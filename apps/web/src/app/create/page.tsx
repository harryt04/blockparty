/**
 * `/create` - Create. See UX-041, PRD-FUN-021, and ENG-029.
 *
 * Game name (optional, length-limited), player count 2-6, bot seats, the
 * ruleset and variant selector, the privacy note, and Create lobby.
 * Invalid combinations explain the fix inline.
 */
import type { Metadata } from "next";
import { CreateGameForm } from "@/components/entry/create-form";
import { AppShell } from "@/components/shell/app-shell";

export const metadata: Metadata = { title: "Create a game" };

export default function CreatePage() {
  return (
    <AppShell>
      <div className="mx-auto flex max-w-2xl flex-col gap-6">
        <h1 className="font-serif text-2xl">Create a game</h1>
        <CreateGameForm />
      </div>
    </AppShell>
  );
}
