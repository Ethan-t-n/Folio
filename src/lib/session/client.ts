/**
 * Browser-facing API used by UI. Two implementations with the same shape:
 *  - live: calls the server functions (real sessions)
 *  - demo: a local in-memory simulation, clearly labelled in the UI, never touches the backend
 */
import { createMemoryStore, createSessionService, type PerformerStatus } from "./core";
import * as fns from "./session.functions";

export type ApiResult<T> = { ok: true; data: T } | { ok: false; error: string; message: string };

export interface SessionApi {
  mode: "live" | "demo";
  createSession(): Promise<ApiResult<{ sessionId: string; code: string; performerToken: string }>>;
  joinSession(code: string): Promise<ApiResult<{ sessionId: string; participantToken: string }>>;
  submitWord(sessionId: string, participantToken: string, word: string): Promise<ApiResult<{ ok: true }>>;
  getPerformerStatus(sessionId: string, performerToken: string): Promise<ApiResult<PerformerStatus>>;
  endSession(sessionId: string, performerToken: string): Promise<ApiResult<{ ok: true }>>;
}

const network = <T>(p: Promise<ApiResult<T>>): Promise<ApiResult<T>> =>
  p.catch(() => ({ ok: false as const, error: "network", message: "Connection problem. Check your signal and retry." }));

export const liveApi: SessionApi = {
  mode: "live",
  createSession: () => network(fns.createSession()),
  joinSession: (code) => network(fns.joinSession({ data: { code } })),
  submitWord: (sessionId, participantToken, word) =>
    network(fns.submitWord({ data: { sessionId, participantToken, word } })),
  getPerformerStatus: (sessionId, performerToken) =>
    network(fns.getPerformerStatus({ data: { sessionId, performerToken } })),
  endSession: (sessionId, performerToken) => network(fns.endSession({ data: { sessionId, performerToken } })),
};

/** Demo: one shared in-memory service per tab. Demo performer auto-simulates a word after a delay. */
const demoService = createSessionService(createMemoryStore());
const demoWords = ["lighthouse", "orchid", "parallax", "velvet", "comet", "harbor"];
async function demoWrap<T>(fn: () => Promise<T>): Promise<ApiResult<T>> {
  try {
    return { ok: true, data: await fn() };
  } catch (e) {
    const err = e as { code?: string; message: string };
    return { ok: false, error: err.code ?? "server", message: err.message };
  }
}
export const demoApi: SessionApi = {
  mode: "demo",
  createSession: () =>
    demoWrap(async () => {
      const s = await demoService.createSession();
      // Simulated participant (demo only).
      setTimeout(async () => {
        try {
          const j = await demoService.joinSession(s.code);
          await demoService.submitWord(j.sessionId, j.participantToken, demoWords[Math.floor(Math.random() * demoWords.length)]);
        } catch { /* session ended before the simulation fired */ }
      }, 6000);
      return s;
    }),
  joinSession: (code) =>
    demoWrap(async () => {
      // Demo participant accepts any code and creates a throwaway local session.
      const s = await demoService.createSession();
      void code;
      return demoService.joinSession(s.code);
    }),
  submitWord: (a, b, w) => demoWrap(() => demoService.submitWord(a, b, w)),
  getPerformerStatus: (a, b) => demoWrap(() => demoService.getPerformerStatus(a, b)),
  endSession: (a, b) => demoWrap(() => demoService.endSession(a, b)),
};

export const getApi = (demo: boolean): SessionApi => (demo ? demoApi : liveApi);
