/**
 * Browser-facing API used by UI. Two implementations with the same shape:
 *  - live: calls the server functions (real sessions)
 *  - demo: a localStorage-backed simulation shared across tabs in this browser
 */
import { createSessionService, type PerformerStatus } from "./core";
import { createLocalStorageStore } from "./local-storage-store";
import * as fns from "./session.functions";

export type ApiResult<T> = { ok: true; data: T } | { ok: false; error: string; message: string };

export interface SessionApi {
  mode: "live" | "demo";
  createSession(): Promise<ApiResult<{ sessionId: string; code: string; performerToken: string }>>;
  joinSession(code: string): Promise<ApiResult<{ sessionId: string; participantToken: string }>>;
  submitWord(
    sessionId: string,
    participantToken: string,
    word: string,
  ): Promise<ApiResult<{ ok: true }>>;
  getPerformerStatus(
    sessionId: string,
    performerToken: string,
  ): Promise<ApiResult<PerformerStatus>>;
  endSession(sessionId: string, performerToken: string): Promise<ApiResult<{ ok: true }>>;
}

const network = <T>(p: Promise<ApiResult<T>>): Promise<ApiResult<T>> =>
  p.catch(() => ({
    ok: false as const,
    error: "network",
    message: "Connection problem. Check your signal and retry.",
  }));

export const liveApi: SessionApi = {
  mode: "live",
  createSession: () => network(fns.createSession()),
  joinSession: (code) => network(fns.joinSession({ data: { code } })),
  submitWord: (sessionId, participantToken, word) =>
    network(fns.submitWord({ data: { sessionId, participantToken, word } })),
  getPerformerStatus: (sessionId, performerToken) =>
    network(fns.getPerformerStatus({ data: { sessionId, performerToken } })),
  endSession: (sessionId, performerToken) =>
    network(fns.endSession({ data: { sessionId, performerToken } })),
};

/** Demo sessions are shared only by tabs on this origin in the same browser profile. */
const demoService = createSessionService(createLocalStorageStore());
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
  createSession: () => demoWrap(() => demoService.createSession()),
  joinSession: (code) => demoWrap(() => demoService.joinSession(code)),
  submitWord: (a, b, w) => demoWrap(() => demoService.submitWord(a, b, w)),
  getPerformerStatus: (a, b) => demoWrap(() => demoService.getPerformerStatus(a, b)),
  endSession: (a, b) => demoWrap(() => demoService.endSession(a, b)),
};

export const getApi = (demo: boolean): SessionApi => (demo ? demoApi : liveApi);
