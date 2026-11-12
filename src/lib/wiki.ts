/**
 * Wikimedia public API access (read-only, from the browser; CORS via origin=*).
 * Nothing the participant searches or reads is sent to our backend.
 */
const API = "https://en.wikipedia.org/w/api.php";

export interface SearchHit {
  title: string;
  snippet: string;
  wordcount: number;
  pageid: number;
}
export interface Article {
  title: string;
  url: string;
  extract: string;
  lastEdited?: string;
  length?: number;
  thumbnail?: string;
}

async function get(params: Record<string, string>, signal?: AbortSignal) {
  const qs = new URLSearchParams({ format: "json", formatversion: "2", origin: "*", ...params });
  const res = await fetch(`${API}?${qs}`, { signal: signal ?? null });
  if (!res.ok) throw new Error(`Wikimedia responded ${res.status}`);
  return res.json();
}

const stripTags = (s: string) =>
  s
    .replace(/<[^>]+>/g, "")
    .replace(/&quot;/g, '"')
    .replace(/&amp;/g, "&")
    .replace(/&#039;/g, "'");

export async function searchArticles(query: string, signal?: AbortSignal): Promise<SearchHit[]> {
  const j = await get(
    {
      action: "query",
      list: "search",
      srsearch: query,
      srlimit: "12",
      srprop: "snippet|wordcount",
    },
    signal,
  );
  return (j.query?.search ?? []).map((h: SearchHit) => ({ ...h, snippet: stripTags(h.snippet) }));
}

export async function getArticle(title: string, signal?: AbortSignal): Promise<Article> {
  const j = await get(
    {
      action: "query",
      prop: "extracts|info|pageimages",
      explaintext: "1",
      exsectionformat: "plain",
      inprop: "url",
      piprop: "thumbnail",
      pithumbsize: "600",
      redirects: "1",
      titles: title,
    },
    signal,
  );
  const p = j.query?.pages?.[0];
  if (!p || p.missing) throw new Error("not_found");
  return {
    title: p.title,
    url: p.fullurl ?? `https://en.wikipedia.org/wiki/${encodeURIComponent(p.title)}`,
    extract: (p.extract ?? "").slice(0, 12000),
    lastEdited: p.touched,
    length: p.length,
    thumbnail: p.thumbnail?.source,
  };
}

/** Splits text into paragraphs of tokens; word tokens are tappable, others render as-is. */
export function tokenize(text: string): { word: boolean; text: string }[][] {
  return text
    .split(/\n+/)
    .map((p) => p.trim())
    .filter((p) => p.length > 0)
    .map((p) =>
      (p.match(/[\p{L}\p{N}][\p{L}\p{N}'’-]*|[^\p{L}\p{N}]+/gu) ?? []).map((t) => ({
        word: /^[\p{L}\p{N}]/u.test(t),
        text: t,
      })),
    );
}

export function readingStats(text: string) {
  const words = text.split(/\s+/).filter(Boolean).length;
  return { words, minutes: Math.max(1, Math.round(words / 230)) };
}
