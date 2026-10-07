# Model card: merchant churn

> **Trained and tested on synthetic data only.** Kosh has no real payment
> history yet. Every number below comes from our own simulator, whose churn
> process we designed, and says nothing yet about real merchants.

| | |
|---|---|
| **Model** | Logistic regression on 11 standardised features (`Churn logistic regression`) |
| **Version / trained** | `churn-2026-10-07`, trained 2026-10-07 |
| **Code** | Training: `ml/train.py` (scikit-learn 1.9.1, seed 20261008). Serving: `src/services/mock/intelligence/churn-model.ts`, a pure-TypeScript scorer reading `churn-model.json` (no Python on the server) |
| **Parity** | `tests/churn-model.test.ts`: the TS scorer matches Python's probabilities and per-feature contributions to within 1e-9 on 200 test rows, for both model kinds |
| **Output** | Probability that a verified merchant has **no successful payment in the next 30 days**. Shown as a percentage; HIGH ≥ 50%, MEDIUM ≥ 15% |
| **Owner** | Kosh team. Questions about a score: the admin Intelligence page shows its reasons |

## Intended use

- **For:** the operations team, on the admin Intelligence page, to decide which merchants to contact first (a call, a visit, help with a failing QR terminal).
- **How:** a ranked list with a probability and the main reasons for each merchant. An admin confirms or dismisses each flag; decisions are stored and audit-logged.
- **Not for:** anything automatic or adverse. Not credit decisions, fees, limits, account restrictions, or judging a merchant's honesty. Not shown to merchants as a score. Merchants see recommendations ("win back regular customers"), not their churn probability.

## Data

- **Source:** `scripts/generate-large.mjs`: 1,600 merchants, 80 agents and 4,000 customers in 8 districts over 330 days, ≈ 710,000 transactions, fixed seed. Stored in `data/` (gitignored), never in a database. See [evaluation.md](evaluation.md#1-churn-model) for how churn is simulated.
- **Rows:** one per merchant per weekly snapshot, for verified merchants with tenure ≥ 30 days and ≥ 5 successful payments in the 60 days before the snapshot. 36,681 rows from 1,509 merchants and 30 snapshots; 5.0% positive.
- **Label:** no successful payment in the 30 days after the snapshot.
- **Features** (all strictly before the snapshot, computed by the same TypeScript the app uses, `churn-features.ts`):

| Feature | Meaning |
|---|---|
| `days_since_last` | days since the last successful payment (capped at 60) |
| `count_drop`, `value_drop` | payments and value, last 14 days vs the 14 before (0 = no drop, 1 = nothing left) |
| `failure_rate` | failed share of payment attempts, 30 days |
| `refund_rate` | refunded share of revenue, 30 days |
| `tenure_days` | days since the account was created (capped at 365) |
| `trend_8w` | weekly payment counts over 8 weeks: slope ÷ mean |
| `top_customer_share` | share of the last 60 days' payments from the most frequent customer |
| `repeat_share` | share of the last 60 days' payments from customers who paid 2+ times |
| `log_payments_60` | ln(1 + payments in the last 60 days) |
| `active_days_28` | share of the last 28 days with a payment |

The first five are the rule score's factors. No names, phone numbers, district or category are features.

## Training

- **Split:** by merchant (30% of merchants, chosen by hash, only in test) and by time (test = last 8 weekly snapshots; train only uses snapshots whose label window closes before test starts). Asserted in code.
- **Selection:** logistic regression vs gradient boosting (200 depth-3 trees), compared on a validation slice inside train. Validation PR-AUC: logistic regression 0.909, gradient boosting 0.869, rule score 0.526. Logistic regression was chosen; boosting would only have been chosen with a 0.01 lead.
- **Reproduce:** `npm run ml`. Same numbers every run.

## Metrics

Held-out test set: 366 merchants never seen in training, 2,799 snapshots, 133 churned. 95% intervals resample whole merchants. Full tables, calibration and the other model: [evaluation.md](evaluation.md#1-churn-model).

| | Model | Rule score (current baseline) |
|---|---|---|
| ROC-AUC | 0.979 (0.961–0.993) | 0.953 (0.929–0.971) |
| PR-AUC | 0.881 (0.803–0.941) | 0.604 (0.482–0.709) |
| Precision, top 10% | 44.6% | 43.2% |
| Recall, top 10% | 94.0% | 91.0% |
| Brier score | 0.012 | — (not a probability) |
| HIGH flags: precision / recall | 89.6% / 77.4% (p ≥ 0.50) | 73.5% / 37.6% (score ≥ 60) |

**Hard cases** (merchants paid in the 14 days before the snapshot): 2,689 rows, only 36 churned. PR-AUC 0.489 (0.325–0.653) against 0.350 (0.199–0.518) for the rule score. The direction favours the model, but the intervals overlap: **not enough evidence to call it better there.** Top-10% precision is capped by the 1.3% base rate.

Calibration: expected calibration error 0.008; in the top decile the model predicts 42.8% and 44.8% churned.

## Fairness

[evaluation.md § 2](evaluation.md#2-fairness): no measurable skew by district. **Small merchants who keep trading are flagged more often** than large ones (false-positive rate a few percent vs near zero; intervals don't overlap), as they were, more strongly, under the rule score. There is a smaller category gap that may follow size.

## Explanations

The reasons shown for a merchant are the features that push its log-odds up most, relative to the average training merchant (coefficient × standardised value). They are grouped where features move together (payment volume and active days are read as one "activity" reason), and shown only when the value itself points to risk: a merchant is never told "high volume" or "rising trend" as a reason. Points add up to 100 across the reasons shown. These are associations the model learned, **not causes**. The reasons feed the same factors UI and AI summary as the rule score.

## Fallback

Merchants with tenure under 30 days or fewer than 5 payments in 60 days are scored by the rule score (0–100 points from the five factors), marked "Rule score (short history)" on the page. The model was never trained on such histories.

## Limitations and risks

- **Synthetic data.** The model can only be as right as the simulator. Real churn will have causes the simulator lacks (seasonality, competition, Eid closures), and the generator's own hazard factors (concentration, repeat share) turned out weak next to recency.
- **The easy cases dominate the headline numbers.** Merchants already quiet before the snapshot are easy to call; read the hard-case table.
- **Label noise.** "No payment in 30 days" also catches seasonal closures and very low-volume shops; 8% of simulated leavers come back.
- **Feedback loop.** If the team contacts flagged merchants and they stay, future labels will look like false alarms. Keep confirm/dismiss decisions and outreach records separate from labels when retraining.
- **Size skew** (above): small merchants get more false alarms.
- **Collinear features.** The logistic coefficients for volume and active days have opposite signs. Individual coefficients shouldn't be read as effects; the grouped reason is.

## Maintenance

- Retrain with `npm run ml` after changing features, the label or the data. `npm test` then fails if the TS scorer no longer matches Python, or if `churn-model.json` was trained on different features than the app computes.
- Replace the synthetic dataset with real history (exported read-only, never by writing to the live database) before trusting the numbers. Admin confirm/dismiss decisions (`flag_reviews`) are the first real labels for checking precision.
