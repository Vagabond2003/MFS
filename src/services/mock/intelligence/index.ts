/**
 * Merchant & agent intelligence: deterministic, pure functions over a DbState
 * snapshot. Every forecast, score, benchmark and flag is computed here; the AI
 * layer (src/server/ai) only puts these results into words.
 */
export { forecastSeries, merchantDemand } from "./forecast";
export { agentLiquidity, lowCashDays } from "./liquidity";
export { churnRanking, merchantChurnRisk, modelChurnScore, ruleChurnScore, CHURN_WEIGHTS } from "./churn";
export { churnSnapshot, hasModelHistory, CHURN_FEATURES } from "./churn-features";
export { CHURN_MODEL_INFO, scoreChurnModel } from "./churn-model";
export { merchantBenchmark, BENCHMARK_WINDOW_DAYS } from "./benchmark";
export { agentIntelligence, agentPerformance } from "./anomalies";
export { locationCoverage } from "./coverage";
export { merchantSignals, type MerchantSignal, type MerchantSignalCode } from "./recommendations";
