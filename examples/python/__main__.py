"""
Pathly Pulumi example — Python dynamic resources calling https://api.pathlyhq.com.

Requires PATHLY_API_TOKEN. Browser journeys stay console-only (no credentials in state).
"""

from __future__ import annotations

import json
import os
import time
import urllib.error
import urllib.request
from typing import Any, Optional, Sequence

import pulumi
from pulumi import Input, Output
from pulumi.dynamic import CreateResult, DiffResult, ReadResult, Resource, ResourceProvider


DEFAULT_API = "https://api.pathlyhq.com"


def _request(
    method: str,
    path: str,
    body: Optional[dict] = None,
    *,
    token: str,
    base_url: str,
    idempotency_key: Optional[str] = None,
) -> dict:
    data = None if body is None else json.dumps(body).encode("utf-8")
    headers = {
        "Authorization": f"Bearer {token}",
        "Accept": "application/json",
        "User-Agent": "pulumi-pathly-python",
    }
    if data is not None:
        headers["Content-Type"] = "application/json"
    if idempotency_key:
        headers["Idempotency-Key"] = idempotency_key
    req = urllib.request.Request(
        base_url.rstrip("/") + path,
        data=data,
        method=method,
        headers=headers,
    )
    try:
        with urllib.request.urlopen(req, timeout=30) as res:
            raw = res.read().decode("utf-8")
            return json.loads(raw) if raw else {}
    except urllib.error.HTTPError as e:
        detail = e.read().decode("utf-8", errors="replace")
        raise Exception(f"{method} {path}: HTTP {e.code} {detail}") from e


def _creds(props: dict) -> tuple[str, str]:
    token = (props.get("__apiToken") or os.environ.get("PATHLY_API_TOKEN") or "").strip()
    if not token:
        raise Exception("PATHLY_API_TOKEN (or __apiToken) is required")
    base = (
        props.get("__apiUrl")
        or os.environ.get("PATHLY_API_URL")
        or DEFAULT_API
    ).rstrip("/")
    return token, base


class _ScenarioProvider(ResourceProvider):
    def create(self, props: dict) -> CreateResult:
        token, base = _creds(props)
        body = {
            "name": props["name"],
            "type": "http",
            "url": props["url"],
            "intervalSec": props["intervalSec"],
        }
        for k in (
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
        ):
            if props.get(k) is not None:
                body[k] = props[k]
        created = _request(
            "POST",
            "/v1/scenarios",
            body,
            token=token,
            base_url=base,
            idempotency_key=f"scenario-{int(time.time())}",
        )
        outs = {**props, "id": created["id"], "type": "http"}
        return CreateResult(id_=created["id"], outs=outs)

    def read(self, id_: str, props: dict) -> ReadResult:
        token, base = _creds(props)
        try:
            s = _request("GET", f"/v1/scenarios/{id_}", token=token, base_url=base)
            return ReadResult(id_=id_, outs={**props, **{k: s.get(k) for k in s}})
        except Exception as e:
            if "HTTP 404" in str(e):
                return ReadResult(id_="", outs={})
            raise

    def diff(self, _id: str, olds: dict, news: dict) -> DiffResult:
        keys = [
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
        ]
        changes = [k for k in keys if olds.get(k) != news.get(k)]
        return DiffResult(changes=bool(changes), replaces=[], delete_before_replace=False)

    def update(self, id_: str, _olds: dict, news: dict) -> dict:
        token, base = _creds(news)
        body = {"name": news["name"], "type": "http", "url": news["url"], "intervalSec": news["intervalSec"]}
        for k in (
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
        ):
            if news.get(k) is not None:
                body[k] = news[k]
        updated = _request("PATCH", f"/v1/scenarios/{id_}", body, token=token, base_url=base)
        return {**news, **updated}

    def delete(self, id_: str, props: dict) -> None:
        token, base = _creds(props)
        try:
            _request("DELETE", f"/v1/scenarios/{id_}", token=token, base_url=base)
        except Exception as e:
            if "HTTP 404" not in str(e):
                raise


class Scenario(Resource):
    id: Output[str]

    def __init__(
        self,
        name: str,
        *,
        url: Input[str],
        interval_sec: Input[int],
        expect_text: Optional[Input[str]] = None,
        severity: Optional[Input[str]] = None,
        folder: Optional[Input[str]] = None,
        tags: Optional[Input[Sequence[str]]] = None,
        method: Optional[Input[str]] = None,
        expected_status: Optional[Input[int]] = None,
        enabled: Optional[Input[bool]] = None,
        opts: Optional[pulumi.ResourceOptions] = None,
    ) -> None:
        props: dict[str, Any] = {
            "name": name,
            "url": url,
            "intervalSec": interval_sec,
            "expectText": expect_text,
            "severity": severity,
            "folder": folder,
            "tags": tags,
            "method": method,
            "expectedStatus": expected_status,
            "enabled": enabled,
            "type": "http",
        }
        super().__init__(_ScenarioProvider(), name, props, opts)


home = Scenario(
    "home",
    url="https://shop.example.com/",
    interval_sec=300,
    expect_text="Our products",
    severity="major",
    folder="Shop",
    tags=["prod"],
)

pulumi.export("scenario_id", home.id)
