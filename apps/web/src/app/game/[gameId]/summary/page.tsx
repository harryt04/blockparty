/** Completion is fetched from the authorized terminal projection. See C12. */
import type { Metadata } from "next";
import { SummaryClient } from "@/components/game/summary-client";

export const metadata: Metadata = { title: "Game summary" };

export default async function SummaryPage({ params }: { params: Promise<{ gameId: string }> }) {
  const { gameId } = await params;
  return <SummaryClient gameId={gameId} />;
}
