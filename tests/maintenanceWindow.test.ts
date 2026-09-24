import { describe, expect, it, vi } from "vitest";
import { APIError, Client } from "../src/client";
import {
  MaintenanceWindowResourceProvider,
  MaintenanceWindowState,
} from "../src/maintenanceWindow";

function mockClient(partial: Partial<Client>): Client {
  return partial as Client;
}

const weekly: MaintenanceWindowState = {
  weekday: 7,
  startMinute: 180,
  durationMin: 120,
  reason: "Weekly backup",
  __apiToken: "tok",
};

describe("MaintenanceWindowResourceProvider", () => {
  it("create / read / diff replace / delete", async () => {
    const createMaintenanceWindow = vi.fn(async () => ({
      id: "mw1",
      weekday: 7,
      startMinute: 180,
      durationMin: 120,
      reason: "Weekly backup",
    }));
    const getMaintenanceWindow = vi.fn(async () => ({
      id: "mw1",
      weekday: 7,
      startMinute: 180,
      durationMin: 120,
      reason: "Weekly backup",
    }));
    const deleteMaintenanceWindow = vi.fn(async () => undefined);
    const provider = new MaintenanceWindowResourceProvider({
      client: mockClient({
        createMaintenanceWindow,
        getMaintenanceWindow,
        deleteMaintenanceWindow,
      }),
      idempotencyKey: "fixed",
    });

    const created = await provider.create(weekly);
    expect(created.id).toBe("mw1");

    const read = await provider.read("mw1", weekly);
    expect(read.props).toMatchObject({ weekday: 7 });

    const noChange = await provider.diff!("mw1", weekly, { ...weekly });
    expect(noChange.changes).toBe(false);

    const change = await provider.diff!("mw1", weekly, { ...weekly, durationMin: 60 });
    expect(change.replaces).toContain("durationMin");
    expect(change.deleteBeforeReplace).toBe(true);

    await expect(provider.update!()).rejects.toThrow(/cannot update in place/);
    await provider.delete("mw1", weekly);
  });

  it("one-off window and 404 handling", async () => {
    const oneOff: MaintenanceWindowState = {
      monitorId: "s1",
      startsAt: "2026-10-04T22:00:00Z",
      endsAt: "2026-10-05T02:00:00Z",
      reason: "Migration",
      __apiToken: "tok",
    };
    const provider = new MaintenanceWindowResourceProvider({
      client: mockClient({
        createMaintenanceWindow: async () => ({
          id: "mw2",
          monitorId: "s1",
          startsAt: "2026-10-04T22:00:00Z",
          endsAt: "2026-10-05T02:00:00Z",
        }),
        getMaintenanceWindow: async () => {
          throw new APIError(404, "missing", "/v1/maintenance-windows/x");
        },
        deleteMaintenanceWindow: async () => {
          throw new APIError(404, "missing", "/v1/maintenance-windows/x");
        },
      }),
      idempotencyKey: "k",
    });
    expect((await provider.create(oneOff)).id).toBe("mw2");
    expect(await provider.read("x", oneOff)).toEqual({ id: "", props: {} });
    await provider.delete("x", oneOff);

    const provider2 = new MaintenanceWindowResourceProvider({
      client: mockClient({
        getMaintenanceWindow: async () => {
          throw new APIError(500, "boom", "/v1/maintenance-windows/x");
        },
        deleteMaintenanceWindow: async () => {
          throw new APIError(500, "boom", "/v1/maintenance-windows/x");
        },
      }),
    });
    await expect(provider2.read("x", weekly)).rejects.toMatchObject({ statusCode: 500 });
    await expect(provider2.delete("x", weekly)).rejects.toMatchObject({ statusCode: 500 });
  });

  it("create without idempotency key; null API fields keep props", async () => {
    const provider = new MaintenanceWindowResourceProvider({
      client: mockClient({
        createMaintenanceWindow: async () => ({
          id: "mw3",
          monitorId: null,
          startsAt: null,
          endsAt: null,
          reason: null,
          weekday: null,
          startMinute: null,
          durationMin: null,
        }),
      }),
    });
    const created = await provider.create({
      weekday: 1,
      startMinute: 0,
      durationMin: 30,
      reason: "r",
    });
    expect(created.id).toBe("mw3");
    expect(created.outs).toMatchObject({ weekday: 1, reason: "r" });
  });

  it("creates client from props when not injected", async () => {
    const bare = new MaintenanceWindowResourceProvider();
    await expect(bare.create({ weekday: 1, startMinute: 0, durationMin: 30 })).rejects.toThrow(
      /PATHLY_API_TOKEN/,
    );
  });
});
