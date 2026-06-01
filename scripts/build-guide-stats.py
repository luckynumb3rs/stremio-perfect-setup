#!/usr/bin/env python3
from __future__ import annotations

import json
import os
import re
from datetime import datetime, timezone
from pathlib import Path


ROOT_DIR = Path(__file__).resolve().parents[1]
CONFIG_PATH = ROOT_DIR / "assets" / "js" / "guide-completion-config.js"
OUTPUT_PATH = ROOT_DIR / "assets" / "data" / "guide-stats.json"
GA4_EARLIEST_VALID_DATE = "2026-01-01"
WIZARD_ACCOUNT_CREATED_EVENT = "wizard_account_created"


def load_completion_config() -> dict:
    raw = CONFIG_PATH.read_text(encoding="utf-8")
    match = re.search(
        r"GUIDE_COMPLETION_CONFIG\s*=\s*Object\.freeze\(\s*(\{.*?\})\s*\)\s*;",
        raw,
        re.DOTALL,
    )
    if not match:
        raise ValueError(f"Could not parse completion config from {CONFIG_PATH}")

    config = json.loads(match.group(1))
    config["legacyCompletions"] = int(config.get("legacyCompletions", 0) or 0)
    config["completionEventName"] = str(config.get("completionEventName") or "guide_completed")
    config["requiredPaths"] = [
        str(path).strip().strip("/")
        for path in config.get("requiredPaths", [])
        if str(path).strip()
    ]
    return config


def fetch_analytics_totals(property_id: str, service_account_json: str, event_name: str) -> tuple[int, int]:
    from google.analytics.data_v1beta import BetaAnalyticsDataClient
    from google.analytics.data_v1beta.types import DateRange, Dimension, Filter, FilterExpression, Metric, RunReportRequest
    from google.oauth2 import service_account

    credentials = service_account.Credentials.from_service_account_info(
        json.loads(service_account_json)
    )
    client = BetaAnalyticsDataClient(credentials=credentials)

    request = RunReportRequest(
        property=f"properties/{property_id}",
        dimensions=[Dimension(name="eventName")],
        metrics=[Metric(name="totalUsers"), Metric(name="eventCount")],
        date_ranges=[DateRange(start_date=GA4_EARLIEST_VALID_DATE, end_date="today")],
        dimension_filter=FilterExpression(
            filter=Filter(
                field_name="eventName",
                string_filter=Filter.StringFilter(value=event_name),
            )
        ),
    )

    response = client.run_report(request=request)
    if not response.rows:
        return 0, 0

    total_users = int(response.rows[0].metric_values[0].value or 0)
    event_count = int(response.rows[0].metric_values[1].value or 0)
    return total_users, event_count


def build_payload(config: dict) -> dict:
    baseline = config["legacyCompletions"]
    event_name = config["completionEventName"]
    property_id = os.environ.get("GA4_PROPERTY_ID", "").strip()
    service_account_json = os.environ.get("GA4_SERVICE_ACCOUNT_KEY", "").strip()

    analytics_unique_users = 0
    analytics_event_count = 0
    wizard_analytics_unique_users = 0
    wizard_analytics_event_count = 0
    source = "baseline_only"
    error = None

    if property_id and service_account_json:
        try:
            analytics_unique_users, analytics_event_count = fetch_analytics_totals(
                property_id=property_id,
                service_account_json=service_account_json,
                event_name=event_name,
            )
            wizard_analytics_unique_users, wizard_analytics_event_count = fetch_analytics_totals(
                property_id=property_id,
                service_account_json=service_account_json,
                event_name=WIZARD_ACCOUNT_CREATED_EVENT,
            )
            source = "ga4"
        except Exception as exc:  # pragma: no cover - best effort fallback in CI
            source = "baseline_fallback"
            error = str(exc)

    payload = {
        "eventName": event_name,
        "legacyCompletions": baseline,
        "analyticsUniqueUsers": analytics_unique_users,
        "analyticsEventCount": analytics_event_count,
        "totalCompletions": baseline + analytics_unique_users,
        "requiredPaths": config["requiredPaths"],
        "storageVersion": int(config.get("storageVersion", 1) or 1),
        "source": source,
        "updatedAt": datetime.now(timezone.utc).isoformat().replace("+00:00", "Z"),
        "wizard": {
            "accountCreatedEventName": WIZARD_ACCOUNT_CREATED_EVENT,
            "analyticsUniqueUsers": wizard_analytics_unique_users,
            "analyticsEventCount": wizard_analytics_event_count,
            "totalAccountsCreated": wizard_analytics_event_count,
        },
    }

    if error:
        payload["error"] = error

    return payload


def main() -> None:
    config = load_completion_config()
    payload = build_payload(config)
    OUTPUT_PATH.parent.mkdir(parents=True, exist_ok=True)
    OUTPUT_PATH.write_text(json.dumps(payload, indent=2) + "\n", encoding="utf-8")
    print(
        "Wrote guide stats to"
        f" {OUTPUT_PATH} with totalCompletions={payload['totalCompletions']}"
        f" source={payload['source']}"
    )


if __name__ == "__main__":
    main()
