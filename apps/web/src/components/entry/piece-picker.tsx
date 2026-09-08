"use client";

import { useEffect, useRef, type ChangeEvent } from "react";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import { PlayerToken } from "../game/player-token";
import {
  PIECE_OPTIONS,
  PIECE_PATTERN_LABELS,
  pieceIsAvailable,
  type PieceOptionId,
} from "./piece-options";

export interface PiecePickerProps {
  readonly name: string;
  readonly legend: string;
  readonly value?: PieceOptionId;
  readonly defaultValue?: PieceOptionId;
  readonly availablePieceIds?: readonly PieceOptionId[];
  readonly errorId?: string;
  readonly "aria-invalid"?: boolean;
  readonly onChange?: (pieceId: PieceOptionId) => void;
  readonly focusFirstAvailable?: boolean;
}

function changeHandler(
  onChange: PiecePickerProps["onChange"],
  event: ChangeEvent<HTMLInputElement>,
) {
  if (onChange === undefined) return;
  const piece = PIECE_OPTIONS.find((option) => option.token.pieceId === event.target.value);
  if (piece !== undefined) onChange(piece.token.pieceId);
}

export function PiecePicker({
  name,
  legend,
  value,
  defaultValue,
  availablePieceIds,
  errorId,
  "aria-invalid": ariaInvalid,
  onChange,
  focusFirstAvailable = false,
}: PiecePickerProps) {
  const fieldsetRef = useRef<HTMLFieldSetElement>(null);
  const controlled = value !== undefined;

  useEffect(() => {
    if (!focusFirstAvailable) return;
    fieldsetRef.current
      ?.querySelector<HTMLInputElement>('input[type="radio"]:not(:disabled)')
      ?.focus();
  }, [availablePieceIds, focusFirstAvailable]);

  return (
    <fieldset
      ref={fieldsetRef}
      className="flex min-w-0 flex-col gap-3"
      aria-invalid={ariaInvalid === true ? true : undefined}
      aria-describedby={errorId}
    >
      <legend className="text-sm font-medium">{legend}</legend>
      <div className="grid min-w-0 grid-cols-1 gap-3 min-[20rem]:grid-cols-2 sm:grid-cols-3">
        {PIECE_OPTIONS.map((piece) => {
          const available = pieceIsAvailable(piece, availablePieceIds);
          const patternLabel = PIECE_PATTERN_LABELS[piece.token.pattern];
          return (
            <Label
              key={piece.token.pieceId}
              className={cn(
                "flex min-h-20 min-w-0 cursor-pointer items-center gap-2 rounded-(--radius-md) border border-line p-3",
                "has-[:checked]:border-brand has-[:checked]:bg-selection",
                !available && "cursor-not-allowed opacity-60",
              )}
            >
              <input
                type="radio"
                name={name}
                value={piece.token.pieceId}
                {...(controlled
                  ? { checked: value === piece.token.pieceId }
                  : { defaultChecked: defaultValue === piece.token.pieceId })}
                disabled={!available}
                onChange={(event) => changeHandler(onChange, event)}
              />
              <PlayerToken token={piece.token} name={piece.label} className="shrink-0" />
              <span className="min-w-0">
                <span className="block truncate font-medium">{piece.label}</span>
                <span className="block text-xs text-muted-ink">{patternLabel}</span>
                {!available && <span className="block text-xs text-muted-ink">Unavailable</span>}
              </span>
            </Label>
          );
        })}
      </div>
    </fieldset>
  );
}

export { PIECE_OPTIONS } from "./piece-options";
