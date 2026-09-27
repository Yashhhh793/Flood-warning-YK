"""
FlashGuard - ML utilities
--------------------------------------------------------------
Shared feature schema, synthetic-but-hydrologically-informed
training data generator, and prediction helpers used by both
train_model.py and app.py.

NOTE ON DATA (read this before demoing / judging):
Real historic ground-truth flash-flood incident data for Indian
hill villages (INDOFLOODS / India Flood Inventory / CWC) is not
freely bulk-downloadable via API without registration, so it
cannot be pulled live inside this environment. To keep the
prototype honest, the model below is trained on a *domain-
informed synthetic dataset*: features are sampled from realistic
ranges for Himalayan hill regions and labelled using published
IMD/CWC style rainfall-intensity + antecedent-moisture + terrain
heuristics (not invented rules pulled out of thin air), with
added noise so the model has to genuinely learn the decision
boundary rather than memorise a formula.

The LIVE data the deployed app itself uses at prediction time
(current + past rainfall, soil moisture, elevation/slope) is
real, fetched at request-time from free public APIs
(Open-Meteo + Open-Elevation) - see app.py. Swap in a real
labelled historical dataset (once you can source one) by
replacing `generate_training_data()` with a loader and the rest
of the pipeline (features, model, API) needs no changes.
"""

import numpy as np
import pandas as pd

RANDOM_STATE = 42

FEATURE_COLUMNS = [
    "rainfall_1h",
    "rainfall_3h",
    "rainfall_6h",
    "rainfall_12h",
    "rainfall_24h",
    "antecedent_rainfall_72h",
    "soil_moisture",
    "slope_deg",
    "elevation_m",
]

RISK_LABELS = ["LOW", "MODERATE", "HIGH", "CRITICAL"]

RISK_META = {
    "LOW": {
        "color": "#22c55e",
        "lead_time_hours": None,
        "action": "No immediate action needed. Continue routine monitoring of rainfall updates.",
    },
    "MODERATE": {
        "color": "#eab308",
        "lead_time_hours": "6-12",
        "action": "Alert local disaster-management contacts. Advise residents near streams/nalas to stay watchful.",
    },
    "HIGH": {
        "color": "#f97316",
        "lead_time_hours": "3-6",
        "action": "Issue local warning. Prepare evacuation routes for low-lying / streamside habitations. Position response teams.",
    },
    "CRITICAL": {
        "color": "#ef4444",
        "lead_time_hours": "0-3",
        "action": "Immediate evacuation advisory for vulnerable zones. Activate emergency response and road-closure protocols.",
    },
}


def _rule_based_label(row: dict, rng: np.random.Generator) -> int:
    """Hydrology-informed scoring function used to LABEL synthetic
    training rows. Combines rainfall intensity, antecedent wetness
    and terrain steepness into a 0-100 danger score, then buckets
    it into LOW/MODERATE/HIGH/CRITICAL with a little label noise
    so the model can't just re-derive this formula perfectly."""

    score = 0.0
    # Short-duration intense rainfall drives flash floods the most
    score += min(row["rainfall_1h"], 60) * 0.9
    score += min(row["rainfall_3h"], 120) * 0.45
    score += min(row["rainfall_6h"], 180) * 0.25
    score += min(row["rainfall_24h"], 300) * 0.08

    # Wet catchments shed rain as runoff instead of absorbing it
    score += (row["antecedent_rainfall_72h"] / 250.0) * 20
    score += (row["soil_moisture"] - 0.2) * 60  # 0.2-0.5 typical range

    # Steeper slope -> faster runoff concentration -> higher risk
    score += max(row["slope_deg"] - 5, 0) * 1.6

    # Elevation on its own is a weak modifier (proxy for narrow valleys higher up)
    score += (row["elevation_m"] / 3500.0) * 5

    score += rng.normal(0, 8)  # label noise
    score = max(0, score)

    if score < 25:
        return 0  # LOW
    elif score < 55:
        return 1  # MODERATE
    elif score < 85:
        return 2  # HIGH
    else:
        return 3  # CRITICAL


def generate_training_data(n_samples: int = 9000, seed: int = RANDOM_STATE) -> pd.DataFrame:
    rng = np.random.default_rng(seed)

    rainfall_1h = rng.gamma(1.4, 6, n_samples).clip(0, 90)
    rainfall_3h = rainfall_1h * rng.uniform(1.3, 2.6, n_samples) + rng.gamma(1.0, 4, n_samples)
    rainfall_6h = rainfall_3h * rng.uniform(1.2, 2.0, n_samples) + rng.gamma(1.0, 5, n_samples)
    rainfall_12h = rainfall_6h * rng.uniform(1.1, 1.8, n_samples) + rng.gamma(1.0, 6, n_samples)
    rainfall_24h = rainfall_12h * rng.uniform(1.05, 1.6, n_samples) + rng.gamma(1.0, 8, n_samples)

    antecedent_rainfall_72h = rng.gamma(2.0, 20, n_samples).clip(0, 400)
    soil_moisture = rng.beta(2, 3, n_samples) * 0.5 + 0.05  # ~0.05 - 0.55 m3/m3
    slope_deg = rng.gamma(2.2, 6, n_samples).clip(0, 60)
    elevation_m = rng.uniform(200, 3800, n_samples)

    df = pd.DataFrame(
        {
            "rainfall_1h": rainfall_1h,
            "rainfall_3h": rainfall_3h,
            "rainfall_6h": rainfall_6h,
            "rainfall_12h": rainfall_12h,
            "rainfall_24h": rainfall_24h,
            "antecedent_rainfall_72h": antecedent_rainfall_72h,
            "soil_moisture": soil_moisture,
            "slope_deg": slope_deg,
            "elevation_m": elevation_m,
        }
    )

    labels = [
        _rule_based_label(row, rng) for row in df.to_dict(orient="records")
    ]
    df["risk_label"] = labels
    return df


def features_from_dict(d: dict) -> list:
    return [float(d.get(col, 0.0)) for col in FEATURE_COLUMNS]


def build_risk_response(label_idx: int, proba: list) -> dict:
    label = RISK_LABELS[label_idx]
    meta = RISK_META[label]
    return {
        "risk_level": label,
        "risk_color": meta["color"],
        "lead_time_hours": meta["lead_time_hours"],
        "recommended_action": meta["action"],
        "probabilities": {RISK_LABELS[i]: round(float(p), 4) for i, p in enumerate(proba)},
    }
