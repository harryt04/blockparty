import { cn } from "@/lib/utils";

const PIP_POSITIONS = [
  "center",
  "top-left",
  "bottom-right",
  "top-right",
  "bottom-left",
  "middle-left",
  "middle-right",
] as const;

function Die({ value }: { value: number }) {
  const positions =
    value === 1
      ? [0]
      : value === 2
        ? [1, 2]
        : value === 3
          ? [1, 0, 2]
          : value === 4
            ? [1, 3, 4, 2]
            : value === 5
              ? [1, 3, 0, 4, 2]
              : [1, 3, 5, 6, 4, 2];
  return (
    <span className="game-die" aria-label={`Die showing ${value}`}>
      {PIP_POSITIONS.map((position, index) => (
        <span
          key={position}
          className={cn(
            "game-die-pip",
            `game-die-pip-${position}`,
            positions.includes(index) && "game-die-pip-visible",
          )}
        />
      ))}
    </span>
  );
}

export function DicePair({
  dice,
  animate = false,
}: {
  dice: readonly [number, number];
  animate?: boolean;
}) {
  return (
    <div
      className={cn("game-dice-pair", animate && "game-dice-tumble")}
      aria-label={`Server roll: ${dice[0]} plus ${dice[1]} equals ${dice[0] + dice[1]}`}
    >
      <Die value={dice[0]} />
      <span className="text-sm font-semibold" aria-hidden="true">
        +
      </span>
      <Die value={dice[1]} />
    </div>
  );
}
