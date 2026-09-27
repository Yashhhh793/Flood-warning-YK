"""
FlashGuard - Hyper-Local Flash Flood Prediction & Early Warning System
Smart India Hackathon 2026 | Team BYTEX8 | PS ID 26192
--------------------------------------------------------------
FastAPI backend:
  * fetches REAL live rainfall + soil-moisture data (Open-Meteo,
    free/no key) and REAL elevation/slope data (Open-Elevation,
    free/no key) for any lat/lon at request time
  * runs those features through the trained RandomForest +
    GradientBoosting ensemble to classify flash-flood risk
  * serves the dashboard (Leaflet map + risk cards)

Run locally:
    pip install -r requirements.txt
    python train_model.py      # trains + saves the model once
    uvicorn app:app --reload

Deploy: push this repo to GitHub, then "New Web Service" on
Render, pointing at this repo (see render.yaml / README.md).
"""

import os
import time
import joblib
import numpy as np
import httpx
from fastapi import FastAPI, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse

from model_utils import FEATURE_COLUMNS, features_from_dict, build_risk_response
from locations import SAMPLE_LOCATIONS

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
MODEL_PATH = os.path.join(BASE_DIR, "flashguard_model.pkl")

app = FastAPI(title="FlashGuard API", version="1.0")
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

# ---------------------------------------------------------------
# Model loading
# ---------------------------------------------------------------
_model_bundle = None


def get_model():
    global _model_bundle
    if _model_bundle is None:
        if not os.path.exists(MODEL_PATH):
            raise RuntimeError(
                "Model file not found. Run `python train_model.py` first."
            )
        _model_bundle = joblib.load(MODEL_PATH)
    return _model_bundle


def predict_risk(feature_dict: dict):
    bundle = get_model()
    x = np.array([features_from_dict(feature_dict)])
    rf_proba = bundle["rf_model"].predict_proba(x)[0]
    gb_proba = bundle["gb_model"].predict_proba(x)[0]
    ensemble_proba = (rf_proba + gb_proba) / 2.0
    label_idx = int(np.argmax(ensemble_proba))
    return build_risk_response(label_idx, ensemble_proba)


# ---------------------------------------------------------------
# Live data fetchers (real public APIs, no key required)
# ---------------------------------------------------------------
OPEN_METEO_URL = "https://api.open-meteo.com/v1/forecast"
OPEN_ELEVATION_URL = "https://api.open-elevation.com/api/v1/lookup"

_cache: dict = {}
CACHE_TTL_SECONDS = 900  # 15 min - avoid hammering free public APIs


def _cache_get(key):
    entry = _cache.get(key)
    if entry and (time.time() - entry["t"] < CACHE_TTL_SECONDS):
        return entry["v"]
    return None


def _cache_set(key, value):
    _cache[key] = {"v": value, "t": time.time()}


async def fetch_weather_features(lat: float, lon: float) -> dict:
    """Real rainfall + soil-moisture data from Open-Meteo.
    Returns hourly precip aggregated into the windows FlashGuard
    needs, plus latest topsoil moisture."""
    cache_key = f"weather:{lat:.3f}:{lon:.3f}"
    cached = _cache_get(cache_key)
    if cached:
        return cached

    params = {
        "latitude": lat,
        "longitude": lon,
        "hourly": "precipitation,soil_moisture_0_to_7cm",
        "past_days": 3,
        "forecast_days": 1,
        "timezone": "auto",
    }
    try:
        async with httpx.AsyncClient(timeout=8.0) as client:
            r = await client.get(OPEN_METEO_URL, params=params)
            r.raise_for_status()
            data = r.json()

        precip = data["hourly"]["precipitation"]
        soil = data["hourly"]["soil_moisture_0_to_7cm"]
        times = data["hourly"]["time"]

        # index of "now" = end of past_days*24 hours block
        now_idx = min(len(times) - 1, 3 * 24)

        def window_sum(hours):
            start = max(0, now_idx - hours)
            vals = [v for v in precip[start:now_idx] if v is not None]
            return float(sum(vals))

        rainfall_1h = float(precip[max(0, now_idx - 1)] or 0)
        rainfall_3h = window_sum(3)
        rainfall_6h = window_sum(6)
        rainfall_12h = window_sum(12)
        rainfall_24h = window_sum(24)
        antecedent = window_sum(72) - rainfall_24h
        antecedent = max(antecedent, 0)

        soil_vals = [v for v in soil[max(0, now_idx - 6):now_idx] if v is not None]
        soil_moisture = float(np.mean(soil_vals)) if soil_vals else 0.25

        result = {
            "rainfall_1h": rainfall_1h,
            "rainfall_3h": rainfall_3h,
            "rainfall_6h": rainfall_6h,
            "rainfall_12h": rainfall_12h,
            "rainfall_24h": rainfall_24h,
            "antecedent_rainfall_72h": antecedent,
            "soil_moisture": soil_moisture,
            "source": "open-meteo (live)",
        }
        _cache_set(cache_key, result)
        return result
    except Exception as e:
        # Graceful fallback so the dashboard still works if the
        # free public API is rate-limited / unreachable. Clearly
        # flagged in the response so it's never confused with
        # live data.
        fallback = {
            "rainfall_1h": 4.0,
            "rainfall_3h": 9.0,
            "rainfall_6h": 14.0,
            "rainfall_12h": 20.0,
            "rainfall_24h": 28.0,
            "antecedent_rainfall_72h": 35.0,
            "soil_moisture": 0.22,
            "source": f"fallback-estimate (live fetch failed: {type(e).__name__})",
        }
        return fallback


async def fetch_terrain_features(lat: float, lon: float, fallback_elev: float = None) -> dict:
    """Real elevation from Open-Elevation, plus a slope estimate
    computed from elevation samples ~500m N/S/E/W of the point."""
    cache_key = f"terrain:{lat:.3f}:{lon:.3f}"
    cached = _cache_get(cache_key)
    if cached:
        return cached

    d = 0.0045  # ~500m in degrees latitude
    points = [
        (lat, lon),
        (lat + d, lon),
        (lat - d, lon),
        (lat, lon + d),
        (lat, lon - d),
    ]
    locations_param = "|".join(f"{p[0]:.5f},{p[1]:.5f}" for p in points)

    try:
        async with httpx.AsyncClient(timeout=8.0) as client:
            r = await client.get(OPEN_ELEVATION_URL, params={"locations": locations_param})
            r.raise_for_status()
            results = r.json()["results"]

        elevs = [pt["elevation"] for pt in results]
        center_elev = elevs[0]
        diffs = [abs(center_elev - e) for e in elevs[1:]]
        distance_m = 500.0
        slope_deg = float(np.degrees(np.arctan((max(diffs) if diffs else 0) / distance_m)))

        result = {
            "elevation_m": float(center_elev),
            "slope_deg": slope_deg,
            "source": "open-elevation (live)",
        }
        _cache_set(cache_key, result)
        return result
    except Exception as e:
        result = {
            "elevation_m": float(fallback_elev) if fallback_elev else 1200.0,
            "slope_deg": 15.0,
            "source": f"fallback-estimate (live fetch failed: {type(e).__name__})",
        }
        return result


# ---------------------------------------------------------------
# API routes
# ---------------------------------------------------------------
@app.get("/api/health")
async def health():
    return {"status": "ok", "model_loaded": os.path.exists(MODEL_PATH)}


@app.get("/api/locations")
async def get_locations():
    return {"locations": SAMPLE_LOCATIONS}


@app.get("/api/predict")
async def api_predict(
    lat: float = Query(...),
    lon: float = Query(...),
    name: str = Query("Custom location"),
    elevation_hint: float = Query(None),
):
    weather = await fetch_weather_features(lat, lon)
    terrain = await fetch_terrain_features(lat, lon, fallback_elev=elevation_hint)

    feature_dict = {**weather, **terrain}
    try:
        risk = predict_risk(feature_dict)
    except RuntimeError as e:
        raise HTTPException(status_code=503, detail=str(e))

    return {
        "name": name,
        "lat": lat,
        "lon": lon,
        "inputs": {
            "rainfall_1h_mm": round(weather["rainfall_1h"], 1),
            "rainfall_3h_mm": round(weather["rainfall_3h"], 1),
            "rainfall_6h_mm": round(weather["rainfall_6h"], 1),
            "rainfall_12h_mm": round(weather["rainfall_12h"], 1),
            "rainfall_24h_mm": round(weather["rainfall_24h"], 1),
            "antecedent_rainfall_72h_mm": round(weather["antecedent_rainfall_72h"], 1),
            "soil_moisture_m3m3": round(weather["soil_moisture"], 3),
            "elevation_m": round(terrain["elevation_m"], 1),
            "slope_deg": round(terrain["slope_deg"], 1),
        },
        "data_sources": {
            "weather": weather["source"],
            "terrain": terrain["source"],
        },
        **risk,
    }


@app.get("/api/dashboard")
async def api_dashboard():
    """Predictions for every sample location - powers the map + sidebar."""
    results = []
    for loc in SAMPLE_LOCATIONS:
        pred = await api_predict(
            lat=loc["lat"], lon=loc["lon"], name=loc["name"], elevation_hint=loc["elevation_m"]
        )
        pred["id"] = loc["id"]
        results.append(pred)

    order = {"CRITICAL": 0, "HIGH": 1, "MODERATE": 2, "LOW": 3}
    results.sort(key=lambda r: order.get(r["risk_level"], 4))
    return {"locations": results, "generated_at": time.time()}


# ---------------------------------------------------------------
# Dashboard (flat file layout - everything lives at repo root)
# ---------------------------------------------------------------
@app.get("/")
async def index():
    return FileResponse(os.path.join(BASE_DIR, "index.html"))


@app.get("/style.css")
async def style_css():
    return FileResponse(os.path.join(BASE_DIR, "style.css"), media_type="text/css")


@app.get("/script.js")
async def script_js():
    return FileResponse(os.path.join(BASE_DIR, "script.js"), media_type="application/javascript")


if __name__ == "__main__":
    import uvicorn

    port = int(os.environ.get("PORT", 8000))
    uvicorn.run("app:app", host="0.0.0.0", port=port, reload=True)
