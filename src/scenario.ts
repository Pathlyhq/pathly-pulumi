import * as pulumi from "@pulumi/pulumi";
import {
  Client,
  Scenario as ScenarioModel,
  ScenarioInput,
  createClientFromConfig,
  isNotFound,
} from "./client";
import { ProviderArgs, ProviderInputs, attachProviderInputs, providerFromProps } from "./config";
import { changedKeys, newIdempotencyKey, omitUndefined } from "./util";

/**
 * HTTP scenario only. Browser journeys with credentials must stay in the
 * Pathly console — they are not managed here so passwords never land in state.
 */
export interface ScenarioArgs {
  name: pulumi.Input<string>;
  url: pulumi.Input<string>;
  intervalSec: pulumi.Input<number>;
  method?: pulumi.Input<string>;
  expectedStatus?: pulumi.Input<number>;
  maxLatencyMs?: pulumi.Input<number>;
  expectText?: pulumi.Input<string>;
  regions?: pulumi.Input<string[]>;
  tags?: pulumi.Input<string[]>;
  folder?: pulumi.Input<string>;
  severity?: pulumi.Input<string>;
  runbook?: pulumi.Input<string>;
  cron?: pulumi.Input<string>;
  enabled?: pulumi.Input<boolean>;
  /** Optional override of provider credentials for this resource. */
  provider?: ProviderArgs;
}

export interface ScenarioState extends ProviderInputs {
  name: string;
  url: string;
  intervalSec: number;
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
  lastStatus?: string;
  mutedUntil?: string;
  scenarioFingerprint?: string;
  createdAt?: string;
  type?: string;
}

const MUTABLE_KEYS = [
  "name",
  "url",
  "intervalSec",
  "method",
  "expectedStatus",
  "maxLatencyMs",
  "expectText",
  "regions",
  "tags",
  "folder",
  "severity",
  "runbook",
  "cron",
  "enabled",
] as const;

function clientFrom(props: ProviderInputs, inject?: { client?: Client }): Client {
  if (inject?.client) return inject.client;
  return createClientFromConfig(providerFromProps(props));
}

function toInput(props: ScenarioState): ScenarioInput {
  return omitUndefined({
    name: props.name,
    type: "http",
    url: props.url,
    intervalSec: props.intervalSec,
    method: props.method,
    expectedStatus: props.expectedStatus,
    maxLatencyMs: props.maxLatencyMs,
    expectText: props.expectText,
    regions: props.regions,
    tags: props.tags,
    folder: props.folder,
    severity: props.severity,
    runbook: props.runbook,
    cron: props.cron,
    enabled: props.enabled,
  }) as ScenarioInput;
}

function fromApi(s: ScenarioModel, props: ScenarioState): ScenarioState {
  return {
    ...props,
    name: s.name,
    url: s.url ?? props.url,
    intervalSec: s.intervalSec ?? props.intervalSec,
    method: s.method ?? props.method,
    expectedStatus: s.expectedStatus ?? props.expectedStatus,
    maxLatencyMs: s.maxLatencyMs ?? props.maxLatencyMs,
    expectText: s.expectText ?? props.expectText,
    regions: s.regions ?? props.regions,
    tags: s.tags ?? props.tags,
    folder: s.folder ?? props.folder,
    severity: s.severity ?? props.severity,
    runbook: s.runbook ?? props.runbook,
    cron: s.cron ?? props.cron,
    enabled: s.enabled ?? props.enabled,
    lastStatus: s.lastStatus ?? undefined,
    mutedUntil: s.mutedUntil ?? undefined,
    scenarioFingerprint: s.scenarioFingerprint ?? undefined,
    createdAt: s.createdAt ?? undefined,
    type: "http",
  };
}

export interface ScenarioProviderDeps {
  client?: Client;
  idempotencyKey?: string;
}

/** Dynamic provider implementation (exported for unit tests). */
export class ScenarioResourceProvider implements pulumi.dynamic.ResourceProvider {
  constructor(private readonly deps: ScenarioProviderDeps = {}) {}

  async create(inputs: ScenarioState): Promise<pulumi.dynamic.CreateResult> {
    const client = clientFrom(inputs, this.deps);
    const key = this.deps.idempotencyKey ?? newIdempotencyKey("scenario");
    const created = await client.createScenario(toInput(inputs), key);
    const outs = fromApi(created, inputs);
    return { id: created.id, outs };
  }

  async read(id: string, props: ScenarioState): Promise<pulumi.dynamic.ReadResult> {
    const client = clientFrom(props, this.deps);
    try {
      const s = await client.getScenario(id);
      return { id, props: fromApi(s, props) };
    } catch (err) {
      if (isNotFound(err)) return { id: "", props: {} };
      throw err;
    }
  }

  async diff(
    _id: string,
    olds: ScenarioState,
    news: ScenarioState,
  ): Promise<pulumi.dynamic.DiffResult> {
    const replaces: string[] = [];
    const changes = changedKeys(
      olds as unknown as Record<string, unknown>,
      news as unknown as Record<string, unknown>,
      [...MUTABLE_KEYS],
    );
    return {
      changes: changes.length > 0,
      replaces,
      deleteBeforeReplace: false,
      stables: ["createdAt", "scenarioFingerprint", "lastStatus", "mutedUntil"],
    };
  }

  async update(
    id: string,
    _olds: ScenarioState,
    news: ScenarioState,
  ): Promise<pulumi.dynamic.UpdateResult> {
    const client = clientFrom(news, this.deps);
    const updated = await client.updateScenario(id, toInput(news));
    return { outs: fromApi(updated, news) };
  }

  async delete(id: string, props: ScenarioState): Promise<void> {
    const client = clientFrom(props, this.deps);
    try {
      await client.deleteScenario(id);
    } catch (err) {
      if (isNotFound(err)) return;
      throw err;
    }
  }
}

/* v8 ignore start -- requires Pulumi engine (Resource registration) */
export class Scenario extends pulumi.dynamic.Resource {
  public readonly name!: pulumi.Output<string>;
  public readonly url!: pulumi.Output<string>;
  public readonly intervalSec!: pulumi.Output<number>;
  public readonly method!: pulumi.Output<string | undefined>;
  public readonly expectedStatus!: pulumi.Output<number | undefined>;
  public readonly maxLatencyMs!: pulumi.Output<number | undefined>;
  public readonly expectText!: pulumi.Output<string | undefined>;
  public readonly regions!: pulumi.Output<string[] | undefined>;
  public readonly tags!: pulumi.Output<string[] | undefined>;
  public readonly folder!: pulumi.Output<string | undefined>;
  public readonly severity!: pulumi.Output<string | undefined>;
  public readonly runbook!: pulumi.Output<string | undefined>;
  public readonly cron!: pulumi.Output<string | undefined>;
  public readonly enabled!: pulumi.Output<boolean | undefined>;
  public readonly lastStatus!: pulumi.Output<string | undefined>;
  public readonly mutedUntil!: pulumi.Output<string | undefined>;
  public readonly scenarioFingerprint!: pulumi.Output<string | undefined>;
  public readonly createdAt!: pulumi.Output<string | undefined>;
  public readonly type!: pulumi.Output<string | undefined>;

  constructor(name: string, args: ScenarioArgs, opts?: pulumi.CustomResourceOptions) {
    const props = attachProviderInputs(
      {
        name: args.name,
        url: args.url,
        intervalSec: args.intervalSec,
        method: args.method,
        expectedStatus: args.expectedStatus,
        maxLatencyMs: args.maxLatencyMs,
        expectText: args.expectText,
        regions: args.regions,
        tags: args.tags,
        folder: args.folder,
        severity: args.severity,
        runbook: args.runbook,
        cron: args.cron,
        enabled: args.enabled,
        lastStatus: undefined,
        mutedUntil: undefined,
        scenarioFingerprint: undefined,
        createdAt: undefined,
        type: "http",
      },
      args.provider,
    );
    super(new ScenarioResourceProvider(), name, props, opts);
  }
}
/* v8 ignore stop */
