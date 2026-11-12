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

  it("replaces the selected word across independent demo tab stores", async () => {
    const performer = createSessionService(createLocalStorageStore());
    const participant = createSessionService(createLocalStorageStore());

    const session = await performer.createSession();
    const joined = await participant.joinSession(session.code);
    await participant.submitWord(joined.sessionId, joined.participantToken, "octopus");
    await participant.submitWord(joined.sessionId, joined.participantToken, "arms");

    await expect(
      performer.getPerformerStatus(session.sessionId, session.performerToken),
    ).resolves.toMatchObject({ state: "received", word: "arms" });
  });
});
