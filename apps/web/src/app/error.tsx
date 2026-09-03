"use client";

/**
 * Route-level error boundary. See UX section 5.
 *
 * Plain language, the scope of the failure, a retry, and a safe way out. It
 * never claims a command succeeded, and it never shows the raw error: an
 * exception message can carry internal detail. See SEC-004.
 */
import Link from "next/link";
import { useEffect } from "react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button, buttonVariants } from "@/components/ui/button";

export default function RouteError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // TODO(SEC-004): report the digest and the error class to the structured
    // logger. Never the message, the stack, or any payload.
    console.error("Route error", error.digest);
  }, [error]);

  return (
    <div className="mx-auto flex max-w-md flex-col gap-4 px-4 py-10">
      <Alert variant="danger">
        <div>
          <AlertTitle>This page could not load</AlertTitle>
          <AlertDescription>
            Nothing in your game was changed. Try again, or go back home.
          </AlertDescription>
        </div>
      </Alert>
      <div className="flex flex-wrap gap-3">
        <Button variant="primary" onClick={reset}>
          Try again
        </Button>
        <Link href="/" className={buttonVariants({ variant: "ghost" })}>
          Back to home
        </Link>
      </div>
    </div>
  );
}
