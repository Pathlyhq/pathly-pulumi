import { describe, expect, it, vi } from "vitest";
import { APIError, Client } from "../src/client";
import { WebhookResourceProvider, WebhookState } from "../src/webhook";

function mockClient(partial: Partial<Client>): Client {
  return partial as Client;
}

const base: WebhookState = {
  url: "https://hooks.example.com/pathly",
  events: ["run.failed", "run.recovered"],
  __apiToken: "tok",
};

describe("WebhookResourceProvider", () => {
  it("create stores secret; read keeps it; replace on url/events", async () => {
    const createWebhook = vi.fn(async () => ({
      id: "wh1",
      secret: "s3cr3t",
      events: ["run.failed", "run.recovered"],
      enabled: true,
      urlFingerprint: "fp",
      createdAt: "2026-01-01",
    }));
    const getWebhook = vi.fn(async () => ({
      id: "wh1",
      events: ["run.failed", "run.recovered"],
      enabled: true,
      urlFingerprint: "fp",
      createdAt: "2026-01-01",
    }));
    const deleteWebhook = vi.fn(async () => undefined);
    const provider = new WebhookResourceProvider({
      client: mockClient({ createWebhook, getWebhook, deleteWebhook }),
      idempotencyKey: "fixed",
    });

    const created = await provider.create(base);
    expect(created.id).toBe("wh1");
    expect(created.outs.secret).toBe("s3cr3t");

    const read = await provider.read("wh1", { ...base, secret: "s3cr3t" });
    expect(read.props).toMatchObject({ secret: "s3cr3t", urlFingerprint: "fp" });

    const same = await provider.diff!("wh1", base, {
      ...base,
      events: ["run.recovered", "run.failed"],
    });
    expect(same.replaces).toEqual([]);
    expect(same.changes).toBe(false);

    const urlDiff = await provider.diff!("wh1", base, { ...base, url: "https://other" });
    expect(urlDiff.replaces).toContain("url");
    expect(urlDiff.deleteBeforeReplace).toBe(true);

    const evDiff = await provider.diff!("wh1", base, { ...base, events: ["run.failed"] });
    expect(evDiff.replaces).toContain("events");

    await expect(provider.update!()).rejects.toThrow(/cannot update in place/);
    await provider.delete("wh1", base);
  });

  it("404 on read/delete; other errors propagate; create without secret field", async () => {
    const provider = new WebhookResourceProvider({
      client: mockClient({
        createWebhook: async () => ({ id: "wh2", events: ["run.failed"] }),
        getWebhook: async () => {
          throw new APIError(404, "missing", "/v1/webhooks/x");
        },
        deleteWebhook: async () => {
          throw new APIError(404, "missing", "/v1/webhooks/x");
        },
      }),
      idempotencyKey: "k",
    });
    const created = await provider.create({ url: "https://h.example/x" });
    expect(created.outs.secret).toBeUndefined();
    expect(await provider.read("x", base)).toEqual({ id: "", props: {} });
    await provider.delete("x", base);

    const provider2 = new WebhookResourceProvider({
      client: mockClient({
        getWebhook: async () => {
          throw new APIError(500, "boom", "/v1/webhooks/x");
        },
        deleteWebhook: async () => {
          throw new APIError(500, "boom", "/v1/webhooks/x");
        },
      }),
    });
    await expect(provider2.read("x", base)).rejects.toMatchObject({ statusCode: 500 });
    await expect(provider2.delete("x", base)).rejects.toMatchObject({ statusCode: 500 });
  });

  it("create without injected idempotency key; null API fields keep props", async () => {
    const provider = new WebhookResourceProvider({
      client: mockClient({
        createWebhook: async () => ({
          id: "wh3",
          events: undefined,
          enabled: undefined,
          urlFingerprint: undefined,
          createdAt: undefined,
          secret: "once",
        }),
        getWebhook: async () => ({
          id: "wh3",
          events: undefined,
          enabled: null,
          urlFingerprint: null,
          createdAt: null,
          secret: null,
        }),
      }),
    });
    const created = await provider.create({
      url: "https://h.example/x",
      events: ["run.failed"],
      enabled: true,
      urlFingerprint: "fp0",
      createdAt: "t0",
      secret: "keep",
    });
    expect(created.outs.secret).toBe("once");
    expect(created.outs.events).toEqual(["run.failed"]);
    const read = await provider.read("wh3", {
      url: "https://h.example/x",
      events: ["run.failed"],
      secret: "keep",
      enabled: true,
      urlFingerprint: "fp0",
      createdAt: "t0",
    });
    expect(read.props).toMatchObject({
      secret: "keep",
      events: ["run.failed"],
      enabled: true,
      urlFingerprint: "fp0",
      createdAt: "t0",
    });
  });

  it("creates client from props when not injected", async () => {
    const bare = new WebhookResourceProvider();
    await expect(bare.create({ url: "https://h.example/x" })).rejects.toThrow(/PATHLY_API_TOKEN/);
  });
});
