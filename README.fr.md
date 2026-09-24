# @pathlyhq/pulumi

[English](README.md) · **Français** · [Español](README.es.md)


[![Powered by Pathly](https://img.shields.io/badge/Powered%20by-Pathly-0B5FFF?style=flat-square)](https://pathlyhq.com)
[![Website](https://img.shields.io/badge/Website-pathlyhq.com-111827?style=flat-square)](https://pathlyhq.com)
[![API docs](https://img.shields.io/badge/API-developers-2563eb?style=flat-square)](https://pathlyhq.com/fr/developers)
[![Start free](https://img.shields.io/badge/Solo-start%20free-16a34a?style=flat-square)](https://pathlyhq.com/fr/login?mode=signup)

> **Démarrage en un clic.** Créez un compte gratuit sur [Pathly](https://pathlyhq.com) ([inscription](https://pathlyhq.com/fr/login?mode=signup)), générez une clé API dans la console, puis exportez `PATHLY_API_TOKEN`. Ce dépôt est le pont officiel vers [la surveillance Pathly](https://pathlyhq.com) — contrôles HTTP et parcours navigateur (panier, connexion, disponibilité), données hébergées dans l’UE. Référence API : [pathlyhq.com/fr/developers](https://pathlyhq.com/fr/developers).

Provider Pulumi **dynamique** (TypeScript) pour l’API de monitoring [Pathly](https://pathlyhq.com) (`https://api.pathlyhq.com`).

Il reprend les ressources Terraform `pathly_*` pour déclarer des contrôles HTTP, webhooks, fenêtres de maintenance et objectifs de disponibilité.

## Installation

```bash
npm install @pathlyhq/pulumi @pulumi/pulumi
```

Jeton d’organisation (de préférence via l’environnement, pas dans le dépôt) :

```bash
export PATHLY_API_TOKEN=sp_…
export PATHLY_API_URL=https://api.pathlyhq.com   # optionnel
```

Ou via la config Pulumi (secret) :

```bash
pulumi config set pathly:apiToken sp_… --secret
pulumi config set pathly:apiUrl https://api.pathlyhq.com
```

## Ressources

| Ressource | API | Notes |
|---|---|---|
| `Scenario` | `POST/GET/PATCH/DELETE /v1/scenarios` | **HTTP uniquement** (`type=http`) |
| `Webhook` | create/get/delete | Changement d’URL ou d’événements → **recréation** ; `secret` une seule fois |
| `MaintenanceWindow` | create/get/delete | Tout changement → **recréation** (ponctuel ou hebdo) |
| `SlaTarget` | upsert `PUT` + get/delete | Changement de `monitorId` → **recréation** |

### Parcours navigateur (console uniquement)

Un parcours browser avec `fill` / `http_auth` peut contenir des mots de passe. Ce provider **ne gère pas** les parcours browser, pour qu’aucun identifiant ne finisse dans l’état Pulumi. Créez-les dans la console Pathly. Les moniteurs HTTP sont entièrement pris en charge ici.

## Exemple TypeScript

```ts
import * as pathly from "@pathlyhq/pulumi";

const home = new pathly.Scenario("home", {
  name: "Page d’accueil",
  url: "https://shop.example.com/",
  intervalSec: 300,
  expectText: "Nos produits",
  severity: "major",
  folder: "Boutique",
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
  reason: "Sauvegarde hebdomadaire",
});

const sla = new pathly.SlaTarget("accueil-sla", {
  monitorId: home.id,
  name: "Accueil — 99,9 %",
  objectivePct: 99.9,
  windowDays: 30,
  excludeMaintenance: true,
  warnAtBudgetRatio: 0.8,
});

export const scenarioId = home.id;
export const webhookSecret = alerts.secret;
```

## Exemple Python

Voir [`examples/python`](examples/python) : shim vers le provider dynamique Node, avec `PATHLY_API_TOKEN`.

```python
import pulumi
import pulumi_pathly as pathly

home = pathly.Scenario(
    "home",
    name="Page d’accueil",
    url="https://shop.example.com/",
    interval_sec=300,
    expect_text="Nos produits",
    severity="major",
)

pulumi.export("scenario_id", home.id)
```

## Développement

```bash
npm ci
npm test
npm run build
```


## Packages associés

| Package | Role |
|---|---|
| [pathly-terraform-provider](https://github.com/pathlyhq/pathly-terraform-provider) | Terraform / OpenTofu |
| [pathly-cdktf](https://github.com/pathlyhq/pathly-cdktf) | CDK for Terraform |
| [pathly-sdk-typescript](https://github.com/pathlyhq/pathly-sdk-typescript) | @pathlyhq/sdk |
| [pathly-crossplane](https://github.com/pathlyhq/pathly-crossplane) | Crossplane |
| [Pathly product](https://pathlyhq.com) | [Pathly monitoring](https://pathlyhq.com) |
## À propos de Pathly

[Pathly](https://pathlyhq.com) surveille les parcours clients des agences et e-commerçants : rejoue le tunnel, détecte un checkout cassé avant l’appel du client, et joint la preuve (capture, étape, consigne) à la facture de maintenance. Produit : [pathlyhq.com](https://pathlyhq.com) · Développeurs : [pathlyhq.com/fr/developers](https://pathlyhq.com/fr/developers) · Tarifs : [pathlyhq.com/fr/pricing](https://pathlyhq.com/fr/pricing).

## Auteur

| | |
|---|---|
| **Entreprise** | Pathly |
| **Auteur** | Simon Raynaud / keyral |

Voir [AUTHORS](AUTHORS).

## Licence
Apache-2.0
