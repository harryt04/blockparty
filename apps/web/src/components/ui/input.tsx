import type { InputHTMLAttributes } from "react";
import { cn } from "@/lib/utils";

export function Input({
  className,
  ...props
}: InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      className={cn(
        "min-h-11 w-full rounded-(--radius-md) border border-line bg-surface-raised px-3 py-2",
        "text-base text-ink placeholder:text-muted-ink",
        "disabled:cursor-not-allowed disabled:opacity-60",
        "aria-[invalid=true]:border-2 aria-[invalid=true]:border-danger",
        className,
      )}
      {...props}
    />
  );
}
