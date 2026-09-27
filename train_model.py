"""
FlashGuard - model training script
--------------------------------------------------------------
Trains a Random Forest + Gradient Boosting ensemble (as named in
the FlashGuard proposal) on the domain-informed synthetic dataset
(see model_utils.py for the full explanation of why it's synthetic
and how to swap in real historical data later) and saves the fitted
ensemble to ml/flashguard_model.pkl.

Run:
    python ml/train_model.py
"""

import os
import sys
import joblib
import numpy as np
from sklearn.ensemble import RandomForestClassifier, GradientBoostingClassifier
from sklearn.model_selection import train_test_split
from sklearn.metrics import accuracy_score, f1_score, classification_report

sys.path.append(os.path.dirname(__file__))
from model_utils import FEATURE_COLUMNS, RISK_LABELS, generate_training_data, RANDOM_STATE


def train():
    print("Generating training data...")
    df = generate_training_data(n_samples=9000)
    X = df[FEATURE_COLUMNS].values
    y = df["risk_label"].values

    X_train, X_test, y_train, y_test = train_test_split(
        X, y, test_size=0.2, random_state=RANDOM_STATE, stratify=y
    )

    print("Training Random Forest...")
    rf = RandomForestClassifier(
        n_estimators=120,
        max_depth=9,
        min_samples_leaf=5,
        random_state=RANDOM_STATE,
        n_jobs=-1,
    )
    rf.fit(X_train, y_train)

    print("Training Gradient Boosting...")
    gb = GradientBoostingClassifier(
        n_estimators=150,
        max_depth=3,
        learning_rate=0.08,
        random_state=RANDOM_STATE,
    )
    gb.fit(X_train, y_train)

    # Ensemble: average class probabilities from both models
    rf_proba = rf.predict_proba(X_test)
    gb_proba = gb.predict_proba(X_test)
    ensemble_proba = (rf_proba + gb_proba) / 2.0
    ensemble_pred = np.argmax(ensemble_proba, axis=1)

    acc = accuracy_score(y_test, ensemble_pred)
    f1 = f1_score(y_test, ensemble_pred, average="macro")

    print(f"\nEnsemble accuracy: {acc:.4f}")
    print(f"Ensemble macro F1:  {f1:.4f}\n")
    print(classification_report(y_test, ensemble_pred, target_names=RISK_LABELS))

    bundle = {
        "rf_model": rf,
        "gb_model": gb,
        "feature_columns": FEATURE_COLUMNS,
        "risk_labels": RISK_LABELS,
        "metrics": {"accuracy": acc, "macro_f1": f1},
    }

    out_path = os.path.join(os.path.dirname(__file__), "flashguard_model.pkl")
    joblib.dump(bundle, out_path)
    print(f"Saved model bundle -> {out_path}")


if __name__ == "__main__":
    train()
