import type { ChurnModelInfo } from "@/types/domain";
import { CHURN_FEATURES, type ChurnFeatures } from "./churn-features";
import trained from "./churn-model.json";

/**
 * Pure-TypeScript scorer for the churn model trained in ml/train.py (exported
 * as churn-model.json), so the server needs no Python. Supports both model
 * kinds the training script can choose; tests/churn-model.test.ts checks it
 * against Python's own predictions.
 */

export interface LogisticModel {
  kind: "logistic_regression";
  features: string[];
  mean: number[];
  scale: number[];
  coef: number[];
  intercept: number;
}

export interface TreeArrays {
  feature: number[];
  threshold: number[];
  left: number[];
  right: number[];
  value: number[];
}

export interface BoostedModel {
  kind: "gradient_boosting";
  features: string[];
  init: number;
  learningRate: number;
  trees: TreeArrays[];
}

export type ChurnModelParams = LogisticModel | BoostedModel;

const sigmoid = (z: number) => 1 / (1 + Math.exp(-z));

/**
 * Probability of churn and each feature's contribution to the log-odds
 * (logistic regression: relative to the average training merchant; boosting:
 * the change in node value at every split on the path, summed per feature).
 */
export function scoreChurnModel(model: ChurnModelParams, x: number[]): { probability: number; contributions: number[] } {
  if (model.kind === "logistic_regression") {
    const contributions = x.map((v, i) => (model.coef[i] * (v - model.mean[i])) / model.scale[i]);
    const z = model.intercept + contributions.reduce((s, c) => s + c, 0);
    return { probability: sigmoid(z), contributions };
  }
  const contributions = new Array<number>(x.length).fill(0);
  // scikit-learn compares features as 32-bit floats inside its trees.
  const x32 = x.map((v) => Math.fround(v));
  let raw = model.init;
  for (const t of model.trees) {
    let node = 0;
    while (t.left[node] !== -1) {
      const f = t.feature[node];
      const child = x32[f] <= t.threshold[node] ? t.left[node] : t.right[node];
      contributions[f] += model.learningRate * (t.value[child] - t.value[node]);
      node = child;
    }
    raw += model.learningRate * t.value[node];
  }
  return { probability: sigmoid(raw), contributions };
}

/* ───────────── The model the app uses ───────────── */

type TrainedFile = typeof trained & ChurnModelParams;
export const CHURN_MODEL = trained as unknown as TrainedFile;

if (CHURN_MODEL.features.join() !== CHURN_FEATURES.join()) {
  throw new Error("churn-model.json was trained on different features; re-run ml/train.py");
}

export const featureVector = (f: ChurnFeatures) => CHURN_FEATURES.map((name) => f[name]);

/** What the admin page shows about the model. */
export const CHURN_MODEL_INFO: ChurnModelInfo = {
  name: CHURN_MODEL.name,
  version: CHURN_MODEL.version,
  trainedAt: CHURN_MODEL.trainedAt,
  syntheticData: CHURN_MODEL.syntheticData,
  label: CHURN_MODEL.label,
  thresholds: CHURN_MODEL.thresholds,
  minHistory: CHURN_MODEL.minHistory,
  test: {
    rows: CHURN_MODEL.test.rows,
    positives: CHURN_MODEL.test.positives,
    rocAuc: CHURN_MODEL.test.roc_auc,
    prAuc: CHURN_MODEL.test.pr_auc,
    precisionTop10: CHURN_MODEL.test.precision_top10,
    recallTop10: CHURN_MODEL.test.recall_top10,
    brier: CHURN_MODEL.test.brier,
  },
  baseline: {
    rows: CHURN_MODEL.baseline.rows,
    positives: CHURN_MODEL.baseline.positives,
    rocAuc: CHURN_MODEL.baseline.roc_auc,
    prAuc: CHURN_MODEL.baseline.pr_auc,
    precisionTop10: CHURN_MODEL.baseline.precision_top10,
    recallTop10: CHURN_MODEL.baseline.recall_top10,
    brier: CHURN_MODEL.baseline.brier,
  },
};
