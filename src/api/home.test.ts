import { afterEach, describe, expect, it, vi } from "vitest";
import { getHomeToday } from "./home";

const ok = (data: unknown) =>
  new Response(JSON.stringify({ ok: true, data, requestId: "req" }), {
    headers: { "content-type": "application/json" }
  });

afterEach(() => {
  vi.restoreAllMocks();
});

describe("Home api client", () => {
  it("fetches the lean Home endpoint with an optional date", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(ok({
      date: "2026-08-25",
      homeTasks: [],
      completedRecords: [],
      passedRecords: [],
      shopping: { pendingCount: 0 },
      members: []
    }));

    await getHomeToday("2026-08-25");

    expect(fetchMock).toHaveBeenCalledWith("/api/home/today?date=2026-08-25", expect.objectContaining({ credentials: "include" }));
  });
});
