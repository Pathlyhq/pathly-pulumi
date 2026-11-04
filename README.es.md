# @pathly/pulumi

[English](README.md) · [Français](README.fr.md) · **Español**


[![Powered by Pathly](https://img.shields.io/badge/Powered%20by-Pathly-0B5FFF?style=flat-square)](https://pathlyhq.com)
[![Website](https://img.shields.io/badge/Website-pathlyhq.com-111827?style=flat-square)](https://pathlyhq.com)
[![API docs](https://img.shields.io/badge/API-developers-2563eb?style=flat-square)](https://pathlyhq.com/es/developers)
[![Start free](https://img.shields.io/badge/Solo-start%20free-16a34a?style=flat-square)](https://pathlyhq.com/es/login?mode=signup)

> **Empiece en un clic.** Cree una cuenta gratuita en [Pathly](https://pathlyhq.com) ([registro](https://pathlyhq.com/es/login?mode=signup)), genere una clave API en la consola y exporte `PATHLY_API_TOKEN`. Este repositorio es el puente oficial hacia [la monitorización Pathly](https://pathlyhq.com): comprobaciones HTTP y de navegador (carrito, login, disponibilidad), con datos en la UE. Referencia API: [pathlyhq.com/es/developers](https://pathlyhq.com/es/developers).

Provider Pulumi **dinámico** (TypeScript) para la API de monitorización [Pathly](https://pathlyhq.com) (`https://api.pathlyhq.com`).

Refleja los recursos Terraform `pathly_*` para declarar controles HTTP, webhooks, ventanas de mantenimiento y objetivos de disponibilidad.

## Instalación

```bash
npm install @pathly/pulumi @pulumi/pulumi
# o
yarn add @pathly/pulumi @pulumi/pulumi
```

Token de organización (preferiblemente por entorno, no en el repositorio):

```bash
export PATHLY_API_TOKEN=sp_…
# anulación opcional
export PATHLY_API_URL=https://api.pathlyhq.com
```

O vía configuración Pulumi (secreto):

```bash
pulumi config set pathly:apiToken sp_… --secret
pulumi config set pathly:apiUrl https://api.pathlyhq.com   # opcional
```

## Recursos

| Recurso | API | Notas |
|---|---|---|
| `Scenario` | `POST/GET/PATCH/DELETE /v1/scenarios` | **Solo HTTP** (`type=http`) |
| `Webhook` | create/get/delete | Cambio de URL o eventos → **recreación**; `secret` una sola vez |
| `MaintenanceWindow` | create/get/delete | Cualquier cambio → **recreación** (puntual o semanal) |
| `SlaTarget` | upsert `PUT` + get/delete | Cambio de `monitorId` → **recreación** |

### Recorridos de navegador (solo consola)

Un recorrido browser con pasos `fill` / `http_auth` puede contener contraseñas. Este provider **no gestiona** recorridos browser, para que ninguna credencial acabe en el estado Pulumi. Créelos en la consola Pathly (o con el provider Terraform si acepta estado sensible). Los monitores HTTP están totalmente soportados aquí.

## Ejemplo TypeScript

```ts
import * as pathly from "@pathly/pulumi";

const home = new pathly.Scenario("home", {
  name: "Página de inicio",
  url: "https://shop.example.com/",
  intervalSec: 300,
  expectText: "Nuestros productos",
  severity: "major",
  folder: "Tienda",
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
  reason: "Copia semanal",
});

const sla = new pathly.SlaTarget("inicio-sla", {
  monitorId: home.id,
  name: "Inicio — 99,9 %",
  objectivePct: 99.9,
  windowDays: 30,
  excludeMaintenance: true,
  warnAtBudgetRatio: 0.8,
});

export const scenarioId = home.id;
export const webhookSecret = alerts.secret; // salida secreta Pulumi
```

Credenciales por recurso si hace falta:

```ts
new pathly.Scenario("home", {
  name: "Inicio",
  url: "https://example.com/",
  intervalSec: 300,
  provider: {
    apiToken: process.env.PATHLY_API_TOKEN!,
    apiUrl: "https://api.pathlyhq.com",
  },
});
```

## Ejemplo Python

Pulumi puede impulsar el mismo provider dinámico desde Python mediante un programa Node ligero, o llamar a la API HTTP con helpers `pulumi_pathly`. Véase [`examples/python`](examples/python) para un stack que invoca el paquete TypeScript, y un fallback HTTP puro con `requests` + patrones `pulumi.ComponentResource` documentados allí.

Un stack Python mínimo solo HTTP (sin runtime npm del provider) también es posible envolviendo la API REST; prefiera el paquete TypeScript para paridad CRUD/diff completa con Terraform.

```python
# examples/python/__main__.py — usa PATHLY_API_TOKEN vía el provider dinámico Node
"""
Requiere: pulumi, node y @pathly/pulumi enlazado desde el paquete padre.
"""
import pulumi
import pulumi_pathly as pathly  # shim generado / vendored — véase examples/python

home = pathly.Scenario(
    "home",
    name="Página de inicio",
    url="https://shop.example.com/",
    interval_sec=300,
    expect_text="Nuestros productos",
    severity="major",
)

pulumi.export("scenario_id", home.id)
```

Véase `examples/python` para el shim ejecutable.

## Desarrollo

```bash
npm ci
npm test          # vitest + cobertura 100 % en cliente y lógica de recursos
npm run build
```


## Paquetes relacionados

| Package | Role |
|---|---|
| [terraform-provider-pathly](https://github.com/Pathlyhq/terraform-provider-pathly) | Terraform / OpenTofu |
| [pathly-cdktf](https://github.com/pathlyhq/pathly-cdktf) | CDK for Terraform |
| [pathly-sdk-typescript](https://github.com/pathlyhq/pathly-sdk-typescript) | @pathly/sdk |
| [pathly-crossplane](https://github.com/pathlyhq/pathly-crossplane) | Crossplane |
| [Pathly product](https://pathlyhq.com) | [Pathly monitoring](https://pathlyhq.com) |
## Acerca de Pathly

[Pathly](https://pathlyhq.com) es monitorización sintética para agencias y e-commerce: reproduce el recorrido del cliente, detecta un checkout roto antes de la llamada, y deja la prueba (captura, paso, runbook) lista para la factura. Producto: [pathlyhq.com](https://pathlyhq.com) · Desarrolladores: [pathlyhq.com/es/developers](https://pathlyhq.com/es/developers) · Precios: [pathlyhq.com/es/pricing](https://pathlyhq.com/es/pricing).

## Autor

| | |
|---|---|
| **Empresa** | Pathly |
| **Autor** | Simon Raynaud / keyral |

Véase [AUTHORS](AUTHORS).

## Licencia
Apache-2.0
