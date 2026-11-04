/**
 * HTTP client for the Pathly public `/v1` API.
 * Mirrors the Terraform provider client: retries on 429/5xx, Idempotency-Key,
 * and clear APIError with IsNotFound for state drift.
 */

export const DEFAULT_BASE_URL = "https://api.pathlyhq.com";
export const ENV_TOKEN = "PATHLY_API_TOKEN";
export const ENV_BASE_URL = "PATHLY_API_URL";

const MAX_ATTEMPTS = 4;
const MAX_RETRY_WAIT_MS = 90_000;

export class APIError extends Error {
  readonly statusCode: number;
  readonly path: string;

  constructor(statusCode: number, message: string, path: string) {
    super(`${path}: ${message} (HTTP ${statusCode})`);
    this.name = "APIError";
    this.statusCode = statusCode;
    this.path = path;
  }

  isNotFound(): boolean {
    return this.statusCode === 404;
  }
}

export function isNotFound(err: unknown): boolean {
  return err instanceof APIError && err.isNotFound();
}

export type FetchFn = typeof fetch;
export type SleepFn = (ms: number) => Promise<void>;

export interface ClientOptions {
  baseUrl?: string;
  token: string;
  fetchFn?: FetchFn;
  sleep?: SleepFn;
  userAgent?: string;
}

export interface Scenario {
  id: string;
  name: string;
  type: string;
  url?: string | null;
  enabled?: boolean | null;
  intervalSec?: number | null;
  method?: string | null;
  expectedStatus?: number | null;
  maxLatencyMs?: number | null;
  expectText?: string | null;
  runbook?: string | null;
  cron?: string | null;
  lastStatus?: string | null;
  regions?: string[];
  tags?: string[];
  folder?: string | null;
  severity?: string | null;
  mutedUntil?: string | null;
  scenarioFingerprint?: string | null;
  createdAt?: string | null;
}

export interface ScenarioInput {
  name?: string;
  type?: string;
  url?: string;
  intervalSec?: number;
  method?: string;
  expectedStatus?: number;
  maxLatencyMs?: number;
  expectText?: string;
  regions?: string[];
  tags?: string[];
  folder?: string;
  severity?: string;
  runbook?: string;
  cron?: string;
  enabled?: boolean;
}

export interface MaintenanceWindow {
  id: string;
  monitorId?: string | null;
  startsAt?: string | null;
  endsAt?: string | null;
  reason?: string | null;
  weekday?: number | null;
  startMinute?: number | null;
  durationMin?: number | null;
}

export interface MaintenanceWindowInput {
  monitorId?: string;
  startsAt?: string;
  endsAt?: string;
  reason?: string;
  weekday?: number;
  startMinute?: number;
  durationMin?: number;
}

export interface Webhook {
  id: string;
  events?: string[];
  enabled?: boolean | null;
  hasSecret?: boolean | null;
  urlFingerprint?: string | null;
  createdAt?: string | null;
  secret?: string | null;
}

export interface WebhookInput {
  url: string;
  events?: string[];
}

export interface SlaTarget {
  id: string;
  monitorId?: string | null;
  name?: string | null;
  objectivePct?: number | null;
  windowDays?: number | null;
  excludeMaintenance?: boolean | null;
  warnAtBudgetRatio?: number | null;
  enabled?: boolean | null;
}

export interface SlaTargetInput {
  monitorId?: string;
  name?: string;
  objectivePct: number;
  windowDays: number;
  excludeMaintenance?: boolean;
  warnAtBudgetRatio?: number;
  enabled?: boolean;
}

interface RequestOpts {
  method: string;
  path: string;
  body?: unknown;
  idempotencyKey?: string;
}

function trimBase(url: string): string {
  return url.replace(/\/+$/, "");
}

function backoffMs(attempt: number): number {
  return attempt * 500;
}

function fieldOf(path: unknown[]): string {
  const parts: string[] = [];
  for (const p of path) {
    if (typeof p === "string") parts.push(p);
    else if (typeof p === "number") parts.push(String(Math.trunc(p)));
  }
  return parts.length === 0 ? "body" : parts.join(".");
}

function parseApiError(status: number, path: string, bodyText: string): APIError {
  let message = bodyText.trim();
  try {
    const parsed = JSON.parse(bodyText) as {
      error?: string;
      details?: Array<{ message?: string; path?: unknown[] }>;
    };
    if (parsed.error) {
      message = parsed.error;
      for (const d of parsed.details ?? []) {
        message += ` [${fieldOf(d.path ?? [])}: ${d.message ?? ""}]`;
      }
    }
  } catch {
    // keep raw body
  }
  if (!message) {
    message = statusText(status);
  }
  if (status === 401) {
    message +=
      " Check PATHLY_API_TOKEN: an expired, revoked or truncated key gives the same response.";
  } else if (status === 403) {
    message += " Widen the scopes of the key, or check that the plan includes the feature.";
  }
  return new APIError(status, message, path);
}

function statusText(status: number): string {
  const map: Record<number, string> = {
    400: "Bad Request",
    401: "Unauthorized",
    403: "Forbidden",
    404: "Not Found",
    429: "Too Many Requests",
    500: "Internal Server Error",
    502: "Bad Gateway",
    503: "Service Unavailable",
  };
  return map[status] ?? `HTTP ${status}`;
}

function waitForRetry(headers: Headers, attempt: number): number {
  const raw = headers.get("Retry-After");
  if (raw) {
    const secs = Number.parseInt(raw.trim(), 10);
    if (!Number.isNaN(secs) && secs > 0) {
      const wait = secs * 1000;
      return wait > MAX_RETRY_WAIT_MS ? MAX_RETRY_WAIT_MS : wait;
    }
  }
  return backoffMs(attempt);
}

/** Exported for unit tests (fake timers). */
export async function defaultSleep(ms: number): Promise<void> {
  await new Promise((r) => setTimeout(r, ms));
}

export class Client {
  readonly baseUrl: string;
  private readonly token: string;
  private readonly fetchFn: FetchFn;
  private readonly sleep: SleepFn;
  private readonly userAgent: string;

  constructor(opts: ClientOptions) {
    const base = (opts.baseUrl ?? DEFAULT_BASE_URL).trim();
    this.baseUrl = trimBase(base === "" ? DEFAULT_BASE_URL : base);
    this.token = opts.token.trim();
    this.fetchFn = opts.fetchFn ?? fetch;
    this.sleep = opts.sleep ?? defaultSleep;
    this.userAgent = opts.userAgent ?? "pathly-pulumi/0.1.0"; // x-release-please-version
  }

  private async do<T = void>(r: RequestOpts): Promise<T> {
    const payload = r.body === undefined ? undefined : JSON.stringify(r.body);

    for (let attempt = 1; attempt < MAX_ATTEMPTS; attempt++) {
      const { retryMs, error, value } = await this.attempt<T>(r, payload, attempt, false);
      if (retryMs <= 0) {
        if (error) throw error;
        return value as T;
      }
      await this.sleep(retryMs);
    }
    const last = await this.attempt<T>(r, payload, MAX_ATTEMPTS, true);
    if (last.error) throw last.error;
    return last.value as T;
  }

  private async attempt<T>(
    r: RequestOpts,
    payload: string | undefined,
    attempt: number,
    last: boolean,
  ): Promise<{ retryMs: number; error?: Error; value?: T }> {
    const headers: Record<string, string> = {
      Authorization: `Bearer ${this.token}`,
      Accept: "application/json",
      "User-Agent": this.userAgent,
    };
    if (payload !== undefined) headers["Content-Type"] = "application/json";
    if (r.idempotencyKey) headers["Idempotency-Key"] = r.idempotencyKey;

    let res: Response;
    try {
      res = await this.fetchFn(this.baseUrl + r.path, {
        method: r.method,
        headers,
        body: payload,
      });
    } catch (err) {
      const wrapped = new Error(
        `calling ${r.method} ${r.path}: ${err instanceof Error ? err.message : String(err)}`,
      );
      if (last) return { retryMs: 0, error: wrapped };
      return { retryMs: backoffMs(attempt), error: wrapped };
    }

    let bodyText: string;
    try {
      // 204/205 must not carry a body; some runtimes reject text() on them.
      if (res.status === 204 || res.status === 205) {
        return { retryMs: 0, value: undefined as T };
      }
      bodyText = await res.text();
    } catch (err) {
      const wrapped = new Error(
        `reading the response of ${r.method} ${r.path}: ${err instanceof Error ? err.message : String(err)}`,
      );
      if (last) return { retryMs: 0, error: wrapped };
      return { retryMs: backoffMs(attempt), error: wrapped };
    }

    if (res.status === 429 || res.status >= 500) {
      const failure = parseApiError(res.status, r.path, bodyText);
      if (last) return { retryMs: 0, error: failure };
      return { retryMs: waitForRetry(res.headers, attempt), error: failure };
    }

    if (res.status >= 400) {
      return { retryMs: 0, error: parseApiError(res.status, r.path, bodyText) };
    }

    if (!bodyText) return { retryMs: 0, value: undefined as T };
    try {
      return { retryMs: 0, value: JSON.parse(bodyText) as T };
    } catch (err) {
      return {
        retryMs: 0,
        error: new Error(
          `unreadable response from ${r.method} ${r.path}: ${err instanceof Error ? err.message : String(err)}`,
        ),
      };
    }
  }

  /** Validates the token. 403 means the key is valid but lacks org:read. */
  async ping(): Promise<void> {
    try {
      await this.do<{ planId?: string }>({ method: "GET", path: "/v1/usage" });
    } catch (err) {
      if (err instanceof APIError && err.statusCode === 403) return;
      throw err;
    }
  }

  createScenario(input: ScenarioInput, idempotencyKey: string): Promise<Scenario> {
    return this.do({
      method: "POST",
      path: "/v1/scenarios",
      body: input,
      idempotencyKey,
    });
  }

  getScenario(id: string): Promise<Scenario> {
    return this.do({ method: "GET", path: `/v1/scenarios/${encodeURIComponent(id)}` });
  }

  updateScenario(id: string, input: ScenarioInput): Promise<Scenario> {
    return this.do({
      method: "PATCH",
      path: `/v1/scenarios/${encodeURIComponent(id)}`,
      body: input,
    });
  }

  deleteScenario(id: string): Promise<void> {
    return this.do({ method: "DELETE", path: `/v1/scenarios/${encodeURIComponent(id)}` });
  }

  createMaintenanceWindow(
    input: MaintenanceWindowInput,
    idempotencyKey: string,
  ): Promise<MaintenanceWindow> {
    return this.do({
      method: "POST",
      path: "/v1/maintenance-windows",
      body: input,
      idempotencyKey,
    });
  }

  getMaintenanceWindow(id: string): Promise<MaintenanceWindow> {
    return this.do({
      method: "GET",
      path: `/v1/maintenance-windows/${encodeURIComponent(id)}`,
    });
  }

  deleteMaintenanceWindow(id: string): Promise<void> {
    return this.do({
      method: "DELETE",
      path: `/v1/maintenance-windows/${encodeURIComponent(id)}`,
    });
  }

  createWebhook(input: WebhookInput, idempotencyKey: string): Promise<Webhook> {
    return this.do({
      method: "POST",
      path: "/v1/webhooks",
      body: input,
      idempotencyKey,
    });
  }

  getWebhook(id: string): Promise<Webhook> {
    return this.do({ method: "GET", path: `/v1/webhooks/${encodeURIComponent(id)}` });
  }

  deleteWebhook(id: string): Promise<void> {
    return this.do({ method: "DELETE", path: `/v1/webhooks/${encodeURIComponent(id)}` });
  }

  upsertSlaTarget(input: SlaTargetInput, idempotencyKey: string): Promise<SlaTarget> {
    return this.do({
      method: "PUT",
      path: "/v1/sla-targets",
      body: input,
      idempotencyKey,
    });
  }

  getSlaTarget(id: string): Promise<SlaTarget> {
    return this.do({ method: "GET", path: `/v1/sla-targets/${encodeURIComponent(id)}` });
  }

  deleteSlaTarget(id: string): Promise<void> {
    return this.do({ method: "DELETE", path: `/v1/sla-targets/${encodeURIComponent(id)}` });
  }
}

/** Build a client from provider inputs and/or environment. */
export function createClientFromConfig(cfg: {
  apiToken?: string;
  apiUrl?: string;
  fetchFn?: FetchFn;
  sleep?: SleepFn;
}): Client {
  const token = (cfg.apiToken ?? process.env[ENV_TOKEN] ?? "").trim();
  if (!token) {
    throw new Error(
      `Pathly API token required: set provider apiToken or ${ENV_TOKEN}`,
    );
  }
  const fromEnv = (process.env[ENV_BASE_URL] ?? "").trim();
  const apiUrl = fromEnv || (cfg.apiUrl ?? "").trim() || DEFAULT_BASE_URL;
  return new Client({
    token,
    baseUrl: apiUrl,
    fetchFn: cfg.fetchFn,
    sleep: cfg.sleep,
  });
}
