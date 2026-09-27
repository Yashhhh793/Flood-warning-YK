# FlashGuard
**Hyper-Local Flash Flood Prediction & Early Warning System**
Smart India Hackathon 2026 · PS ID 26192 · Team BYTEX8

A working prototype matching the FlashGuard proposal: multi-source
data → feature engineering → Random Forest + Gradient Boosting
ensemble → LOW/MODERATE/HIGH/CRITICAL risk classification → an
interactive Leaflet dashboard.

## What's real vs. what's synthetic (read this first)

- **Live input data is real.** At prediction time the backend calls
  free public APIs — [Open-Meteo](https://open-meteo.com) for
  current + past-3-days rainfall and soil moisture, and
  [Open-Elevation](https://www.open-elevation.com/) for elevation
  and a computed slope — for whatever lat/lon you give it.
- **Model training data is domain-informed synthetic data**, not a
  scraped historical flood-incident dataset. Bulk historical
  flash-flood ground truth (INDOFLOODS / India Flood Inventory /
  CWC) isn't available as a free instant-download API — real use
  would need manual dataset acquisition + labelling, which is
  future work. The synthetic generator (`ml/model_utils.py`) uses
  published rainfall-intensity / antecedent-moisture / slope
  relationships to label samples, so the model still learns a
  genuine, sensible decision boundary. Swap in a real labelled
  CSV later by replacing `generate_training_data()` — nothing else
  needs to change.
- IoT ground sensors (rain gauges, water-level sensors) are **future
  scope**, exactly as stated in the original proposal — not used here.

## Project structure

```
flashguard/
├── app.py                  # FastAPI backend + live data fetch + prediction API
├── ml/
│   ├── model_utils.py       # feature schema, synthetic data generator, risk metadata
│   ├── train_model.py       # trains & saves the RF + GB ensemble
│   └── flashguard_model.pkl # trained model (already included, ready to run)
├── data/
│   └── locations.py         # sample hill-region villages for the map
├── static/
│   ├── index.html
│   ├── style.css
│   └── script.js            # Leaflet map + dashboard UI
├── requirements.txt
├── render.yaml               # Render deploy blueprint
├── Procfile
└── .gitignore
```

## Run locally

```bash
python -m venv .venv
source .venv/bin/activate        # Windows: .venv\Scripts\activate
pip install -r requirements.txt

# (optional — a trained model is already included)
python ml/train_model.py

uvicorn app:app --reload
```

Open **http://localhost:8000** — the dashboard loads a map of 12
sample hill villages (Uttarakhand, Himachal, Sikkim, Darjeeling,
Wayanad, Idukki), each colour-coded by live predicted risk, plus a
box to check any custom latitude/longitude.

## Push to GitHub

```bash
cd flashguard
git init
git add .
git commit -m "FlashGuard prototype: ML flood-risk API + dashboard"
git branch -M main
git remote add origin https://github.com/<your-username>/<your-repo>.git
git push -u origin main
```

## Deploy on Render

1. Go to [dashboard.render.com](https://dashboard.render.com) → **New +** → **Web Service**.
2. Connect the GitHub repo you just pushed.
3. Render will detect `render.yaml` automatically. If asked manually, use:
   - **Build Command:** `pip install -r requirements.txt && python ml/train_model.py`
   - **Start Command:** `uvicorn app:app --host 0.0.0.0 --port $PORT`
4. Click **Create Web Service**. First deploy takes ~2-3 minutes.
5. Your live FlashGuard dashboard will be at `https://<your-service>.onrender.com`.

> Free-tier Render services sleep after inactivity — the first
> request after idle can take ~30s to wake up.

## API endpoints

| Endpoint | Description |
|---|---|
| `GET /` | Dashboard UI |
| `GET /api/locations` | Sample monitored villages |
| `GET /api/predict?lat=&lon=&name=` | Live risk prediction for any point |
| `GET /api/dashboard` | Predictions for all sample locations (map + sidebar) |
| `GET /api/health` | Health check |

## Retraining / improving the model

- Replace `generate_training_data()` in `ml/model_utils.py` with a
  loader for a real labelled dataset once you have one.
- Re-run `python ml/train_model.py` — it prints accuracy/F1 and
  overwrites `ml/flashguard_model.pkl`.
- To add more monitored villages, edit `data/locations.py`.
