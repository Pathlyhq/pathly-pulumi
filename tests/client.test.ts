import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  APIError,
  Client,
  DEFAULT_BASE_URL,
  ENV_BASE_URL,
  ENV_TOKEN,
  createClientFromConfig,
  isNotFound,
} from "../src/client";

type MockRes = {
  status: number;
  body?: string | object;
  headers?: Record<string, string>;
  failRead?: boolean;
};

function jsonRes(status: number, body?: object, headers?: Record<string, string>): Response {
  return new Response(body === undefined ? "" : JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", ...headers },
  });
}

function textRes(status: number, body: string, headers?: Record<string, string>): Response {
  return new Response(body, { status, headers });
}

function mockFetchSequence(responses: Array<MockRes | Error>): {
  fetchFn: typeof fetch;
  calls: Array<{ url: string; init?: RequestInit }>;
} {
  const calls: Array<{ url: string; init?: RequestInit }> = [];
  let i = 0;
  const fetchFn: typeof fetch = async (input, init) => {
    calls.push({ url: String(input), init });
    const next = responses[i++];
    if (next === undefined) {
      return jsonRes(500, { error: `unexpected fetch #${i}` });
    }
    if (next instanceof Error) throw next;
    if (next.failRead) {
      return {
        status: next.status,
        headers: new Headers(next.headers),
        text: async () => {
          throw new Error("read failed");
        },
      } as unknown as Response;
    }
    if (typeof next.body === "string") {
      return textRes(next.status, next.body, next.headers);
    }
    if (next.status === 204 || next.status === 205) {
      return new Response(null, { status: next.status, headers: next.headers });
    }
    return jsonRes(next.status, next.body, next.headers);
  };
  return { fetchFn, calls };
}

describe("APIError", () => {
  it("formats and detects 404", () => {
    const e = new APIError(404, "gone", "/v1/x");
    expect(e.message).toContain("HTTP 404");
    expect(e.isNotFound()).toBe(true);
    expect(isNotFound(e)).toBe(true);
    expect(isNotFound(new Error("x"))).toBe(false);
    expect(new APIError(400, "bad", "/v1/x").isNotFound()).toBe(false);
  });
});

describe("Client", () => {
  const sleeps: number[] = [];
  const sleep = async (ms: number) => {
    sleeps.push(ms);
  };

  beforeEach(() => {
    sleeps.length = 0;
  });

  it("uses default base URL and trims slash", async () => {
    const { fetchFn, calls } = mockFetchSequence([{ status: 200, body: { id: "1" } }]);
    const c = new Client({ token: " sp_x ", baseUrl: "", fetchFn, sleep });
    expect(c.baseUrl).toBe(DEFAULT_BASE_URL);
    const c2 = new Client({
      token: "t",
      baseUrl: "https://example.com/",
      fetchFn,
      sleep,
      userAgent: "test-ua",
    });
    expect(c2.baseUrl).toBe("https://example.com");
    await c2.getScenario("a");
    expect(calls[0].url).toBe("https://example.com/v1/scenarios/a");
    expect(calls[0].init?.headers).toMatchObject({
      Authorization: "Bearer t",
      "User-Agent": "test-ua",
    });
  });

  it("CRUD scenarios", async () => {
    const { fetchFn, calls } = mockFetchSequence([
      { status: 200, body: { id: "s1", name: "n", type: "http" } },
      { status: 200, body: { id: "s1", name: "n", type: "http" } },
      { status: 200, body: { id: "s1", name: "n2", type: "http" } },
      { status: 200, body: {} },
    ]);
    const c = new Client({ token: "t", fetchFn, sleep });
    const created = await c.createScenario({ name: "n", type: "http", url: "https://a" }, "idem-1");
    expect(created.id).toBe("s1");
    expect((calls[0].init?.headers as Record<string, string>)["Idempotency-Key"]).toBe("idem-1");
    expect(await c.getScenario("s1")).toMatchObject({ id: "s1" });
    expect(await c.updateScenario("s1", { name: "n2" })).toMatchObject({ name: "n2" });
    await c.deleteScenario("s1");
    expect(calls[3].init?.method).toBe("DELETE");
  });

  it("CRUD maintenance, webhook, sla", async () => {
    const { fetchFn } = mockFetchSequence([
      { status: 200, body: { id: "mw1", weekday: 1 } },
      { status: 200, body: { id: "mw1", weekday: 1 } },
      { status: 200, body: {} },
      { status: 200, body: { id: "wh1", secret: "sec", events: ["run.failed"] } },
      { status: 200, body: { id: "wh1", events: ["run.failed"] } },
      { status: 200, body: {} },
      { status: 200, body: { id: "sla1", objectivePct: 99.9, windowDays: 30 } },
      { status: 200, body: { id: "sla1", objectivePct: 99.9, windowDays: 30 } },
      { status: 200, body: {} },
    ]);
    const c = new Client({ token: "t", fetchFn, sleep });
    expect(
      (await c.createMaintenanceWindow({ weekday: 1, startMinute: 0, durationMin: 60 }, "k")).id,
    ).toBe("mw1");
    expect((await c.getMaintenanceWindow("mw1")).id).toBe("mw1");
    await c.deleteMaintenanceWindow("mw1");
    expect((await c.createWebhook({ url: "https://h.example/x" }, "k")).secret).toBe("sec");
    expect((await c.getWebhook("wh1")).id).toBe("wh1");
    await c.deleteWebhook("wh1");
    expect((await c.upsertSlaTarget({ objectivePct: 99.9, windowDays: 30 }, "k")).id).toBe("sla1");
    expect((await c.getSlaTarget("sla1")).id).toBe("sla1");
    await c.deleteSlaTarget("sla1");
  });

  it("ping accepts 200 and 403", async () => {
    const a = mockFetchSequence([{ status: 200, body: { planId: "pro" } }]);
    await new Client({ token: "t", fetchFn: a.fetchFn, sleep }).ping();
    const b = mockFetchSequence([{ status: 403, body: { error: "missing scope" } }]);
    await new Client({ token: "t", fetchFn: b.fetchFn, sleep }).ping();
    const c = mockFetchSequence([{ status: 401, body: { error: "nope" } }]);
    await expect(new Client({ token: "t", fetchFn: c.fetchFn, sleep }).ping()).rejects.toThrow(
      /PATHLY_API_TOKEN/,
    );
  });

  it("parses validation details and empty body errors", async () => {
    const a = mockFetchSequence([
      {
        status: 400,
        body: {
          error: "Invalid body",
          details: [{ message: "required", path: ["events", 0] }, { message: "x", path: [] }],
        },
      },
    ]);
    await expect(
      new Client({ token: "t", fetchFn: a.fetchFn, sleep }).createWebhook({ url: "https://x" }, "k"),
    ).rejects.toThrow(/events\.0/);

    const b = mockFetchSequence([{ status: 400, body: "" }]);
    await expect(
      new Client({ token: "t", fetchFn: b.fetchFn, sleep }).getScenario("x"),
    ).rejects.toThrow(/Bad Request/);

    const c = mockFetchSequence([{ status: 418, body: "teapot" }]);
    await expect(
      new Client({ token: "t", fetchFn: c.fetchFn, sleep }).getScenario("x"),
    ).rejects.toThrow(/teapot/);

    const d = mockFetchSequence([{ status: 403, body: { error: "denied" } }]);
    await expect(
      new Client({ token: "t", fetchFn: d.fetchFn, sleep }).getScenario("x"),
    ).rejects.toThrow(/Widen the scopes/);
  });

  it("retries transport errors then succeeds", async () => {
    const { fetchFn } = mockFetchSequence([
      new Error("boom"),
      { status: 200, body: { id: "s1", name: "n", type: "http" } },
    ]);
    const out = await new Client({ token: "t", fetchFn, sleep }).getScenario("s1");
    expect(out.id).toBe("s1");
    expect(sleeps[0]).toBe(500);
  });

  it("retries read failures then fails on last", async () => {
    const { fetchFn } = mockFetchSequence([
      { status: 200, failRead: true },
      { status: 200, failRead: true },
      { status: 200, failRead: true },
      { status: 200, failRead: true },
    ]);
    await expect(
      new Client({ token: "t", fetchFn, sleep }).getScenario("s1"),
    ).rejects.toThrow(/reading the response/);
    expect(sleeps.length).toBe(3);
  });

  it("retries 429 with Retry-After capped", async () => {
    const { fetchFn } = mockFetchSequence([
      { status: 429, body: { error: "slow" }, headers: { "Retry-After": "120" } },
      { status: 200, body: { id: "s1", name: "n", type: "http" } },
    ]);
    await new Client({ token: "t", fetchFn, sleep }).getScenario("s1");
    expect(sleeps[0]).toBe(90_000);
  });

  it("retries 503 with invalid Retry-After via backoff", async () => {
    const { fetchFn } = mockFetchSequence([
      { status: 503, body: { error: "down" }, headers: { "Retry-After": "nope" } },
      { status: 200, body: { id: "s1", name: "n", type: "http" } },
    ]);
    await new Client({ token: "t", fetchFn, sleep }).getScenario("s1");
    expect(sleeps[0]).toBe(500);
  });

  it("retries 500 until last attempt fails", async () => {
    const { fetchFn } = mockFetchSequence([
      { status: 500, body: { error: "e" } },
      { status: 500, body: { error: "e" } },
      { status: 500, body: { error: "e" } },
      { status: 500, body: { error: "e" } },
    ]);
    await expect(
      new Client({ token: "t", fetchFn, sleep }).getScenario("s1"),
    ).rejects.toMatchObject({ statusCode: 500 });
  });

  it("fails on unreadable JSON", async () => {
    const { fetchFn } = mockFetchSequence([{ status: 200, body: "{not-json" }]);
    await expect(
      new Client({ token: "t", fetchFn, sleep }).getScenario("s1"),
    ).rejects.toThrow(/unreadable response/);
  });

  it("does not retry 404", async () => {
    const { fetchFn, calls } = mockFetchSequence([{ status: 404, body: { error: "missing" } }]);
    await expect(
      new Client({ token: "t", fetchFn, sleep }).getScenario("s1"),
    ).rejects.toMatchObject({ statusCode: 404 });
    expect(calls.length).toBe(1);
  });

  it("encodes path ids", async () => {
    const { fetchFn, calls } = mockFetchSequence([{ status: 200, body: {} }]);
    await new Client({ token: "t", fetchFn, sleep }).deleteScenario("a/b");
    expect(calls[0].url).toContain("/v1/scenarios/a%2Fb");
  });

  it("accepts empty 204 delete body", async () => {
    const { fetchFn } = mockFetchSequence([{ status: 204 }]);
    await new Client({ token: "t", fetchFn, sleep }).deleteScenario("s1");
  });

  it("retries transport until last fails with non-Error", async () => {
    const calls: number[] = [];
    const fetchFn: typeof fetch = async () => {
      calls.push(1);
      throw "fail";
    };
    await expect(
      new Client({ token: "t", fetchFn, sleep }).getScenario("s1"),
    ).rejects.toThrow(/calling GET/);
    expect(calls.length).toBe(4);
  });

  it("handles positive Retry-After under cap", async () => {
    const { fetchFn } = mockFetchSequence([
      { status: 429, body: { error: "slow" }, headers: { "Retry-After": "2" } },
      { status: 200, body: { id: "s1", name: "n", type: "http" } },
    ]);
    await new Client({ token: "t", fetchFn, sleep }).getScenario("s1");
    expect(sleeps[0]).toBe(2000);
  });

  it("ignores non-positive Retry-After", async () => {
    const { fetchFn } = mockFetchSequence([
      { status: 429, body: { error: "slow" }, headers: { "Retry-After": "0" } },
      { status: 200, body: { id: "s1", name: "n", type: "http" } },
    ]);
    await new Client({ token: "t", fetchFn, sleep }).getScenario("s1");
    expect(sleeps[0]).toBe(500);
  });

  it("uses defaultSleep when none provided", async () => {
    vi.useFakeTimers();
    try {
      const { fetchFn } = mockFetchSequence([
        new Error("boom"),
        { status: 200, body: { id: "s1", name: "n", type: "http" } },
      ]);
      const p = new Client({ token: "t", fetchFn }).getScenario("s1");
      await vi.advanceTimersByTimeAsync(500);
      await expect(p).resolves.toMatchObject({ id: "s1" });
    } finally {
      vi.useRealTimers();
    }
  });

  it("succeeds on the last attempt after transient failures", async () => {
    const { fetchFn } = mockFetchSequence([
      { status: 503, body: { error: "down" } },
      { status: 503, body: { error: "down" } },
      { status: 503, body: { error: "down" } },
      { status: 200, body: { id: "s1", name: "n", type: "http" } },
    ]);
    await expect(
      new Client({ token: "t", fetchFn, sleep }).getScenario("s1"),
    ).resolves.toMatchObject({ id: "s1" });
    expect(sleeps.length).toBe(3);
  });

  it("covers statusText fallbacks for known codes", async () => {
    for (const status of [400, 401, 403, 404, 502, 599]) {
      const responses =
        status >= 500
          ? [
              { status, body: "" },
              { status, body: "" },
              { status, body: "" },
              { status, body: "" },
            ]
          : [{ status, body: "" }];
      const { fetchFn } = mockFetchSequence(responses);
      await expect(
        new Client({ token: "t", fetchFn, sleep }).getScenario("x"),
      ).rejects.toMatchObject({ statusCode: status });
    }
  });

  it("handles detail path with only numbers and read error non-Error", async () => {
    const a = mockFetchSequence([
      {
        status: 400,
        body: { error: "bad", details: [{ message: "n", path: [1] }] },
      },
    ]);
    await expect(
      new Client({ token: "t", fetchFn: a.fetchFn, sleep }).getScenario("x"),
    ).rejects.toThrow(/1:/);

    const b = mockFetchSequence([
      {
        status: 400,
        body: { error: "bad", details: [{ path: ["f"] }] },
      },
    ]);
    await expect(
      new Client({ token: "t", fetchFn: b.fetchFn, sleep }).getScenario("x"),
    ).rejects.toThrow(/f:/);

    const c = mockFetchSequence([
      {
        status: 400,
        body: { error: "only", details: [{ message: "m" }] },
      },
    ]);
    await expect(
      new Client({ token: "t", fetchFn: c.fetchFn, sleep }).getScenario("x"),
    ).rejects.toThrow(/body: m/);

    const d = mockFetchSequence([
      {
        status: 400,
        body: { error: "only", details: null },
      },
    ]);
    await expect(
      new Client({ token: "t", fetchFn: d.fetchFn, sleep }).getScenario("x"),
    ).rejects.toThrow(/only/);

    const fetchFn: typeof fetch = async () =>
      ({
        status: 200,
        headers: new Headers(),
        text: async () => {
          throw "read-boom";
        },
      }) as unknown as Response;
    await expect(
      new Client({ token: "t", fetchFn, sleep }).getScenario("x"),
    ).rejects.toThrow(/reading the response/);
  });

  it("handles 205 no-content", async () => {
    const { fetchFn } = mockFetchSequence([{ status: 205 }]);
    await new Client({ token: "t", fetchFn, sleep }).deleteScenario("s1");
  });

  it("accepts empty 200 body and non-Error JSON parse failure", async () => {
    const a = mockFetchSequence([{ status: 200, body: "" }]);
    await expect(
      new Client({ token: "t", fetchFn: a.fetchFn, sleep }).deleteScenario("s1"),
    ).resolves.toBeUndefined();

    const fetchFn: typeof fetch = async () =>
      ({
        status: 200,
        headers: new Headers(),
        text: async () => "{bad",
      }) as unknown as Response;
    // Force JSON.parse to throw a non-Error by stubbing
    const orig = JSON.parse;
    JSON.parse = (() => {
      throw "parse-boom";
    }) as typeof JSON.parse;
    try {
      await expect(
        new Client({ token: "t", fetchFn, sleep }).getScenario("x"),
      ).rejects.toThrow(/unreadable response.*parse-boom/);
    } finally {
      JSON.parse = orig;
    }
  });
});

describe("createClientFromConfig", () => {
  const prevToken = process.env[ENV_TOKEN];
  const prevUrl = process.env[ENV_BASE_URL];

  afterEach(() => {
    if (prevToken === undefined) delete process.env[ENV_TOKEN];
    else process.env[ENV_TOKEN] = prevToken;
    if (prevUrl === undefined) delete process.env[ENV_BASE_URL];
    else process.env[ENV_BASE_URL] = prevUrl;
  });

  it("requires token", () => {
    delete process.env[ENV_TOKEN];
    expect(() => createClientFromConfig({})).toThrow(/PATHLY_API_TOKEN/);
  });

  it("prefers env URL then args", () => {
    process.env[ENV_TOKEN] = "tok";
    process.env[ENV_BASE_URL] = "https://env.example";
    const c = createClientFromConfig({ apiUrl: "https://arg.example" });
    expect(c.baseUrl).toBe("https://env.example");
    delete process.env[ENV_BASE_URL];
    const c2 = createClientFromConfig({ apiToken: "tok", apiUrl: "https://arg.example" });
    expect(c2.baseUrl).toBe("https://arg.example");
    const c3 = createClientFromConfig({ apiToken: "tok" });
    expect(c3.baseUrl).toBe(DEFAULT_BASE_URL);
  });
});
