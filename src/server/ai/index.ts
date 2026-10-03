/**
 * AI wording for the merchant & agent insights. Server-only.
 *
 * Numbers come from code (src/services/mock/intelligence); this layer only
 * turns them into words, falls back to fixed templates, and never sees or
 * produces anything that can move money.
 */
export { explain, type Explanation } from "./explain";
export {
  agentsFacts,
  benchmarkFacts,
  churnFacts,
  coverageFacts,
  demandFacts,
  liquidityFacts,
  performanceFacts,
  recommendationFacts,
  KINDS,
  type InsightKind,
} from "./kinds";
export { planNote, resolveNote, type AiNote, type NotePlan } from "./notes";
