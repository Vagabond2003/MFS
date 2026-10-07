#!/usr/bin/env python3
"""
Trains the merchant churn model on the large synthetic dataset and exports it
for the TypeScript scorer (src/services/mock/intelligence/churn-model.ts).

    ml/.venv/bin/python ml/train.py          (or: bash ml/reproduce.sh for the whole pipeline)

Input: data/churn/features.csv from scripts/churn-dataset.mjs. Features are
computed by the app's own code, strictly from before each snapshot; label = no
successful payment in the 30 days after it.

Split, so that no merchant and no label window appears on both sides:
  - by merchant: a hash of the merchant id puts 30% of merchants in test, 70% in train;
  - by time: test uses the last 6 weekly snapshots; train uses only snapshots
    whose 30-day label window ends before the first test snapshot.
Model choice happens inside train (fit on earlier snapshots of 80% of train
merchants, validate on later snapshots of the other 20%), never on test.
Logistic regression is kept unless gradient boosting beats it on validation
PR-AUC by at least 0.01 — it is simpler to explain. Both are then refit on all
of train and evaluated once on test, next to the current rule score.

Outputs:
  src/services/mock/intelligence/churn-model.json   the chosen model + test metrics (shown on the admin page)
  tests/fixtures/churn-parity.json                  Python predictions and reasons for the TS parity test
  ml/reports/metrics.json, ml/reports/metrics.md    full metrics
  docs/evaluation.md                                the section between the metrics markers is regenerated

Everything is seeded; a re-run gives the same numbers (only "trainedAt" changes;
set TRAINED_AT=YYYY-MM-DD to pin it).
"""
import csv
import datetime
import hashlib
import json
import math
import os
from pathlib import Path

import numpy as np
from sklearn.ensemble import GradientBoostingClassifier
from sklearn.linear_model import LogisticRegression
from sklearn.metrics import average_precision_score, brier_score_loss, roc_auc_score
from sklearn.preprocessing import StandardScaler

SEED = 20261008
ROOT = Path(__file__).resolve().parent.parent
DATA = ROOT / "data/churn/features.csv"
MODEL_OUT = ROOT / "src/services/mock/intelligence/churn-model.json"
PARITY_OUT = ROOT / "tests/fixtures/churn-parity.json"
REPORT_DIR = ROOT / "ml/reports"
EVAL_DOC = ROOT / "docs/evaluation.md"
TEST_SNAPSHOTS = 8
LABEL_DAYS = 30
BOOTSTRAP = 1000

LR_PARAMS = {"C": 1.0, "max_iter": 2000}
GB_PARAMS = {"n_estimators": 200, "learning_rate": 0.05, "max_depth": 3, "min_samples_leaf": 20, "subsample": 0.8, "random_state": SEED}


# ───────────── Data ─────────────

def load():
    with open(DATA, newline="") as f:
        reader = csv.reader(f)
        header = next(reader)
        rows = list(reader)
    features = header[header.index("snapshot_day") + 1 : header.index("rule_score")]
    col = {name: i for i, name in enumerate(header)}
    return {
        "features": features,
        "merchant": np.array([r[col["merchant_id"]] for r in rows]),
        "day": np.array([int(r[col["snapshot_day"]]) for r in rows]),
        "snapshot": np.array([r[col["snapshot"]] for r in rows]),
        "X": np.array([[float(r[col[c]]) for c in features] for r in rows]),
        "rule": np.array([float(r[col["rule_score"]]) for r in rows]),
        "active14": np.array([int(r[col["active14"]]) for r in rows]),
        "category": np.array([r[col["category"]] for r in rows]),
        "district": np.array([r[col["district"]] for r in rows]),
        "y": np.array([int(r[col["label"]]) for r in rows]),
    }


def bucket(merchant_id):
    return int(hashlib.md5(f"{SEED}:{merchant_id}".encode()).hexdigest()[:8], 16) % 100


def split(d):
    days = sorted(set(d["day"].tolist()))
    test_days = days[-TEST_SNAPSHOTS:]
    train_days = [x for x in days if x + LABEL_DAYS <= test_days[0]]
    val_days = train_days[-5:]
    fit_days = [x for x in train_days if x + LABEL_DAYS <= val_days[0]]
    b = np.array([bucket(m) for m in d["merchant"]])
    in_days = lambda ds: np.isin(d["day"], ds)
    idx = {
        "test": np.where((b < 30) & in_days(test_days))[0],
        "train": np.where((b >= 30) & in_days(train_days))[0],
        "val": np.where((b >= 30) & (b < 44) & in_days(val_days))[0],
        "fit": np.where((b >= 44) & in_days(fit_days))[0],
    }
    # The guarantees the split is built on.
    assert not set(d["merchant"][idx["train"]]) & set(d["merchant"][idx["test"]]), "a merchant is in both train and test"
    assert max(train_days) + LABEL_DAYS <= min(test_days), "a train label window overlaps the test period"
    assert not set(d["merchant"][idx["fit"]]) & set(d["merchant"][idx["val"]])
    assert max(fit_days) + LABEL_DAYS <= min(val_days)
    dates = lambda ds: [str(d["snapshot"][d["day"] == x][0]) for x in (min(ds), max(ds))]
    info = {
        "train_snapshots": {"from": dates(train_days)[0], "to": dates(train_days)[1], "count": len(train_days)},
        "test_snapshots": {"from": dates(test_days)[0], "to": dates(test_days)[1], "count": len(test_days)},
        "skipped_snapshots_between": len(days) - len(train_days) - len(test_days),
        "train_merchants": int(len(set(d["merchant"][idx["train"]]))),
        "test_merchants": int(len(set(d["merchant"][idx["test"]]))),
    }
    return idx, info


# ───────────── Models ─────────────

class LR:
    name = "logistic_regression"

    def fit(self, X, y):
        self.scaler = StandardScaler().fit(X)
        self.model = LogisticRegression(**LR_PARAMS).fit(self.scaler.transform(X), y)
        return self

    def predict(self, X):
        return self.model.predict_proba(self.scaler.transform(X))[:, 1]

    def export(self, features):
        return {
            "kind": "logistic_regression",
            "features": features,
            "mean": self.scaler.mean_.tolist(),
            "scale": self.scaler.scale_.tolist(),
            "coef": self.model.coef_[0].tolist(),
            "intercept": float(self.model.intercept_[0]),
        }

    def contributions(self, X):
        """Log-odds contribution of each feature, relative to the average merchant."""
        return self.model.coef_[0] * self.scaler.transform(X)


class GB:
    name = "gradient_boosting"

    def fit(self, X, y):
        self.model = GradientBoostingClassifier(**GB_PARAMS).fit(X, y)
        return self

    def predict(self, X):
        return self.model.predict_proba(X)[:, 1]

    def export(self, features):
        trees = []
        for est in self.model.estimators_[:, 0]:
            t = est.tree_
            trees.append({
                "feature": t.feature.tolist(),
                "threshold": t.threshold.tolist(),
                "left": t.children_left.tolist(),
                "right": t.children_right.tolist(),
                "value": t.value[:, 0, 0].tolist(),
            })
        return {
            "kind": "gradient_boosting",
            "features": features,
            "init": float(self.model._raw_predict_init(np.zeros((1, len(features))))[0, 0]),
            "learningRate": float(self.model.learning_rate),
            "trees": trees,
        }

    def contributions(self, X):
        """Per-feature log-odds contributions by following each tree's path (Saabas):
        each split hands the change in node value to the feature it split on."""
        lr = self.model.learning_rate
        out = np.zeros_like(X, dtype=np.float64)
        X32 = X.astype(np.float32)
        for est in self.model.estimators_[:, 0]:
            t = est.tree_
            value = t.value[:, 0, 0]
            for i in range(X.shape[0]):
                node = 0
                while t.children_left[node] != -1:
                    f = t.feature[node]
                    child = t.children_left[node] if X32[i, f] <= t.threshold[node] else t.children_right[node]
                    out[i, f] += lr * (value[child] - value[node])
                    node = child
        return out


# ───────────── Metrics ─────────────

def top_k(y, s, share=0.1):
    k = max(1, math.ceil(share * len(y)))
    order = np.argsort(-s, kind="stable")[:k]
    hits = y[order].sum()
    return float(hits / k), float(hits / max(1, y.sum()))


def calibration(y, p, bins=10):
    edges = np.linspace(0, 1, bins + 1)
    which = np.clip(np.digitize(p, edges[1:-1]), 0, bins - 1)
    ece = 0.0
    for b in range(bins):
        m = which == b
        if m.any():
            ece += m.mean() * abs(p[m].mean() - y[m].mean())
    order = np.argsort(p, kind="stable")
    table = []
    for chunk in np.array_split(order, bins):
        table.append({"predicted": round(float(p[chunk].mean()), 4), "observed": round(float(y[chunk].mean()), 4), "rows": int(len(chunk))})
    return {"brier": float(brier_score_loss(y, p)), "ece": float(ece), "reliability": table}


def metrics(y, s, merchants, probability=True):
    precision, recall = top_k(y, s)
    out = {
        "rows": int(len(y)),
        "positives": int(y.sum()),
        "base_rate": float(y.mean()),
        "roc_auc": float(roc_auc_score(y, s)),
        "pr_auc": float(average_precision_score(y, s)),
        "precision_top10": precision,
        "recall_top10": recall,
    }
    cal = calibration(y, s if probability else np.clip(s / 100, 0, 1))
    out.update({"brier": cal["brier"], "ece": cal["ece"], "reliability": cal["reliability"], "calibration_note": None if probability else "rule score ÷ 100, not a probability"})
    out["ci95"] = bootstrap(y, s, merchants)
    return out


def bootstrap(y, s, merchants):
    """95% intervals, resampling whole merchants (each appears in several snapshots)."""
    rng = np.random.default_rng(SEED)
    groups = {}
    for i, m in enumerate(merchants):
        groups.setdefault(m, []).append(i)
    keys = list(groups)
    stats = {"roc_auc": [], "pr_auc": [], "precision_top10": []}
    for _ in range(BOOTSTRAP):
        sample = rng.integers(0, len(keys), len(keys))
        idx = np.concatenate([groups[keys[j]] for j in sample])
        yy, ss = y[idx], s[idx]
        if yy.min() == yy.max():
            continue
        stats["roc_auc"].append(roc_auc_score(yy, ss))
        stats["pr_auc"].append(average_precision_score(yy, ss))
        stats["precision_top10"].append(top_k(yy, ss)[0])
    return {k: [round(float(np.percentile(v, 2.5)), 4), round(float(np.percentile(v, 97.5)), 4)] for k, v in stats.items()}


def flag_quality(y, flagged):
    tp = int((flagged & (y == 1)).sum())
    return {"flagged": int(flagged.sum()), "precision": tp / max(1, int(flagged.sum())), "recall": tp / max(1, int(y.sum()))}


# ───────────── Main ─────────────

def main():
    d = load()
    X, y, features = d["X"], d["y"], d["features"]
    idx, split_info = split(d)

    # Model choice inside train.
    val = {}
    for M in (LR, GB):
        m = M().fit(X[idx["fit"]], y[idx["fit"]])
        val[M.name] = {"pr_auc": float(average_precision_score(y[idx["val"]], m.predict(X[idx["val"]]))), "model": m}
    val_rule = float(average_precision_score(y[idx["val"]], d["rule"][idx["val"]]))
    chosen = GB if val["gradient_boosting"]["pr_auc"] >= val["logistic_regression"]["pr_auc"] + 0.01 else LR
    # The score shown is the probability in percent (the models are close to calibrated, see ECE),
    # so the levels are fixed probabilities: HIGH = more likely than not, MEDIUM = 15% or more.
    thresholds = {"high": 0.5, "medium": 0.15}

    # Refit on all of train; evaluate once on test.
    models = {M.name: M().fit(X[idx["train"]], y[idx["train"]]) for M in (LR, GB)}
    te = idx["test"]
    yt, mt = y[te], d["merchant"][te]
    preds = {name: m.predict(X[te]) for name, m in models.items()}
    results = {name: metrics(yt, p, mt) for name, p in preds.items()}
    results["rule_score"] = metrics(yt, d["rule"][te], mt, probability=False)

    active = d["active14"][te] == 1
    results_active = {name: metrics(yt[active], p[active], mt[active]) for name, p in preds.items()}
    results_active["rule_score"] = metrics(yt[active], d["rule"][te][active], mt[active], probability=False)

    p_chosen = preds[chosen.name]
    levels = {
        "model_high": flag_quality(yt, p_chosen >= thresholds["high"]),
        "model_high_or_medium": flag_quality(yt, p_chosen >= thresholds["medium"]),
        "rule_high": flag_quality(yt, d["rule"][te] >= 60),
        "rule_high_or_medium": flag_quality(yt, d["rule"][te] >= 35),
    }

    importance = {
        "logistic_regression_coef_per_sd": dict(zip(features, [round(float(c), 4) for c in models["logistic_regression"].model.coef_[0]])),
        "gradient_boosting_importance": dict(zip(features, [round(float(c), 4) for c in models["gradient_boosting"].model.feature_importances_])),
    }

    trained_at = os.environ.get("TRAINED_AT") or datetime.date.today().isoformat()
    r = lambda v: round(v, 4)
    summary = lambda m: {k: r(m[k]) for k in ("roc_auc", "pr_auc", "precision_top10", "recall_top10", "brier", "ece", "base_rate")} | {"rows": m["rows"], "positives": m["positives"], "ci95": m["ci95"]}
    model_json = {
        "name": f"Churn {chosen.name.replace('_', ' ')}",
        "version": f"churn-{trained_at}",
        "trainedAt": trained_at,
        "syntheticData": True,
        "label": f"No successful payment in the {LABEL_DAYS} days after the snapshot",
        "minHistory": {"tenureDays": 30, "payments60": 5},
        "thresholds": thresholds,
        "dataset": {"rows": int(len(y)), "merchants": int(len(set(d["merchant"]))), "snapshots": int(len(set(d["day"].tolist()))), "positiveRate": r(float(y.mean()))} | split_info,
        "test": summary(results[chosen.name]),
        "baseline": summary(results["rule_score"]),
        **models[chosen.name].export(features),
    }
    MODEL_OUT.write_text(json.dumps(model_json, indent=1) + "\n")

    # Parity fixture: both model kinds, so the TS scorer is checked for each.
    sample = te[:200]
    PARITY_OUT.parent.mkdir(parents=True, exist_ok=True)
    PARITY_OUT.write_text(json.dumps({
        "features": features,
        "rows": X[sample].tolist(),
        "models": {name: m.export(features) for name, m in models.items()},
        "predictions": {name: m.predict(X[sample]).tolist() for name, m in models.items()},
        "contributions": {name: m.contributions(X[sample]).tolist() for name, m in models.items()},
        "chosen": chosen.name,
    }) + "\n")

    report = {
        "trainedAt": trained_at,
        "seed": SEED,
        "params": {"logistic_regression": LR_PARAMS, "gradient_boosting": GB_PARAMS},
        "split": split_info,
        "rows": {k: int(len(v)) for k, v in idx.items()},
        "validation_pr_auc": {"logistic_regression": r(val["logistic_regression"]["pr_auc"]), "gradient_boosting": r(val["gradient_boosting"]["pr_auc"]), "rule_score": r(val_rule)},
        "chosen": chosen.name,
        "thresholds": thresholds,
        "test": results,
        "test_still_active": results_active,
        "levels": levels,
        "importance": importance,
    }
    REPORT_DIR.mkdir(parents=True, exist_ok=True)
    (REPORT_DIR / "metrics.json").write_text(json.dumps(report, indent=1) + "\n")
    md = markdown(report)
    (REPORT_DIR / "metrics.md").write_text(md)
    if EVAL_DOC.exists():
        doc = EVAL_DOC.read_text()
        start, end = "<!-- metrics:start -->", "<!-- metrics:end -->"
        if start in doc and end in doc:
            EVAL_DOC.write_text(doc[: doc.index(start) + len(start)] + "\n" + md + doc[doc.index(end) :])
    print(md)


def markdown(rep):
    pct = lambda v: f"{v * 100:.1f}%"
    f3 = lambda v: f"{v:.3f}"
    ci = lambda m, k: f"{m['ci95'][k][0]:.3f}–{m['ci95'][k][1]:.3f}"
    names = {"logistic_regression": "Logistic regression", "gradient_boosting": "Gradient boosting", "rule_score": "Rule score (current)"}
    s = rep["split"]
    lines = [
        f"_Generated by `ml/train.py` on {rep['trainedAt']} (seed {rep['seed']}). **All figures are on synthetic data.**_",
        "",
        f"Train: {s['train_merchants']} merchants, snapshots {s['train_snapshots']['from']} to {s['train_snapshots']['to']} ({rep['rows']['train']} rows). "
        f"Test: {s['test_merchants']} other merchants, snapshots {s['test_snapshots']['from']} to {s['test_snapshots']['to']} ({rep['rows']['test']} rows); "
        f"{s['skipped_snapshots_between']} snapshots in between are skipped so no label window crosses into the test period.",
        "",
        f"Chosen on validation PR-AUC: **{names[rep['chosen']]}** (validation PR-AUC: logistic regression {rep['validation_pr_auc']['logistic_regression']:.3f}, gradient boosting {rep['validation_pr_auc']['gradient_boosting']:.3f}, rule score {rep['validation_pr_auc']['rule_score']:.3f}).",
        "",
    ]
    for title, block in (("Test set", rep["test"]), ("Test set, merchants paid in the 14 days before the snapshot (the hard cases)", rep["test_still_active"])):
        any_m = next(iter(block.values()))
        lines += [
            f"#### {title}: {any_m['rows']} rows, {any_m['positives']} churned ({pct(any_m['base_rate'])})",
            "",
            "| Model | ROC-AUC (95% CI) | PR-AUC (95% CI) | Precision, top 10% (95% CI) | Recall, top 10% | Brier | ECE |",
            "|---|---|---|---|---|---|---|",
        ]
        for k in ("logistic_regression", "gradient_boosting", "rule_score"):
            m = block[k]
            note = " ¹" if m["calibration_note"] else ""
            lines.append(f"| {names[k]} | {f3(m['roc_auc'])} ({ci(m, 'roc_auc')}) | {f3(m['pr_auc'])} ({ci(m, 'pr_auc')}) | {pct(m['precision_top10'])} ({ci(m, 'precision_top10')}) | {pct(m['recall_top10'])} | {f3(m['brier'])}{note} | {f3(m['ece'])}{note} |")
        lines.append("")
    lines += ["¹ The rule score is not a probability; its calibration is computed on score ÷ 100 for comparison only.", ""]
    chosen = rep["test"][rep["chosen"]]
    lines += ["#### Calibration of the chosen model (test, 10 equal-size bins)", "", "| Mean predicted | Observed churn | Rows |", "|---|---|---|"]
    lines += [f"| {pct(b['predicted'])} | {pct(b['observed'])} | {b['rows']} |" for b in chosen["reliability"]]
    lv = rep["levels"]
    lines += [
        "",
        "#### Flags shown on the admin page (test)",
        "",
        "| Flag | Merchants flagged | Precision | Recall |",
        "|---|---|---|---|",
        f"| Model HIGH (p ≥ {rep['thresholds']['high']:.2f}) | {lv['model_high']['flagged']} | {pct(lv['model_high']['precision'])} | {pct(lv['model_high']['recall'])} |",
        f"| Model HIGH or MEDIUM (p ≥ {rep['thresholds']['medium']:.2f}) | {lv['model_high_or_medium']['flagged']} | {pct(lv['model_high_or_medium']['precision'])} | {pct(lv['model_high_or_medium']['recall'])} |",
        f"| Rule HIGH (score ≥ 60) | {lv['rule_high']['flagged']} | {pct(lv['rule_high']['precision'])} | {pct(lv['rule_high']['recall'])} |",
        f"| Rule HIGH or MEDIUM (score ≥ 35) | {lv['rule_high_or_medium']['flagged']} | {pct(lv['rule_high_or_medium']['precision'])} | {pct(lv['rule_high_or_medium']['recall'])} |",
        "",
        "#### What the models rely on",
        "",
        "| Feature | Logistic regression coefficient (per SD) | Gradient boosting importance |",
        "|---|---|---|",
    ]
    imp = rep["importance"]
    for f in imp["logistic_regression_coef_per_sd"]:
        lines.append(f"| `{f}` | {imp['logistic_regression_coef_per_sd'][f]:+.3f} | {imp['gradient_boosting_importance'][f]:.3f} |")
    return "\n".join(lines) + "\n"


if __name__ == "__main__":
    main()
