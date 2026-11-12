import { useEffect, useMemo, useState } from "react";
import { ArrowLeft, ExternalLink } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import { getArticle, readingStats, tokenize, type Article } from "@/lib/wiki";

interface Props {
  title: string;
  onBack: () => void;
  selected: { key: string; word: string } | null;
  onSelect: (s: { key: string; word: string }) => void;
}

export function ArticleReader({ title, onBack, selected, onSelect }: Props) {
  const [article, setArticle] = useState<Article | null>(null);
  const [error, setError] = useState(false);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    const ctrl = new AbortController();
    setArticle(null); setError(false);
    getArticle(title, ctrl.signal).then(setArticle).catch((e) => { if (e.name !== "AbortError") setError(true); });
    return () => ctrl.abort();
  }, [title, attempt]);

  const paragraphs = useMemo(() => (article ? tokenize(article.extract) : []), [article]);
  const stats = article ? readingStats(article.extract) : null;

  return (
    <article className="pb-32">
      <Button variant="ghost" size="sm" onClick={onBack} className="-ml-3 mb-2"><ArrowLeft /> Results</Button>
      {error && (
        <div role="alert" className="rounded-lg border border-border bg-card p-4 text-sm">
          This article couldn't be loaded. <button className="font-medium text-primary underline" onClick={() => setAttempt((a) => a + 1)}>Retry</button>
        </div>
      )}
      {!article && !error && <div className="space-y-3"><Skeleton className="h-10 w-2/3" /><Skeleton className="h-24 w-full" /><Skeleton className="h-64 w-full" /></div>}
      {article && stats && (
        <>
          <h1 className="text-3xl leading-tight">{article.title}</h1>
          <dl className="mt-4 grid grid-cols-3 gap-2 text-center">
            {[
              ["Words", stats.words.toLocaleString()],
              ["Read", `${stats.minutes} min`],
              ["Paragraphs", paragraphs.length.toString()],
            ].map(([k, v]) => (
              <div key={k} className="rounded-md border border-border bg-card p-2">
                <dt className="text-[10px] uppercase tracking-wider text-muted-foreground">{k}</dt>
                <dd className="font-mono text-sm">{v}</dd>
              </div>
            ))}
          </dl>
          {article.thumbnail && <img src={article.thumbnail} alt="" className="mt-4 max-h-56 w-full rounded-lg object-cover" />}
          <p className="mt-4 text-sm text-muted-foreground">Tap any word to select it.</p>
          <div className="mt-3 space-y-4 text-[17px] leading-8">
            {paragraphs.map((tokens, pi) => (
              <p key={pi}>
                {tokens.map((t, ti) => {
                  if (!t.word) return <span key={ti}>{t.text}</span>;
                  const key = `${pi}:${ti}`;
                  const isSel = selected?.key === key;
                  return (
                    <span
                      key={ti}
                      role="button"
                      tabIndex={0}
                      aria-pressed={isSel}
                      onClick={() => onSelect({ key, word: t.text })}
                      onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onSelect({ key, word: t.text }); } }}
                      className={cn("cursor-pointer rounded-sm px-px transition-colors", isSel ? "bg-primary text-primary-foreground" : "hover:bg-highlight/60")}
                    >{t.text}</span>
                  );
                })}
              </p>
            ))}
          </div>
          <a href={article.url} target="_blank" rel="noreferrer" className="mt-8 inline-flex items-center gap-1 text-sm text-primary underline">
            Read the full article on Wikipedia <ExternalLink className="h-3.5 w-3.5" />
          </a>
          <p className="mt-2 text-xs text-muted-foreground">Text from Wikipedia, available under CC BY-SA 4.0.</p>
        </>
      )}
    </article>
  );
}
