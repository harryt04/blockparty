"use client";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { seatCountAfterDelta, type SeatStepperProps } from "./seat-stepper-model";

export function SeatStepper({
  id,
  label,
  value,
  min,
  max,
  description,
  error,
  onChange,
}: SeatStepperProps) {
  const valueId = `${id}-value`;
  const descriptionId = description === undefined ? undefined : `${id}-description`;
  const errorId = error === undefined ? undefined : `${id}-error`;
  const describedBy =
    [descriptionId, errorId].filter((entry) => entry !== undefined).join(" ") || undefined;

  return (
    <div className="flex min-w-0 flex-col gap-3" aria-describedby={describedBy}>
      <div className="flex min-w-0 items-center justify-between gap-3 max-[20rem]:flex-col max-[20rem]:items-start">
        <span id={`${id}-label`} className="min-w-0 text-sm font-medium">
          {label}
        </span>
        <div className="flex shrink-0 items-center gap-2">
          <Button
            aria-label={`Decrease ${label}`}
            aria-controls={valueId}
            disabled={value <= min}
            size="icon"
            onClick={() => onChange(seatCountAfterDelta(value, -1, min, max))}
          >
            <span aria-hidden="true">−</span>
          </Button>
          <output
            id={valueId}
            className={cn(
              "flex min-h-11 min-w-11 items-center justify-center rounded-(--radius-md) border border-line px-3 font-mono text-base tabular",
              error !== undefined && "border-danger",
            )}
            aria-live="polite"
            aria-atomic="true"
            aria-labelledby={`${id}-label`}
          >
            {value}
          </output>
          <Button
            aria-label={`Increase ${label}`}
            aria-controls={valueId}
            disabled={value >= max}
            size="icon"
            onClick={() => onChange(seatCountAfterDelta(value, 1, min, max))}
          >
            <span aria-hidden="true">+</span>
          </Button>
        </div>
      </div>
      {description === undefined ? null : (
        <p id={descriptionId} className="text-sm text-muted-ink">
          {description}
        </p>
      )}
      {error === undefined ? null : (
        <p id={errorId} className="text-sm text-danger" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}

export { clampSeatCount, seatCountAfterDelta } from "./seat-stepper-model";
