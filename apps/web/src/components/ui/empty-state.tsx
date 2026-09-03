import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

/**
 * An empty state explains WHY it is empty and gives the permitted next action
 * where one exists. See UX section 5.
 */
export function EmptyState({
  title,
  description,
  action,
  className,
}: {
  title: string;
  description: string;
  action?: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "flex flex-col items-center gap-2 rounded-(--radius-md) border border-dashed border-line p-6 text-center",
        className,
      )}
    >
      <p className="font-medium text-ink">{title}</p>
      <p className="max-w-prose text-sm text-muted-ink">{description}</p>
      {action}
    </div>
  );
}
