import { beforeEach, describe, expect, it } from "vitest";
import { createSessionService } from "./core";
import { createLocalStorageStore } from "./local-storage-store";

describe("browser-local demo sessions", () => {
  beforeEach(() => localStorage.clear());

  it("shares a participant's word across independent tab stores", async () => {
    const performer = createSessionService(createLocalStorageStore());
    const participant = createSessionService(createLocalStorageStore());

    const session = await performer.createSession();
    const joined = await participant.joinSession(session.code);
    await participant.submitWord(joined.sessionId, joined.participantToken, "octopus");

    await expect(
      performer.getPerformerStatus(session.sessionId, session.performerToken),
    ).resolves.toMatchObject({ state: "received", word: "octopus" });
  });

  it("rejects a second word for the same demo session", async () => {
    const performer = createSessionService(createLocalStorageStore());
    const participant = createSessionService(createLocalStorageStore());

    const session = await performer.createSession();
    const joined = await participant.joinSession(session.code);
    await participant.submitWord(joined.sessionId, joined.participantToken, "octopus");

    await expect(
      participant.submitWord(joined.sessionId, joined.participantToken, "arms"),
    ).rejects.toMatchObject({ code: "already_sent" });
  });
});
