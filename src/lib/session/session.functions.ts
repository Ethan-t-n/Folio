import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { createSessionService, SessionError } from "./core";

/**
 * Public server functions. Callers are anonymous by design (no accounts); authorization is
 * the possession of unguessable tokens, which are verified against stored SHA-256 hashes.
 */
async function service() {
  const { createSupabaseStore } = await import("./supabase-store.server");
  return createSessionService(await createSupabaseStore());
}

type Result<T> = { ok: true; data: T } | { ok: false; error: SessionError["code"] | "server"; message: string };
async function wrap<T>(fn: () => Promise<T>): Promise<Result<T>> {
  try {
    return { ok: true, data: await fn() };
  } catch (e) {
    if (e instanceof SessionError) return { ok: false, error: e.code, message: e.message };
    console.error(e);
    return { ok: false, error: "server", message: "Something went wrong. Please try again." };
  }
}

const token = z.string().regex(/^[a-f0-9]{64}$/);
const id = z.string().uuid();

export const createSession = createServerFn({ method: "POST" }).handler(async () =>
  wrap(async () => (await service()).createSession()),
);

export const joinSession = createServerFn({ method: "POST" })
  .inputValidator((i: unknown) => z.object({ code: z.string().min(1).max(20) }).parse(i))
  .handler(async ({ data }) => wrap(async () => (await service()).joinSession(data.code)));

export const submitWord = createServerFn({ method: "POST" })
  .inputValidator((i: unknown) =>
    z.object({ sessionId: id, participantToken: token, word: z.string().min(1).max(100) }).parse(i),
  )
  .handler(async ({ data }) =>
    wrap(async () => (await service()).submitWord(data.sessionId, data.participantToken, data.word)),
  );

export const getPerformerStatus = createServerFn({ method: "POST" })
  .inputValidator((i: unknown) => z.object({ sessionId: id, performerToken: token }).parse(i))
  .handler(async ({ data }) =>
    wrap(async () => (await service()).getPerformerStatus(data.sessionId, data.performerToken)),
  );

export const endSession = createServerFn({ method: "POST" })
  .inputValidator((i: unknown) => z.object({ sessionId: id, performerToken: token }).parse(i))
  .handler(async ({ data }) => wrap(async () => (await service()).endSession(data.sessionId, data.performerToken)));
