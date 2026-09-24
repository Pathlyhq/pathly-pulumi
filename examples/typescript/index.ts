import * as pathly from "@pathlyhq/pulumi";

/**
 * Requires PATHLY_API_TOKEN in the environment.
 * Browser journeys stay in the Pathly console (no credentials in state).
 */
const home = new pathly.Scenario("home", {
  name: "Home page",
  url: "https://shop.example.com/",
  intervalSec: 300,
  method: "GET",
  expectedStatus: 200,
  expectText: "Our products",
  severity: "major",
  folder: "Shop",
  tags: ["prod"],
  enabled: true,
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

const migration = new pathly.MaintenanceWindow("migration", {
  monitorId: home.id,
  startsAt: "2026-10-04T22:00:00Z",
  endsAt: "2026-10-05T02:00:00Z",
  reason: "Checkout funnel migration",
});

const sla = new pathly.SlaTarget("home-sla", {
  monitorId: home.id,
  name: "Home — 99.9 %",
  objectivePct: 99.9,
  windowDays: 30,
  excludeMaintenance: true,
  warnAtBudgetRatio: 0.8,
  enabled: true,
});

export const scenarioId = home.id;
export const webhookId = alerts.id;
export const webhookSecret = alerts.secret;
export const maintenanceIds = [backup.id, migration.id];
export const slaId = sla.id;
