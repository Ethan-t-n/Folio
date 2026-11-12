import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export function CodeEntry({ onJoin, error, busy }: { onJoin: (code: string) => void; error?: string | undefined; busy: boolean }) {
  const [code, setCode] = useState("");
  return (
    <form
      className="mx-auto mt-10 max-w-sm space-y-4"
      onSubmit={(e) => { e.preventDefault(); if (code.trim()) onJoin(code); }}
    >
      <h1 className="text-4xl leading-tight">Every article,<br /><em className="text-primary">by the numbers.</em></h1>
      <p className="text-muted-foreground">Enter your access code to start exploring.</p>
      <Input
        aria-label="Access code"
        value={code}
        onChange={(e) => setCode(e.target.value.toUpperCase())}
        placeholder="e.g. K7Q2MX"
        autoCapitalize="characters"
        autoComplete="off"
        maxLength={12}
        className="h-12 text-center font-mono text-xl tracking-[0.3em]"
      />
      {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
      <Button type="submit" size="lg" className="w-full" disabled={busy || !code.trim()}>
        {busy ? "Checking…" : "Continue"}
      </Button>
    </form>
  );
}
