import type { HTMLAttributes } from "react";
import { cn } from "@/lib/utils";

/**
 * A skeleton preserves board and panel geometry. It never renders fake board
 * state, and it announces status once, not every frame. See UX section 5.
 */
export function Skeleton({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      aria-hidden="true"
      className={cn("animate-pulse rounded-(--radius-md) bg-line/60", className)}
      {...props}
    />
  );
}
