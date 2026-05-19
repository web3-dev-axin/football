import { shouldAutoPauseForProviderHealth, type ProviderHealthCheck } from "@worldcup/shared";

export function providerHealthRequiresPause(checks: ProviderHealthCheck[]) {
  return shouldAutoPauseForProviderHealth(checks);
}
