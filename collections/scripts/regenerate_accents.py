#!/usr/bin/env python3
"""
Regenerate the `ACCENT_PRESETS` map from the current collection cover artwork.

Purpose:
    This helper script rescans the cover artwork in `collections/<group>/cover/*`
    and rebuilds the `ACCENT_PRESETS` mapping used by `generate_backdrops.py`.
    Use it when cover images change and you want the wrapper's accent presets to
    stay aligned with the artwork.

Important parameters:
    --collections-root
        Collections root containing the `<group>/cover/*` files to scan.
    --format
        Output format when printing or writing the generated map. Supports
        `python` and `json`.
    --write
        Optional output file path for the generated map text.
    --write-wrapper
        Optional wrapper file path to update in place by replacing its
        `ACCENT_PRESETS` block.
    --missing-only
        When updating the wrapper, only add accents for folder ids that are not
        already present in the existing `ACCENT_PRESETS` map.

Examples:
    python3 -B regenerate_accents.py
    python3 -B regenerate_accents.py --format json
    python3 -B regenerate_accents.py --write /tmp/accent_map.py
    python3 -B regenerate_accents.py --missing-only --write-wrapper collections/scripts/generate_backdrops.py
    python3 -B regenerate_accents.py --write-wrapper collections/scripts/generate_backdrops.py
"""

import argparse
import colorsys
import json
from pathlib import Path

from PIL import Image

SCRIPT_DIR = Path(__file__).resolve().parent
REPO_ROOT = SCRIPT_DIR.parent.parent
DEFAULT_COLLECTIONS_ROOT = REPO_ROOT / "collections"
DEFAULT_WRAPPER = SCRIPT_DIR / "generate_backdrops.py"


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
            hue, light, sat = colorsys.rgb_to_hls(red / 255, green / 255, blue / 255)
            score = sat * (1 - abs(light - 0.55))
            if light < 0.12 or light > 0.9:
                score *= 0.2
            if sat < 0.12:
                score *= 0.2
            scored.append((score, (red, green, blue)))

    if not scored:
        return (128, 128, 128)

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


def build_accent_map(collections_root):
    """Build a full accent map by scanning every cover image under collections root."""
    accent_map = {}
    for path in sorted(collections_root.glob("*/cover/*")):
        group = path.parts[-3]
        slug = path.stem
        accent_map[f"collections.{group}.{slug}"] = scan_cover_color(path)
    return accent_map


def python_map_text(accent_map):
    lines = ["ACCENT_PRESETS = {"]
    for folder_id, color in accent_map.items():
        lines.append(f'    "{folder_id}": {color},')
    lines.append("}")
    return "\n".join(lines) + "\n"


def read_wrapper_accent_map(wrapper_path):
    """Read the current ACCENT_PRESETS block from the wrapper as a Python dict."""
    content = wrapper_path.read_text(encoding="utf-8")
    start_token = "ACCENT_PRESETS = {\n"
    start_index = content.find(start_token)
    def_index = content.find("\ndef load_json", start_index)
    if start_index == -1 or def_index == -1:
        raise ValueError(f"Could not find ACCENT_PRESETS block in {wrapper_path}.")
    block = content[start_index:def_index].strip()
    namespace = {}
    exec(block, {}, namespace)
    return dict(namespace["ACCENT_PRESETS"])


def write_wrapper(wrapper_path, accent_map, missing_only=False):
    """Replace the ACCENT_PRESETS block inside the wrapper script."""
    content = wrapper_path.read_text(encoding="utf-8")
    start_token = "ACCENT_PRESETS = {\n"
    start_index = content.find(start_token)
    def_index = content.find("\ndef load_json", start_index)
    if start_index == -1 or def_index == -1:
        raise ValueError(f"Could not find ACCENT_PRESETS block in {wrapper_path}.")
    if missing_only:
        current_map = read_wrapper_accent_map(wrapper_path)
        merged_map = dict(current_map)
        for folder_id, color in accent_map.items():
            if folder_id not in merged_map:
                merged_map[folder_id] = color
        accent_map = merged_map
    replacement = python_map_text(accent_map).rstrip("\n") + "\n\n"
    updated = content[:start_index] + replacement + content[def_index + 1:]
    wrapper_path.write_text(updated, encoding="utf-8")


def main():
    parser = argparse.ArgumentParser(description="Regenerate collection accent presets from cover images.")
    parser.add_argument("--collections-root", default=str(DEFAULT_COLLECTIONS_ROOT), help="Collections root containing `<group>/cover/*` images")
    parser.add_argument("--format", choices=("python", "json"), default="python", help="Output format when printing the map")
    parser.add_argument("--write", default=None, help="Optional file path to write the generated map text")
    parser.add_argument("--write-wrapper", default=None, help="Optional wrapper file to update in place with the regenerated ACCENT_PRESETS block")
    parser.add_argument("--missing-only", action="store_true", help="When updating the wrapper, only add missing folder ids and keep existing accent values unchanged")
    args = parser.parse_args()

    accent_map = build_accent_map(Path(args.collections_root))
    output = python_map_text(accent_map) if args.format == "python" else json.dumps(accent_map, indent=2) + "\n"

    if args.write:
        Path(args.write).write_text(output, encoding="utf-8")
    else:
        print(output, end="")

    if args.write_wrapper:
        write_wrapper(Path(args.write_wrapper), accent_map, missing_only=args.missing_only)


if __name__ == "__main__":
    main()
