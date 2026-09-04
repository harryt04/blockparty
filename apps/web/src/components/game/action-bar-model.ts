import type { ActionAvailability, LegalAction } from "@blockparty/contracts";

export function actionRenderKey(
  action: LegalAction | ActionAvailability,
  group: "legal" | "blocked",
  index: number,
): string {
  const constraints = "constraints" in action ? action.constraints : undefined;
  const reasonCode = "reasonCode" in action ? action.reasonCode : undefined;
  return `${group}:${action.type}:${JSON.stringify(constraints ?? {})}:${reasonCode ?? ""}:${index}`;
}
