import { describe, expect, it } from "vitest";
import type { User } from "@shared/types/user";
import { getNextMeCompletionMs } from "./useMeCompletionRefresh";

describe("getNextMeCompletionMs", () => {
  it("returns the nearest active completion timestamp", () => {
    const user = {
      planets: [
        {
          buildings: [
            { queueAction: "upgrade", queueCompletesAt: "2026-01-01T00:10:00.000Z" },
            { queueAction: null, queueCompletesAt: "2026-01-01T00:01:00.000Z" },
          ],
        },
      ],
      research: [{ completesAt: "2026-01-01T00:08:00.000Z" }],
      ships: [
        { status: "idle", queueCompletesAt: "2026-01-01T00:02:00.000Z" },
        { status: "building", queueCompletesAt: "2026-01-01T00:06:00.000Z" },
      ],
      expeditions: [
        { status: "returning", eta: "2026-01-01T00:04:00.000Z" },
        { status: "completed", eta: "2026-01-01T00:03:00.000Z" },
      ],
    } as unknown as User;

    expect(getNextMeCompletionMs(user)).toBe(Date.parse("2026-01-01T00:04:00.000Z"));
  });

  it("returns null when there are no active completion timestamps", () => {
    const user = {
      planets: [{ buildings: [{ queueAction: null, queueCompletesAt: "2026-01-01T00:01:00.000Z" }] }],
      ships: [{ status: "idle", queueCompletesAt: "2026-01-01T00:02:00.000Z" }],
      expeditions: [{ status: "completed", eta: "2026-01-01T00:03:00.000Z" }],
    } as unknown as User;

    expect(getNextMeCompletionMs(user)).toBeNull();
  });
});
