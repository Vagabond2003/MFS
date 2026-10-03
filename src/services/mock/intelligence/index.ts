/**
 * Merchant & agent intelligence: deterministic, pure functions over a DbState
 * snapshot. Every forecast, score, benchmark and flag is computed here; the AI
 * layer (src/server/ai) only puts these results into words.
 */
export { forecastSeries, merchantDemand } from "./forecast";
export { agentLiquidity, lowCashDays } from "./liquidity";
export { churnRanking, merchantChurnRisk, CHURN_WEIGHTS } from "./churn";
export { merchantBenchmark, BENCHMARK_WINDOW_DAYS } from "./benchmark";
export { agentIntelligence, agentPerformance } from "./anomalies";
export { locationCoverage } from "./coverage";
export { merchantSignals, type MerchantSignal, type MerchantSignalCode } from "./recommendations";
