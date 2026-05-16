import Fastify from "fastify";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { registerRateLimit } from "../lib/rate-limit.js";
import { botRoutes } from "./bot.js";

const { processUpdateMock } = vi.hoisted(() => ({
  processUpdateMock: vi.fn(),
}));

vi.mock("../features/bot/service.js", () => ({
  botService: {
    processUpdate: processUpdateMock,
  },
}));

async function buildApp() {
  const app = Fastify();
  await registerRateLimit(app);
  await app.register(botRoutes);
  await app.ready();
  return app;
}

describe("Telegram bot routes", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    processUpdateMock.mockResolvedValue(undefined);
  });

  it("returns ok after the Telegram update is processed", async () => {
    const app = await buildApp();

    const response = await app.inject({
      method: "POST",
      url: "/webhook/telegram",
      payload: {
        update_id: 1,
        message: { message_id: 10, chat: { id: 12345, type: "private" } },
      },
    });

    expect(response.statusCode, response.body).toBe(200);
    expect(response.json()).toEqual({ ok: true });
    expect(processUpdateMock).toHaveBeenCalledWith({
      update_id: 1,
      message: { message_id: 10, chat: { id: 12345, type: "private" } },
    });

    await app.close();
  });

  it("returns an error when processing fails so Telegram can retry", async () => {
    processUpdateMock.mockRejectedValueOnce(new Error("database unavailable"));
    const app = await buildApp();

    const response = await app.inject({
      method: "POST",
      url: "/webhook/telegram",
      payload: {
        update_id: 2,
        message: { message_id: 11, chat: { id: 12345, type: "private" } },
      },
    });

    expect(response.statusCode, response.body).toBe(500);
    expect(processUpdateMock).toHaveBeenCalledTimes(1);

    await app.close();
  });
});
