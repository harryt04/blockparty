import { LobbyClient } from "@/components/game/lobby-client";

export default async function LobbyPage({ params }: { params: Promise<{ gameId: string }> }) {
  const { gameId } = await params;
  return <LobbyClient gameId={gameId} />;
}
