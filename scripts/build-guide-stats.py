#!/usr/bin/env python3
from __future__ import annotations

import json
import os
import re
from datetime import datetime, timezone
from pathlib import Path
from typing import Any


ROOT_DIR = Path(__file__).resolve().parents[1]
CONFIG_PATH = ROOT_DIR / "assets" / "js" / "guide-completion-config.js"
OUTPUT_PATH = ROOT_DIR / "assets" / "data" / "guide-stats.json"
TEMPLATE_PATH = ROOT_DIR / "templates" / "AIOStreams.json"
GA4_EARLIEST_VALID_DATE = "2026-01-01"
WIZARD_COUNTER_EVENT = "wizard_completed"
STATS_DIR = ROOT_DIR / "assets" / "data" / "wizard-stats"  # written by scripts/pull-ga4-daily.py

ACCOUNT_PLATFORM_LABELS = {
    "nuvio": {"label": "Nuvio"},
    "stremio": {"label": "Stremio"},
}
ACCOUNT_MODE_LABELS = {
    "signin": {"label": "Sign in"},
    "create": {"label": "Create"},
}
FORMATTER_STYLE_LABELS = {
    "flat": {"label": "Flat"},
    "color": {"label": "Color"},
}
ACCOUNT_LOGO_PATHS = {
    "nuvio": "assets/images/services/nuvio.png",
    "stremio": "assets/images/services/stremio.svg",
}
DEBRID_LOGO_PATHS = {
    "TorBox": "assets/images/services/torbox.svg",
    "Real-Debrid": "assets/images/services/realdebrid.png",
    "AllDebrid": "assets/images/services/alldebrid.png",
    "Premiumize": "assets/images/services/premiumize.svg",
    "Debrid-Link": "assets/images/services/debridlink.svg",
    "Debrider": "assets/images/services/debrider.svg",
    "EasyDebrid": "assets/images/services/easydebrid.png",
    "Offcloud": "assets/images/services/offcloud.png",
    "PikPak": "assets/images/services/pikpak.png",
    "Seedr": "assets/images/services/seedr.png",
    "Put.io": "assets/images/services/putio.svg",
}


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


def load_stats_rows() -> list[dict[str, Any]]:
    """Sum the per-day rows of every month file into all-time rows."""
    totals: dict[tuple[str, str, str], list[int]] = {}
    for path in sorted(STATS_DIR.glob("*.json")):
        for day_rows in json.loads(path.read_text(encoding="utf-8"))["days"].values():
            for category, name, value, true_count, false_count in day_rows:
                t = totals.setdefault((category, name, value), [0, 0])
                t[0] += true_count
                t[1] += false_count

    def sort_order(category: str, name: str) -> int:
        if category == "Total":
            return 0
        if category == "Account":
            return {"Platform": 1, "Mode": 2, "Mode (Nuvio)": 3, "Mode (Stremio)": 4}.get(name, 5)
        return 5

    rows = [
        {"sortOrder": sort_order(c, n), "category": c, "name": n, "value": v, "trueCount": t, "falseCount": f}
        for (c, n, v), (t, f) in totals.items()
    ]
    rows.sort(key=lambda r: (r["sortOrder"], r["category"], r["name"], -r["trueCount"], r["value"]))
    return rows


def load_template_option_maps() -> dict[str, dict[str, dict[str, str]]]:
    raw = json.loads(TEMPLATE_PATH.read_text(encoding="utf-8"))
    inputs = raw.get("metadata", {}).get("inputs", [])

    maps: dict[str, dict[str, dict[str, str]]] = {}
    for field in inputs:
        field_id = str(field.get("id") or "").strip()
        options = field.get("options")
        if not field_id or not isinstance(options, list):
            continue
        option_map: dict[str, dict[str, str]] = {}
        for option in options:
            value = str(option.get("value") or "").strip()
            label = str(option.get("label") or "").strip()
            if not value or not label:
                continue
            emoji, plain_label = split_emoji_label(label)
            option_map[value] = {
                "label": plain_label,
                "shortLabel": shorten_option_label(field_id, value, plain_label),
                "emoji": emoji,
                "title": plain_label,
            }
        if option_map:
            maps[field_id] = option_map
    return maps


def split_emoji_label(label: str) -> tuple[str, str]:
    trimmed = label.strip()
    if not trimmed:
        return "", ""
    parts = trimmed.split(maxsplit=1)
    if len(parts) == 2 and not parts[0][:1].isalnum():
        return parts[0], parts[1].strip()
    return "", trimmed


def shorten_option_label(field_id: str, value: str, label: str) -> str:
    normalized = label.strip()

    if field_id == "formatterChoice":
        return FORMATTER_STYLE_LABELS.get(value, {}).get("label", normalized)
    if field_id == "httpAddons":
        return {
            "none": "Off",
            "install": "Extra",
            "only": "Only HTTP",
        }.get(value, normalized)
    if field_id in {"language", "seeders"}:
        return {
            "default": "Default",
            "medium": "Medium",
            "high": "High",
        }.get(value, normalized)
    return normalized


def build_display_item(
    raw_value: str,
    count: int,
    *,
    label_map: dict[str, dict[str, str]] | None = None,
    fallback_label: str | None = None,
) -> dict[str, Any]:
    details = (label_map or {}).get(raw_value, {})
    label = details.get("label") or fallback_label or humanize_value(raw_value)
    short_label = details.get("shortLabel") or label
    emoji = details.get("emoji") or ""
    title = details.get("title") or label
    return {
        "value": raw_value,
        "label": label,
        "shortLabel": short_label,
        "emoji": emoji,
        "title": title,
        "count": count,
    }


def humanize_value(value: str) -> str:
    text = str(value or "").strip()
    if not text:
        return ""
    if text.isupper():
        return text
    if " " in text:
        return text
    return text.replace("_", " ").replace("-", " ").title()


def get_row_total(index: dict[tuple[str, str], list[dict[str, Any]]], category: str, name: str, value: str) -> int:
    for row in index.get((category, name), []):
        if row["value"] == value:
            return int(row["trueCount"])
    return 0


def get_boolean_total(index: dict[tuple[str, str], list[dict[str, Any]]], category: str, name: str) -> int:
    return get_row_total(index, category, name, "Selected")


def get_top_items(
    index: dict[tuple[str, str], list[dict[str, Any]]],
    category: str,
    name: str,
    limit: int,
    *,
    label_map: dict[str, dict[str, str]] | None = None,
) -> list[dict[str, Any]]:
    items: list[dict[str, Any]] = []
    for row in index.get((category, name), []):
        count = int(row["trueCount"])
        if count <= 0:
            continue
        items.append(
            build_display_item(
                row["value"],
                count,
                label_map=label_map,
            )
        )
        if len(items) >= limit:
            break
    return items


def build_wizard_analytics_summary(rows: list[dict[str, Any]]) -> dict[str, Any]:
    if not rows:
        return {
            "accounts": {"total": 0, "platforms": []},
            "debrid": [],
            "audio": [],
            "subtitles": [],
            "catalogs": {"discover": [], "categories": []},
            "formatter": [],
            "addons": {"anime": 0, "debridio": 0, "httpInstall": 0, "httpOnly": 0, "p2p": 0},
            "recommendations": {"watchly": 0, "bingecat": 0, "traktScrobble": 0, "traktAiometadata": 0, "kids": 0},
            "settings": {"fullSettings": 0, "pinCollections": 0, "profiles": 0},
            "keys": {"tmdb": 0, "tvdb": 0, "rpdb": 0, "gemini": 0, "instantDebrid": 0},
            "rowCount": 0,
        }

    option_maps = load_template_option_maps()
    index: dict[tuple[str, str], list[dict[str, Any]]] = {}
    for row in rows:
        index.setdefault((row["category"], row["name"]), []).append(row)

    total_completions = get_row_total(index, "Total", "Completions", "wizard_completed")

    account_platforms = []
    for platform_value in ("nuvio", "stremio"):
        platform_total = get_row_total(index, "Account", "Platform", platform_value)
        if platform_total <= 0:
            continue
        platform_label = ACCOUNT_PLATFORM_LABELS.get(platform_value, {}).get("label", humanize_value(platform_value))
        account_platforms.append(
            {
                "id": platform_value,
                "label": platform_label,
                "logoPath": ACCOUNT_LOGO_PATHS.get(platform_value, ""),
                "total": platform_total,
                "signin": get_row_total(index, "Account", f"Mode ({platform_label})", "signin"),
                "create": get_row_total(index, "Account", f"Mode ({platform_label})", "create"),
            }
        )

    debrid_items = []
    for row in index.get(("Services", "Debrid"), [])[:5]:
        count = int(row["trueCount"])
        if count <= 0:
            continue
        debrid_items.append(
            {
                "id": str(row["value"]).lower().replace("-", "").replace(" ", ""),
                "label": str(row["value"]),
                "logoPath": DEBRID_LOGO_PATHS.get(str(row["value"]), ""),
                "count": count,
            }
        )

    audio_items = []
    for item in get_top_items(index, "Languages", "Preferred", 5, label_map=option_maps.get("languages")):
        audio_items.append(
            {
                "emoji": item.get("emoji") or item.get("value", ""),
                "title": item.get("title") or item.get("label"),
                "count": int(item["count"]),
            }
        )

    subtitle_items = []
    for item in get_top_items(index, "Languages", "Subtitles", 5, label_map=option_maps.get("subtitles")):
        subtitle_items.append(
            {
                "emoji": item.get("emoji") or item.get("value", ""),
                "title": item.get("title") or item.get("label"),
                "count": int(item["count"]),
            }
        )

    discover_items = []
    for row in index.get(("Catalogs", "Discover"), [])[:4]:
        discover_items.append(
            {
                "emoji": str(row["value"]),
                "title": str(row["value"]),
                "count": int(row["trueCount"]),
            }
        )

    category_items = []
    for row in index.get(("Catalogs", "Categories"), [])[:8]:
        category_items.append(
            {
                "emoji": str(row["value"]),
                "title": str(row["value"]),
                "count": int(row["trueCount"]),
            }
        )

    formatter_items = []
    for item in get_top_items(index, "Formatter", "Style", 2, label_map=option_maps.get("formatterChoice", FORMATTER_STYLE_LABELS)):
        formatter_items.append(
            {
                "id": str(item["value"]),
                "emoji": item.get("emoji") or "",
                "label": item.get("shortLabel") or item.get("label") or str(item["value"]),
                "title": item.get("title") or item.get("label"),
                "count": int(item["count"]),
            }
        )

    return {
        "accounts": {
            "total": total_completions,
            "platforms": account_platforms,
        },
        "debrid": debrid_items,
        "audio": audio_items,
        "subtitles": subtitle_items,
        "catalogs": {
            "discover": discover_items,
            "categories": category_items,
        },
        "formatter": formatter_items,
        "addons": {
            "anime": get_boolean_total(index, "Addons", "Anime"),
            "debridio": get_boolean_total(index, "Addons", "Debridio"),
            "httpInstall": get_row_total(index, "Addons", "HTTP", "install"),
            "httpOnly": get_row_total(index, "Addons", "HTTP", "only"),
            "p2p": get_row_total(index, "Addons", "P2P", "p2p"),
        },
        "keys": {
            "tmdb": get_row_total(index, "Services", "Keys", "tmdb"),
            "tvdb": get_row_total(index, "Services", "Keys", "tvdb"),
            "rpdb": get_row_total(index, "Services", "Keys", "rpdb"),
            "gemini": get_row_total(index, "Services", "Keys", "gemini"),
            "instantDebrid": get_boolean_total(index, "Services", "Instant Debrid"),
        },
        "recommendations": {
            "watchly": get_boolean_total(index, "Recommendations", "Watchly"),
            "bingecat": get_boolean_total(index, "Recommendations", "BingeCat"),
            "traktScrobble": get_row_total(index, "Recommendations", "Trakt", "scrobble"),
            "traktAiometadata": get_row_total(index, "Recommendations", "Trakt", "aiometadata"),
            # kids_count is per run: total Kids profiles = sum of selected Kids profiles * runs
            "kids": sum(int(r["value"]) * int(r["trueCount"]) for r in index.get(("Setup", "Kids Profiles"), []) if r["value"].isdigit()),
        },
        "settings": {
            # full_settings is the number of profiles per run; count the runs that used it at all
            "fullSettings": sum(int(r["trueCount"]) for r in index.get(("Settings", "Full Settings"), []) if r["value"] != "0"),
            "pinCollections": get_boolean_total(index, "Settings", "Pin Collections"),
            # profile_count is per run: total profiles = sum of value * runs
            "profiles": sum(int(r["value"]) * int(r["trueCount"]) for r in index.get(("Setup", "Profiles"), []) if r["value"].isdigit()),
        },
        "rowCount": len(rows),
    }


def build_payload(config: dict) -> dict:
    baseline = config["legacyCompletions"]
    event_name = config["completionEventName"]
    property_id = os.environ.get("GA4_PROPERTY_ID", "").strip()
    service_account_json = os.environ.get("GA4_SERVICE_ACCOUNT_KEY", "").strip()

    analytics_unique_users = 0
    analytics_event_count = 0
    wizard_counter_unique_users = 0
    wizard_counter_event_count = 0
    source = "baseline_only"
    error = None
    stats_rows = load_stats_rows()

    if property_id and service_account_json:
        try:
            analytics_unique_users, analytics_event_count = fetch_analytics_totals(
                property_id=property_id,
                service_account_json=service_account_json,
                event_name=event_name,
            )
            wizard_counter_unique_users, wizard_counter_event_count = fetch_analytics_totals(
                property_id=property_id,
                service_account_json=service_account_json,
                event_name=WIZARD_COUNTER_EVENT,
            )
            source = "ga4"
        except Exception as exc:  # pragma: no cover - best effort fallback in CI
            source = "baseline_fallback"
            error = str(exc)

    wizard_analytics_summary = build_wizard_analytics_summary(stats_rows)

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
            "counterEventName": WIZARD_COUNTER_EVENT,
            "analyticsUniqueUsers": wizard_counter_unique_users,
            "analyticsEventCount": wizard_counter_event_count,
            "totalAccountsCreated": wizard_counter_event_count,
            "analytics": {
                "source": "repo",
                "rows": stats_rows,
                "summary": wizard_analytics_summary,
            },
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
