#!/usr/bin/env python3
"""Pull per-day wizard stats from the GA4 Data API into assets/data/wizard-stats/YYYY-MM.json.

Rows (one per stat_date + category + name + value):
  [category, name, value, true_count, false_count]
plus Funnel (wizard step page_views) and Recommendations/Trakt (wizard_trakt_connected) rows.

Usage:
  pull-ga4-daily.py --since 2026-06-01        # backfill
  pull-ga4-daily.py                           # daily: re-pull from 3 days before the newest stored day (late GA4 data)
Env: GA4_PROPERTY_ID, GA4_SERVICE_ACCOUNT_KEY (falls back to .env.local).
"""
import argparse, base64, calendar, json, os, re, sys, time
from datetime import date, timedelta
from pathlib import Path

import requests
from cryptography.hazmat.primitives import hashes, serialization
from cryptography.hazmat.primitives.asymmetric import padding

ROOT = Path(__file__).resolve().parents[1]
OUT_DIR = ROOT / "assets" / "data" / "wizard-stats"
EVENT = "wizard_completed"
LOOKBACK_DAYS = 3

# param -> (category, name)
PARAMS = {
    "target": ("Account", "Platform"),
    "account_mode": ("Account", "Mode"),
    "aio_anime": ("Addons", "Anime"),
    "aio_debridio": ("Addons", "Debridio"),
    "aio_http_addons": ("Addons", "HTTP"),
    "aio_timeout": ("Addons", "Timeout"),
    "catalog_categories": ("Catalogs", "Categories"),
    "catalog_discover": ("Catalogs", "Discover"),
    "aio_formatter_choice": ("Formatter", "Style"),
    "aio_formatter_filename": ("Formatter", "Filename"),
    "aio_languages": ("Languages", "Preferred"),
    "aio_languages_required": ("Languages", "Required"),
    "aio_subtitles": ("Languages", "Subtitles"),
    "services_debrid": ("Services", "Debrid"),
    "services_keys": ("Services", "Keys"),
    "instant_debrid": ("Services", "Instant Debrid"),
    "aio_language": ("Sorting", "Language"),
    "aio_seeders": ("Sorting", "Seeders"),
    # added 2026-11 (no history before their registration date)
    "addon_count": ("Setup", "Addon Count"),
    "profile_count": ("Setup", "Profiles"),
    "kids_count": ("Setup", "Kids Profiles"),
    "bingecat": ("Recommendations", "BingeCat"),
    "watchly": ("Recommendations", "Watchly"),
    "pin_collections": ("Settings", "Pin Collections"),
    "full_settings": ("Settings", "Full Settings"),
}
MULTI = {"services_debrid", "services_keys", "catalog_categories", "catalog_discover", "aio_languages", "aio_subtitles"}
# all-true/false params are summarised as one "Selected" row (the SQL detects this from the data)
BOOLEAN = {"aio_anime", "aio_debridio", "aio_formatter_filename", "aio_languages_required", "instant_debrid", "bingecat", "watchly", "pin_collections"}


def load_env():
    env = dict(os.environ)
    p = ROOT / ".env.local"
    if p.exists():
        for line in p.read_text().splitlines():
            if "=" in line:
                k, v = line.split("=", 1)
                env.setdefault(k, v.strip().strip("'\""))
    return env["GA4_PROPERTY_ID"], json.loads(env["GA4_SERVICE_ACCOUNT_KEY"])


def access_token(sa):
    b = lambda x: base64.urlsafe_b64encode(x).rstrip(b"=")
    now = int(time.time())
    head = b(json.dumps({"alg": "RS256", "typ": "JWT"}).encode())
    claims = b(json.dumps({"iss": sa["client_email"], "scope": "https://www.googleapis.com/auth/analytics.readonly",
                           "aud": "https://oauth2.googleapis.com/token", "iat": now, "exp": now + 3000}).encode())
    key = serialization.load_pem_private_key(sa["private_key"].encode(), None)
    sig = b(key.sign(head + b"." + claims, padding.PKCS1v15(), hashes.SHA256()))
    r = requests.post("https://oauth2.googleapis.com/token", data={
        "grant_type": "urn:ietf:params:oauth:grant-type:jwt-bearer", "assertion": (head + b"." + claims + b"." + sig).decode()})
    r.raise_for_status()
    return r.json()["access_token"]


class GA:
    def __init__(self):
        self.pid, sa = load_env()
        self.tok = access_token(sa)

    def report(self, dims, start, end, event=None, path_prefix=None):
        """All rows of a report as [(dim values...), eventCount]; pages through results."""
        body = {"dimensions": [{"name": d} for d in dims], "metrics": [{"name": "eventCount"}],
                "dateRanges": [{"startDate": start, "endDate": end}], "limit": 100000, "offset": 0}
        flt = []
        if event:
            flt.append({"filter": {"fieldName": "eventName", "stringFilter": {"value": event}}})
        if path_prefix:
            flt.append({"filter": {"fieldName": "pagePath", "stringFilter": {"matchType": "BEGINS_WITH", "value": path_prefix}}})
        if len(flt) == 1:
            body["dimensionFilter"] = flt[0]
        elif flt:
            body["dimensionFilter"] = {"andGroup": {"expressions": flt}}
        rows = []
        while True:
            r = requests.post(f"https://analyticsdata.googleapis.com/v1beta/properties/{self.pid}:runReport",
                              headers={"Authorization": "Bearer " + self.tok}, json=body)
            if r.status_code == 400 and "not a valid dimension" in r.text:
                return None  # dimension not registered (yet)
            r.raise_for_status()
            j = r.json()
            rows += [([d["value"] for d in x["dimensionValues"]], int(x["metricValues"][0]["value"])) for x in j.get("rows", [])]
            if len(rows) >= j.get("rowCount", 0):
                return rows
            body["offset"] = len(rows)


def iso(d):  # GA 'date' is YYYYMMDD
    return f"{d[:4]}-{d[4:6]}-{d[6:]}"


def pull_month(ga, start, end):
    """-> {iso date: [rows]} for start..end (ISO strings)."""
    days = {}

    def day(d):
        return days.setdefault(iso(d), [])

    totals = {iso(d[0]): c for d, c in ga.report(["date"], start, end, EVENT)}
    for d, t in totals.items():
        days.setdefault(d, []).append(["Total", "Completions", EVENT, t, 0])

    debrid_with = {}
    for param, (cat, name) in PARAMS.items():
        rows = ga.report(["date", f"customEvent:{param}"], start, end, EVENT)
        if rows is None:
            print(f"  skip {param}: not a registered dimension yet", file=sys.stderr)
            continue
        counts = {}  # (date, value) -> events
        for (d, raw), c in rows:
            d = iso(d)
            if raw in ("(not set)", ""):
                continue
            if param == "services_debrid":
                debrid_with[d] = debrid_with.get(d, 0) + c
            for v in (raw.split(",") if param in MULTI else [raw]):
                v = v.strip()
                if v:
                    counts[(d, v)] = counts.get((d, v), 0) + c
        if param in BOOLEAN:
            by_day = {}
            for (d, v), c in counts.items():
                by_day.setdefault(d, [0, 0])[0 if v.lower() == "true" else 1] += c
            for d, (t, f) in by_day.items():
                days[d].append([cat, name, "Selected", t, f])
        else:
            for (d, v), c in counts.items():
                days[d].append([cat, name, v.lower() if param in ("target", "account_mode") else v, c, totals[d] - c])

    # Account | Mode (platform), only runs with a known platform and mode
    pm = {}
    for (d, tgt, mode), c in ga.report(["date", "customEvent:target", "customEvent:account_mode"], start, end, EVENT) or []:
        if tgt.lower() in ("nuvio", "stremio") and mode.lower() in ("signin", "create"):
            pm[(iso(d), tgt.lower(), mode.lower())] = c
    plat_total = {}
    for (d, tgt, _), c in pm.items():
        plat_total[(d, tgt)] = plat_total.get((d, tgt), 0) + c
    for (d, tgt, mode), c in pm.items():
        days[d].append(["Account", f"Mode ({tgt.title()})", mode, c, plat_total[(d, tgt)] - c])

    for d, t in totals.items():  # P2P = completions without any debrid service
        w = debrid_with.get(d, 0)
        days[d].append(["Addons", "P2P", "p2p", t - w, w])

    # wizard step funnel from page_view paths (/wizard/<slug>)
    funnel = {}
    for (d, path), c in ga.report(["date", "pagePath"], start, end, "page_view", "/wizard/"):
        m = re.fullmatch(r"/wizard/([a-z0-9-]+)", path)
        if m:
            funnel[(iso(d), m[1])] = funnel.get((iso(d), m[1]), 0) + c
    for (d, slug), c in funnel.items():
        days.setdefault(d, []).append(["Funnel", "Step", slug, c, 0])

    for (d, kind), c in ga.report(["date", "customEvent:trakt"], start, end, "wizard_trakt_connected") or []:
        days.setdefault(iso(d), []).append(["Recommendations", "Trakt", kind, c, 0])
    return days


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--since", help="ISO date; default: today minus %d days" % LOOKBACK_DAYS)
    arg = ap.parse_args().since
    stored_days = [d for f in OUT_DIR.glob("*.json") for d in json.loads(f.read_text())["days"]]
    # resume from the newest stored day, so a long pause in the scheduled run leaves no gap
    since = date.fromisoformat(arg) if arg else (date.fromisoformat(max(stored_days)) if stored_days else date.today()) - timedelta(days=LOOKBACK_DAYS)
    today = date.today()
    ga = GA()
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    y, m = since.year, since.month
    while (y, m) <= (today.year, today.month):
        first = max(since, date(y, m, 1))
        last = min(today, date(y, m, calendar.monthrange(y, m)[1]))
        print(f"{y}-{m:02d}: {first} .. {last}")
        new = pull_month(ga, first.isoformat(), last.isoformat())
        path = OUT_DIR / f"{y}-{m:02d}.json"
        stored = json.loads(path.read_text())["days"] if path.exists() else {}
        for d in [(first + timedelta(n)).isoformat() for n in range((last - first).days + 1)]:
            stored.pop(d, None)  # a re-pulled day replaces the old one (also drops days that became empty)
        stored.update(new)
        path.write_text(json.dumps({"days": dict(sorted(stored.items()))}, separators=(",", ":")) + "\n")
        y, m = (y + 1, 1) if m == 12 else (y, m + 1)


if __name__ == "__main__":
    main()
