# Folio — two-person word mentalism effect

A participant browses **Folio** (an original article-statistics site backed by Wikimedia's public API). Tapping a word in an article sends that word once to the performer, where it stays concealed until **Reveal**. The participant sees a notice before browsing that explains what gets shared.

| Route               | Who         | Purpose                                                           |
| ------------------- | ----------- | ----------------------------------------------------------------- |
| `/`                 | Participant | Enter code → search → read article → tap word → sent    |
| `/perform`          | Performer   | Create session → waiting → word received → reveal → end           |
| `?demo=1` on either | Reviewer    | Local simulation, labelled "Demo mode"; never touches the backend |

## Architecture

```text
UI (src/routes, src/components)            Wikimedia API (browser → en.wikipedia.org, read-only)
   │  SessionApi (src/lib/session/client.ts) ── live | demo
   ▼
Server functions (src/lib/session/session.functions.ts)  ← zod-validated, token-verified
   ▼
Session service (src/lib/session/core.ts)  ← pure logic, unit-tested with an in-memory store
   ▼
SessionStore (supabase-store.server.ts) → `sessions` table (service role only)
```

- **Backend**: Lovable Cloud (hosted Postgres). Migration: `drizzle/migrations/0000_migration.sql`.
- **Delivery**: the performer page polls a server function every 1.5 s with exponential backoff (max 12 s) on failure, and re-polls immediately on `online` / tab-visible events. Polling was chosen over a realtime socket because the table has no client read access at all, which keeps access control in one place and recovers trivially from network loss.
- **Access control**: RLS is enabled with **no policies** and no grants to anon/authenticated, so browsers cannot touch the table. Server functions authorize by token:
  - `createSession` → returns `sessionId` (UUID), 6-char `code`, 256-bit `performerToken`.
  - `joinSession(code)` → issues a 256-bit `participantToken` for that session.
  - `submitWord(sessionId, participantToken, word)` — single write; conditional update rejects duplicates.
  - `getPerformerStatus` / `endSession` require `performerToken`.
- **Stored data**: `id`, SHA-256 hashes of code and tokens, the single word, timestamps. No identity, searches, article text or analytics.
- **Deletion**: ending deletes the row. Sessions expire after 2 h; expired rows are deleted lazily on every create/join and on any read of that session.

## Local setup

```sh
bun install
cp .env.example .env   # fill with your own backend values (Lovable fills these automatically)
bun run dev            # http://localhost:8080  — try /perform?demo=1 and /?demo=1 without credentials
bun run test
```

## Backend setup (outside Lovable)

1. Create a Postgres/Supabase project and run `drizzle/migrations/*.sql`.
2. Set the env vars from `.env.example`. The service role key is read only inside server functions.

## Deployment

Publish from Lovable (Cloudflare Workers runtime). No extra configuration is needed.

## Tests

`src/lib/session/core.test.ts` covers creation (hash-only storage), join + delivery, wrong code, bad token, duplicate prevention, word validation, expiry, ending and unauthorized ending. An end-to-end run (two browsers, real backend) was performed manually with Playwright during development; it is not in CI.

## Known limitations

- No rate limiting on code guesses (≈ 887 M combinations, 2 h lifetime). Add per-IP throttling before wide use.
- Code hashes are unsalted SHA-256 (needed for lookup); acceptable given short lifetime, but not secret against an attacker with DB access.
- Expired sessions that are never touched again stay in the table until the next session is created (no scheduled job — pg_cron unavailable in this project).
- One word per session. English Wikipedia only. Polling adds up to ~1.5 s latency.
- Participant state is in memory; reloading the participant page requires re-entering the code.

## Feature branches and pull requests

- Lovable syncs one branch (usually `main`). Do work on a feature branch (`git switch -c feature/short-name`) so the synced branch stays working.
- Push the branch and open a pull request into the synced branch. CI (`.github/workflows/ci.yml`) runs lint, tests and build on every pull request.
- Merge only when CI passes; avoid force-pushing or rewriting history that is already pushed.
- Never commit `.env`; it is git-ignored. Use `.env.example` for placeholders.
