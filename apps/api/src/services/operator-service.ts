import { ApiError } from "./errors";

export function requireOperator(operatorId: string | undefined): string {
  if (!operatorId?.trim()) throw new ApiError("OPERATOR_UNAUTHORIZED", "Operator credentials are required", 401);
  return operatorId;
}
