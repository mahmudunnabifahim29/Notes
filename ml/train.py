"""Train an exploratory behavior model for NoteAtlas. No demographic prediction."""
from __future__ import annotations

import argparse
import json
from pathlib import Path

import numpy as np
import pandas as pd
from sklearn.cluster import KMeans
from sklearn.metrics import silhouette_score
from sklearn.model_selection import train_test_split
from sklearn.preprocessing import StandardScaler

FEATURES = ["page_views", "note_views", "creates", "edits", "uploads", "shares", "active_seconds", "active_days"]
SEED = 42


def train(csv_path: Path, output: Path) -> dict:
    frame = pd.read_csv(csv_path)
    missing = [c for c in ["research_id", *FEATURES] if c not in frame]
    if missing:
        raise ValueError(f"Missing columns: {', '.join(missing)}")
    if frame.research_id.isna().any() or frame.research_id.duplicated().any():
        raise ValueError("Use one row per research_id. Duplicate browser IDs would leak across the holdout split.")
    if len(frame) < 30:
        raise ValueError("Collect at least 30 opted-in browser records for this starter workflow. This is a heuristic, not a claim of statistical adequacy.")
    numeric = frame[FEATURES].apply(pd.to_numeric, errors="raise").to_numpy(dtype=float)
    if not np.isfinite(numeric).all() or (numeric < 0).any() or (numeric > 1e10).any():
        raise ValueError("Activity features must be finite, non-negative numbers below 1e10.")
    if len(np.unique(numeric, axis=0)) < 3:
        raise ValueError("There is too little variation to discover useful groups. Collect more varied activity.")
    synthetic = "_synthetic" in frame and frame["_synthetic"].fillna(0).astype(str).isin(["1", "True", "true"]).any()
    source = "synthetic" if synthetic else "real"

    # Split BEFORE fitting the scaler. The holdout never selects k or fits preprocessing.
    train_idx, holdout_idx = train_test_split(np.arange(len(frame)), test_size=0.2, random_state=SEED)
    logged = np.log1p(numeric)
    scaler = StandardScaler().fit(logged[train_idx])
    x_train = scaler.transform(logged[train_idx])
    x_holdout = scaler.transform(logged[holdout_idx])
    candidates, best = [], None
    unique_train = len(np.unique(x_train, axis=0))
    for k in range(2, min(6, unique_train, len(x_train) - 1) + 1):
        estimator = KMeans(n_clusters=k, n_init=20, random_state=SEED).fit(x_train)
        counts = np.bincount(estimator.labels_, minlength=k)
        if counts.min() < 3:
            continue
        score = float(silhouette_score(x_train, estimator.labels_))
        candidates.append({"k": k, "silhouette_train": score})
        if best is None or score > best[0]:
            best = (score, estimator)
    if best is None:
        raise ValueError("No candidate produced groups with at least three training examples each. Gather more varied data.")

    score, estimator = best
    holdout_labels = estimator.predict(x_holdout)
    holdout_score = None
    if 1 < len(np.unique(holdout_labels)) < len(x_holdout):
        holdout_score = float(silhouette_score(x_holdout, holdout_labels))
    model = {
        "version": 1, "model_type": "kmeans", "features": FEATURES,
        "mean": scaler.mean_.tolist(), "scale": scaler.scale_.tolist(),
        "centroids": estimator.cluster_centers_.tolist(),
        "training_source": source, "trained_samples": len(train_idx),
        "silhouette_train": score, "silhouette_holdout": holdout_score,
    }
    warnings = [
        "Exploratory behavior clusters are not demographic predictions or causal findings.",
        "Browser IDs can be reset or shared and do not uniquely identify people.",
        "Opt-in selection, bot activity, and small samples can bias the findings.",
        "Thirty rows is only a starter guard, not a statistically justified sample size.",
        "Training and holdout rows describe the same observation period; future-period validation is still needed.",
    ]
    if source == "synthetic":
        warnings.insert(0, "SYNTHETIC PRACTICE DATA: results are not findings about website visitors.")
    if holdout_score is None:
        warnings.append("Holdout silhouette is unavailable: not enough distinct predicted groups.")
    elif holdout_score < 0.2:
        warnings.append("Weak holdout separation. Do not assign strong meaning to the groups.")
    report = {
        "training_source": source, "total_rows": len(frame), "train_rows": len(train_idx),
        "holdout_rows": len(holdout_idx), "random_seed": SEED,
        "selected_k": int(estimator.n_clusters), "candidates": candidates,
        "silhouette_train": score, "silhouette_holdout": holdout_score,
        "holdout_score_interpretation": "Ranges from -1 to 1; larger indicates greater separation. It is not prediction accuracy.",
        "warnings": warnings,
    }
    # Export only aggregate summaries, suppressing individual groups below five.
    assigned = estimator.predict(scaler.transform(logged))
    summary, small = [], 0
    for k in range(estimator.n_clusters):
        group = frame.loc[assigned == k, FEATURES]
        if len(group) < 5:
            small += len(group)
            continue
        summary.append({"group": f"Group {k + 1}", "browsers": len(group), **{f"mean_{f}": float(group[f].mean()) for f in FEATURES}})
    if small:
        summary.append({"group": "Small groups (combined)", "browsers": small})
    output.mkdir(parents=True, exist_ok=True)
    (output / "model.json").write_text(json.dumps(model, indent=2, allow_nan=False), encoding="utf-8")
    (output / "report.json").write_text(json.dumps(report, indent=2, allow_nan=False), encoding="utf-8")
    pd.DataFrame(summary).to_csv(output / "cluster_summary.csv", index=False)
    print(f"{source.upper()} data: trained {estimator.n_clusters} exploratory groups on {len(train_idx)} rows; {len(holdout_idx)} held out.")
    print(f"Import {output / 'model.json'} in NoteAtlas. Read {output / 'report.json'} before interpreting results.")
    return model


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("csv", type=Path, help="NoteAtlas activity CSV")
    parser.add_argument("--output", type=Path, default=Path("results"))
    args = parser.parse_args()
    try:
        train(args.csv, args.output)
    except (ValueError, OSError) as error:
        parser.exit(2, f"Cannot train: {error}\n")
