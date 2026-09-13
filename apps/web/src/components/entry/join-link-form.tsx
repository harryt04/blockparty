"use client";

import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { invitePathFromInput } from "./create-form-model";

export function JoinLinkForm() {
  const router = useRouter();
  const [error, setError] = useState<string>();

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const path = invitePathFromInput(String(form.get("inviteLink") ?? ""));
    if (path === undefined) {
      setError("Paste a valid Blockparty invite link.");
      return;
    }
    setError(undefined);
    router.push(path);
  }

  return (
    <form className="flex flex-col gap-3 sm:flex-row sm:items-end" onSubmit={submit} noValidate>
      <div className="flex-1">
        <Label htmlFor="invite-link">Invite link</Label>
        <Input
          id="invite-link"
          name="inviteLink"
          type="url"
          inputMode="url"
          autoComplete="off"
          placeholder="https://example.com/join/..."
          className="mt-1"
          aria-invalid={error === undefined ? undefined : true}
          aria-describedby={error === undefined ? undefined : "invite-link-error"}
        />
        {error === undefined ? null : (
          <p id="invite-link-error" className="mt-1 text-sm text-danger" role="alert">
            {error}
          </p>
        )}
      </div>
      <Button variant="secondary" type="submit">
        Open invite
      </Button>
    </form>
  );
}
