/**
 * Lobby state must come from the authenticated sync client. B11 removes the
 * final fabricated server projection; C1/C4 restore this live surface.
 */
import { notFound } from "next/navigation";

export default async function LobbyPage({ params }: { params: Promise<{ gameId: string }> }) {
  await params;
  notFound();
}
