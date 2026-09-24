import * as pulumi from "@pulumi/pulumi";
import { DEFAULT_BASE_URL, ENV_BASE_URL, ENV_TOKEN } from "./client";

/**
 * Provider-level configuration.
 * Prefer PATHLY_API_TOKEN over hard-coding the token in Pulumi.yaml.
 */
export interface ProviderArgs {
  /** Organization API key (`sp_` prefix). Marked secret. Falls back to PATHLY_API_TOKEN. */
  apiToken?: pulumi.Input<string>;
  /** API base URL. Defaults to https://api.pathlyhq.com or PATHLY_API_URL. */
  apiUrl?: pulumi.Input<string>;
}

export interface ResolvedProviderConfig {
  apiToken?: string;
  apiUrl?: string;
}

export type ConfigGetter = (key: string) => string | undefined;

/** Default getter: Pulumi config namespace `pathly:`. Safe when no project is loaded. */
export function defaultPulumiConfigGet(key: string): string | undefined {
  try {
    return new pulumi.Config("pathly").get(key);
  } catch {
    return undefined;
  }
}

/**
 * Resolve plain string config from args → getter → env (no Pulumi Outputs).
 */
export function resolvePlainConfig(
  args?: { apiToken?: string; apiUrl?: string },
  getConfig?: ConfigGetter,
): ResolvedProviderConfig {
  const token =
    (args?.apiToken ?? "").trim() ||
    (getConfig?.("apiToken") ?? "").trim() ||
    (process.env[ENV_TOKEN] ?? "").trim() ||
    undefined;

  const fromEnvUrl = (process.env[ENV_BASE_URL] ?? "").trim();
  const fromCfgUrl = (getConfig?.("apiUrl") ?? "").trim();
  const fromArgsUrl = (args?.apiUrl ?? "").trim();
  const apiUrl = fromEnvUrl || fromArgsUrl || fromCfgUrl || DEFAULT_BASE_URL;

  return { apiToken: token, apiUrl };
}

/**
 * Resolve config for resource constructors (Outputs + secrets).
 */
export function resolveProviderConfig(
  args?: ProviderArgs,
  getConfig?: ConfigGetter,
): {
  apiToken: pulumi.Input<string> | undefined;
  apiUrl: pulumi.Input<string>;
} {
  const cfgGet: ConfigGetter = getConfig ?? defaultPulumiConfigGet;

  const fromArgsToken = args?.apiToken;
  const fromCfgToken = cfgGet("apiToken");
  const fromEnvToken = process.env[ENV_TOKEN];

  let apiToken: pulumi.Input<string> | undefined;
  if (fromArgsToken !== undefined) {
    apiToken = pulumi.secret(fromArgsToken);
  } else if (fromCfgToken) {
    apiToken = pulumi.secret(fromCfgToken);
  } else if (fromEnvToken) {
    apiToken = pulumi.secret(fromEnvToken);
  }

  const fromArgsUrl = args?.apiUrl;
  const fromCfgUrl = cfgGet("apiUrl");
  const fromEnvUrl = process.env[ENV_BASE_URL];
  const apiUrl: pulumi.Input<string> =
    fromArgsUrl !== undefined
      ? fromArgsUrl
      : fromCfgUrl || fromEnvUrl || DEFAULT_BASE_URL;

  return { apiToken, apiUrl };
}

/** Inputs embedded in every dynamic resource for the API client. */
export interface ProviderInputs {
  __apiToken?: string;
  __apiUrl?: string;
}

export function attachProviderInputs(
  outs: Record<string, pulumi.Input<unknown>>,
  provider?: ProviderArgs,
  getConfig?: ConfigGetter,
): Record<string, pulumi.Input<unknown>> {
  const resolved = resolveProviderConfig(provider, getConfig);
  if (resolved.apiToken !== undefined) {
    outs.__apiToken = pulumi.secret(resolved.apiToken);
  }
  outs.__apiUrl = resolved.apiUrl;
  return outs;
}

export function providerFromProps(props: ProviderInputs): {
  apiToken?: string;
  apiUrl?: string;
} {
  return {
    apiToken: props.__apiToken,
    apiUrl: props.__apiUrl,
  };
}
