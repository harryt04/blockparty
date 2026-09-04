/**
 * `/join/[inviteId]` - the join gate. See UX section 2 and UX-011.
 *
 * Validates the invitation, then lets the joiner choose a game-scoped
 * pseudonym and a token, and acknowledge the 13+ notice.
 *
 * Expired, invalid, full, and ended states give a safe exit and reveal nothing
 * about the private room. Never request a real name. See PRD-FUN-003.
 */
import type { Metadata } from "next";
import { JoinGate } from "@/components/entry/join-gate";
import { AppShell } from "@/components/shell/app-shell";

export const metadata: Metadata = { title: "Join a game" };

export default async function JoinPage({ params }: { params: Promise<{ inviteId: string }> }) {
  const { inviteId } = await params;

  return (
    <AppShell>
      <div className="mx-auto flex max-w-md flex-col gap-6">
        <h1 className="font-serif text-2xl">Join a private game</h1>
        <JoinGate inviteId={inviteId} />
      </div>
    </AppShell>
  );
}
