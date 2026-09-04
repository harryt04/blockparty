import Link from "next/link";
import { AppShell } from "@/components/shell/app-shell";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { buttonVariants } from "@/components/ui/button";

export const dynamic = "force-static";

export default function OfflinePage() {
  return (
    <AppShell>
      <div className="mx-auto flex max-w-xl flex-col gap-6">
        <h1 className="font-serif text-3xl">You are offline</h1>
        <Alert variant="warning">
          <div>
            <AlertTitle>Live play requires reconnection</AlertTitle>
            <AlertDescription>
              The app shell is available, but commands and game state cannot be read or changed
              without a network connection.
            </AlertDescription>
          </div>
        </Alert>
        <Link href="/" className={buttonVariants({ variant: "secondary" })}>
          Return home
        </Link>
      </div>
    </AppShell>
  );
}
