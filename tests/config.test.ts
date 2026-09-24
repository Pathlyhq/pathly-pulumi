import { afterEach, describe, expect, it, vi } from "vitest";
import * as pulumi from "@pulumi/pulumi";
import { DEFAULT_BASE_URL, ENV_BASE_URL, ENV_TOKEN } from "../src/client";
import {
  attachProviderInputs,
  defaultPulumiConfigGet,
  providerFromProps,
  resolvePlainConfig,
  resolveProviderConfig,
} from "../src/config";

describe("resolvePlainConfig", () => {
  const prevToken = process.env[ENV_TOKEN];
  const prevUrl = process.env[ENV_BASE_URL];

  afterEach(() => {
    if (prevToken === undefined) delete process.env[ENV_TOKEN];
    else process.env[ENV_TOKEN] = prevToken;
    if (prevUrl === undefined) delete process.env[ENV_BASE_URL];
    else process.env[ENV_BASE_URL] = prevUrl;
  });

  it("reads args, getter, env, defaults", () => {
    delete process.env[ENV_TOKEN];
    delete process.env[ENV_BASE_URL];
    expect(resolvePlainConfig({ apiToken: " a ", apiUrl: " https://x/ " })).toEqual({
      apiToken: "a",
      apiUrl: "https://x/",
    });
    expect(
      resolvePlainConfig({}, (k) =>
        k === "apiToken" ? "fromCfg" : k === "apiUrl" ? "https://cfg" : undefined,
      ),
    ).toEqual({ apiToken: "fromCfg", apiUrl: "https://cfg" });
    process.env[ENV_TOKEN] = "envTok";
    process.env[ENV_BASE_URL] = "https://env";
    expect(resolvePlainConfig({})).toEqual({ apiToken: "envTok", apiUrl: "https://env" });
    delete process.env[ENV_TOKEN];
    delete process.env[ENV_BASE_URL];
    expect(resolvePlainConfig({})).toEqual({ apiToken: undefined, apiUrl: DEFAULT_BASE_URL });
  });

  it("env URL wins over args", () => {
    process.env[ENV_BASE_URL] = "https://env";
    expect(resolvePlainConfig({ apiToken: "t", apiUrl: "https://arg" }).apiUrl).toBe("https://env");
  });
});

describe("resolveProviderConfig / attach", () => {
  const prevToken = process.env[ENV_TOKEN];
  const prevUrl = process.env[ENV_BASE_URL];

  afterEach(() => {
    if (prevToken === undefined) delete process.env[ENV_TOKEN];
    else process.env[ENV_TOKEN] = prevToken;
    if (prevUrl === undefined) delete process.env[ENV_BASE_URL];
    else process.env[ENV_BASE_URL] = prevUrl;
    vi.restoreAllMocks();
  });

  it("uses args token and url", () => {
    delete process.env[ENV_TOKEN];
    const r = resolveProviderConfig({ apiToken: "tok", apiUrl: "https://a" }, () => undefined);
    expect(r.apiToken).toBeDefined();
    expect(r.apiUrl).toBe("https://a");
  });

  it("uses config getter then env", () => {
    delete process.env[ENV_TOKEN];
    delete process.env[ENV_BASE_URL];
    const r = resolveProviderConfig(undefined, (k) =>
      k === "apiToken" ? "cfgTok" : k === "apiUrl" ? "https://cfg" : undefined,
    );
    expect(r.apiToken).toBeDefined();
    expect(r.apiUrl).toBe("https://cfg");
    process.env[ENV_TOKEN] = "envTok";
    process.env[ENV_BASE_URL] = "https://env";
    const r2 = resolveProviderConfig(undefined, () => undefined);
    expect(r2.apiToken).toBeDefined();
    expect(r2.apiUrl).toBe("https://env");
  });

  it("falls back to default URL via defaultPulumiConfigGet", () => {
    delete process.env[ENV_TOKEN];
    delete process.env[ENV_BASE_URL];
    const r = resolveProviderConfig();
    expect(r.apiUrl).toBe(DEFAULT_BASE_URL);
    expect(r.apiToken).toBeUndefined();
  });

  it("defaultPulumiConfigGet swallows Config errors", () => {
    vi.spyOn(pulumi, "Config").mockImplementation(() => {
      throw new Error("no project");
    });
    expect(defaultPulumiConfigGet("apiToken")).toBeUndefined();
  });

  it("defaultPulumiConfigGet reads when Config works", () => {
    vi.spyOn(pulumi, "Config").mockImplementation(
      () =>
        ({
          get: (k: string) => (k === "apiToken" ? "fromPulumi" : undefined),
        }) as pulumi.Config,
    );
    expect(defaultPulumiConfigGet("apiToken")).toBe("fromPulumi");
  });

  it("attachProviderInputs without token leaves __apiToken unset", () => {
    delete process.env[ENV_TOKEN];
    const outs = attachProviderInputs({ name: "x" }, undefined, () => undefined);
    expect(outs.__apiToken).toBeUndefined();
    expect(outs.__apiUrl).toBe(DEFAULT_BASE_URL);
  });

  it("attachProviderInputs and providerFromProps", () => {
    const outs = attachProviderInputs(
      { name: "x" },
      { apiToken: "tok", apiUrl: "https://a" },
      () => undefined,
    );
    expect(outs.__apiUrl).toBe("https://a");
    expect(outs.__apiToken).toBeDefined();
    expect(providerFromProps({ __apiToken: "t", __apiUrl: "u" })).toEqual({
      apiToken: "t",
      apiUrl: "u",
    });
  });
});
