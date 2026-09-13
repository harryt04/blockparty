/**
 * A skeleton preserves the panel geometry and announces status ONCE, not on
 * every frame. It never renders fake board state. See UX section 5.
 */
import { Skeleton } from "@/components/ui/skeleton";

export default function Loading() {
  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-4 px-4 py-6">
      <p role="status" aria-live="polite" className="sr-only">
        Loading
      </p>
      <Skeleton className="h-8 w-56" />
      <Skeleton className="h-40 w-full" />
      <Skeleton className="h-40 w-full" />
    </div>
  );
}
