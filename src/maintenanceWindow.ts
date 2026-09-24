import * as pulumi from "@pulumi/pulumi";
import {
  Client,
  MaintenanceWindow as MaintenanceWindowModel,
  MaintenanceWindowInput,
  createClientFromConfig,
  isNotFound,
} from "./client";
import { ProviderArgs, ProviderInputs, attachProviderInputs, providerFromProps } from "./config";
import { changedKeys, newIdempotencyKey, omitUndefined } from "./util";

export interface MaintenanceWindowArgs {
  /** Targeted scenario/monitor. Absent = whole organization. Forces replace. */
  monitorId?: pulumi.Input<string>;
  /** One-off: ISO 8601 start. */
  startsAt?: pulumi.Input<string>;
  /** One-off: ISO 8601 end (max 90 days). */
  endsAt?: pulumi.Input<string>;
  reason?: pulumi.Input<string>;
  /** Weekly: 1=Monday … 7=Sunday. */
  weekday?: pulumi.Input<number>;
  /** Weekly: minutes since midnight UTC (0–1439). */
  startMinute?: pulumi.Input<number>;
  /** Weekly: duration minutes (15–1440). */
  durationMin?: pulumi.Input<number>;
  provider?: ProviderArgs;
}

export interface MaintenanceWindowState extends ProviderInputs {
  monitorId?: string;
  startsAt?: string;
  endsAt?: string;
  reason?: string;
  weekday?: number;
  startMinute?: number;
  durationMin?: number;
}

const REPLACE_KEYS = [
  "monitorId",
  "startsAt",
  "endsAt",
  "reason",
  "weekday",
  "startMinute",
  "durationMin",
] as const;

export interface MaintenanceWindowProviderDeps {
  client?: Client;
  idempotencyKey?: string;
}

function clientFrom(props: ProviderInputs, inject?: { client?: Client }): Client {
  if (inject?.client) return inject.client;
  return createClientFromConfig(providerFromProps(props));
}

function toInput(props: MaintenanceWindowState): MaintenanceWindowInput {
  return omitUndefined({
    monitorId: props.monitorId,
    startsAt: props.startsAt,
    endsAt: props.endsAt,
    reason: props.reason,
    weekday: props.weekday,
    startMinute: props.startMinute,
    durationMin: props.durationMin,
  }) as MaintenanceWindowInput;
}

function fromApi(m: MaintenanceWindowModel, props: MaintenanceWindowState): MaintenanceWindowState {
  return {
    ...props,
    monitorId: m.monitorId ?? props.monitorId,
    startsAt: m.startsAt ?? props.startsAt,
    endsAt: m.endsAt ?? props.endsAt,
    reason: m.reason ?? props.reason,
    weekday: m.weekday ?? props.weekday,
    startMinute: m.startMinute ?? props.startMinute,
    durationMin: m.durationMin ?? props.durationMin,
  };
}

/** Maintenance window: API has no PATCH — any change forces replace. */
export class MaintenanceWindowResourceProvider implements pulumi.dynamic.ResourceProvider {
  constructor(private readonly deps: MaintenanceWindowProviderDeps = {}) {}

  async create(inputs: MaintenanceWindowState): Promise<pulumi.dynamic.CreateResult> {
    const client = clientFrom(inputs, this.deps);
    const key = this.deps.idempotencyKey ?? newIdempotencyKey("mw");
    const created = await client.createMaintenanceWindow(toInput(inputs), key);
    return { id: created.id, outs: fromApi(created, inputs) };
  }

  async read(
    id: string,
    props: MaintenanceWindowState,
  ): Promise<pulumi.dynamic.ReadResult> {
    const client = clientFrom(props, this.deps);
    try {
      const m = await client.getMaintenanceWindow(id);
      return { id, props: fromApi(m, props) };
    } catch (err) {
      if (isNotFound(err)) return { id: "", props: {} };
      throw err;
    }
  }

  async diff(
    _id: string,
    olds: MaintenanceWindowState,
    news: MaintenanceWindowState,
  ): Promise<pulumi.dynamic.DiffResult> {
    const replaces = changedKeys(
      olds as unknown as Record<string, unknown>,
      news as unknown as Record<string, unknown>,
      [...REPLACE_KEYS],
    );
    return {
      changes: replaces.length > 0,
      replaces,
      deleteBeforeReplace: true,
    };
  }

  async update(): Promise<pulumi.dynamic.UpdateResult> {
    throw new Error(
      "pathly.MaintenanceWindow cannot update in place; delete and recreate",
    );
  }

  async delete(id: string, props: MaintenanceWindowState): Promise<void> {
    const client = clientFrom(props, this.deps);
    try {
      await client.deleteMaintenanceWindow(id);
    } catch (err) {
      if (isNotFound(err)) return;
      throw err;
    }
  }
}

/* v8 ignore start -- requires Pulumi engine (Resource registration) */
export class MaintenanceWindowResource extends pulumi.dynamic.Resource {
  public readonly monitorId!: pulumi.Output<string | undefined>;
  public readonly startsAt!: pulumi.Output<string | undefined>;
  public readonly endsAt!: pulumi.Output<string | undefined>;
  public readonly reason!: pulumi.Output<string | undefined>;
  public readonly weekday!: pulumi.Output<number | undefined>;
  public readonly startMinute!: pulumi.Output<number | undefined>;
  public readonly durationMin!: pulumi.Output<number | undefined>;

  constructor(
    name: string,
    args: MaintenanceWindowArgs = {},
    opts?: pulumi.CustomResourceOptions,
  ) {
    const props = attachProviderInputs(
      {
        monitorId: args.monitorId,
        startsAt: args.startsAt,
        endsAt: args.endsAt,
        reason: args.reason,
        weekday: args.weekday,
        startMinute: args.startMinute,
        durationMin: args.durationMin,
      },
      args.provider,
    );
    super(new MaintenanceWindowResourceProvider(), name, props, opts);
  }
}
/* v8 ignore stop */

/** Alias matching Terraform `pathly_maintenance_window`. */
export { MaintenanceWindowResource as MaintenanceWindow };
