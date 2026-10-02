#!/usr/bin/env python3
"""Builds a contact sheet of extracted sprites over alternating dark/light/checker
backgrounds so halos, leftover labels or sheet background are easy to spot.
Usage: python3 scripts/contact_sheet.py <glob-dir-or-files...> --out sheet.png"""
import sys, argparse
from pathlib import Path
from PIL import Image, ImageDraw
ap = argparse.ArgumentParser(); ap.add_argument('paths', nargs='+'); ap.add_argument('--out', required=True); ap.add_argument('--cell', type=int, default=170)
a = ap.parse_args()
files = []
for p in a.paths:
    P = Path(p)
    files += sorted(P.glob('*.png')) if P.is_dir() else [P]
cell = a.cell; cols = 8; rows = (len(files) + cols - 1) // cols
sheet = Image.new('RGBA', (cols * cell, rows * (cell + 14)), (255, 255, 255, 255))
d = ImageDraw.Draw(sheet)
bgs = [(30, 34, 48, 255), (236, 244, 250, 255), (120, 150, 90, 255)]
for i, f in enumerate(files):
    im = Image.open(f).convert('RGBA')
    s = min((cell - 8) / im.width, (cell - 8) / im.height, 1.0)
    im = im.resize((max(1, int(im.width * s)), max(1, int(im.height * s))), Image.LANCZOS)
    x, y = (i % cols) * cell, (i // cols) * (cell + 14)
    bg = Image.new('RGBA', (cell, cell), bgs[(i + i // cols) % 3])
    bg.alpha_composite(im, ((cell - im.width) // 2, (cell - im.height) // 2))
    sheet.paste(bg, (x, y))
    d.text((x + 2, y + cell), f.stem[:26], fill=(0, 0, 0, 255))
sheet.convert('RGB').save(a.out)
print('wrote', a.out, len(files))
