/**
 * Badge. Every variant carries a border and text; color is supplemental.
 * See DS-020 and DS-041.
 */
import { cva, type VariantProps } from "class-variance-authority";
import type { HTMLAttributes } from "react";
import { cn } from "@/lib/utils";

const badgeVariants = cva(
  "inline-flex items-center gap-1 rounded-(--radius-pill) border px-2.5 py-0.5 text-xs font-medium",
  {
    variants: {
      variant: {
        neutral: "border-line bg-surface text-muted-ink",
        brand: "border-brand bg-brand/10 text-brand",
        success: "border-success bg-success/10 text-success",
        // Warning and danger take a strong border. DS-020.
        warning: "border-2 border-warning bg-warning/10 text-warning",
        danger: "border-2 border-danger bg-danger/10 text-danger",
        info: "border-info bg-info/10 text-info",
      },
    },
    defaultVariants: { variant: "neutral" },
  },
);

export interface BadgeProps
  extends HTMLAttributes<HTMLSpanElement>,
    VariantProps<typeof badgeVariants> {}

export function Badge({ className, variant, ...props }: BadgeProps) {
  return <span className={cn(badgeVariants({ variant }), className)} {...props} />;
}
