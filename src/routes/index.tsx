import { createFileRoute } from "@tanstack/react-router";
import { useRef, useState } from "react";
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
      {
        name: "description",
        content: "Search any topic, open the article and explore its statistics.",
      },
      { property: "og:title", content: "Folio — article stats & discovery" },
      {
        property: "og:description",
        content: "Search any topic, open the article and explore its statistics.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: ParticipantPage,
});

type Phase =
  | { kind: "code" }
  | { kind: "browse"; title: string | null }
  | { kind: "expired" };

function ParticipantPage() {
  const { demo } = Route.useSearch();
  const api = getApi(demo === "1");
  const [phase, setPhase] = useState<Phase>({ kind: "code" });
  const [creds, setCreds] = useState<{ sessionId: string; participantToken: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [codeError, setCodeError] = useState<string>();
  const [selected, setSelected] = useState<{ key: string; word: string } | null>(null);
  const [sendError, setSendError] = useState<string>();
  const sending = useRef(false);
  const pendingWord = useRef<string | null>(null);

  async function join(code: string) {
    setBusy(true);
    setCodeError(undefined);
    const r = await api.joinSession(code);
    setBusy(false);
    if (!r.ok)
      return setCodeError(
        r.error === "not_found" ? "That code isn't active. Check it and try again." : r.message,
      );
    setCreds(r.data);
    setPhase({ kind: "browse", title: null });
  }

  async function sendPendingWords() {
    if (!creds || sending.current) return;
    sending.current = true;
    setBusy(true);
    setSendError(undefined);
    try {
      while (pendingWord.current !== null) {
        const word = pendingWord.current;
        pendingWord.current = null;
        const r = await api.submitWord(creds.sessionId, creds.participantToken, word);
        if (!r.ok) {
          if (r.error === "expired" || r.error === "unauthorized") {
            pendingWord.current = null;
            setPhase({ kind: "expired" });
          } else {
            setSendError(r.message);
            if (pendingWord.current !== null) continue;
          }
          pendingWord.current = null;
          break;
        }
        setSendError(undefined);
      }
    } finally {
      sending.current = false;
      setBusy(false);
    }
  }

  function selectWord(next: { key: string; word: string } | null) {
    if (!next) return;
    setSelected(next);
    setSendError(undefined);
    pendingWord.current = next.word;
    void sendPendingWords();
  }

  return (
    <div className="min-h-screen">
      {demo && <DemoBanner />}
      <header className="border-b border-border">
        <div className="mx-auto flex max-w-2xl items-center justify-between px-5 py-4">
          <span className="font-display text-2xl">
            Folio<span className="text-primary">.</span>
          </span>
          <span className="font-mono text-[11px] uppercase tracking-widest text-muted-foreground">
            article stats
          </span>
        </div>
      </header>

      <main className="mx-auto max-w-2xl px-5 py-6">
        {phase.kind === "code" && <CodeEntry onJoin={join} error={codeError} busy={busy} />}

        {phase.kind === "browse" && phase.title === null && (
          <SearchPanel
            onOpen={(t) => {
              setSelected(null);
              setPhase({ kind: "browse", title: t });
            }}
          />
        )}
        {phase.kind === "browse" && phase.title !== null && (
          <ArticleReader
            title={phase.title}
            onBack={() => setPhase({ kind: "browse", title: null })}
            selected={selected}
            onSelect={selectWord}
          />
        )}

        {phase.kind === "browse" && phase.title && busy && (
          <p role="status" className="mt-3 text-center text-sm text-muted-foreground">
            Sending “{selected?.word}” to the performer…
          </p>
        )}
        {phase.kind === "browse" && phase.title && sendError && (
          <p role="alert" className="mt-3 text-center text-sm text-destructive">
            Couldn’t send the selected word. Tap it again to retry. {sendError}
          </p>
        )}

        {phase.kind === "expired" && (
          <div className="mx-auto mt-16 max-w-sm text-center">
            <h1 className="text-3xl">This session has ended</h1>
            <p className="mt-2 text-muted-foreground">Ask for a new code to start again.</p>
            <Button
              className="mt-6"
              onClick={() => {
                setCreds(null);
                setPhase({ kind: "code" });
              }}
            >
              Enter a new code
            </Button>
          </div>
        )}
      </main>
    </div>
  );
}
