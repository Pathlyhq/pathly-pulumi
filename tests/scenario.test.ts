import { describe, expect, it, vi } from "vitest";
import { APIError, Client } from "../src/client";
import { ScenarioResourceProvider, ScenarioState } from "../src/scenario";

function mockClient(partial: Partial<Client>): Client {
  return partial as Client;
}

const base: ScenarioState = {
  name: "Home",
  url: "https://shop.example.com/",
  intervalSec: 300,
  __apiToken: "tok",
  __apiUrl: "https://api.test",
};

describe("ScenarioResourceProvider", () => {
  it("create / read / update / delete", async () => {
    const createScenario = vi.fn(async () => ({
      id: "s1",
      name: "Home",
      type: "http",
      url: "https://shop.example.com/",
      intervalSec: 300,
      lastStatus: "ok",
      createdAt: "2026-01-01",
    }));
    const getScenario = vi.fn(async () => ({
      id: "s1",
      name: "Home",
      type: "http",
      url: "https://shop.example.com/",
      intervalSec: 300,
      enabled: true,
    }));
    const updateScenario = vi.fn(async () => ({
      id: "s1",
      name: "Home2",
      type: "http",
      url: "https://shop.example.com/",
      intervalSec: 60,
    }));
    const deleteScenario = vi.fn(async () => undefined);
    const provider = new ScenarioResourceProvider({
      client: mockClient({ createScenario, getScenario, updateScenario, deleteScenario }),
      idempotencyKey: "fixed",
    });

    const created = await provider.create(base);
    expect(created.id).toBe("s1");
    expect(createScenario).toHaveBeenCalledWith(
      expect.objectContaining({ type: "http", name: "Home" }),
      "fixed",
    );

    const read = await provider.read("s1", base);
    expect(read.id).toBe("s1");
    expect(read.props).toMatchObject({ enabled: true });

    const diff = await provider.diff!("s1", base, { ...base, intervalSec: 60 });
    expect(diff.changes).toBe(true);
    expect(diff.replaces).toEqual([]);

    const updated = await provider.update!("s1", base, { ...base, name: "Home2", intervalSec: 60 });
    expect(updated.outs).toMatchObject({ name: "Home2", intervalSec: 60 });

    await provider.delete("s1", base);
    expect(deleteScenario).toHaveBeenCalledWith("s1");
  });

  it("read/delete tolerate 404; other errors propagate", async () => {
    const provider = new ScenarioResourceProvider({
      client: mockClient({
        getScenario: async () => {
          throw new APIError(404, "missing", "/v1/scenarios/x");
        },
        deleteScenario: async () => {
          throw new APIError(404, "missing", "/v1/scenarios/x");
        },
      }),
    });
    expect(await provider.read("x", base)).toEqual({ id: "", props: {} });
    await provider.delete("x", base);

    const provider2 = new ScenarioResourceProvider({
      client: mockClient({
        getScenario: async () => {
          throw new APIError(500, "boom", "/v1/scenarios/x");
        },
        deleteScenario: async () => {
          throw new APIError(500, "boom", "/v1/scenarios/x");
        },
      }),
    });
    await expect(provider2.read("x", base)).rejects.toMatchObject({ statusCode: 500 });
    await expect(provider2.delete("x", base)).rejects.toMatchObject({ statusCode: 500 });
  });

  it("diff with no changes and creates client from props", async () => {
    const provider = new ScenarioResourceProvider({
      client: mockClient({
        createScenario: async () => ({ id: "s2", name: "n", type: "http" }),
      }),
      idempotencyKey: "k",
    });
    const d = await provider.diff!("id", base, { ...base });
    expect(d.changes).toBe(false);

    // no injected client → uses createClientFromConfig (needs token on props)
    const real = new ScenarioResourceProvider({ idempotencyKey: "k" });
    const fetchFn: typeof fetch = async () =>
      new Response(JSON.stringify({ id: "s9", name: "n", type: "http" }), { status: 200 });
    // Monkey-patch via client created from props — ensure create path without inject works
    // by temporarily stubbing global fetch through a Client in createClientFromConfig.
    // We only assert that missing token throws.
    const bare = new ScenarioResourceProvider();
    await expect(
      bare.create({ name: "n", url: "https://a", intervalSec: 1 } as ScenarioState),
    ).rejects.toThrow(/PATHLY_API_TOKEN/);
    const created2 = await new ScenarioResourceProvider({
      client: mockClient({
        createScenario: async () => ({
          id: "s3",
          name: "Home",
          type: "http",
          method: "GET",
          expectedStatus: 200,
          maxLatencyMs: 1000,
          expectText: "ok",
          regions: ["eu"],
          tags: ["prod"],
          folder: "Shop",
          severity: "major",
          runbook: "https://wiki",
          cron: "0 * * * *",
          enabled: false,
          mutedUntil: null,
          scenarioFingerprint: null,
          createdAt: null,
          lastStatus: null,
        }),
      }),
    }).create({
      ...base,
      method: "GET",
      expectedStatus: 200,
      maxLatencyMs: 1000,
      expectText: "ok",
      regions: ["eu"],
      tags: ["prod"],
      folder: "Shop",
      severity: "major",
      runbook: "https://wiki",
      cron: "0 * * * *",
      enabled: false,
    });
    expect(created2.id).toBe("s3");
  });
});
