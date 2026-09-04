/**
 * Small, DOM-free parts of the modal keyboard contract. Keeping these rules
 * separate makes the focus boundary testable without pretending a component
 * test is a browser test. See UX-040 and DS-070.
 */

export const FOCUSABLE_SELECTOR =
  "button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), a[href], [tabindex]:not([tabindex='-1'])";

export function wrappedTabIndex(
  activeIndex: number,
  controlCount: number,
  backwards: boolean,
): number | undefined {
  if (controlCount === 0) return undefined;
  if (backwards && activeIndex <= 0) return controlCount - 1;
  if (!backwards && activeIndex >= controlCount - 1) return 0;
  return undefined;
}

export function escapeDismisses(dismissible: boolean, key: string): boolean {
  return dismissible && key === "Escape";
}
