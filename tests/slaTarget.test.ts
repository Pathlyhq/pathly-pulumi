import { describe, expect, it, vi } from "vitest";
import { APIError, Client } from "../src/client";
import { SlaTargetResourceProvider, SlaTargetState } from "../src/slaTarget";

function mockClient(partial: Partial<Client>): Client {
  return partial as Client;
}

const base: SlaTargetState = {
  monitorId: "s1",
  name: "Checkout — 99.9 %",
  objectivePct: 99.9,
  windowDays: 30,
  excludeMaintenance: true,
  warnAtBudgetRatio: 0.8,
  enabled: true,
  __apiToken: "tok",
};

describe("SlaTargetResourceProvider", () => {
  it("upsert create / update / read / delete; replace on monitorId", async () => {
    const upsertSlaTarget = vi.fn(async () => ({
      id: "sla1",
      monitorId: "s1",
      name: "Checkout — 99.9 %",
      objectivePct: 99.9,
      windowDays: 30,
      excludeMaintenance: true,
      warnAtBudgetRatio: 0.8,
      enabled: true,
    }));
    const getSlaTarget = vi.fn(async () => ({
      id: "sla1",
      monitorId: "s1",
      objectivePct: 99.9,
      windowDays: 30,
    }));
    const deleteSlaTarget = vi.fn(async () => undefined);
    const provider = new SlaTargetResourceProvider({
      client: mockClient({ upsertSlaTarget, getSlaTarget, deleteSlaTarget }),
      idempotencyKey: "fixed",
    });

    const created = await provider.create(base);
    expect(created.id).toBe("sla1");

    const read = await provider.read("sla1", base);
    expect(read.props).toMatchObject({ objectivePct: 99.9 });

    const same = await provider.diff!("sla1", base, { ...base });
    expect(same.changes).toBe(false);
    expect(same.replaces).toEqual([]);

    const pct = await provider.diff!("sla1", base, { ...base, objectivePct: 99.5 });
    expect(pct.changes).toBe(true);
    expect(pct.replaces).toEqual([]);

    const mon = await provider.diff!("sla1", base, { ...base, monitorId: "s2" });
    expect(mon.replaces).toContain("monitorId");
    expect(mon.deleteBeforeReplace).toBe(true);

    const updated = await provider.update!("sla1", base, { ...base, objectivePct: 99.5 });
    expect(upsertSlaTarget).toHaveBeenCalled();
    expect(updated.outs).toMatchObject({ objectivePct: 99.9 });

    await provider.delete("sla1", base);
  });

  it("404 and errors; client from props", async () => {
    const provider = new SlaTargetResourceProvider({
      client: mockClient({
        getSlaTarget: async () => {
          throw new APIError(404, "missing", "/v1/sla-targets/x");
        },
        deleteSlaTarget: async () => {
          throw new APIError(404, "missing", "/v1/sla-targets/x");
        },
      }),
    });
    expect(await provider.read("x", base)).toEqual({ id: "", props: {} });
    await provider.delete("x", base);

    const provider2 = new SlaTargetResourceProvider({
      client: mockClient({
        getSlaTarget: async () => {
          throw new APIError(500, "boom", "/v1/sla-targets/x");
        },
        deleteSlaTarget: async () => {
          throw new APIError(500, "boom", "/v1/sla-targets/x");
        },
      }),
    });
    await expect(provider2.read("x", base)).rejects.toMatchObject({ statusCode: 500 });
    await expect(provider2.delete("x", base)).rejects.toMatchObject({ statusCode: 500 });

    const bare = new SlaTargetResourceProvider();
    await expect(
      bare.create({ objectivePct: 99, windowDays: 7 } as SlaTargetState),
    ).rejects.toThrow(/PATHLY_API_TOKEN/);
  });

  it("create without key; null API numeric fields keep props", async () => {
    const provider = new SlaTargetResourceProvider({
      client: mockClient({
        upsertSlaTarget: async () => ({
          id: "sla2",
          monitorId: null,
          name: null,
          objectivePct: null,
          windowDays: null,
          excludeMaintenance: null,
          warnAtBudgetRatio: null,
          enabled: null,
        }),
      }),
    });
    const created = await provider.create({
      objectivePct: 99.9,
      windowDays: 30,
      name: "n",
      excludeMaintenance: true,
      warnAtBudgetRatio: 0.5,
      enabled: true,
    });
    expect(created.outs).toMatchObject({
      objectivePct: 99.9,
      windowDays: 30,
      name: "n",
      excludeMaintenance: true,
      warnAtBudgetRatio: 0.5,
      enabled: true,
    });
  });

  it("update generates idempotency key when not injected", async () => {
    const upsertSlaTarget = vi.fn(async () => ({
      id: "sla1",
      objectivePct: 99,
      windowDays: 7,
    }));
    const provider = new SlaTargetResourceProvider({
      client: mockClient({ upsertSlaTarget }),
    });
    await provider.update!("sla1", base, { objectivePct: 99, windowDays: 7, __apiToken: "tok" });
    expect(upsertSlaTarget.mock.calls[0][1]).toMatch(/^sla-upd-/);
  });
});
