/**
 * @pathlyhq/pulumi — Pulumi dynamic provider for the Pathly monitoring API.
 *
 * HTTP scenarios, webhooks, maintenance windows and SLA targets.
 * Browser journeys remain console-only (no credentials in Pulumi state).
 */

export {
  Client,
  APIError,
  isNotFound,
  createClientFromConfig,
  DEFAULT_BASE_URL,
  ENV_TOKEN,
  ENV_BASE_URL,
} from "./client";
export type {
  ClientOptions,
  Scenario as ScenarioModel,
  ScenarioInput,
  Webhook as WebhookModel,
  WebhookInput,
  MaintenanceWindow as MaintenanceWindowModel,
  MaintenanceWindowInput,
  SlaTarget as SlaTargetModel,
  SlaTargetInput,
} from "./client";

export { resolveProviderConfig, resolvePlainConfig, attachProviderInputs, providerFromProps, defaultPulumiConfigGet } from "./config";
export type { ProviderArgs, ProviderInputs, ResolvedProviderConfig, ConfigGetter } from "./config";

export { Scenario, ScenarioResourceProvider } from "./scenario";
export type { ScenarioArgs, ScenarioState } from "./scenario";

export { Webhook, WebhookResourceProvider } from "./webhook";
export type { WebhookArgs, WebhookState } from "./webhook";

export {
  MaintenanceWindow,
  MaintenanceWindowResource,
  MaintenanceWindowResourceProvider,
} from "./maintenanceWindow";
export type { MaintenanceWindowArgs, MaintenanceWindowState } from "./maintenanceWindow";

export { SlaTarget, SlaTargetResource, SlaTargetResourceProvider } from "./slaTarget";
export type { SlaTargetArgs, SlaTargetState } from "./slaTarget";

export { arraysEqual, changedKeys, omitUndefined, newIdempotencyKey, sortedCopy } from "./util";
