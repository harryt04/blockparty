/**
 * Persistent connection status: icon plus text, never an icon alone.
 * See UX section 5 and UX-018.
 *
 * SCAFFOLD: the state is a prop today. The sync client drives it once
 * /api/games/[gameId]/events and /sync are real.
 */
import { Pause, Plug, RefreshCw, WifiOff } from "lucide-react";
import { cn } from "@/lib/utils";

export type ConnectionState = "connected" | "reconnecting" | "offline" | "paused";

const STATES = {
  connected: { label: "Connected", icon: Plug, tone: "text-success border-success" },
  reconnecting: {
    label: "Reconnecting",
    icon: RefreshCw,
    tone: "text-warning border-2 border-warning",
  },
  offline: { label: "Offline", icon: WifiOff, tone: "text-danger border-2 border-danger" },
  paused: { label: "Paused", icon: Pause, tone: "text-info border-info" },
} as const;

export function ConnectionStatus({
  state = "connected",
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
