#!/usr/bin/env python3
"""
Network Streaming Originals Wallpaper Generator
Generates Apple TV+ style tilted poster grids for any streaming network.
Outputs: 4K (3840x2160) and 1080p (1920x1080)

Usage:
    python3 network_wallpaper3.py --network netflix --api-key YOUR_TMDB_KEY --fanart-key YOUR_FANART_KEY
    python3 network_wallpaper3.py --network hbo --api-key YOUR_TMDB_KEY --fanart-key YOUR_FANART_KEY
    python3 network_wallpaper3.py --list-networks
"""

import argparse
import math
import os
import sys
import time
import io
from pathlib import Path

import requests
from PIL import Image, ImageDraw, ImageFilter

DEFAULT_OUTPUT_DIR = Path(__file__).resolve().parent / "output"

# ─────────────────────────────────────────────
#  TMDB Network / Provider IDs
# ─────────────────────────────────────────────
NETWORKS = {
    # ── Streaming Services ────────────────────────────────────────────────────
    # key           : (label,            tmdb_network_id, watch_provider_id, accent_color, tmdb_company_id)
    "netflix"       : ("Netflix",          213,  8,    (229, 9,   20),  None),
    "appletv"       : ("Apple TV+",        2552, 350,  (255, 255, 255), None),
    "hbo"           : ("HBO / Max",        49,   384,  (110, 60,  220), None),
    "disney"        : ("Disney+",          2739, 337,  (17,  60,  207), None),
    "amazon"        : ("Amazon Prime",     1024, 9,    (0,   168, 225), None),
    "paramount"     : ("Paramount+",       4330, 531,  (0,   103, 201), None),
    "hulu"          : ("Hulu",             453,  15,   (28,  231, 131), None),
    "peacock"       : ("Peacock",          3353, 386,  (0,   120, 200), None),
    "crunchyroll"   : ("Crunchyroll",      None, 283,  (244, 117, 33),  198847),
    "discoveryplus" : ("discovery+",       None, 520,  (18,  173, 229), 225743),
    "curiosity"     : ("CuriosityStream",  None, 190,  (46,  95,  205), 96320),

    # ── Premium Cable ─────────────────────────────────────────────────────────
    "showtime"      : ("Showtime",         67,   37,   (200, 30,  30),  None),
    "starz"         : ("STARZ",            318,  43,   (0,   0,   0),   None),
    "mgmplus"       : ("MGM+",             6219, 686,  (20,  20,  140), None),

    # ── Broadcast Networks ────────────────────────────────────────────────────
    "nbc"           : ("NBC",              6,    None, (55,  130, 215), None),
    "cbs"           : ("CBS",              16,   None, (0,   50,  160), None),
    "fox"           : ("FOX",              19,   None, (255, 200, 0),   None),
    "abc"           : ("ABC",              2,    None, (0,   120, 210), None),
    "thecw"         : ("The CW",           71,   None, (20,  20,  20),  None),

    # ── Cable Networks ────────────────────────────────────────────────────────
    "fx"            : ("FX",               88,   None, (0,   0,   0),   None),
    "amc"           : ("AMC",              174,  None, (180, 40,  40),  None),
    "amcplus"       : ("AMC+",             4760, 526,  (140, 20,  20),  None),
    "usa"           : ("USA Network",      30,   None, (0,   40,  130), None),

    # ── Horror / Genre ────────────────────────────────────────────────────────
    "shudder"       : ("Shudder",          2949, 99,   (180, 0,   0),   None),

    # ── International / Streaming ─────────────────────────────────────────────
    "bbciplayer"    : ("BBC iPlayer",      1155, 151,  (255, 50,  0),   None),
}

TMDB_BASE      = "https://api.themoviedb.org/3"
TMDB_IMG_BASE  = "https://image.tmdb.org/t/p"
BACKDROP_SIZE  = "w1280"   # TMDB backdrop size (fallback only)
POSTER_SIZE    = "w500"    # TMDB poster size (unused; kept for reference)

FANART_BASE    = "https://webservice.fanart.tv/v3"

# ─────────────────────────────────────────────
#  Canvas / layout constants
# ─────────────────────────────────────────────
CARD_RADIUS = 9         # rounded-corner radius at 1080p scale (scales with tile size)

TILT_DEG  = 10           # degrees of rotation (+positive = top-left corner rises)
TILE_W    = 372          # poster tile width  (before tilt)  at 1080p scale
TILE_H    = 210          # poster tile height (16:9 landscape)
GAP       = 9            # gap between tiles
ROWS      = 10           # visible tile rows
COLS      = 10            # tiles per row (extra for bleed)
STAGGER   = 0.5          # row offset as fraction of (TILE_W + GAP) — 0.5 = half tile
NEEDED    = ROWS * COLS  # posters needed; we'll fetch 60 to have headroom

# ── Grid focus / placement ────────────────────────────────────────────────────
# Controls which part of the oversized rotated grid sits at the canvas centre.
# Both values are 0.0–1.0 fractions of the rotated grid's own dimensions.
#   0.0 = left / top edge of the grid    1.0 = right / bottom edge
#   0.5 = exact centre of the grid       (default, safe starting point)
#
# Because tiles are placed left→right, top→bottom, the top-rated titles
# always land in the upper-left region of the grid.  Shifting focus toward
# upper-right (FOCUS_X ↑, FOCUS_Y ↓) pulls those tiles into the visible area.
#
# Named presets (usable via --focus on the CLI):
#   "center"       → (0.50, 0.50)  balanced, no bias
#   "top-right"    → (0.72, 0.28)  top-rated tiles visible upper-right
#   "center-right" → (0.65, 0.45)  top-rated tiles near centre-right  ← recommended
#   "top-center"   → (0.52, 0.30)  top-rated tiles near top-centre
FOCUS_X = 0.5   # horizontal focus (0 = grid's left edge, 1 = grid's right edge)
FOCUS_Y = 0.53   # vertical   focus (0 = grid's top  edge, 1 = grid's bottom edge)

FOCUS_PRESETS = {
    "center"       : (0.50, 0.50),
    "top-right"    : (0.72, 0.28),
    "center-right" : (0.65, 0.45),
    "top-center"   : (0.52, 0.30),
}


# ─────────────────────────────────────────────
#  TMDB fetch helpers
# ─────────────────────────────────────────────

def tmdb_get(endpoint, params, api_key):
    params["api_key"] = api_key
    r = requests.get(f"{TMDB_BASE}{endpoint}", params=params, timeout=15)
    r.raise_for_status()
    return r.json()


def fetch_titles(network_key, api_key, count=60):
    """Fetch top-rated movies + TV shows for the given network."""
    cfg = NETWORKS[network_key]
    network_id   = cfg[1]
    provider_id  = cfg[2]  # may be None for broadcast networks
    company_id   = cfg[4]

    items = []

    # ── TV shows by original network ──
    tv_filters = {
        "sort_by": "popularity.desc",
        "language": "en-US",
    }
    if network_id is not None:
        tv_filters["with_networks"] = network_id
    elif company_id is not None:
        tv_filters["with_companies"] = company_id

    if "with_networks" in tv_filters or "with_companies" in tv_filters:
        for page in range(1, 4):
            data = tmdb_get("/discover/tv", {
                **tv_filters,
                "page": page,
            }, api_key)
            for item in data.get("results", []):
                if item.get("backdrop_path"):
                    items.append(("tv", item))
            if len(items) >= count:
                break

    # ── Movies by watch provider (only for streaming/cable services) ──
    if provider_id is not None and len(items) < count:
        for page in range(1, 4):
            data = tmdb_get("/discover/movie", {
                "with_watch_providers": provider_id,
                "watch_region": "US",
                "sort_by": "popularity.desc",
                "page": page,
                "language": "en-US",
            }, api_key)
            for item in data.get("results", []):
                if item.get("backdrop_path"):
                    items.append(("movie", item))
            if len(items) >= count:
                break

    # Deduplicate by id
    seen = set()
    unique = []
    for kind, item in items:
        if item["id"] not in seen:
            seen.add(item["id"])
            unique.append((kind, item))

    return unique[:count]


def get_tmdb_external_ids(kind, tmdb_id, api_key):
    """Fetch external IDs (including TVDB/IMDB) for a title — used to query Fanart."""
    endpoint = f"/{kind}/{tmdb_id}/external_ids"
    try:
        data = tmdb_get(endpoint, {}, api_key)
        return data
    except Exception:
        return {}


# ─────────────────────────────────────────────
#  Fanart.tv fetch helpers
# ─────────────────────────────────────────────

def fanart_get_tv(tvdb_id, fanart_key):
    """
    Fetch Fanart.tv metadata for a TV show by TVDB ID.
    Returns the parsed JSON or None on failure.
    """
    url = f"{FANART_BASE}/tv/{tvdb_id}"
    try:
        r = requests.get(url, params={"api_key": fanart_key}, timeout=15)
        r.raise_for_status()
        return r.json()
    except Exception:
        return None


def fanart_get_movie(tmdb_id, fanart_key):
    """
    Fetch Fanart.tv metadata for a movie by TMDB ID.
    Returns the parsed JSON or None on failure.
    """
    url = f"{FANART_BASE}/movies/{tmdb_id}"
    try:
        r = requests.get(url, params={"api_key": fanart_key}, timeout=15)
        r.raise_for_status()
        return r.json()
    except Exception:
        return None


def best_fanart_thumb_url(fanart_data, kind):
    """
    Pick the highest-liked thumb (16:9 with logo) from Fanart data.

    For TV  → prefers 'tvthumb'  (16:9 w/ logo), falls back to 'showbackground'
    For movies → prefers 'moviethumb' (16:9 w/ logo), falls back to 'moviebackground'

    Returns a URL string or None.
    """
    if not fanart_data:
        return None

    if kind == "tv":
        candidates = fanart_data.get("tvthumb") or fanart_data.get("showbackground") or []
    else:
        candidates = fanart_data.get("moviethumb") or fanart_data.get("moviebackground") or []

    if not candidates:
        return None

    # Sort by likes descending, pick the best
    best = sorted(candidates, key=lambda x: int(x.get("likes", 0)), reverse=True)[0]
    return best.get("url")


def download_image_url(url, retries=2):
    """Download an image from an arbitrary URL."""
    for attempt in range(retries + 1):
        try:
            r = requests.get(url, timeout=20)
            r.raise_for_status()
            return Image.open(io.BytesIO(r.content)).convert("RGBA")
        except Exception as e:
            if attempt == retries:
                print(f"  ⚠  Failed to download {url}: {e}")
                return None
            time.sleep(1)


def download_tmdb_backdrop(path, retries=2):
    """Download a TMDB backdrop by its path (fallback)."""
    url = f"{TMDB_IMG_BASE}/{BACKDROP_SIZE}{path}"
    return download_image_url(url, retries=retries)


def fetch_tile_image(kind, item, api_key, fanart_key):
    """
    Try to get the best Fanart.tv thumb (with logo) for this title.
    Falls back to the TMDB backdrop if Fanart has nothing useful.
    """
    tmdb_id = item["id"]
    fanart_url = None

    if fanart_key:
        if kind == "tv":
            # Fanart TV endpoint uses TVDB ID — fetch it from TMDB external IDs
            ext = get_tmdb_external_ids("tv", tmdb_id, api_key)
            tvdb_id = ext.get("tvdb_id")
            if tvdb_id:
                fanart_data = fanart_get_tv(tvdb_id, fanart_key)
                fanart_url = best_fanart_thumb_url(fanart_data, "tv")
        else:
            # Fanart movie endpoint uses TMDB ID directly
            fanart_data = fanart_get_movie(tmdb_id, fanart_key)
            fanart_url = best_fanart_thumb_url(fanart_data, "movie")

    if fanart_url:
        img = download_image_url(fanart_url)
        if img:
            return img

    # Fallback: TMDB backdrop
    return download_tmdb_backdrop(item["backdrop_path"])


# ─────────────────────────────────────────────
#  Compositing helpers
# ─────────────────────────────────────────────

def rounded_rect_mask(w, h, radius=CARD_RADIUS):
    mask = Image.new("L", (w, h), 0)
    d = ImageDraw.Draw(mask)
    d.rounded_rectangle([0, 0, w - 1, h - 1], radius=radius, fill=255)
    return mask


def make_tile(img, tw, th):
    """Resize/crop image to tile dimensions with rounded corners."""
    # Centre-crop to 16:9
    iw, ih = img.size
    target_ratio = tw / th
    current_ratio = iw / ih
    if current_ratio > target_ratio:
        new_w = int(ih * target_ratio)
        left = (iw - new_w) // 2
        img = img.crop((left, 0, left + new_w, ih))
    else:
        new_h = int(iw / target_ratio)
        top = (ih - new_h) // 2
        img = img.crop((0, top, iw, top + new_h))
    img = img.resize((tw, th), Image.LANCZOS)
    # Scale CARD_RADIUS proportionally to tile width
    scaled_radius = max(8, int(CARD_RADIUS * tw / TILE_W))
    mask = rounded_rect_mask(tw, th, radius=scaled_radius)
    result = Image.new("RGBA", (tw, th), (0, 0, 0, 0))
    result.paste(img, mask=mask)
    return result


def build_tilted_grid(tiles, canvas_w, canvas_h, scale=1.0, focus_x=None, focus_y=None):
    """
    Arrange tiles in a staggered (brick/staircase) grid, rotate it,
    and composite onto a dark background.

    focus_x / focus_y (0.0–1.0): which point of the rotated grid sits at the
    canvas centre.  Derived from FOCUS_X / FOCUS_Y when not passed explicitly.

    Tile seeding strategy: we compute which grid cell is closest to the focal
    point and fill outward from there, so the highest-ranked tiles (early in
    `tiles`) always land near the focus region.
    """
    fx = FOCUS_X if focus_x is None else focus_x
    fy = FOCUS_Y if focus_y is None else focus_y

    tw = int(TILE_W * scale)
    th = int(TILE_H * scale)
    gap = int(GAP * scale)

    cols = COLS + 3        # extra columns for bleed + stagger overhang
    rows = ROWS + 3        # extra rows for bleed

    needed = rows * cols
    tlist = (tiles * (needed // len(tiles) + 1))[:needed]

    stagger_px = int(STAGGER * (tw + gap))

    grid_w = cols * (tw + gap) + rows * stagger_px
    grid_h = rows * (th + gap)
    grid = Image.new("RGBA", (grid_w, grid_h), (0, 0, 0, 0))

    # ── Focal cell: the grid cell whose centre is closest to the focus point ──
    # The focus point in pre-rotation grid coordinates:
    focal_gx = fx * grid_w
    focal_gy = fy * grid_h

    # Estimate which (row, col) that maps to (ignoring stagger for simplicity)
    focal_row = max(0, min(rows - 1, int(focal_gy / (th + gap))))
    focal_col = max(0, min(cols - 1, int((focal_gx - focal_row * stagger_px) / (tw + gap))))

    # Build a list of (row, col) sorted by Manhattan distance from focal cell,
    # so we paint best tiles closest to the focal point first.
    all_cells = [(r, c) for r in range(rows) for c in range(cols)]
    all_cells.sort(key=lambda rc: abs(rc[0] - focal_row) + abs(rc[1] - focal_col))

    for idx, (row, col) in enumerate(all_cells):
        if idx >= len(tlist):
            break
        row_offset_x = row * stagger_px
        x = row_offset_x + col * (tw + gap)
        y = row * (th + gap)
        t = make_tile(tlist[idx], tw, th)
        grid.paste(t, (x, y), t)

    # Rotate the whole grid
    rotated = grid.rotate(TILT_DEG, expand=True, resample=Image.BICUBIC)
    rx, ry = rotated.size

    # ── Position the rotated grid so the focus point lands at canvas centre ──
    # The focus point in rotated-image space (rotation expands the bounding box):
    # We rotate the focus vector from grid-centre to focus point.
    angle_rad = math.radians(-TILT_DEG)   # PIL rotates CCW; negate for coord transform
    # Focus point relative to grid centre (pre-rotation)
    pre_cx = fx * grid_w - grid_w / 2
    pre_cy = fy * grid_h - grid_h / 2
    # Rotate that offset
    rot_cx =  pre_cx * math.cos(angle_rad) - pre_cy * math.sin(angle_rad)
    rot_cy =  pre_cx * math.sin(angle_rad) + pre_cy * math.cos(angle_rad)
    # The focus point in rotated image coords (rotated image is rx × ry)
    focus_in_rot_x = rx / 2 + rot_cx
    focus_in_rot_y = ry / 2 + rot_cy

    # Paste so that focus_in_rot lands at canvas centre
    canvas_cx = canvas_w / 2
    canvas_cy = canvas_h / 2
    paste_x = int(canvas_cx - focus_in_rot_x)
    paste_y = int(canvas_cy - focus_in_rot_y)

    canvas = Image.new("RGBA", (canvas_w, canvas_h), (10, 10, 12, 255))
    canvas.paste(rotated, (paste_x, paste_y), rotated)

    return canvas


def apply_gradient(canvas, accent):
    """
    Dark gradient: solid black at bottom-left, transparent at top-right.
    Built from three fast linear gradient passes composited together.
    """
    w, h = canvas.size

    def make_linear_gradient(w, h, direction):
        """
        direction: 'left' (dark on left), 'bottom' (dark on bottom),
                   'corner_bl' (dark at bottom-left, light at top-right)
        Returns an RGBA image with (0,0,0,alpha) pixels.
        """
        img = Image.new("RGBA", (w, h), (0, 0, 0, 0))
        pixels = img.load()

        if direction == 'left':
            for x in range(w):
                t = max(0.0, 1.0 - x / (w * 0.45))
                a = int(200 * t ** 1.6)
                if a:
                    col = (6, 6, 8, a)
                    for y in range(h):
                        pixels[x, y] = col

        elif direction == 'bottom':
            for y in range(h):
                t = max(0.0, (y - h * 0.50) / (h * 0.50))
                a = int(200 * t ** 1.4)
                if a:
                    row_col = (6, 6, 8, a)
                    for x in range(w):
                        pixels[x, y] = row_col

        elif direction == 'corner_bl':
            max_diag = math.hypot(w, h)
            for x in range(w):
                for y in range(h):
                    dist = math.hypot(x, h - y)
                    t = dist / max_diag
                    base = max(0.0, 1.0 - t / 0.60)
                    a = int(230 * base ** 2.2)
                    if a:
                        pixels[x, y] = (6, 6, 8, min(255, a))

        return img

    # 1. Fast left-edge band (column loop)
    left_grad = make_linear_gradient(w, h, 'left')
    # 2. Fast bottom-edge band (row loop)
    bot_grad  = make_linear_gradient(w, h, 'bottom')
    # 3. Corner gradient (pixel loop — but we subsample and scale up)
    #    Run at 1/4 res then scale up for speed
    sw, sh = w // 4, h // 4
    corner_small = make_linear_gradient(sw, sh, 'corner_bl')
    corner_grad  = corner_small.resize((w, h), Image.BILINEAR)

    # Composite all three onto canvas
    result = Image.alpha_composite(canvas,    corner_grad)
    result = Image.alpha_composite(result,    left_grad)
    result = Image.alpha_composite(result,    bot_grad)

    # Subtle accent colour hint at top-right
    ar, ag, ab = accent
    accent_overlay = Image.new("RGBA", (w, h), (0, 0, 0, 0))
    adraw = ImageDraw.Draw(accent_overlay)
    for i in range(20):
        t = i / 20
        radius = int(math.hypot(w, h) * (0.04 + 0.40 * t))
        alpha = int(12 * (1 - t) ** 2)
        if alpha:
            adraw.ellipse([w - radius, -radius, w + radius, radius],
                          fill=(ar, ag, ab, alpha))
    result = Image.alpha_composite(result, accent_overlay)

    return result


def save_output(canvas, path):
    final = canvas.convert("RGB")
    final.save(path, "JPEG", quality=95, optimize=True)
    size_mb = os.path.getsize(path) / 1_048_576
    print(f"  ✓  Saved {path}  ({final.size[0]}×{final.size[1]}, {size_mb:.1f} MB)")


# ─────────────────────────────────────────────
#  Main
# ─────────────────────────────────────────────

def list_networks():
    print("\nAvailable networks:")
    for key, cfg in NETWORKS.items():
        print(f"  --network {key:<14}  →  {cfg[0]}")
    print()


def main():
    parser = argparse.ArgumentParser(
        description="Generate Apple TV+-style streaming network wallpapers."
    )
    parser.add_argument("--api-key",    required=False, help="TMDB API key (v3)")
    parser.add_argument("--fanart-key", required=False, default=None,
                        help="Fanart.tv API key — enables logo thumbs for movies & TV")
    parser.add_argument("--network",    default="netflix",
                        help="Network to generate (default: netflix)")
    parser.add_argument("--list-networks", action="store_true",
                        help="Show available network keys and exit")
    parser.add_argument("--output-dir", default=str(DEFAULT_OUTPUT_DIR),
                        help="Directory to save output images (default: script output folder)")
    parser.add_argument("--focus", default=None,
                        help=(
                            "Where top-rated tiles are placed on the canvas. "
                            f"Named presets: {', '.join(FOCUS_PRESETS)}. "
                            "Or two floats: --focus 0.65,0.40  (x,y; 0=left/top 1=right/bottom). "
                            "Default: uses FOCUS_X/FOCUS_Y constants in the script."
                        ))
    args = parser.parse_args()

    if args.list_networks:
        list_networks()
        sys.exit(0)

    # ── Resolve focus ──
    focus_x, focus_y = FOCUS_X, FOCUS_Y
    if args.focus:
        if args.focus in FOCUS_PRESETS:
            focus_x, focus_y = FOCUS_PRESETS[args.focus]
        else:
            try:
                parts = args.focus.split(",")
                focus_x, focus_y = float(parts[0]), float(parts[1])
            except Exception:
                print(f"Invalid --focus value '{args.focus}'. "
                      f"Use a preset ({', '.join(FOCUS_PRESETS)}) or 'x,y' floats.")
                sys.exit(1)

    if not args.api_key:
        print("Error: --api-key is required. Get a free TMDB API key at https://www.themoviedb.org/settings/api")
        sys.exit(1)

    network_key = args.network.lower()
    if network_key not in NETWORKS:
        print(f"Unknown network '{network_key}'. Use --list-networks to see options.")
        sys.exit(1)

    cfg    = NETWORKS[network_key]
    label  = cfg[0]
    accent = cfg[3]

    out_dir = Path(args.output_dir)
    out_dir.mkdir(parents=True, exist_ok=True)

    fanart_note = "Fanart.tv thumbs (w/ logos)" if args.fanart_key else "TMDB backdrops (no Fanart key)"
    focus_label = args.focus if args.focus else f"{focus_x:.2f}, {focus_y:.2f}"

    print(f"\n{'─'*50}")
    print(f"  Network : {label}")
    print(f"  Images  : {fanart_note}")
    print(f"  Focus   : {focus_label}  (x={focus_x:.2f}, y={focus_y:.2f})")
    print(f"  Output  : {out_dir.resolve()}")
    print(f"{'─'*50}\n")

    # ── 1. Fetch titles ──
    print("Fetching titles from TMDB…")
    titles = fetch_titles(network_key, args.api_key, count=60)
    print(f"  Found {len(titles)} titles.\n")

    if not titles:
        print("No titles found — check your API key or network ID.")
        sys.exit(1)

    # ── 2. Download images (Fanart preferred, TMDB backdrop as fallback) ──
    source_label = "Fanart thumbs" if args.fanart_key else "backdrop images"
    print(f"Downloading {source_label}…")
    tile_imgs = []
    fanart_hits = 0
    tmdb_fallbacks = 0

    for i, (kind, item) in enumerate(titles):
        title = item.get("title") or item.get("name", "?")
        sys.stdout.write(f"  [{i+1:02d}/{len(titles)}] {title[:40]:<40}\r")
        sys.stdout.flush()

        if args.fanart_key:
            # Try Fanart first; track whether we actually got a Fanart image
            tmdb_id = item["id"]
            fanart_url = None
            if kind == "tv":
                ext = get_tmdb_external_ids("tv", tmdb_id, args.api_key)
                tvdb_id = ext.get("tvdb_id")
                if tvdb_id:
                    fanart_data = fanart_get_tv(tvdb_id, args.fanart_key)
                    fanart_url = best_fanart_thumb_url(fanart_data, "tv")
            else:
                fanart_data = fanart_get_movie(tmdb_id, args.fanart_key)
                fanart_url = best_fanart_thumb_url(fanart_data, "movie")

            if fanart_url:
                img = download_image_url(fanart_url)
                if img:
                    tile_imgs.append(img)
                    fanart_hits += 1
                    continue

            # Fanart miss → TMDB fallback
            img = download_tmdb_backdrop(item["backdrop_path"])
            if img:
                tile_imgs.append(img)
                tmdb_fallbacks += 1
        else:
            img = download_tmdb_backdrop(item["backdrop_path"])
            if img:
                tile_imgs.append(img)

    if args.fanart_key:
        print(f"\n  Downloaded {len(tile_imgs)} images  "
              f"({fanart_hits} Fanart thumbs, {tmdb_fallbacks} TMDB fallbacks).\n")
    else:
        print(f"\n  Downloaded {len(tile_imgs)} images.\n")

    if len(tile_imgs) < 12:
        print("Not enough images to build wallpaper. Try a different network or check API key.")
        sys.exit(1)

    # ── 3. Generate 4K ──
    print("Compositing 4K (3840×2160)…")
    scale_4k = 3840 / 1920  # = 2.0
    canvas_4k = build_tilted_grid(tile_imgs, 3840, 2160, scale=scale_4k, focus_x=focus_x, focus_y=focus_y)
    canvas_4k = apply_gradient(canvas_4k, accent)
    save_output(canvas_4k, out_dir / f"{network_key}_wallpaper_4k.jpg")

    # ── 4. Generate 1080p ──
    print("Compositing 1080p (1920×1080)…")
    canvas_1080 = build_tilted_grid(tile_imgs, 1920, 1080, scale=1.0, focus_x=focus_x, focus_y=focus_y)
    canvas_1080 = apply_gradient(canvas_1080, accent)
    save_output(canvas_1080, out_dir / f"{network_key}_wallpaper_1080p.jpg")

    print(f"\n✓  Done! Both wallpapers saved to: {out_dir.resolve()}\n")


if __name__ == "__main__":
    main()
