import * as pulumi from "@pulumi/pulumi";
import {
  Client,
  SlaTarget as SlaTargetModel,
  SlaTargetInput,
  createClientFromConfig,
  isNotFound,
} from "./client";
import { ProviderArgs, ProviderInputs, attachProviderInputs, providerFromProps } from "./config";
import { changedKeys, newIdempotencyKey, omitUndefined } from "./util";

export interface SlaTargetArgs {
  /** Measured scenario/monitor. Changing forces replacement. */
  monitorId?: pulumi.Input<string>;
  name?: pulumi.Input<string>;
  /** Availability objective, 50–100 (e.g. 99.9). */
  objectivePct: pulumi.Input<number>;
  /** Rolling window in days, 1–365. */
  windowDays: pulumi.Input<number>;
  excludeMaintenance?: pulumi.Input<boolean>;
  warnAtBudgetRatio?: pulumi.Input<number>;
  enabled?: pulumi.Input<boolean>;
  provider?: ProviderArgs;
}

export interface SlaTargetState extends ProviderInputs {
  monitorId?: string;
  name?: string;
  objectivePct: number;
  windowDays: number;
  excludeMaintenance?: boolean;
  warnAtBudgetRatio?: number;
  enabled?: boolean;
}

export interface SlaTargetProviderDeps {
  client?: Client;
  idempotencyKey?: string;
}

function clientFrom(props: ProviderInputs, inject?: { client?: Client }): Client {
  if (inject?.client) return inject.client;
  return createClientFromConfig(providerFromProps(props));
}

function toInput(props: SlaTargetState): SlaTargetInput {
  return omitUndefined({
    monitorId: props.monitorId,
    name: props.name,
    objectivePct: props.objectivePct,
    windowDays: props.windowDays,
    excludeMaintenance: props.excludeMaintenance,
    warnAtBudgetRatio: props.warnAtBudgetRatio,
    enabled: props.enabled,
  }) as SlaTargetInput;
}

function fromApi(s: SlaTargetModel, props: SlaTargetState): SlaTargetState {
  return {
    ...props,
    monitorId: s.monitorId ?? props.monitorId,
    name: s.name ?? props.name,
    objectivePct: s.objectivePct ?? props.objectivePct,
    windowDays: s.windowDays ?? props.windowDays,
    excludeMaintenance: s.excludeMaintenance ?? props.excludeMaintenance,
    warnAtBudgetRatio: s.warnAtBudgetRatio ?? props.warnAtBudgetRatio,
    enabled: s.enabled ?? props.enabled,
  };
}

/** SLA target: API upsert (PUT). monitorId change forces replace. */
export class SlaTargetResourceProvider implements pulumi.dynamic.ResourceProvider {
  constructor(private readonly deps: SlaTargetProviderDeps = {}) {}

  async create(inputs: SlaTargetState): Promise<pulumi.dynamic.CreateResult> {
    const client = clientFrom(inputs, this.deps);
    const key = this.deps.idempotencyKey ?? newIdempotencyKey("sla");
    const created = await client.upsertSlaTarget(toInput(inputs), key);
    return { id: created.id, outs: fromApi(created, inputs) };
  }

  async read(id: string, props: SlaTargetState): Promise<pulumi.dynamic.ReadResult> {
    const client = clientFrom(props, this.deps);
    try {
      const s = await client.getSlaTarget(id);
      return { id, props: fromApi(s, props) };
    } catch (err) {
      if (isNotFound(err)) return { id: "", props: {} };
      throw err;
    }
  }

  async diff(
    _id: string,
    olds: SlaTargetState,
    news: SlaTargetState,
  ): Promise<pulumi.dynamic.DiffResult> {
    const replaces: string[] = [];
    if (olds.monitorId !== news.monitorId) {
      replaces.push("monitorId");
    }
    const changes = changedKeys(
      olds as unknown as Record<string, unknown>,
      news as unknown as Record<string, unknown>,
      [
        "monitorId",
        "name",
        "objectivePct",
        "windowDays",
        "excludeMaintenance",
        "warnAtBudgetRatio",
        "enabled",
      ],
    );
    return {
      changes: changes.length > 0,
      replaces,
      deleteBeforeReplace: replaces.length > 0,
    };
  }

  async update(
    _id: string,
    _olds: SlaTargetState,
    news: SlaTargetState,
  ): Promise<pulumi.dynamic.UpdateResult> {
    const client = clientFrom(news, this.deps);
    const key = this.deps.idempotencyKey ?? newIdempotencyKey("sla-upd");
    const updated = await client.upsertSlaTarget(toInput(news), key);
    return { outs: fromApi(updated, news) };
  }

  async delete(id: string, props: SlaTargetState): Promise<void> {
    const client = clientFrom(props, this.deps);
    try {
      await client.deleteSlaTarget(id);
    } catch (err) {
      if (isNotFound(err)) return;
      throw err;
    }
  }
}

/* v8 ignore start -- requires Pulumi engine (Resource registration) */
export class SlaTargetResource extends pulumi.dynamic.Resource {
  public readonly monitorId!: pulumi.Output<string | undefined>;
  public readonly name!: pulumi.Output<string | undefined>;
  public readonly objectivePct!: pulumi.Output<number>;
  public readonly windowDays!: pulumi.Output<number>;
  public readonly excludeMaintenance!: pulumi.Output<boolean | undefined>;
  public readonly warnAtBudgetRatio!: pulumi.Output<number | undefined>;
  public readonly enabled!: pulumi.Output<boolean | undefined>;

  constructor(name: string, args: SlaTargetArgs, opts?: pulumi.CustomResourceOptions) {
    const props = attachProviderInputs(
      {
        monitorId: args.monitorId,
        name: args.name,
        objectivePct: args.objectivePct,
        windowDays: args.windowDays,
        excludeMaintenance: args.excludeMaintenance,
        warnAtBudgetRatio: args.warnAtBudgetRatio,
        enabled: args.enabled,
      },
      args.provider,
    );
    super(new SlaTargetResourceProvider(), name, props, opts);
  }
}
/* v8 ignore stop */

export { SlaTargetResource as SlaTarget };
