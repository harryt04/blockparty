/**
 * Completed-game state must come from an authorized projection. Do not show a
 * fabricated result while the sync client is not yet wired (C1/C12).
 */
import { notFound } from "next/navigation";

export default async function SummaryPage({ params }: { params: Promise<{ gameId: string }> }) {
  await params;
  notFound();
}
