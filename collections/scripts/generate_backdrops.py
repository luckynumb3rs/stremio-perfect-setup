#!/usr/bin/env python3
"""
Generate collection backdrops for folders defined in collections/nuvio-collections.json.

Purpose:
    This is the wrapper entry point most users should run. It:
    1. reads the folder definitions from `nuvio-collections.json`
    2. resolves the underlying TMDB catalog filters from `AIOMetadata-Catalogs.json`
    3. merges all catalogs assigned to the same folder into one backdrop job
    4. selects a predefined accent color for each folder, with a deterministic fallback
    5. calls `backdrop.py` once per folder
    Fanart language preference is passed through to `backdrop.py`, which
    prioritizes preferred language first and falls back in a controlled order.

Important parameters:
    --api-key
        TMDB API key used for all folder jobs.
    --fanart-key
        Optional Fanart.tv API key used to improve tile art quality.
    --preferred-language
        Preferred Fanart artwork language code. Default is `en`.
    --collections-file
        Path to the `nuvio-collections.json` file to read folder definitions
        from.
    --catalogs-file
        Path to the `AIOMetadata-Catalogs.json` file used to resolve TMDB
        discover filters.
    --output-root
        Collections root where generated files are written in the existing
        layout: `<group>/backdrop/<folder>.jpg`.
    --folder-id
        Optional folder filter. Repeat this flag to generate only selected
        folders.
    --focus
        Grid focus preset or explicit `x,y` fractions passed through to
        `backdrop.py`.
    --count
        Maximum number of titles to use for each folder after that folder's
        catalogs are merged.
    --size
        Output size: `4k`, `1080p`, or `both`.
    --quality
        Named JPEG profile: `compressed` or `high`. Default is `compressed`.
    --jpg-quality
        Advanced manual JPEG quality override.
    --parallelism
        Number of folders to generate at the same time. Keep this relatively
        low to avoid hitting TMDB rate limits.
    --dry-run
        Print the resolved folder jobs, accent colors, and TMDB requests
        without generating images.

Examples:
    python3 -B generate_backdrops.py \
      --api-key YOUR_TMDB_KEY \
      --fanart-key YOUR_FANART_KEY

    python3 -B generate_backdrops.py \
      --api-key YOUR_TMDB_KEY \
      --fanart-key YOUR_FANART_KEY \
      --folder-id collections.streaming.netflix \
      --size 4k

    python3 -B generate_backdrops.py \
      --api-key YOUR_TMDB_KEY \
      --fanart-key YOUR_FANART_KEY \
      --preferred-language en \
      --quality compressed

    python3 -B generate_backdrops.py \
      --api-key YOUR_TMDB_KEY \
      --fanart-key YOUR_FANART_KEY \
      --quality high

    python3 -B generate_backdrops.py \
      --api-key YOUR_TMDB_KEY \
      --dry-run
"""

import argparse
import concurrent.futures
import json
import subprocess
import sys
from pathlib import Path
from urllib.parse import urlencode

from backdrop import default_accent_for_label, parse_focus_value

SCRIPT_DIR = Path(__file__).resolve().parent
REPO_ROOT = SCRIPT_DIR.parent.parent
DEFAULT_COLLECTIONS_FILE = REPO_ROOT / "collections" / "nuvio-collections.json"
DEFAULT_CATALOGS_FILE = REPO_ROOT / "templates" / "AIOMetadata-Catalogs.json"
DEFAULT_OUTPUT_ROOT = SCRIPT_DIR.parent

STATIC_TMDB_REQUESTS = {
    # Some home/discover catalogs are not TMDB discover payloads in the JSON file,
    # so the wrapper maps them to the nearest direct TMDB list endpoints here.
    ("tmdb.top", "movie"): "movie:/movie/popular?language=en-US",
    ("tmdb.top", "series"): "tv:/tv/popular?language=en-US",
    ("tmdb.trending", "movie"): "movie:/trending/movie/week?language=en-US",
    ("tmdb.trending", "series"): "tv:/trending/tv/week?language=en-US",
    ("tmdb.top_rated", "movie"): "movie:/movie/top_rated?language=en-US",
    ("tmdb.top_rated", "series"): "tv:/tv/top_rated?language=en-US",
    ("tmdb.airing_today", "series"): "tv:/tv/airing_today?language=en-US",
}

FOLDER_REQUEST_OVERRIDES = {
    # The anime folder is backed by MAL sources in the collection JSON. For backdrop
    # generation we still want a representative TMDB image pool, so we override it.
    "collections.genres.anime": [
        "movie:sort_by=popularity.desc&include_adult=false&with_genres=16&with_original_language=ja&vote_count.gte=20&with_release_type=4|5|6",
        "tv:sort_by=popularity.desc&include_adult=false&with_genres=16&with_original_language=ja&vote_count.gte=10&with_status=0|3|4|5",
    ],
}

ACCENT_PRESETS = {
    "collections.decades.1950s": (188, 125, 77),
    "collections.decades.1960s": (236, 186, 123),
    "collections.decades.1970s": (27, 151, 187),
    "collections.decades.1980s": (27, 95, 187),
    "collections.decades.1990s": (164, 127, 50),
    "collections.decades.2000s": (155, 155, 59),
    "collections.decades.2010s": (27, 151, 187),
    "collections.decades.2020s": (232, 177, 92),
    "collections.discover.popular": (227, 187, 140),
    "collections.discover.top-rated": (173, 96, 42),
    "collections.discover.trending": (59, 110, 155),
    "collections.genres.action": (233, 170, 102),
    "collections.genres.animation": (220, 148, 99),
    "collections.genres.anime": (226, 124, 52),
    "collections.genres.comedy": (59, 155, 140),
    "collections.genres.crime": (166, 102, 58),
    "collections.genres.documentary": (59, 116, 155),
    "collections.genres.drama": (59, 116, 155),
    "collections.genres.family": (212, 141, 69),
    "collections.genres.fantasy": (88, 150, 191),
    "collections.genres.history": (201, 150, 112),
    "collections.genres.horror": (225, 138, 68),
    "collections.genres.music": (225, 183, 137),
    "collections.genres.mystery": (59, 129, 155),
    "collections.genres.reality": (210, 154, 114),
    "collections.genres.romance": (167, 95, 47),
    "collections.genres.talk": (27, 113, 187),
    "collections.genres.thriller": (183, 67, 56),
    "collections.genres.tv": (195, 146, 97),
    "collections.genres.western": (223, 154, 96),
    "collections.runtime.epic": (59, 103, 155),
    "collections.runtime.long": (65, 116, 173),
    "collections.runtime.short": (86, 59, 155),
    "collections.runtime.standard": (235, 181, 115),
    "collections.streaming.apple-tv": (167, 151, 216),
    "collections.streaming.crunchyroll": (223, 104, 32),
    "collections.streaming.curiosity-stream": (166, 122, 49),
    "collections.streaming.discovery-plus": (199, 172, 107),
    "collections.streaming.disney-plus": (119, 182, 203),
    "collections.streaming.hbo-max": (177, 29, 200),
    "collections.streaming.hulu": (38, 224, 133),
    "collections.streaming.netflix": (213, 30, 39),
    "collections.streaming.paramount-plus": (32, 108, 223),
    "collections.streaming.peacock": (225, 200, 41),
    "collections.streaming.prime-video": (38, 125, 224),
    "collections.themes.coming-of-age": (155, 95, 59),
    "collections.themes.magic": (176, 142, 67),
    "collections.themes.martial-arts": (207, 99, 55),
    "collections.themes.revenge": (204, 139, 96),
    "collections.themes.romantic-comedy": (191, 129, 87),
    "collections.themes.satire": (176, 112, 50),
    "collections.themes.space": (63, 121, 165),
    "collections.themes.spy": (59, 121, 155),
    "collections.themes.superhero": (117, 178, 202),
    "collections.themes.time-travel": (183, 137, 69),
    "collections.themes.treasure-hunt": (223, 174, 82),
    "collections.themes.vampire": (155, 78, 59),
}

def load_json(path):
    with path.open("r", encoding="utf-8") as handle:
        return json.load(handle)


def build_catalog_index(catalogs_data):
    """Index catalogs by `(catalog_id, type)` for quick lookup from folder sources."""
    index = {}
    for catalog in catalogs_data["catalogs"]:
        index[(catalog["id"], catalog.get("type"))] = catalog
    return index


def parse_folder_key(folder_id):
    parts = folder_id.split(".")
    if len(parts) < 3:
        raise ValueError(f"Unexpected folder id '{folder_id}'.")
    return parts[1], parts[2]


def stringify_discover_request(media_type, params):
    """Convert the discover JSON params into the request format expected by backdrop.py."""
    filtered = {}
    for key, value in params.items():
        if value is None:
            continue
        if isinstance(value, bool):
            filtered[key] = "true" if value else "false"
        else:
            filtered[key] = str(value)
    return f"{media_type}:{urlencode(filtered, doseq=True)}"


def folder_tmdb_requests(folder, catalog_index):
    """Resolve every TMDB-backed source attached to a folder into request specs."""
    override = FOLDER_REQUEST_OVERRIDES.get(folder["id"])
    if override:
        return list(override)

    requests = []
    for source in folder.get("catalogSources", []):
        if source.get("addonId") != "aio-metadata":
            continue

        catalog = catalog_index.get((source["catalogId"], source.get("type")))
        if not catalog or catalog.get("source") != "tmdb":
            continue

        discover = ((catalog.get("metadata") or {}).get("discover") or {})
        if discover.get("params"):
            media_type = discover.get("mediaType") or source.get("type")
            requests.append(stringify_discover_request(media_type, discover["params"]))
            continue

        static_request = STATIC_TMDB_REQUESTS.get((catalog["id"], source.get("type")))
        if static_request:
            requests.append(static_request)

    return requests


def folder_accent(folder_id, folder_title):
    """Use a cover-derived preset when available, otherwise a deterministic fallback."""
    return ACCENT_PRESETS.get(folder_id, default_accent_for_label(folder_title))


def should_process(folder_id, allowed_ids):
    if not allowed_ids:
        return True
    return folder_id in allowed_ids


def resolve_quality_args(quality, jpg_quality):
    """Convert wrapper quality options into the kwargs expected by backdrop.py."""
    return {
        "quality": quality,
        "jpg_quality": jpg_quality,
    }


def build_jobs(collections_data, catalog_index, output_root, allowed_ids):
    """Precompute all folder jobs before generation starts."""
    jobs = []
    for collection in collections_data:
        for folder in collection.get("folders", []):
            folder_id = folder["id"]
            if not should_process(folder_id, allowed_ids):
                continue

            group, slug = parse_folder_key(folder_id)
            jobs.append({
                "folder_id": folder_id,
                "label": folder["title"],
                "output_path": Path(output_root) / group / "backdrop" / f"{slug}.jpg",
                "requests": folder_tmdb_requests(folder, catalog_index),
                "accent": folder_accent(folder_id, folder["title"]),
            })
    return jobs


def run_job(job, api_key, fanart_key, preferred_language, focus_x, focus_y, count, size, quality, jpg_quality):
    """Run one folder job in its own process so parallel logs stay isolated."""
    command = [
        "python3",
        "-B",
        str(SCRIPT_DIR / "backdrop.py"),
        "--api-key", api_key,
        "--label", job["label"],
        "--accent-color", ",".join(str(value) for value in job["accent"]),
        "--output", str(job["output_path"]),
        "--size", size,
        "--quality", quality,
        "--focus", f"{focus_x:.4f},{focus_y:.4f}",
        "--count", str(count),
    ]
    if fanart_key:
        command.extend(["--fanart-key", fanart_key])
    if preferred_language:
        command.extend(["--preferred-language", preferred_language])
    if jpg_quality is not None:
        command.extend(["--jpg-quality", str(jpg_quality)])
    for request in job["requests"]:
        command.extend(["--tmdb-request", request])

    result = subprocess.run(
        command,
        cwd=REPO_ROOT,
        text=True,
        capture_output=True,
        check=False,
    )
    if result.returncode != 0:
        raise RuntimeError((result.stdout + result.stderr).strip() or f"backdrop.py exited with {result.returncode}")
    return result.stdout


def print_job_preview(job):
    """Print a short one-line summary before a folder job starts."""
    print(
        f"Queued {job['folder_id']} -> {job['output_path']} "
        f"({len(job['requests'])} request{'s' if len(job['requests']) != 1 else ''})",
        flush=True,
    )


def main():
    parser = argparse.ArgumentParser(description="Generate collection backdrops from collection and TMDB catalog JSON files.")
    parser.add_argument("--api-key", required=False, help="TMDB API key")
    parser.add_argument("--fanart-key", required=False, default=None, help="Fanart.tv API key")
    parser.add_argument("--preferred-language", default="en", help="Preferred Fanart artwork language code. Default: en")
    parser.add_argument("--collections-file", default=str(DEFAULT_COLLECTIONS_FILE), help="Path to nuvio-collections.json")
    parser.add_argument("--catalogs-file", default=str(DEFAULT_CATALOGS_FILE), help="Path to AIOMetadata-Catalogs.json")
    parser.add_argument("--output-root", default=str(DEFAULT_OUTPUT_ROOT), help="Root collections folder where `<group>/backdrop/<folder>.jpg` files are written")
    parser.add_argument("--folder-id", action="append", default=[], help="Only generate for the matching folder id(s). Repeat this flag to target multiple folders.")
    parser.add_argument("--focus", default="center-right", help="Focus preset or x,y values passed to backdrop.py")
    parser.add_argument("--count", type=int, default=60, help="Max source titles to use per backdrop after the folder's catalogs are merged")
    parser.add_argument("--size", choices=("4k", "1080p", "both"), default="4k", help="Rendered output size(s)")
    parser.add_argument("--quality", choices=("compressed", "high"), default="compressed", help="Named JPEG output profile. Default is compressed.")
    parser.add_argument("--jpg-quality", type=int, default=None, help="Advanced override for JPEG quality from 1-95. If set, it overrides --quality.")
    parser.add_argument("--parallelism", type=int, default=3, help="How many folders to generate at once. Keep this low to avoid TMDB rate limits.")
    parser.add_argument("--dry-run", action="store_true", help="Print the resolved accent and TMDB requests without generating images")
    args = parser.parse_args()

    if not args.api_key:
        print("Error: --api-key is required.")
        sys.exit(1)

    collections_data = load_json(Path(args.collections_file))
    catalog_index = build_catalog_index(load_json(Path(args.catalogs_file)))
    selected_ids = set(args.folder_id)
    focus_x, focus_y = parse_focus_value(args.focus)
    if args.jpg_quality is not None and (args.jpg_quality < 1 or args.jpg_quality > 95):
        print("Error: --jpg-quality must be between 1 and 95.")
        sys.exit(1)
    if args.parallelism < 1:
        print("Error: --parallelism must be at least 1.")
        sys.exit(1)

    failures = []
    generated = 0
    skipped = 0
    jobs = build_jobs(collections_data, catalog_index, args.output_root, selected_ids)
    print(f"Resolved {len(jobs)} folder job(s) from collections config.", flush=True)

    for job in jobs:
        if not job["requests"]:
            skipped += 1
            print(f"Skipping {job['folder_id']}: no TMDB-backed catalog sources resolved.", flush=True)

    jobs = [job for job in jobs if job["requests"]]

    if args.dry_run:
        for job in jobs:
            print(f"{job['folder_id']} -> {job['output_path']}", flush=True)
            print(f"  accent={job['accent']}", flush=True)
            for request in job["requests"]:
                print(f"  {request}", flush=True)
        print(f"\nGenerated: 0", flush=True)
        print(f"Skipped: {skipped}", flush=True)
        return

    quality_args = resolve_quality_args(args.quality, args.jpg_quality)
    print(
        f"Starting generation for {len(jobs)} folder(s) "
        f"with parallelism={args.parallelism}, quality={quality_args['quality']}, size={args.size}, "
        f"preferred_language={args.preferred_language}.",
        flush=True,
    )
    for job in jobs:
        print_job_preview(job)

    completed = 0
    with concurrent.futures.ThreadPoolExecutor(max_workers=args.parallelism) as executor:
        future_map = {
            executor.submit(
                run_job,
                job,
                args.api_key,
                args.fanart_key,
                args.preferred_language,
                focus_x,
                focus_y,
                args.count,
                args.size,
                quality_args["quality"],
                quality_args["jpg_quality"],
            ): job
            for job in jobs
        }
        for future in concurrent.futures.as_completed(future_map):
            job = future_map[future]
            completed += 1
            print(f"\n[{completed}/{len(jobs)}] Finished {job['folder_id']} -> {job['output_path']}", flush=True)
            try:
                log_output = future.result()
                if log_output.strip():
                    print(log_output, end="" if log_output.endswith("\n") else "\n", flush=True)
                generated += 1
            except Exception as exc:
                failures.append((job["folder_id"], str(exc)))
                print(f"Failed {job['folder_id']}: {exc}", flush=True)

    print(f"\nGenerated: {generated}", flush=True)
    print(f"Skipped: {skipped}", flush=True)
    if failures:
        print(f"Failed: {len(failures)}", flush=True)
        for folder_id, message in failures:
            print(f"  {folder_id}: {message}", flush=True)
        sys.exit(1)


if __name__ == "__main__":
    main()
