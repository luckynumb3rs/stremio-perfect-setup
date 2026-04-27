#!/usr/bin/env python3
"""
Purge jsDelivr cache entries for collection backdrops.

This script discovers current backdrop assets from the repo layout and also
includes deleted or renamed backdrop paths from the current git diff so stale
CDN entries can be invalidated when folders are removed.
"""

import argparse
import shutil
import subprocess
import sys
from pathlib import Path
from urllib.error import HTTPError, URLError
from urllib.request import urlopen


SCRIPT_DIR = Path(__file__).resolve().parent
REPO_ROOT = SCRIPT_DIR.parent.parent
DEFAULT_COLLECTIONS_ROOT = REPO_ROOT / "collections"
DEFAULT_REPO_SLUG = "luckynumb3rs/stremio-perfect-setup"
PURGE_BASE = "https://purge.jsdelivr.net/gh"


def cleanup_pycache():
    """Remove the local __pycache__ folder if one was created."""
    shutil.rmtree(SCRIPT_DIR / "__pycache__", ignore_errors=True)


def iter_current_backdrops(collections_root):
    for path in sorted(collections_root.glob("*/backdrop/*")):
        if path.is_file():
            yield path.relative_to(REPO_ROOT).as_posix()


def git_changed_backdrops():
    command = [
        "git",
        "diff",
        "--name-status",
        "--find-renames",
        "--",
        "collections/*/backdrop/*",
    ]
    result = subprocess.run(
        command,
        cwd=REPO_ROOT,
        text=True,
        capture_output=True,
        check=False,
    )
    if result.returncode != 0:
        raise RuntimeError((result.stdout + result.stderr).strip() or "git diff failed")

    paths = set()
    for raw_line in result.stdout.splitlines():
        line = raw_line.strip()
        if not line:
            continue

        parts = line.split("\t")
        status = parts[0]
        code = status[0]

        if code == "R" and len(parts) >= 3:
            paths.add(parts[1])
            paths.add(parts[2])
        elif code in {"A", "M", "D"} and len(parts) >= 2:
            paths.add(parts[1])

    return paths


def build_purge_urls(repo_slug, collections_root, include_git_changes):
    paths = set(iter_current_backdrops(collections_root))
    if include_git_changes:
        paths.update(git_changed_backdrops())
    return [f"{PURGE_BASE}/{repo_slug}/{path}" for path in sorted(paths)]


def purge_url(url, timeout):
    with urlopen(url, timeout=timeout) as response:
        return response.status


def main():
    parser = argparse.ArgumentParser(description="Purge jsDelivr cache for collection backdrops.")
    parser.add_argument(
        "--repo",
        default=DEFAULT_REPO_SLUG,
        help="GitHub repo slug used in jsDelivr URLs, like owner/repo",
    )
    parser.add_argument(
        "--collections-root",
        default=str(DEFAULT_COLLECTIONS_ROOT),
        help="Collections root containing <group>/backdrop/* assets",
    )
    parser.add_argument(
        "--no-git-changes",
        action="store_true",
        help="Skip deleted or renamed backdrop paths discovered from git diff",
    )
    parser.add_argument(
        "--timeout",
        type=float,
        default=20.0,
        help="Per-request timeout in seconds",
    )
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="Print purge URLs without making requests",
    )
    args = parser.parse_args()

    urls = build_purge_urls(
        repo_slug=args.repo,
        collections_root=Path(args.collections_root),
        include_git_changes=not args.no_git_changes,
    )
    if not urls:
        print("No backdrop URLs found to purge.")
        return 0

    for url in urls:
        print(url)
        if args.dry_run:
            continue
        try:
            status = purge_url(url, timeout=args.timeout)
        except (HTTPError, URLError) as exc:
            print(f"Failed to purge {url}: {exc}", file=sys.stderr)
            return 1
        print(f"status={status}")

    return 0


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    finally:
        cleanup_pycache()
