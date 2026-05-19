import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock modules before importing the action
vi.mock("../../app/shopify.server", () => ({
  authenticate: {
    webhook: vi.fn(),
  },
}));

vi.mock("../../app/db.server", () => ({
  default: {
    session: {
      deleteMany: vi.fn(),
    },
  },
}));

import { action } from "../../app/routes/webhooks.app.uninstalled";
import { authenticate } from "../../app/shopify.server";
import db from "../../app/db.server";

describe("webhooks.app.uninstalled", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("deletes sessions for the shop when session exists", async () => {
    vi.mocked(authenticate.webhook).mockResolvedValue({
      shop: "test-shop.myshopify.com",
      session: { id: "session-1" } as any,
      topic: "APP_UNINSTALLED",
      payload: {} as any,
      admin: undefined as any,
      apiVersion: "2025-01",
      webhookId: "wh-1",
      webhookType: "HTTP",
    } as any);

    const request = new Request("https://app.example.com/webhooks/app/uninstalled", {
      method: "POST",
    });

    const response = await action({ request, params: {}, context: {} });

    expect(db.session.deleteMany).toHaveBeenCalledWith({
      where: { shop: "test-shop.myshopify.com" },
    });
    expect(response.status).toBe(200);
  });

  it("does not delete sessions when session is null", async () => {
    vi.mocked(authenticate.webhook).mockResolvedValue({
      shop: "test-shop.myshopify.com",
      session: undefined as any,
      topic: "APP_UNINSTALLED",
      payload: {} as any,
      admin: undefined as any,
      apiVersion: "2025-01",
      webhookId: "wh-2",
      webhookType: "HTTP",
    } as any);

    const request = new Request("https://app.example.com/webhooks/app/uninstalled", {
      method: "POST",
    });

    const response = await action({ request, params: {}, context: {} });

    expect(db.session.deleteMany).not.toHaveBeenCalled();
    expect(response.status).toBe(200);
  });
});
