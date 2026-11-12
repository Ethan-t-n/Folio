import { describe, expect, it } from "vitest";
import { createMemoryStore, createSessionService, normalizeWord, sha256, SESSION_TTL_MS, CODE_LENGTH } from "./core";

function setup() {
  let now = new Date("2026-01-01T12:00:00Z");
  const store = createMemoryStore();
  const svc = createSessionService(store, () => now);
  return { store, svc, advance: (ms: number) => { now = new Date(now.getTime() + ms); } };
}

describe("session creation", () => {
  it("returns a short code and a secure token, and stores only hashes", async () => {
    const { svc, store } = setup();
    const s = await svc.createSession();
    expect(s.code).toHaveLength(CODE_LENGTH);
    expect(s.performerToken).toMatch(/^[a-f0-9]{64}$/);
    const row = store.rows.get(s.sessionId)!;
    expect(row.code_hash).toBe(await sha256(s.code));
    expect(JSON.stringify(row)).not.toContain(s.code);
    expect(JSON.stringify(row)).not.toContain(s.performerToken);
  });
});

describe("participant join and word delivery", () => {
  it("delivers the word to the performer after join + submit", async () => {
    const { svc } = setup();
    const s = await svc.createSession();
    expect((await svc.getPerformerStatus(s.sessionId, s.performerToken)).state).toBe("waiting");
    const j = await svc.joinSession(s.code.toLowerCase());
    await svc.submitWord(j.sessionId, j.participantToken, "Lighthouse,");
    const st = await svc.getPerformerStatus(s.sessionId, s.performerToken);
    expect(st).toMatchObject({ state: "received", word: "Lighthouse" });
  });

  it("rejects a wrong code", async () => {
    const { svc } = setup();
    await svc.createSession();
    await expect(svc.joinSession("ZZZZZZ")).rejects.toMatchObject({ code: "not_found" });
  });

  it("rejects a write without a valid participant token", async () => {
    const { svc } = setup();
    const s = await svc.createSession();
    await svc.joinSession(s.code);
    await expect(svc.submitWord(s.sessionId, "0".repeat(64), "word")).rejects.toMatchObject({ code: "unauthorized" });
  });

  it("accepts only one word (no duplicate submissions)", async () => {
    const { svc } = setup();
    const s = await svc.createSession();
    const j = await svc.joinSession(s.code);
    await svc.submitWord(j.sessionId, j.participantToken, "first");
    await expect(svc.submitWord(j.sessionId, j.participantToken, "second")).rejects.toMatchObject({ code: "already_sent" });
    expect(await svc.getPerformerStatus(s.sessionId, s.performerToken)).toMatchObject({ word: "first" });
  });

  it("only the performer token can read the word", async () => {
    const { svc } = setup();
    const s = await svc.createSession();
    await expect(svc.getPerformerStatus(s.sessionId, "a".repeat(64))).rejects.toMatchObject({ code: "unauthorized" });
  });

  it("rejects multi-word or empty selections", () => {
    expect(normalizeWord("two words")).toBeNull();
    expect(normalizeWord("…")).toBeNull();
    expect(normalizeWord("“Paris”")).toBe("Paris");
  });
});

describe("expiry", () => {
  it("expired sessions cannot be joined or written and are deleted", async () => {
    const { svc, store, advance } = setup();
    const s = await svc.createSession();
    const j = await svc.joinSession(s.code);
    advance(SESSION_TTL_MS + 1);
    await expect(svc.submitWord(j.sessionId, j.participantToken, "late")).rejects.toMatchObject({ code: "expired" });
    expect(store.rows.size).toBe(0);
    await expect(svc.joinSession(s.code)).rejects.toMatchObject({ code: "not_found" });
  });

  it("performer sees ended once expired", async () => {
    const { svc, advance } = setup();
    const s = await svc.createSession();
    advance(SESSION_TTL_MS);
    expect(await svc.getPerformerStatus(s.sessionId, s.performerToken)).toEqual({ state: "ended" });
  });
});

describe("ending a session", () => {
  it("deletes all session data and blocks further words", async () => {
    const { svc, store } = setup();
    const s = await svc.createSession();
    const j = await svc.joinSession(s.code);
    await svc.endSession(s.sessionId, s.performerToken);
    expect(store.rows.size).toBe(0);
    await expect(svc.submitWord(j.sessionId, j.participantToken, "word")).rejects.toMatchObject({ code: "expired" });
  });

  it("cannot be ended by someone without the performer token", async () => {
    const { svc, store } = setup();
    const s = await svc.createSession();
    await expect(svc.endSession(s.sessionId, "b".repeat(64))).rejects.toMatchObject({ code: "unauthorized" });
    expect(store.rows.size).toBe(1);
  });
});

describe("repeated joins", () => {
  it("a second join issues a new token and invalidates the earlier one", async () => {
    const { svc } = setup();
    const s = await svc.createSession();
    const first = await svc.joinSession(s.code);
    const second = await svc.joinSession(s.code);
    expect(second.participantToken).not.toBe(first.participantToken);
    await expect(svc.submitWord(s.sessionId, first.participantToken, "old")).rejects.toMatchObject({ code: "unauthorized" });
    await svc.submitWord(s.sessionId, second.participantToken, "new");
    expect(await svc.getPerformerStatus(s.sessionId, s.performerToken)).toMatchObject({ word: "new" });
  });

  it("joining after a word was shared is rejected", async () => {
    const { svc } = setup();
    const s = await svc.createSession();
    const j = await svc.joinSession(s.code);
    await svc.submitWord(j.sessionId, j.participantToken, "only");
    await expect(svc.joinSession(s.code)).rejects.toMatchObject({ code: "already_sent" });
  });
});

describe("concurrent word submissions", () => {
  it("exactly one of several simultaneous submissions is stored", async () => {
    const { svc } = setup();
    const s = await svc.createSession();
    const j = await svc.joinSession(s.code);
    const results = await Promise.allSettled(
      ["alpha", "beta", "gamma"].map((w) => svc.submitWord(j.sessionId, j.participantToken, w)),
    );
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    const st = await svc.getPerformerStatus(s.sessionId, s.performerToken);
    expect(st.state).toBe("received");
    expect(["alpha", "beta", "gamma"]).toContain((st as { word: string }).word);
  });
});
