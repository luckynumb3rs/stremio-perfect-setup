#!/usr/bin/env python3
"""
Generate collection backdrops for folders defined in collections/nuvio-collections.json.

Purpose:
    This is the wrapper entry point most users should run. It:
    1. reads the folder definitions from `nuvio-collections.json`
    2. resolves the underlying TMDB catalog filters from `AIOMetadata-Catalogs.json`
    3. merges all catalogs assigned to the same folder into one backdrop job
    4. scans the matching folder cover image to derive one accent color
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
    --cover-root
        Collections root containing the `<group>/cover/<folder>.*` images used
        to derive runtime accent colors.
    --collections-file
        Path to the `nuvio-collections.json` file to read folder definitions
        from.
    --catalogs-file
        Path to the `AIOMetadata-Catalogs.json` file used to resolve TMDB
        discover filters.
    --output-root
        Collections root where generated files are written in the existing
        layout: `<group>/backdrop/<folder>.jpg`.
    --catalog
        Optional folder selector in shorthand `group/slug` form, for example
        `genres/k-drama` or `discover/popular`. Repeat this flag to target
        multiple folders.
    --folder-id
        Optional folder filter. Repeat this flag to generate only selected
        folders. This is the fully qualified form such as
        `collections.genres.k-drama`.
    --missing-only
        Only generate missing backdrop output file(s). For `--size both`, if
        one size already exists and the other is missing, only the missing
        size is generated.
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
    --grouped-logs
        Buffer each folder job's output and print it as one block after that
        job finishes, instead of streaming live lines during execution.
    --dry-run
        Print the resolved folder jobs, cover paths, derived accents, and TMDB requests
        without generating images.

Examples:
    python3 -B generate_backdrops.py \
      --api-key YOUR_TMDB_KEY \
      --fanart-key YOUR_FANART_KEY

    python3 -B generate_backdrops.py \
      --api-key YOUR_TMDB_KEY \
      --fanart-key YOUR_FANART_KEY \
      --catalog genres/k-drama \
      --size 4k

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
      --fanart-key YOUR_FANART_KEY \
      --missing-only

    python3 -B generate_backdrops.py \
      --api-key YOUR_TMDB_KEY \
      --fanart-key YOUR_FANART_KEY \
      --grouped-logs

    python3 -B generate_backdrops.py \
      --api-key YOUR_TMDB_KEY \
      --dry-run
"""

import argparse
import concurrent.futures
import json
import re
import shutil
import subprocess
import sys
import threading
from pathlib import Path
from urllib.parse import urlencode

from backdrop import parse_focus_value, resolve_outputs

SCRIPT_DIR = Path(__file__).resolve().parent
REPO_ROOT = SCRIPT_DIR.parent.parent
DEFAULT_COLLECTIONS_FILE = REPO_ROOT / "collections" / "nuvio-collections.json"
DEFAULT_CATALOGS_FILE = REPO_ROOT / "templates" / "AIOMetadata-Catalogs.json"
DEFAULT_OUTPUT_ROOT = SCRIPT_DIR.parent
DEFAULT_COVER_ROOT = SCRIPT_DIR.parent
PRINT_LOCK = threading.Lock()
ANSI_RESET = "\033[0m"
ANSI_GREEN = "\033[32m"
ANSI_RED = "\033[31m"
JOB_COLORS = (
    "\033[36m",
    "\033[35m",
    "\033[34m",
    "\033[33m",
    "\033[96m",
    "\033[95m",
)
GROUPED_PROGRESS_RE = re.compile(r"^\s*\[\d+/\d+\]\s+")


def cleanup_pycache():
    """Remove the local __pycache__ folder if one was created."""
    shutil.rmtree(SCRIPT_DIR / "__pycache__", ignore_errors=True)


def supports_color():
    return sys.stdout.isatty()


def colorize(text, color):
    if not text or not color or not supports_color():
        return text
    return f"{color}{text}{ANSI_RESET}"


def print_locked(message="", end="\n", flush=True, color=None):
    """Print one complete message atomically so parallel jobs do not interleave characters."""
    with PRINT_LOCK:
        print(colorize(message, color), end=end, flush=flush)


def job_log_prefix(job):
    """Return a compact stable prefix for log lines emitted by one folder job."""
    group, slug = parse_folder_key(job["folder_id"])
    return f"[{group}/{slug}]"


def job_color(job):
    return JOB_COLORS[hash(job["folder_id"]) % len(JOB_COLORS)]


def print_job_line(job, message):
    """Print one prefixed log line for a specific folder job."""
    prefix = job_log_prefix(job)
    if message:
        print_locked(f"{prefix} {message}", color=job_color(job))
    else:
        print_locked(prefix, color=job_color(job))


def print_overall_line(message):
    """Print a wrapper-level status line in green."""
    print_locked(message, color=ANSI_GREEN)


def print_failure_line(message):
    """Print a failure line in red."""
    print_locked(message, color=ANSI_RED)

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
    "collections.discover.trakt": [
        "movie:/movie/popular?language=en-US",
        "tv:/tv/popular?language=en-US",
    ],
    "collections.genres.anime": [
        "movie:sort_by=popularity.desc&include_adult=false&with_genres=16&with_original_language=ja&vote_count.gte=20&with_release_type=4|5|6",
        "tv:sort_by=popularity.desc&include_adult=false&with_genres=16&with_original_language=ja&vote_count.gte=10&with_status=0|3|4|5",
    ],
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


def find_cover_path(cover_root, group, slug):
    """Find the cover image for a folder using the repo's existing layout."""
    candidates = sorted((Path(cover_root) / group / "cover").glob(f"{slug}.*"))
    return candidates[0] if candidates else None


def should_process(folder_id, allowed_ids):
    if not allowed_ids:
        return True
    return folder_id in allowed_ids


def normalize_catalog_selector(value):
    """Accept `group/slug` shorthand and normalize it to the internal folder id."""
    raw = (value or "").strip().strip("/")
    if not raw:
        raise ValueError("Catalog selector cannot be empty.")
    if raw.startswith("collections."):
        parse_folder_key(raw)
        return raw

    parts = [part.strip() for part in raw.split("/") if part.strip()]
    if len(parts) != 2:
        raise ValueError(
            f"Invalid catalog selector '{value}'. Use 'group/slug', for example 'genres/k-drama'."
        )
    return f"collections.{parts[0]}.{parts[1]}"


def resolve_quality_args(quality, jpg_quality):
    """Convert wrapper quality options into the kwargs expected by backdrop.py."""
    return {
        "quality": quality,
        "jpg_quality": jpg_quality,
    }


def build_jobs(collections_data, catalog_index, output_root, cover_root, allowed_ids, size):
    """Precompute all folder jobs before generation starts."""
    jobs = []
    for collection in collections_data:
        for folder in collection.get("folders", []):
            folder_id = folder["id"]
            if not should_process(folder_id, allowed_ids):
                continue

            group, slug = parse_folder_key(folder_id)
            output_path = Path(output_root) / group / "backdrop" / f"{slug}.jpg"
            jobs.append({
                "folder_id": folder_id,
                "label": folder["title"],
                "output_path": output_path,
                "expected_outputs": resolve_outputs(output=output_path, size=size),
                "cover_path": find_cover_path(cover_root, group, slug),
                "requests": folder_tmdb_requests(folder, catalog_index),
            })
    return jobs


def missing_output_sizes(job):
    """Return the list of output size keys that are missing for this job."""
    return [size for size, path in job["expected_outputs"].items() if not path.exists()]


def run_accent(job):
    """Call accent.py to derive the accent for one folder from its cover image."""
    command = [
        "python3",
        "-B",
        str(SCRIPT_DIR / "accent.py"),
        "--fallback-label", job["label"],
        "--format", "csv",
    ]
    if job["cover_path"] is not None:
        command.extend(["--image", str(job["cover_path"])])

    result = subprocess.run(
        command,
        cwd=REPO_ROOT,
        text=True,
        capture_output=True,
        check=False,
    )
    if result.returncode != 0:
        raise RuntimeError((result.stdout + result.stderr).strip() or f"accent.py exited with {result.returncode}")

    parts = [part.strip() for part in result.stdout.strip().split(",")]
    if len(parts) != 3:
        raise RuntimeError(f"Unexpected accent.py output: {result.stdout!r}")
    return tuple(int(part) for part in parts)


def run_job(job, api_key, fanart_key, preferred_language, focus_x, focus_y, count, size, quality, jpg_quality, stream_output):
    """Run one folder job and optionally stream child output while still capturing it."""
    accent = run_accent(job)
    command = [
        "python3",
        "-u",
        "-B",
        str(SCRIPT_DIR / "backdrop.py"),
        "--api-key", api_key,
        "--label", job["label"],
        "--accent-color", ",".join(str(value) for value in accent),
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

    process = subprocess.Popen(
        command,
        cwd=REPO_ROOT,
        text=True,
        stdout=subprocess.PIPE,
        stderr=subprocess.STDOUT,
        bufsize=1,
    )
    output_lines = []
    assert process.stdout is not None
    for line in process.stdout:
        output_lines.append(line)
        if stream_output:
            text = line.rstrip("\n")
            if text:
                print_job_line(job, text)
            else:
                print_locked()
    return_code = process.wait()
    output = "".join(output_lines)
    if return_code != 0:
        raise RuntimeError(output.strip() or f"backdrop.py exited with {return_code}")
    return output


def print_grouped_job_output(job, output):
    """Print one completed job log block using that job's color, without per-item progress spam."""
    if not output.strip():
        return
    for line in output.splitlines():
        if GROUPED_PROGRESS_RE.match(line):
            continue
        print_locked(line, color=job_color(job))


def print_job_preview(job):
    """Print a short one-line summary before a folder job starts."""
    print_job_line(
        job,
        f"Queued -> {job['output_path']} "
        f"({len(job['requests'])} request{'s' if len(job['requests']) != 1 else ''}, "
        f"cover={job['cover_path'] or 'fallback-label'})",
    )


def main():
    parser = argparse.ArgumentParser(description="Generate collection backdrops from collection and TMDB catalog JSON files.")
    parser.add_argument("--api-key", required=False, help="TMDB API key")
    parser.add_argument("--fanart-key", required=False, default=None, help="Fanart.tv API key")
    parser.add_argument("--preferred-language", default="en", help="Preferred Fanart artwork language code. Default: en")
    parser.add_argument("--cover-root", default=str(DEFAULT_COVER_ROOT), help="Collections root containing `<group>/cover/<folder>.*` images for runtime accent scanning")
    parser.add_argument("--collections-file", default=str(DEFAULT_COLLECTIONS_FILE), help="Path to nuvio-collections.json")
    parser.add_argument("--catalogs-file", default=str(DEFAULT_CATALOGS_FILE), help="Path to AIOMetadata-Catalogs.json")
    parser.add_argument("--output-root", default=str(DEFAULT_OUTPUT_ROOT), help="Root collections folder where `<group>/backdrop/<folder>.jpg` files are written")
    parser.add_argument("--catalog", action="append", default=[], help="Only generate for the matching folder shorthand(s), like `genres/k-drama` or `discover/popular`. Repeat this flag to target multiple folders.")
    parser.add_argument("--folder-id", action="append", default=[], help="Only generate for the matching folder id(s). Repeat this flag to target multiple folders.")
    parser.add_argument("--missing-only", action="store_true", help="Only generate missing backdrop output file(s). For `--size both`, existing sizes are skipped and only missing ones are rendered.")
    parser.add_argument("--focus", default="center-right", help="Focus preset or x,y values passed to backdrop.py")
    parser.add_argument("--count", type=int, default=60, help="Max source titles to use per backdrop after the folder's catalogs are merged")
    parser.add_argument("--size", choices=("4k", "1080p", "both"), default="4k", help="Rendered output size(s)")
    parser.add_argument("--quality", choices=("compressed", "high"), default="compressed", help="Named JPEG output profile. Default is compressed.")
    parser.add_argument("--jpg-quality", type=int, default=None, help="Advanced override for JPEG quality from 1-95. If set, it overrides --quality.")
    parser.add_argument("--parallelism", type=int, default=3, help="How many folders to generate at once. Keep this low to avoid TMDB rate limits.")
    parser.add_argument("--grouped-logs", action="store_true", help="Buffer each folder job log and print it after completion instead of streaming live output.")
    parser.add_argument("--dry-run", action="store_true", help="Print the resolved accent and TMDB requests without generating images")
    args = parser.parse_args()

    if not args.api_key:
        print("Error: --api-key is required.")
        sys.exit(1)

    collections_data = load_json(Path(args.collections_file))
    catalog_index = build_catalog_index(load_json(Path(args.catalogs_file)))
    try:
        selected_ids = set(args.folder_id)
        selected_ids.update(normalize_catalog_selector(value) for value in args.catalog)
    except ValueError as exc:
        print(f"Error: {exc}")
        sys.exit(1)
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
    jobs = build_jobs(collections_data, catalog_index, args.output_root, args.cover_root, selected_ids, args.size)
    print_overall_line(f"Resolved {len(jobs)} folder job(s) from collections config.")

    for job in jobs:
        if not job["requests"]:
            skipped += 1
            print_job_line(job, "Skipping: no TMDB-backed catalog sources resolved.")

    jobs = [job for job in jobs if job["requests"]]

    if args.missing_only:
        filtered_jobs = []
        for job in jobs:
            missing_sizes = missing_output_sizes(job)
            if not missing_sizes:
                skipped += 1
                existing = ", ".join(str(path) for path in job["expected_outputs"].values())
                print_job_line(job, f"Skipping: expected output already exists ({existing}).")
                continue

            if args.size == "both":
                if len(missing_sizes) == 1:
                    requested_size = missing_sizes[0]
                    print_job_line(
                        job,
                        f"Partial generate: only missing {requested_size} "
                        f"({job['expected_outputs'][requested_size]}).",
                    )
                else:
                    requested_size = "both"
            else:
                requested_size = args.size

            filtered_jobs.append({**job, "requested_size": requested_size})
        jobs = filtered_jobs
    else:
        jobs = [{**job, "requested_size": args.size} for job in jobs]

    if args.dry_run:
        for job in jobs:
            accent = run_accent(job)
            print_job_line(job, f"Output -> {job['output_path']}")
            print_job_line(job, f"cover={job['cover_path'] or 'fallback-label'}")
            print_job_line(job, f"accent={accent}")
            print_job_line(job, f"outputs={', '.join(str(path) for path in job['expected_outputs'].values())}")
            print_job_line(job, f"requested_size={job['requested_size']}")
            for request in job["requests"]:
                print_job_line(job, request)
        print_locked()
        print_overall_line("Generated: 0")
        print_overall_line(f"Skipped: {skipped}")
        return

    quality_args = resolve_quality_args(args.quality, args.jpg_quality)
    print_overall_line(
        f"Starting generation for {len(jobs)} folder(s) "
        f"with parallelism={args.parallelism}, quality={quality_args['quality']}, size={args.size}, "
        f"preferred_language={args.preferred_language}."
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
                job["requested_size"],
                quality_args["quality"],
                quality_args["jpg_quality"],
                not args.grouped_logs,
            ): job
            for job in jobs
        }
        for future in concurrent.futures.as_completed(future_map):
            job = future_map[future]
            completed += 1
            print_locked()
            print_overall_line(f"[{completed}/{len(jobs)}] Finished {job['folder_id']} -> {job['output_path']}")
            try:
                log_output = future.result()
                if args.grouped_logs:
                    print_grouped_job_output(job, log_output)
                generated += 1
            except Exception as exc:
                failures.append((job["folder_id"], str(exc)))
                print_failure_line(f"Failed {job['folder_id']}: {exc}")

    print_locked()
    print_overall_line(f"Generated: {generated}")
    print_overall_line(f"Skipped: {skipped}")
    if failures:
        print_failure_line(f"Failed: {len(failures)}")
        for folder_id, message in failures:
            print_failure_line(f"  {folder_id}: {message}")
        sys.exit(1)


if __name__ == "__main__":
    try:
        main()
    finally:
        cleanup_pycache()
