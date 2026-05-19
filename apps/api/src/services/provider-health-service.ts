import { shouldAutoPauseForProviderHealth, type ProviderHealthCheck } from "@polygoal/shared";

export function providerHealthRequiresPause(checks: ProviderHealthCheck[]) {
  return shouldAutoPauseForProviderHealth(checks);
}
