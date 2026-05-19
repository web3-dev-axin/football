import { DEFAULT_RISK_LIMITS, evaluateRiskOrder, type RiskLimit } from "@polygoal/shared";

export function defaultRiskLimit(): RiskLimit {
  return { ...DEFAULT_RISK_LIMITS };
}

export function evaluateOrderRisk(input: { userExposureRaw: string; marketVolumeRaw: string; orderAmountRaw: string; limit?: RiskLimit }) {
  return evaluateRiskOrder({ ...input, limits: input.limit ?? DEFAULT_RISK_LIMITS });
}
