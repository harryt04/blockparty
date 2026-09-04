/**
 * Persistent connection status: icon plus text, never an icon alone.
 * See UX section 5 and UX-018.
 *
 * The sync client drives this persistent status from bootstrap and SSE state.
 */
import { Plug, RefreshCw, WifiOff } from "lucide-react";
import { cn } from "@/lib/utils";

export type ConnectionState = "connecting" | "live" | "reconnecting" | "resyncing" | "closed";

const STATES = {
  connecting: { label: "Connecting", icon: RefreshCw, tone: "text-warning border-warning" },
  live: { label: "Connected", icon: Plug, tone: "text-success border-success" },
  reconnecting: {
    label: "Reconnecting",
    icon: RefreshCw,
    tone: "text-warning border-2 border-warning",
  },
  resyncing: { label: "Resyncing", icon: RefreshCw, tone: "text-warning border-2 border-warning" },
  closed: { label: "Unavailable", icon: WifiOff, tone: "text-danger border-2 border-danger" },
} as const;

export function ConnectionStatus({
  state = "connecting",
  className,
}: {
  state?: ConnectionState;
  className?: string;
}) {
  const { label, icon: Icon, tone } = STATES[state];
  return (
    <p
      // Restrained announcements: status, not assertive. UX-040.
      role="status"
      aria-live="polite"
      className={cn(
        "inline-flex items-center gap-2 rounded-(--radius-pill) border bg-surface px-3 py-1 text-xs font-medium",
        tone,
        className,
      )}
    >
      <Icon aria-hidden="true" className="size-4" />
      {label}
    </p>
  );
}
