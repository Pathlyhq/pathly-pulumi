import * as pulumi from "@pulumi/pulumi";
import { Client, Webhook as WebhookModel, createClientFromConfig, isNotFound } from "./client";
import { ProviderArgs, ProviderInputs, attachProviderInputs, providerFromProps } from "./config";
import { arraysEqual, changedKeys, newIdempotencyKey, sortedCopy } from "./util";

export interface WebhookArgs {
  /** Destination HTTPS URL (sensitive). Changing it forces replacement. */
  url: pulumi.Input<string>;
  /** `run.failed` and/or `run.recovered`. Changing forces replacement. */
  events?: pulumi.Input<string[]>;
  provider?: ProviderArgs;
}

export interface WebhookState extends ProviderInputs {
  url: string;
  events?: string[];
  enabled?: boolean;
  urlFingerprint?: string;
  secret?: string;
  createdAt?: string;
}

export interface WebhookProviderDeps {
  client?: Client;
  idempotencyKey?: string;
}

function clientFrom(props: ProviderInputs, inject?: { client?: Client }): Client {
  if (inject?.client) return inject.client;
  return createClientFromConfig(providerFromProps(props));
}

function mergeFromApi(w: WebhookModel, props: WebhookState): WebhookState {
  return {
    ...props,
    events: w.events ?? props.events,
    enabled: w.enabled ?? props.enabled,
    urlFingerprint: w.urlFingerprint ?? props.urlFingerprint,
    // Secret is only returned on create; keep previous value on read.
    secret: w.secret ?? props.secret,
    createdAt: w.createdAt ?? props.createdAt,
  };
}

/** Webhook: API has no update — any change replaces (delete + create). */
export class WebhookResourceProvider implements pulumi.dynamic.ResourceProvider {
  constructor(private readonly deps: WebhookProviderDeps = {}) {}

  async create(inputs: WebhookState): Promise<pulumi.dynamic.CreateResult> {
    const client = clientFrom(inputs, this.deps);
    const key = this.deps.idempotencyKey ?? newIdempotencyKey("webhook");
    const created = await client.createWebhook(
      { url: inputs.url, events: inputs.events },
      key,
    );
    const outs = mergeFromApi(created, inputs);
    if (created.secret) {
      outs.secret = created.secret;
    }
    return { id: created.id, outs };
  }

  async read(id: string, props: WebhookState): Promise<pulumi.dynamic.ReadResult> {
    const client = clientFrom(props, this.deps);
    try {
      const w = await client.getWebhook(id);
      return { id, props: mergeFromApi(w, props) };
    } catch (err) {
      if (isNotFound(err)) return { id: "", props: {} };
      throw err;
    }
  }

  async diff(
    _id: string,
    olds: WebhookState,
    news: WebhookState,
  ): Promise<pulumi.dynamic.DiffResult> {
    const replaces = changedKeys(
      { url: olds.url, events: sortedCopy(olds.events).join(",") },
      { url: news.url, events: sortedCopy(news.events).join(",") },
      ["url", "events"],
    );
    // Normalize: if only events order changed, treat as no replace.
    const eventsChanged = !arraysEqual(sortedCopy(olds.events), sortedCopy(news.events));
    const urlChanged = olds.url !== news.url;
    const realReplaces: string[] = [];
    if (urlChanged) realReplaces.push("url");
    if (eventsChanged) realReplaces.push("events");
    return {
      changes: realReplaces.length > 0 || replaces.length > 0,
      replaces: realReplaces,
      deleteBeforeReplace: true,
      stables: ["secret", "createdAt", "urlFingerprint", "enabled"],
    };
  }

  async update(): Promise<pulumi.dynamic.UpdateResult> {
    throw new Error(
      "pathly.Webhook cannot update in place; delete and recreate (diff marks replaces)",
    );
  }

  async delete(id: string, props: WebhookState): Promise<void> {
    const client = clientFrom(props, this.deps);
    try {
      await client.deleteWebhook(id);
    } catch (err) {
      if (isNotFound(err)) return;
      throw err;
    }
  }
}

/* v8 ignore start -- requires Pulumi engine (Resource registration) */
export class Webhook extends pulumi.dynamic.Resource {
  public readonly url!: pulumi.Output<string>;
  public readonly events!: pulumi.Output<string[] | undefined>;
  public readonly enabled!: pulumi.Output<boolean | undefined>;
  public readonly urlFingerprint!: pulumi.Output<string | undefined>;
  /** HMAC signing secret — returned once at creation, stored as a secret. */
  public readonly secret!: pulumi.Output<string | undefined>;
  public readonly createdAt!: pulumi.Output<string | undefined>;

  constructor(name: string, args: WebhookArgs, opts?: pulumi.CustomResourceOptions) {
    const props = attachProviderInputs(
      {
        url: pulumi.secret(args.url),
        events: args.events,
        enabled: undefined,
        urlFingerprint: undefined,
        secret: undefined,
        createdAt: undefined,
      },
      args.provider,
    );
    super(new WebhookResourceProvider(), name, props, opts);
  }
}
/* v8 ignore stop */
