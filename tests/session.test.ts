import { beforeEach, describe, expect, it } from "vitest";
import { auth } from "@/services/mock/handlers/identity";
import { ID, fixtureDb, installHarness, type Harness } from "./helpers/harness";

let h: Harness;
beforeEach(async () => {
  h = installHarness(await fixtureDb());
});

describe("auth.me and the session cookie", () => {
  it("returns the session for a signed-in caller and leaves the cookie alone", async () => {
    h.signIn(ID.personal);
    expect((await auth.me())?.user.id).toBe(ID.personal);
    expect(h.cookies).toEqual([]);
  });

  it("clears the cookie of a session that has ended", async () => {
    h.signIn(ID.personal);
    h.db.sessions.find((s) => s.userId === ID.personal)!.revokedAt = new Date().toISOString();
    expect(await auth.me()).toBeNull();
    expect(h.cookies).toEqual(["clear"]);
  });

  // A lookup sent on page load (no cookie yet) can be answered after a sign-in that ran alongside it;
  // a "clear" in that answer would delete the new session cookie.
  it("sends no cookie change to a caller that sent no session", async () => {
    h.signIn(null);
    expect(await auth.me()).toBeNull();
    expect(h.cookies).toEqual([]);
  });
});
