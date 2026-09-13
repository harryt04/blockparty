/**
 * Alert. Plain-language message, scope, and a safe next step.
 * Warning and danger take a strong border so the meaning survives grayscale.
 * See UX section 5 and DS-020.
 */
import { cva, type VariantProps } from "class-variance-authority";
import type { HTMLAttributes } from "react";
import { cn } from "@/lib/utils";

const alertVariants = cva(
  "flex gap-3 rounded-(--radius-md) border p-4 text-sm [&_svg]:size-5 [&_svg]:shrink-0",
  {
    variants: {
      variant: {
        info: "border-info bg-info/10 text-ink",
        success: "border-success bg-success/10 text-ink",
        warning: "border-2 border-warning bg-warning/10 text-ink",
        danger: "border-2 border-danger bg-danger/10 text-ink",
      },
    },
    defaultVariants: { variant: "info" },
  },
);

export interface AlertProps
  extends HTMLAttributes<HTMLDivElement>, VariantProps<typeof alertVariants> {}

export function Alert({ className, variant, ...props }: AlertProps) {
  return <div role="note" className={cn(alertVariants({ variant }), className)} {...props} />;
}

export function AlertTitle({ className, ...props }: HTMLAttributes<HTMLParagraphElement>) {
  return <p className={cn("font-medium", className)} {...props} />;
}

export function AlertDescription({ className, ...props }: HTMLAttributes<HTMLParagraphElement>) {
  return <p className={cn("text-muted-ink", className)} {...props} />;
}
