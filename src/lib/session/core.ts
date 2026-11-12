/**
 * Pure session logic shared by the server functions, the demo backend and tests.
 * No I/O here — only token generation, hashing, validation and the session service
 * that talks to an abstract SessionStore.
 */

export const SESSION_TTL_MS = 2 * 60 * 60 * 1000; // abandoned sessions expire after 2h
export const CODE_ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789"; // no 0/O/1/I/L
export const CODE_LENGTH = 6;
export const MAX_WORD_LENGTH = 64;

export class SessionError extends Error {
  constructor(
    public readonly code: "not_found" | "expired" | "unauthorized" | "invalid_word" | "already_sent",
    message: string,
  ) {
    super(message);
  }
}

function randomBytes(n: number): Uint8Array {
  const b = new Uint8Array(n);
  crypto.getRandomValues(b);
  return b;
}

export function generateCode(): string {
  // Rejection sampling avoids modulo bias.
  const out: string[] = [];
  const limit = 256 - (256 % CODE_ALPHABET.length);
  while (out.length < CODE_LENGTH) {
    for (const byte of randomBytes(16)) {
      if (byte < limit && out.length < CODE_LENGTH) out.push(CODE_ALPHABET[byte % CODE_ALPHABET.length]);
    }
  }
  return out.join("");
}

export function generateToken(): string {
  return Array.from(randomBytes(32), (b) => b.toString(16).padStart(2, "0")).join("");
}

export function normalizeCode(input: string): string {
  return input.toUpperCase().replace(/[^A-Z0-9]/g, "");
}

export async function sha256(value: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, "0")).join("");
}

/** Strips surrounding punctuation; returns null when nothing word-like remains. */
export function normalizeWord(input: string): string | null {
  const w = input.trim().replace(/^[^\p{L}\p{N}]+|[^\p{L}\p{N}]+$/gu, "");
  if (!w || w.length > MAX_WORD_LENGTH || /\s/.test(w)) return null;
  return w;
}

export interface SessionRow {
  id: string;
  code_hash: string;
  performer_token_hash: string;
  participant_token_hash: string | null;
  word: string | null;
  word_received_at: string | null;
  created_at: string;
  expires_at: string;
}

export interface SessionStore {
  insert(row: SessionRow): Promise<void>;
  getById(id: string): Promise<SessionRow | null>;
  getByCodeHash(codeHash: string): Promise<SessionRow | null>;
  update(id: string, patch: Partial<SessionRow>): Promise<void>;
  /** Conditional update used to prevent double submission. Returns true if a row changed. */
  setWordIfEmpty(id: string, word: string, at: string): Promise<boolean>;
  delete(id: string): Promise<void>;
  deleteExpired(now: Date): Promise<void>;
}

export type PerformerStatus =
  | { state: "waiting"; expiresAt: string }
  | { state: "received"; word: string; receivedAt: string; expiresAt: string }
  | { state: "ended" };

const isExpired = (row: SessionRow, now: Date) => new Date(row.expires_at).getTime() <= now.getTime();

export function createSessionService(store: SessionStore, clock: () => Date = () => new Date()) {
  return {
    async createSession() {
      const now = clock();
      await store.deleteExpired(now);
      const code = generateCode();
      const performerToken = generateToken();
      const id = crypto.randomUUID();
      await store.insert({
        id,
        code_hash: await sha256(code),
        performer_token_hash: await sha256(performerToken),
        participant_token_hash: null,
        word: null,
        word_received_at: null,
        created_at: now.toISOString(),
        expires_at: new Date(now.getTime() + SESSION_TTL_MS).toISOString(),
      });
      return { sessionId: id, code, performerToken };
    },

    /** Participant proves knowledge of the code and receives a per-session write token. */
    async joinSession(rawCode: string) {
      const now = clock();
      await store.deleteExpired(now);
      const row = await store.getByCodeHash(await sha256(normalizeCode(rawCode)));
      if (!row) throw new SessionError("not_found", "No active session with that code.");
      if (isExpired(row, now)) throw new SessionError("expired", "This session has expired.");
      if (row.word) throw new SessionError("already_sent", "A word was already shared in this session.");
      const participantToken = generateToken();
      await store.update(row.id, { participant_token_hash: await sha256(participantToken) });
      return { sessionId: row.id, participantToken };
    },

    async submitWord(sessionId: string, participantToken: string, rawWord: string) {
      const word = normalizeWord(rawWord);
      if (!word) throw new SessionError("invalid_word", "That selection isn't a single word.");
      const now = clock();
      const row = await store.getById(sessionId);
      if (!row) throw new SessionError("expired", "This session has ended.");
      if (isExpired(row, now)) {
        await store.delete(row.id);
        throw new SessionError("expired", "This session has expired.");
      }
      if (!row.participant_token_hash || row.participant_token_hash !== (await sha256(participantToken)))
        throw new SessionError("unauthorized", "Session token is not valid.");
      const ok = await store.setWordIfEmpty(row.id, word, now.toISOString());
      if (!ok) throw new SessionError("already_sent", "A word was already shared in this session.");
      return { ok: true as const };
    },

    async getPerformerStatus(sessionId: string, performerToken: string): Promise<PerformerStatus> {
      const now = clock();
      const row = await store.getById(sessionId);
      if (!row) return { state: "ended" };
      if (row.performer_token_hash !== (await sha256(performerToken)))
        throw new SessionError("unauthorized", "Performer token is not valid.");
      if (isExpired(row, now)) {
        await store.delete(row.id);
        return { state: "ended" };
      }
      if (row.word && row.word_received_at)
        return { state: "received", word: row.word, receivedAt: row.word_received_at, expiresAt: row.expires_at };
      return { state: "waiting", expiresAt: row.expires_at };
    },

    async endSession(sessionId: string, performerToken: string) {
      const row = await store.getById(sessionId);
      if (!row) return { ok: true as const };
      if (row.performer_token_hash !== (await sha256(performerToken)))
        throw new SessionError("unauthorized", "Performer token is not valid.");
      await store.delete(row.id);
      return { ok: true as const };
    },
  };
}

export type SessionService = ReturnType<typeof createSessionService>;

/** In-memory store: used by tests and the browser-only demo mode. */
export function createMemoryStore(): SessionStore & { rows: Map<string, SessionRow> } {
  const rows = new Map<string, SessionRow>();
  return {
    rows,
    async insert(row) { rows.set(row.id, { ...row }); },
    async getById(id) { const r = rows.get(id); return r ? { ...r } : null; },
    async getByCodeHash(h) { for (const r of rows.values()) if (r.code_hash === h) return { ...r }; return null; },
    async update(id, patch) { const r = rows.get(id); if (r) rows.set(id, { ...r, ...patch }); },
    async setWordIfEmpty(id, word, at) {
      const r = rows.get(id);
      if (!r || r.word) return false;
      rows.set(id, { ...r, word, word_received_at: at });
      return true;
    },
    async delete(id) { rows.delete(id); },
    async deleteExpired(now) {
      for (const [id, r] of rows) if (new Date(r.expires_at).getTime() <= now.getTime()) rows.delete(id);
    },
  };
}
