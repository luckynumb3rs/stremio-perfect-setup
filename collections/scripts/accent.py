#!/usr/bin/env python3
"""
Derive one accent color from a collection cover image.

Purpose:
    This script scans a single cover image and returns one RGB accent color
    that can be passed into `backdrop.py`. It is intended to be called by
    `backdrops.py` for each folder at generation time.

Important parameters:
    --image
        Path to the cover image to scan.
    --fallback-label
        Optional label used to generate a deterministic fallback color if the
        image is missing or cannot be scanned.
    --format
        Output format for the derived accent. Supports `csv`, `tuple`, and
        `json`. Default is `csv`.

Examples:
    python3 -B accent.py --image collections/streaming/cover/netflix.png
    python3 -B accent.py --image collections/themes/cover/space.jpg --format tuple
    python3 -B accent.py --fallback-label "New Folder"
"""

import argparse
import colorsys
import json
import shutil
from pathlib import Path

from PIL import Image

SCRIPT_DIR = Path(__file__).resolve().parent


def cleanup_pycache():
    """Remove the local __pycache__ folder if one was created."""
    shutil.rmtree(SCRIPT_DIR / "__pycache__", ignore_errors=True)


def default_accent_for_label(label):
    seed = sum((index + 1) * ord(char) for index, char in enumerate(label or "Backdrop"))
    hue = (seed % 360) / 360.0
    red, green, blue = colorsys.hsv_to_rgb(hue, 0.65, 0.88)
    return (int(red * 255), int(green * 255), int(blue * 255))


def scan_cover_color(path):
    """Pick a usable accent from the cover image, avoiding neutral extremes."""
    image = Image.open(path).convert("RGBA")
    image.thumbnail((200, 200))
    scored = []
    pixels = image.load()
    for y_pos in range(image.height):
        for x_pos in range(image.width):
            red, green, blue, alpha = pixels[x_pos, y_pos]
            if alpha < 16:
                continue
            _, light, sat = colorsys.rgb_to_hls(red / 255, green / 255, blue / 255)
            score = sat * (1 - abs(light - 0.55))
            if light < 0.12 or light > 0.9:
                score *= 0.2
            if sat < 0.12:
                score *= 0.2
            scored.append((score, (red, green, blue)))

    if not scored:
        raise ValueError(f"No usable pixels found in {path}.")

    scored.sort(reverse=True)
    top = [rgb for _, rgb in scored[:max(1, len(scored) // 20)]]
    red = round(sum(color[0] for color in top) / len(top))
    green = round(sum(color[1] for color in top) / len(top))
    blue = round(sum(color[2] for color in top) / len(top))

    hue, light, sat = colorsys.rgb_to_hls(red / 255, green / 255, blue / 255)
    light = min(0.72, max(0.42, light))
    sat = min(0.75, max(0.45, sat))
    norm_red, norm_green, norm_blue = colorsys.hls_to_rgb(hue, light, sat)
    return tuple(round(value * 255) for value in (norm_red, norm_green, norm_blue))


def resolve_accent(image_path=None, fallback_label=None):
    if image_path:
        path = Path(image_path)
        if path.is_file():
            try:
                return scan_cover_color(path)
            except Exception:
                pass
    return default_accent_for_label(fallback_label)


def format_color(color, output_format):
    if output_format == "tuple":
        return str(color)
    if output_format == "json":
        return json.dumps({"r": color[0], "g": color[1], "b": color[2]})
    return f"{color[0]},{color[1]},{color[2]}"


def main():
    parser = argparse.ArgumentParser(description="Derive one accent color from a collection cover image.")
    parser.add_argument("--image", default=None, help="Cover image path to scan")
    parser.add_argument("--fallback-label", default="Backdrop", help="Fallback label used if no image is available")
    parser.add_argument("--format", choices=("csv", "tuple", "json"), default="csv", help="Output format")
    args = parser.parse_args()

    color = resolve_accent(image_path=args.image, fallback_label=args.fallback_label)
    print(format_color(color, args.format))


if __name__ == "__main__":
    try:
        main()
    finally:
        cleanup_pycache()
