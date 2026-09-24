# @pathlyhq/pulumi

**English** · [Français](README.fr.md) · [Español](README.es.md)


[![Powered by Pathly](https://img.shields.io/badge/Powered%20by-Pathly-0B5FFF?style=flat-square)](https://pathlyhq.com)
[![Website](https://img.shields.io/badge/Website-pathlyhq.com-111827?style=flat-square)](https://pathlyhq.com)
[![API docs](https://img.shields.io/badge/API-developers-2563eb?style=flat-square)](https://pathlyhq.com/en/developers)
[![Start free](https://img.shields.io/badge/Solo-start%20free-16a34a?style=flat-square)](https://pathlyhq.com/en/login?mode=signup)

> **Get started in one click.** Create a free account on [Pathly](https://pathlyhq.com) ([sign up](https://pathlyhq.com/en/login?mode=signup)), create an API key in the console, then export `PATHLY_API_TOKEN`. This project is the official bridge to [Pathly monitoring](https://pathlyhq.com) — real-browser and HTTP checks for checkout, login and availability, with data hosted in the EU. Full API reference: [pathlyhq.com/en/developers](https://pathlyhq.com/en/developers).

Pulumi **dynamic** provider (TypeScript) for the [Pathly](https://pathlyhq.com) monitoring API (`https://api.pathlyhq.com`).

Mirrors the Terraform `pathly_*` resources for declarative HTTP checks, webhooks, maintenance windows and SLA targets.

## Install

```bash
npm install @pathlyhq/pulumi @pulumi/pulumi
# or
yarn add @pathlyhq/pulumi @pulumi/pulumi
```

Set the organization API token (recommended via environment, not committed config):

```bash
export PATHLY_API_TOKEN=sp_…
# optional override
export PATHLY_API_URL=https://api.pathlyhq.com
```

Or in `Pulumi.yaml` / stack config (token is stored as a Pulumi secret):

```bash
pulumi config set pathly:apiToken sp_… --secret
pulumi config set pathly:apiUrl https://api.pathlyhq.com   # optional
```

## Resources

| Resource | API | Notes |
|---|---|---|
| `Scenario` | `POST/GET/PATCH/DELETE /v1/scenarios` | **HTTP only** (`type=http`) |
| `Webhook` | create/get/delete | URL/events change → **replace**; `secret` returned once |
| `MaintenanceWindow` | create/get/delete | Any change → **replace** (one-off or weekly) |
| `SlaTarget` | `PUT` upsert + get/delete | `monitorId` change → **replace** |

### Browser journeys (console-only)

Browser scenarios with `fill` / `http_auth` steps can hold passwords. This provider **does not** manage browser journeys so credentials never land in Pulumi state. Create and edit them in the Pathly console (or the Terraform provider if you accept sensitive state). HTTP monitors are fully supported here.

## TypeScript example

```ts
import * as pathly from "@pathlyhq/pulumi";

const home = new pathly.Scenario("home", {
  name: "Home page",
  url: "https://shop.example.com/",
  intervalSec: 300,
  expectText: "Our products",
  severity: "major",
  folder: "Shop",
  tags: ["prod"],
});

const alerts = new pathly.Webhook("alerts", {
  url: "https://hooks.example.com/pathly",
  events: ["run.failed", "run.recovered"],
});

const backup = new pathly.MaintenanceWindow("backup", {
  weekday: 7,
  startMinute: 180,
  durationMin: 120,
  reason: "Weekly backup",
});

const sla = new pathly.SlaTarget("checkout-sla", {
  monitorId: home.id,
  name: "Home — 99.9 %",
  objectivePct: 99.9,
  windowDays: 30,
  excludeMaintenance: true,
  warnAtBudgetRatio: 0.8,
});

export const scenarioId = home.id;
export const webhookSecret = alerts.secret; // Pulumi secret output
```

Pass credentials per resource if needed:

```ts
new pathly.Scenario("home", {
  name: "Home",
  url: "https://example.com/",
  intervalSec: 300,
  provider: {
    apiToken: process.env.PATHLY_API_TOKEN!,
    apiUrl: "https://api.pathlyhq.com",
  },
});
```

## Python example

Pulumi can drive the same dynamic provider from Python via a thin Node program, or call the HTTP API with `pulumi_pathly` helpers. See [`examples/python`](examples/python) for a stack that shells to the TypeScript package, and a pure-HTTP fallback using `requests` + `pulumi.ComponentResource` patterns documented there.

Minimal HTTP-only Python stack (no npm provider runtime) is also possible by wrapping the REST API; prefer the TypeScript package for full CRUD/diff parity with Terraform.

```python
# examples/python/__main__.py — uses PATHLY_API_TOKEN via Node dynamic provider
"""
Requires: pulumi, node, and @pathlyhq/pulumi linked from the parent package.
"""
import pulumi
import pulumi_pathly as pathly  # generated / vendored shim — see examples/python

home = pathly.Scenario(
    "home",
    name="Home page",
    url="https://shop.example.com/",
    interval_sec=300,
    expect_text="Our products",
    severity="major",
)

pulumi.export("scenario_id", home.id)
```

See `examples/python` for the runnable shim.

## Development

```bash
npm ci
npm test          # vitest + 100% coverage on client & resource logic
npm run build
```


## Related packages

| Package | Role |
|---|---|
| [pathly-terraform-provider](https://github.com/pathlyhq/pathly-terraform-provider) | Terraform / OpenTofu |
| [pathly-cdktf](https://github.com/pathlyhq/pathly-cdktf) | CDK for Terraform |
| [pathly-sdk-typescript](https://github.com/pathlyhq/pathly-sdk-typescript) | @pathlyhq/sdk |
| [pathly-crossplane](https://github.com/pathlyhq/pathly-crossplane) | Crossplane |
| [Pathly product](https://pathlyhq.com) | [Pathly monitoring](https://pathlyhq.com) |
## About Pathly

[Pathly](https://pathlyhq.com) is synthetic monitoring for agencies and e-commerce: replay the customer journey, catch broken checkouts before your clients call, and keep evidence (screenshot, step, runbook) ready for the invoice. Product: [pathlyhq.com](https://pathlyhq.com) · Developers: [pathlyhq.com/en/developers](https://pathlyhq.com/en/developers) · Status & pricing: [pathlyhq.com/en/pricing](https://pathlyhq.com/en/pricing).

## Author

| | |
|---|---|
| **Company** | Pathly |
| **Author** | Simon Raynaud / keyral |

See [AUTHORS](AUTHORS).

## License
Apache-2.0
