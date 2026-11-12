import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Eye, EyeOff } from "lucide-react";
import { Button } from "@/components/ui/button";
import { DemoBanner } from "@/components/DemoBanner";
import { usePerformerSession, type Connection } from "@/components/performer/usePerformerSession";
import { getApi } from "@/lib/session/client";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/perform")({
  validateSearch: (s: Record<string, unknown>) => ({ demo: s.demo === "1" || s.demo === 1 ? ("1" as const) : undefined }),
  head: () => ({
    meta: [
      { title: "Console" },
      { name: "description", content: "Private performer console." },
      { name: "robots", content: "noindex, nofollow" },
      { property: "og:title", content: "Console" },
      { property: "og:description", content: "Private performer console." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: PerformerPage,
});

function ConnectionPill({ c }: { c: Connection }) {
  const label = { online: "Connected", reconnecting: "Reconnecting…", offline: "Offline" }[c];
  return (
    <span className="inline-flex items-center gap-1.5 font-mono text-[11px] uppercase tracking-wider text-muted-foreground">
      <span className={cn("h-2 w-2 rounded-full", c === "online" ? "bg-success" : "bg-destructive animate-pulse-dot")} />
      {label}
    </span>
  );
}

function PerformerPage() {
  const { demo } = Route.useSearch();
  const s = usePerformerSession(getApi(demo === "1"));
  const [revealed, setRevealed] = useState(false);
  const [confirmEnd, setConfirmEnd] = useState(false);
  const state = s.status?.state;

  useEffect(() => { if (state !== "received") setRevealed(false); }, [state]);
  useEffect(() => { if (!confirmEnd) return; const t = setTimeout(() => setConfirmEnd(false), 3000); return () => clearTimeout(t); }, [confirmEnd]);

  return (
    <div className="performer flex min-h-[100dvh] flex-col">
      {demo && <DemoBanner />}
      <header className="flex items-center justify-between px-5 pt-[max(1rem,env(safe-area-inset-top))] pb-2">
        <span className="font-mono text-xs uppercase tracking-widest text-muted-foreground">Console</span>
        {s.creds && state !== "ended" && <ConnectionPill c={s.connection} />}
      </header>

      <main className="flex flex-1 flex-col justify-end gap-4 px-5 pb-[max(1.5rem,env(safe-area-inset-bottom))]">
        {!s.creds && state !== "ended" && (
          <div className="space-y-4">
            <h1 className="text-4xl">Ready when you are.</h1>
            <p className="text-muted-foreground">Create a session, then give the code to your participant.</p>
            {s.error && <p role="alert" className="text-sm text-destructive">{s.error}</p>}
            <Button size="lg" className="h-16 w-full text-lg" onClick={() => void s.create()} disabled={s.busy}>
              {s.busy ? "Creating…" : "Create session"}
            </Button>
          </div>
        )}

        {state === "ended" && (
          <div className="space-y-4">
            <h1 className="text-3xl">Session ended</h1>
            <p className="text-muted-foreground">It was ended or expired and can no longer receive words.</p>
            <Button size="lg" className="h-16 w-full text-lg" onClick={s.reset}>New session</Button>
          </div>
        )}

        {s.creds && state !== "ended" && (
          <>
            <section className="rounded-2xl border border-border bg-card p-5 text-center">
              <p className="text-xs uppercase tracking-wider text-muted-foreground">Session code</p>
              <p className="mt-1 font-mono text-4xl tracking-[0.25em]">{s.creds.code}</p>
            </section>

            <section aria-live="polite" className="flex min-h-56 flex-col items-center justify-center rounded-2xl border border-border bg-card p-5 text-center">
              {(!s.status || state === "waiting") && (
                <>
                  <span className="h-3 w-3 rounded-full bg-primary animate-pulse-dot" />
                  <p className="mt-3 text-muted-foreground">Waiting for a word…</p>
                </>
              )}
              {s.status?.state === "received" && (
                revealed ? (
                  <p className="break-all font-display text-5xl">{s.status.word}</p>
                ) : (
                  <>
                    <p className="text-sm uppercase tracking-wider text-muted-foreground">Word received</p>
                    <p className="mt-3 select-none font-display text-5xl text-muted-foreground blur-md" aria-hidden>••••••</p>
                  </>
                )
              )}
            </section>

            {s.status?.state === "received" && (
              <Button size="lg" variant="secondary" className="h-16 w-full text-lg" onClick={() => setRevealed((r) => !r)}>
                {revealed ? <><EyeOff /> Hide</> : <><Eye /> Reveal</>}
              </Button>
            )}
            {s.error && <p role="alert" className="text-sm text-destructive">{s.error}</p>}
            <Button
              size="lg"
              variant={confirmEnd ? "destructive" : "outline"}
              className="h-14 w-full"
              disabled={s.busy}
              onClick={() => (confirmEnd ? void s.end() : setConfirmEnd(true))}
            >
              {confirmEnd ? "Tap again to end & delete" : "End session"}
            </Button>
          </>
        )}
      </main>
    </div>
  );
}
