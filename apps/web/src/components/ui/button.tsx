/**
 * Button. shadcn-style, styled with the DS-020 semantic tokens.
 *
 * Labels use verb + object ("Acquire 4 Maple Stoop"), never a vague "Confirm".
 * One primary action per decision. Targets are at least 44 x 44 CSS px.
 * See DS-030 and UX-040.
 */
import { cva, type VariantProps } from "class-variance-authority";
import type { ButtonHTMLAttributes } from "react";
import { cn } from "@/lib/utils";

const buttonVariants = cva(
  [
    "inline-flex items-center justify-center gap-2 whitespace-nowrap",
    "rounded-(--radius-md) text-sm font-medium",
    "transition-colors duration-150",
    "disabled:pointer-events-none disabled:opacity-60",
    "[&_svg]:size-5 [&_svg]:shrink-0",
  ].join(" "),
  {
    variants: {
      variant: {
        primary: "bg-brand text-brand-ink hover:bg-brand/90 border border-transparent",
        secondary:
          "bg-surface-raised text-ink border border-line hover:bg-selection",
        destructive:
          "bg-danger text-brand-ink border-2 border-danger hover:bg-danger/90",
        ghost: "bg-transparent text-ink border border-transparent hover:bg-selection",
        link: "bg-transparent text-brand underline underline-offset-4 hover:no-underline",
      },
      size: {
        // 44 px minimum touch target. UX-040.
        default: "min-h-11 px-4 py-2",
        sm: "min-h-11 px-3 py-2 text-sm",
        lg: "min-h-12 px-6 py-3 text-base",
        icon: "size-11",
      },
    },
    defaultVariants: { variant: "secondary", size: "default" },
  },
);

export interface ButtonProps
  extends ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {}

export function Button({ className, variant, size, type, ...props }: ButtonProps) {
  return (
    <button
      type={type ?? "button"}
      className={cn(buttonVariants({ variant, size }), className)}
      {...props}
    />
  );
}

export { buttonVariants };
