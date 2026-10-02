#!/usr/bin/env python3
"""
Slippery Fish — reference-sheet asset extractor.

Reads the ORIGINAL presentation sheets in art/source-sheets/ (never modified)
and the declarative per-sheet specs in art/extraction-specs/*.json, then:

  1. Removes the presentation background with a border-seeded flood fill that
     follows smooth background gradients but stops at the thick cartoon
     outlines every object has.
  2. Removes label pills, item numbers and neighbouring art by restricting each
     item to its declared box and discarding stray fragments.
  3. Un-blends anti-aliased edges against the local background colour so the
     sprite has clean transparent edges (no light halo on dark floors).
  4. Trims to content, adds transparent padding, optionally downsamples
     (aspect ratio is always preserved — never stretched).
  5. Packs sprites into per-group texture atlases (Phaser JSON-hash format,
     lossless-alpha WebP pages) and writes content/manifests/assets.generated.json
     with category, themes, source Batch, pivot, rendering role and collision
     role for every frame.

Usage:
  python3 scripts/extract_assets.py              # extract everything
  python3 scripts/extract_assets.py --only Batch04_IceObstacles
  python3 scripts/extract_assets.py --debug      # also write per-item PNGs to art/extracted-debug/

Requirements (development only, never shipped): Python 3.10+, numpy, scipy,
opencv-python-headless, Pillow.
"""
from __future__ import annotations

import argparse
import json
import math
import sys
from pathlib import Path

import cv2
import numpy as np
from PIL import Image
from scipy import ndimage

ROOT = Path(__file__).resolve().parent.parent
SHEETS = ROOT / "art" / "source-sheets"
SPECS = ROOT / "art" / "extraction-specs"
PUBLIC = ROOT / "public" / "assets"
ATLAS_DIR = PUBLIC / "atlases"
SINGLE_DIR = PUBLIC / "images"
MANIFEST = ROOT / "content" / "manifests" / "assets.generated.json"
DEBUG_DIR = ROOT / "art" / "extracted-debug"

VALID_CATEGORIES = {
    "GameplayFish", "GameplayCharacter", "GameplayEnemy", "GameplayObstacle", "GameplayStash",
    "FishEffect", "Floor", "Boundary", "BackgroundDecoration", "ForegroundDecoration",
    "Building", "TownProp", "FishingProp", "UIOnly", "MainMenuOnly", "CurrencyIcon",
}
VALID_COLLISION = {"gameplay-collider", "limited-collider", "visual", "background", "foreground-frame", "ui"}
VALID_ROLES = {"gameplay", "effect", "floor", "decoration", "background", "foreground", "ui", "menu"}


# --------------------------------------------------------------------------- background

def load_sheet(name: str) -> np.ndarray:
    """Returns an RGBA uint8 array. Sheets with real alpha keep it."""
    im = Image.open(SHEETS / name)
    im = im.convert("RGBA")
    return np.array(im)


def flood_background(rgb: np.ndarray, tol: int, seed_step: int = 6, edges=("top", "bottom", "left", "right")) -> np.ndarray:
    """Border-seeded flood fill in 'floating range' mode: each pixel joins the
    background if it differs from an already-accepted neighbour by <= tol per
    channel. Smooth gradients and soft glows pass; dark outlines stop it."""
    h, w = rgb.shape[:2]
    bgr = np.ascontiguousarray(rgb[:, :, ::-1])
    mask = np.zeros((h + 2, w + 2), np.uint8)
    flags = 4 | (255 << 8) | cv2.FLOODFILL_MASK_ONLY
    d = (tol, tol, tol)
    seeds = []
    if "top" in edges:
        seeds += [(x, 0) for x in range(0, w, seed_step)]
    if "bottom" in edges:
        seeds += [(x, h - 1) for x in range(0, w, seed_step)]
    if "left" in edges:
        seeds += [(0, y) for y in range(0, h, seed_step)]
    if "right" in edges:
        seeds += [(w - 1, y) for y in range(0, h, seed_step)]
    for (x, y) in seeds:
        if mask[y + 1, x + 1] == 0:
            cv2.floodFill(bgr, mask, (x, y), 0, d, d, flags)
    return mask[1:-1, 1:-1] > 0


def fill_holes(rgb: np.ndarray, bg: np.ndarray, seeds, tol: int) -> None:
    """Clears enclosed background pockets (e.g. inside a ring) from explicit seeds."""
    h, w = rgb.shape[:2]
    bgr = np.ascontiguousarray(rgb[:, :, ::-1])
    mask = np.zeros((h + 2, w + 2), np.uint8)
    flags = 4 | (255 << 8) | cv2.FLOODFILL_MASK_ONLY
    d = (tol, tol, tol)
    for (x, y) in seeds:
        cv2.floodFill(bgr, mask, (int(x), int(y)), 0, d, d, flags)
    bg |= mask[1:-1, 1:-1] > 0


# --------------------------------------------------------------------------- per item

def item_mask(fg: np.ndarray, box, min_area: int, edge_fraction: float, excludes, exclude_polys=()) -> np.ndarray:
    x0, y0, x1, y1 = box
    sub = fg[y0:y1, x0:x1].copy()
    for (ex0, ey0, ex1, ey1) in excludes:
        sub[max(0, ey0 - y0):max(0, ey1 - y0), max(0, ex0 - x0):max(0, ex1 - x0)] = False
    if exclude_polys:
        pm = np.zeros(sub.shape, np.uint8)
        for poly in exclude_polys:
            pts = np.array([[px - x0, py - y0] for px, py in poly], np.int32)
            cv2.fillPoly(pm, [pts], 1)
        sub &= pm == 0
    lab, n = ndimage.label(sub)
    if n == 0:
        return sub
    areas = ndimage.sum(np.ones_like(sub, dtype=np.int32), lab, index=np.arange(1, n + 1))
    largest = float(areas.max())
    keep = np.zeros(n + 1, bool)
    h, w = sub.shape
    objs = ndimage.find_objects(lab)
    for i in range(n):
        a = areas[i]
        if a < min_area:
            continue
        ys, xs = objs[i]
        touches = ys.start == 0 or xs.start == 0 or ys.stop == h or xs.stop == w
        if touches and a < edge_fraction * largest:
            continue  # sliver of a neighbouring object cut by the box edge
        keep[i + 1] = True
    return keep[lab]


def unblend_edges(rgb: np.ndarray, mask: np.ndarray, bgmask: np.ndarray, ring: int = 2) -> np.ndarray:
    """Produces RGBA. Interior pixels are opaque; pixels within `ring` px of the
    background are un-blended: observed c = a*f + (1-a)*b, with f = nearest
    interior colour and b = nearest pure background colour."""
    h, w = mask.shape
    out = np.zeros((h, w, 4), np.float32)
    rgbf = rgb.astype(np.float32)
    # distance from background (inside the mask) and from the mask (outside)
    dist_in = ndimage.distance_transform_edt(mask)
    interior = dist_in > ring
    if not interior.any():
        interior = mask
    _, (iy, ix) = ndimage.distance_transform_edt(~interior, return_indices=True)
    pure_bg = bgmask & (ndimage.distance_transform_edt(~mask) > ring)
    if not pure_bg.any():
        pure_bg = ~mask
    _, (by, bx) = ndimage.distance_transform_edt(~pure_bg, return_indices=True)
    f = rgbf[iy, ix]
    b = rgbf[by, bx]
    fb = f - b
    denom = np.maximum((fb * fb).sum(axis=2), 1.0)
    a = ((rgbf - b) * fb).sum(axis=2) / denom
    a = np.clip(a, 0.0, 1.0)
    near = (~interior) & (ndimage.distance_transform_edt(~mask) <= 1.5)
    alpha = np.where(interior, 1.0, np.where(near, a, 0.0))
    # sharpen tiny alphas away, keep the outline crisp
    alpha = np.where(alpha < 0.08, 0.0, alpha)
    color = np.where((interior | ~near)[..., None], rgbf, np.where(alpha[..., None] > 0, f, rgbf))
    # For edge pixels with substantial own colour (alpha≈1), keep the original
    color = np.where((alpha[..., None] > 0.92) & mask[..., None], rgbf, color)
    out[..., :3] = color
    out[..., 3] = alpha * 255.0
    return np.clip(out, 0, 255).astype(np.uint8)


def trim_pad(rgba: np.ndarray, pad: int) -> tuple[np.ndarray, tuple[int, int]]:
    ys, xs = np.nonzero(rgba[..., 3] > 0)
    if len(xs) == 0:
        raise ValueError("empty extraction")
    x0, x1, y0, y1 = xs.min(), xs.max() + 1, ys.min(), ys.max() + 1
    crop = rgba[y0:y1, x0:x1]
    out = np.zeros((crop.shape[0] + 2 * pad, crop.shape[1] + 2 * pad, 4), np.uint8)
    out[pad:pad + crop.shape[0], pad:pad + crop.shape[1]] = crop
    return out, (int(x0), int(y0))


def resize_rgba(rgba: np.ndarray, scale: float) -> np.ndarray:
    if abs(scale - 1.0) < 1e-6:
        return rgba
    im = Image.fromarray(rgba, "RGBA")
    # premultiplied resize to avoid dark fringes
    arr = np.array(im).astype(np.float32)
    a = arr[..., 3:4] / 255.0
    arr[..., :3] *= a
    w = max(1, round(im.width * scale))
    h = max(1, round(im.height * scale))
    chans = [Image.fromarray(arr[..., c]).resize((w, h), Image.LANCZOS) for c in range(4)]
    res = np.stack([np.array(c) for c in chans], axis=-1)
    alpha = np.clip(res[..., 3:4], 0, 255) / 255.0
    rgb = np.where(alpha > 0, res[..., :3] / np.maximum(alpha, 1e-6), 0)
    out = np.concatenate([np.clip(rgb, 0, 255), np.clip(res[..., 3:4], 0, 255)], axis=-1)
    return out.astype(np.uint8)


# --------------------------------------------------------------------------- packing

def pack_shelves(sprites: list[tuple[str, np.ndarray]], max_w: int = 2048, gap: int = 2):
    """Simple shelf packer: sort by height, fill rows. Returns list of pages,
    each page = (width, height, [(name, x, y)])."""
    order = sorted(sprites, key=lambda s: (-s[1].shape[0], -s[1].shape[1]))
    pages = []
    cur = []
    x = y = shelf_h = 0
    page_w = 0
    max_h = 2048
    for name, img in order:
        h, w = img.shape[:2]
        if w > max_w or h > max_h:
            raise ValueError(f"sprite {name} too large for atlas ({w}x{h})")
        if x + w > max_w:
            x = 0
            y += shelf_h + gap
            shelf_h = 0
        if y + h > max_h:
            pages.append((page_w, y + shelf_h if shelf_h else y, cur))
            cur, x, y, shelf_h, page_w = [], 0, 0, 0, 0
        cur.append((name, x, y))
        x += w + gap
        shelf_h = max(shelf_h, h)
        page_w = max(page_w, x - gap)
    if cur:
        pages.append((page_w, y + shelf_h, cur))
    return pages


# --------------------------------------------------------------------------- main

def validate_item(sheet_name: str, item: dict) -> None:
    where = f"{sheet_name}:{item.get('id')}"
    for key in ("id", "box", "category", "role", "collision"):
        if key not in item:
            raise ValueError(f"{where} missing '{key}'")
    if item["category"] not in VALID_CATEGORIES:
        raise ValueError(f"{where} bad category {item['category']}")
    if item["collision"] not in VALID_COLLISION:
        raise ValueError(f"{where} bad collision {item['collision']}")
    if item["role"] not in VALID_ROLES:
        raise ValueError(f"{where} bad role {item['role']}")
    x0, y0, x1, y1 = item["box"]
    if not (x1 > x0 and y1 > y0):
        raise ValueError(f"{where} bad box")


def process_sheet(spec: dict, debug: bool):
    name = spec["sheet"]
    rgba_sheet = load_sheet(name)
    rgb = rgba_sheet[..., :3]
    tol = int(spec.get("floodTolerance", 4))
    has_alpha = bool(spec.get("useSheetAlpha", False))
    if has_alpha:
        bg = rgba_sheet[..., 3] < int(spec.get("alphaThreshold", 40))
        # Labels sit on opaque cream pills; they are excluded by boxes.
    else:
        bg = flood_background(rgb, tol)
    results = []
    for item in spec["items"]:
        validate_item(name, item)
        mode = item.get("mode", "sprite")
        x0, y0, x1, y1 = item["box"]
        item_rgb = rgb
        if item.get("inpaint"):
            item_rgb = rgb.copy()
            imask = np.zeros(rgb.shape[:2], np.uint8)
            for (ix0, iy0, ix1, iy1) in item["inpaint"]:
                imask[iy0:iy1, ix0:ix1] = 255
            item_rgb = cv2.inpaint(np.ascontiguousarray(item_rgb[:, :, ::-1]), imask, 9, cv2.INPAINT_TELEA)[:, :, ::-1]
            item_rgb = np.ascontiguousarray(item_rgb)
        if mode == "texture":
            # Interior crop made seamless by 2x2 mirror tiling (soft natural textures only).
            ins = int(item.get("inset", 14))
            crop = item_rgb[y0 + ins:y1 - ins, x0 + ins:x1 - ins]
            top = np.concatenate([crop, crop[:, ::-1]], axis=1)
            tile = np.concatenate([top, top[::-1, :]], axis=0)
            alpha = np.full(tile.shape[:2] + (1,), 255, np.uint8)
            sprite = np.concatenate([tile, alpha], axis=2)
            scale = float(item.get("scale", 1.0))
            sprite = resize_rgba(sprite, scale)
            if debug:
                DEBUG_DIR.mkdir(parents=True, exist_ok=True)
                Image.fromarray(sprite, "RGBA").save(DEBUG_DIR / f"{item['id']}.png")
            results.append((item, sprite))
            continue
        if mode == "colorKey":
            # Soft, outline-free art (clouds): alpha from projection of each pixel
            # onto the axis between the box-border background colour and the
            # brightest object colour; colour is un-blended accordingly.
            sub = item_rgb[y0:y1, x0:x1].astype(np.float32)
            border = np.concatenate([sub[0], sub[-1], sub[:, 0], sub[:, -1]])
            b = np.median(border, axis=0)
            lum = sub.sum(axis=2)
            w = sub.reshape(-1, 3)[np.argsort(lum.reshape(-1))[-max(1, lum.size // 200):]].mean(axis=0)
            axis = w - b
            a = np.clip(((sub - b) * axis).sum(axis=2) / max((axis * axis).sum(), 1.0), 0, 1)
            a = np.clip((a - 0.06) / 0.94, 0, 1)
            f = b + (sub - b) / np.maximum(a[..., None], 1e-3)
            rgba = np.concatenate([np.clip(f, 0, 255), (a * 255)[..., None]], axis=2).astype(np.uint8)
            rgba[a <= 0] = 0
            sprite, _ = trim_pad(rgba, int(item.get("pad", 4)))
            sprite = resize_rgba(sprite, float(item.get("scale", 1.0)))
            if debug:
                DEBUG_DIR.mkdir(parents=True, exist_ok=True)
                Image.fromarray(sprite, "RGBA").save(DEBUG_DIR / f"{item['id']}.png")
            results.append((item, sprite))
            continue
        if has_alpha:
            local_bg = bg.copy()
        elif item.get("localFlood") or spec.get("localFlood"):
            local_bg = np.zeros(rgb.shape[:2], bool)
            edges = tuple(item.get("seedEdges", ("top", "bottom", "left", "right")))
            local_bg[y0:y1, x0:x1] = flood_background(np.ascontiguousarray(item_rgb[y0:y1, x0:x1]),
                                                      int(item.get("tolerance", tol)), 3, edges)
            # outside the box counts as background for edge un-blending
            outside = np.ones(rgb.shape[:2], bool); outside[y0:y1, x0:x1] = False
            local_bg |= outside
        else:
            local_bg = bg.copy()
        if item.get("holes"):
            fill_holes(item_rgb, local_bg, item["holes"], int(item.get("holeTolerance", tol)))
        fg = ~local_bg
        if not has_alpha:
            fg = ndimage.binary_opening(fg, iterations=1)
        if mode == "band":
            m = fg[y0:y1, x0:x1]
        else:
            m = item_mask(fg, item["box"], int(item.get("minArea", 40)), float(item.get("edgeFraction", 0.2)),
                          item.get("exclude", []), item.get("excludePoly", []))
        if item.get("fillInterior", False):
            m = ndimage.binary_fill_holes(m)
        if item.get("solidBelow", False):
            # Scene objects whose bodies blend into the snowy ground (mounds,
            # drifts): everything under the object's top contour is opaque.
            cols = np.nonzero(m.any(axis=0))[0]
            for cx in cols:
                top = int(np.argmax(m[:, cx]))
                m[top:, cx] = True
        sub_rgb = item_rgb[y0:y1, x0:x1]
        if has_alpha:
            sub = rgba_sheet[y0:y1, x0:x1].copy()
            sub[..., 3] = np.where(m, sub[..., 3], 0)
        else:
            sub = unblend_edges(sub_rgb, m, local_bg[y0:y1, x0:x1])
        fb = int(item.get("featherBottom", 0))
        if fb > 0:
            ramp = np.linspace(1.0, 0.0, fb + 1)[1:]
            hh = sub.shape[0]
            for k in range(fb):
                row = hh - fb + k
                sub[row, :, 3] = (sub[row, :, 3].astype(np.float32) * ramp[k]).astype(np.uint8)
        pad = int(item.get("pad", 4))
        if mode == "band":
            sprite = sub
        else:
            try:
                sprite, (ox, oy) = trim_pad(sub, pad)
            except ValueError as exc:
                raise ValueError(f"{name}:{item['id']}: {exc}") from exc
        scale = float(item.get("scale", spec.get("defaultScale", 1.0)))
        sprite = resize_rgba(sprite, scale)
        if debug:
            DEBUG_DIR.mkdir(parents=True, exist_ok=True)
            Image.fromarray(sprite, "RGBA").save(DEBUG_DIR / f"{item['id']}.png")
        results.append((item, sprite))
    return results


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--only", help="process only this spec (basename without .json)")
    ap.add_argument("--debug", action="store_true")
    args = ap.parse_args()

    spec_files = sorted(SPECS.glob("*.json"))
    if args.only:
        spec_files = [p for p in spec_files if p.stem == args.only]
    all_items: list[tuple[dict, dict, np.ndarray]] = []
    seen_ids: set[str] = set()
    for sf in spec_files:
        spec = json.loads(sf.read_text())
        print(f"[extract] {spec['sheet']} ({len(spec['items'])} items)")
        for item, sprite in process_sheet(spec, args.debug):
            if item["id"] in seen_ids:
                raise ValueError(f"duplicate asset id {item['id']}")
            seen_ids.add(item["id"])
            all_items.append((spec, item, sprite))

    if args.only:
        print("[extract] --only given: wrote debug output only, manifest/atlases untouched")
        return 0

    # Group into atlases; items flagged "single" are written as standalone files
    groups: dict[str, list[tuple[str, np.ndarray]]] = {}
    manifest_frames = {}
    SINGLE_DIR.mkdir(parents=True, exist_ok=True)
    ATLAS_DIR.mkdir(parents=True, exist_ok=True)
    for old in list(ATLAS_DIR.glob("*")) + list(SINGLE_DIR.glob("*")):
        old.unlink()
    for spec, item, sprite in all_items:
        entry = {
            "id": item["id"],
            "label": item.get("label", item["id"]),
            "sourceBatch": spec["batch"],
            "sourceSheet": spec["sheet"],
            "sourceBox": item["box"],
            "category": item["category"],
            "themes": item.get("themes", ["all"]),
            "role": item["role"],
            "collision": item["collision"],
            "pivot": item.get("pivot", [0.5, 0.5]),
            "width": int(sprite.shape[1]),
            "height": int(sprite.shape[0]),
            "notes": item.get("notes", ""),
        }
        if item.get("single") or item.get("mode") == "texture":
            fname = f"{item['id']}.webp"
            Image.fromarray(sprite, "RGBA").save(SINGLE_DIR / fname, "WEBP", quality=88, method=6)
            entry["file"] = f"assets/images/{fname}"
        else:
            g = item.get("atlas", spec.get("defaultAtlas", "misc"))
            entry["atlas"] = g
            groups.setdefault(g, []).append((item["id"], sprite))
        manifest_frames[item["id"]] = entry

    atlases = {}
    for g, sprites in sorted(groups.items()):
        pages = pack_shelves(sprites)
        lookup = dict(sprites)
        atlases[g] = []
        for pi, (pw, ph, placed) in enumerate(pages):
            page = np.zeros((ph, pw, 4), np.uint8)
            frames = {}
            for (nm, x, y) in placed:
                im = lookup[nm]
                page[y:y + im.shape[0], x:x + im.shape[1]] = im
                frames[nm] = {
                    "frame": {"x": x, "y": y, "w": int(im.shape[1]), "h": int(im.shape[0])},
                    "rotated": False, "trimmed": False,
                    "spriteSourceSize": {"x": 0, "y": 0, "w": int(im.shape[1]), "h": int(im.shape[0])},
                    "sourceSize": {"w": int(im.shape[1]), "h": int(im.shape[0])},
                    "pivot": {"x": manifest_frames[nm]["pivot"][0], "y": manifest_frames[nm]["pivot"][1]},
                }
                manifest_frames[nm]["atlasPage"] = f"{g}-{pi}"
                manifest_frames[nm]["frame"] = [x, y, int(im.shape[1]), int(im.shape[0])]
                manifest_frames[nm]["pageSize"] = [pw, ph]
            key = f"{g}-{pi}"
            img_name = f"{key}.webp"
            Image.fromarray(page, "RGBA").save(ATLAS_DIR / img_name, "WEBP", quality=90, method=6, exact=True)
            (ATLAS_DIR / f"{key}.json").write_text(json.dumps({
                "frames": frames,
                "meta": {"app": "slippery-fish extract_assets.py", "image": img_name,
                         "size": {"w": pw, "h": ph}, "scale": "1"},
            }, separators=(",", ":")))
            atlases[g].append({"key": key, "image": f"assets/atlases/{img_name}", "json": f"assets/atlases/{key}.json"})
            print(f"[atlas] {key}: {pw}x{ph}, {len(placed)} frames")

    MANIFEST.parent.mkdir(parents=True, exist_ok=True)
    MANIFEST.write_text(json.dumps({
        "generatedBy": "scripts/extract_assets.py",
        "note": "GENERATED FILE — edit art/extraction-specs/*.json and re-run `npm run extract:assets`.",
        "atlases": atlases,
        "frames": manifest_frames,
    }, indent=0, separators=(",", ":")))
    # Slim runtime manifest bundled into the game (full metadata stays in the generated file).
    pages = {}
    for g, plist in atlases.items():
        for pg in plist:
            pages[pg["key"]] = {"group": g, "image": pg["image"], "json": pg["json"]}
    runtime_frames = {}
    for fid, e in manifest_frames.items():
        loc = e.get("atlasPage") or ("file:" + e["file"])
        fr = e.get("frame", [0, 0, e["width"], e["height"]])
        runtime_frames[fid] = [loc, fr[0], fr[1], fr[2], fr[3], e["category"], e["collision"], e["role"], e["themes"]]
    for pk, pv in pages.items():
        sz = next((e["pageSize"] for e in manifest_frames.values() if e.get("atlasPage") == pk), [0, 0])
        pv["size"] = sz
    (MANIFEST.parent / "assets.runtime.json").write_text(json.dumps({"pages": pages, "frames": runtime_frames}, separators=(",", ":")))
    print(f"[extract] wrote {len(manifest_frames)} frames → {MANIFEST.relative_to(ROOT)} (+ assets.runtime.json)")
    return 0


if __name__ == "__main__":
    sys.exit(main())
