import { GameClient } from "@/components/game/game-client";

export default async function GamePage({ params }: { params: Promise<{ gameId: string }> }) {
  const { gameId } = await params;
  return <GameClient gameId={gameId} />;
}
