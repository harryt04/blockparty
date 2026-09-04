/**
 * The live game surface is supplied by the sync client in C1. Until then,
 * never render fabricated game state from a server-side scaffold.
 */
import { notFound } from "next/navigation";

export default async function GamePage({ params }: { params: Promise<{ gameId: string }> }) {
  await params;
  notFound();
}
