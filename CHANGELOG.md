# Changelog

## 0.1.0 — 2026-09-23

- Initial release: TypeScript dynamic provider for Pathly API v1.
- Resources: `Scenario` (HTTP only), `Webhook`, `MaintenanceWindow`, `SlaTarget`.
- Provider config: `apiToken` (secret), `apiUrl`, with `PATHLY_API_TOKEN` / `PATHLY_API_URL` fallbacks.
- Browser journeys remain console-only (no credentials in Pulumi state).
