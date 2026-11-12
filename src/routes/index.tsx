import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { CheckCircle2 } from "lucide-react";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription,
  AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { DemoBanner } from "@/components/DemoBanner";
import { CodeEntry } from "@/components/participant/CodeEntry";
import { SearchPanel } from "@/components/participant/SearchPanel";
import { ArticleReader } from "@/components/participant/ArticleReader";
import { getApi } from "@/lib/session/client";

export const Route = createFileRoute("/")({
  validateSearch: (s: Record<string, unknown>): { demo?: "1" } =>
    s["demo"] === "1" || s["demo"] === 1 ? { demo: "1" } : {},
  head: () => ({
    meta: [
      { title: "Folio — article stats & discovery" },
      { name: "description", content: "Search any topic, open the article and explore its statistics." },
      { property: "og:title", content: "Folio — article stats & discovery" },
      { property: "og:description", content: "Search any topic, open the article and explore its statistics." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: ParticipantPage,
});

type Phase =
  | { kind: "code" }
  | { kind: "browse"; title: string | null }
  | { kind: "sent"; word: string }
  | { kind: "expired" };

function ParticipantPage() {
  const { demo } = Route.useSearch();
  const api = getApi(demo === "1");
  const [phase, setPhase] = useState<Phase>({ kind: "code" });
  const [creds, setCreds] = useState<{ sessionId: string; participantToken: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [codeError, setCodeError] = useState<string>();
  const [selected, setSelected] = useState<{ key: string; word: string } | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [sendError, setSendError] = useState<string>();

  async function join(code: string) {
    setBusy(true); setCodeError(undefined);
    const r = await api.joinSession(code);
    setBusy(false);
    if (!r.ok) return setCodeError(r.error === "not_found" ? "That code isn't active. Check it and try again." : r.message);
    setCreds(r.data);
    setPhase({ kind: "browse", title: null });
  }

  async function send() {
    if (!creds || !selected || busy) return;
    setBusy(true); setSendError(undefined);
    const r = await api.submitWord(creds.sessionId, creds.participantToken, selected.word);
    setBusy(false);
    setConfirming(false);
    if (r.ok) return setPhase({ kind: "sent", word: selected.word });
    if (r.error === "expired" || r.error === "unauthorized") return setPhase({ kind: "expired" });
    if (r.error === "already_sent") return setPhase({ kind: "sent", word: selected.word });
    setSendError(r.message);
  }

  return (
    <div className="min-h-screen">
      {demo && <DemoBanner />}
      <header className="border-b border-border">
        <div className="mx-auto flex max-w-2xl items-center justify-between px-5 py-4">
          <span className="font-display text-2xl">Folio<span className="text-primary">.</span></span>
          <span className="font-mono text-[11px] uppercase tracking-widest text-muted-foreground">article stats</span>
        </div>
      </header>

      <main className="mx-auto max-w-2xl px-5 py-6">
        {phase.kind === "code" && <CodeEntry onJoin={join} error={codeError} busy={busy} />}

        {phase.kind === "browse" && phase.title === null && <SearchPanel onOpen={(t) => { setSelected(null); setPhase({ kind: "browse", title: t }); }} />}
        {phase.kind === "browse" && phase.title !== null && (
          <ArticleReader title={phase.title} onBack={() => setPhase({ kind: "browse", title: null })} selected={selected} onSelect={setSelected} />
        )}

        {phase.kind === "sent" && (
          <div className="mx-auto mt-16 max-w-sm text-center">
            <CheckCircle2 className="mx-auto h-12 w-12 text-success" />
            <h1 className="mt-4 text-3xl">Shared.</h1>
            <p className="mt-2 text-muted-foreground">Your word was sent once. You can put your phone away.</p>
          </div>
        )}

        {phase.kind === "expired" && (
          <div className="mx-auto mt-16 max-w-sm text-center">
            <h1 className="text-3xl">This session has ended</h1>
            <p className="mt-2 text-muted-foreground">Ask for a new code to start again.</p>
            <Button className="mt-6" onClick={() => { setCreds(null); setPhase({ kind: "code" }); }}>Enter a new code</Button>
          </div>
        )}
      </main>

      {phase.kind === "browse" && phase.title && selected && (
        <div className="fixed inset-x-0 bottom-0 border-t border-border bg-card/95 p-4 backdrop-blur">
          <div className="mx-auto flex max-w-2xl items-center justify-between gap-3">
            <div className="min-w-0">
              <p className="text-xs text-muted-foreground">Selected</p>
              <p className="truncate font-display text-xl">{selected.word}</p>
            </div>
            <Button size="lg" onClick={() => setConfirming(true)}>Share…</Button>
          </div>
          {sendError && <p role="alert" className="mx-auto mt-2 max-w-2xl text-sm text-destructive">{sendError}</p>}
        </div>
      )}

      <AlertDialog open={confirming} onOpenChange={(o) => !busy && setConfirming(o)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Share this word with the performer?</AlertDialogTitle>
            <AlertDialogDescription>
              Your searches and article requests go directly to Wikimedia (Wikipedia). Only the word “{selected?.word}” is sent to the performer through this app, and only after you confirm.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={busy}>Cancel</AlertDialogCancel>
            <AlertDialogAction disabled={busy} onClick={(e) => { e.preventDefault(); void send(); }}>
              {busy ? "Sending…" : "Share word"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
