export interface SeatStepperProps {
  readonly id: string;
  readonly label: string;
  readonly value: number;
  readonly min: number;
  readonly max: number;
  readonly description?: string;
  readonly error?: string;
  readonly onChange: (value: number) => void;
}

export function clampSeatCount(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

export function seatCountAfterDelta(
  value: number,
  delta: -1 | 1,
  min: number,
  max: number,
): number {
  return clampSeatCount(value + delta, min, max);
}
