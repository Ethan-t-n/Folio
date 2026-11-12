import { useState } from "react";
import { Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { searchArticles, type SearchHit } from "@/lib/wiki";

type State =
  { kind: "idle" } | { kind: "loading" } | { kind: "error" } | { kind: "done"; hits: SearchHit[] };

export function SearchPanel({ onOpen }: { onOpen: (title: string) => void }) {
  const [q, setQ] = useState("");
  const [state, setState] = useState<State>({ kind: "idle" });

  async function run() {
    if (!q.trim()) return;
    setState({ kind: "loading" });
    try {
      setState({ kind: "done", hits: await searchArticles(q.trim()) });
    } catch {
      setState({ kind: "error" });
    }
  }

  return (
    <section className="space-y-5">
      <form
        className="flex gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          void run();
        }}
      >
        <Input
          aria-label="Search topics"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search any topic…"
          className="h-11 bg-card"
        />
        <Button type="submit" size="icon" className="h-11 w-11 shrink-0" aria-label="Search">
          <Search />
        </Button>
      </form>

      {state.kind === "idle" && (
        <p className="text-sm text-muted-foreground">
          Try a city, an animal, a scientist — anything.
        </p>
      )}
      {state.kind === "loading" && (
        <div className="space-y-3">
          {[0, 1, 2].map((i) => (
            <Skeleton key={i} className="h-20 w-full" />
          ))}
        </div>
      )}
      {state.kind === "error" && (
        <div role="alert" className="rounded-lg border border-border bg-card p-4 text-sm">
          Couldn't reach the encyclopedia.{" "}
          <button className="font-medium text-primary underline" onClick={() => void run()}>
            Retry
          </button>
        </div>
      )}
      {state.kind === "done" && state.hits.length === 0 && (
        <p className="rounded-lg border border-dashed border-border p-6 text-center text-muted-foreground">
          No articles found for “{q}”. Try another phrase.
        </p>
      )}
      {state.kind === "done" && state.hits.length > 0 && (
        <ul className="divide-y divide-border overflow-hidden rounded-lg border border-border bg-card shadow-soft">
          {state.hits.map((h) => (
            <li key={h.pageid}>
              <button
                className="w-full p-4 text-left transition-colors hover:bg-muted"
                onClick={() => onOpen(h.title)}
              >
                <div className="flex items-baseline justify-between gap-3">
                  <span className="font-display text-lg">{h.title}</span>
                  <span className="shrink-0 font-mono text-xs text-muted-foreground">
                    {h.wordcount.toLocaleString()} words
                  </span>
                </div>
                <p className="mt-1 line-clamp-2 text-sm text-muted-foreground">{h.snippet}</p>
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
