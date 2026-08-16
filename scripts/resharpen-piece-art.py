#!/usr/bin/env python3
"""Rebuild a crisp edge on piece art that shipped blurred.

The international xiangqi soldier art arrived with a ~6px alpha ramp where every
other piece in the same set has ~1px. That is the signature of art upscaled from
roughly a sixth of its stated resolution: the shape is intact, the edge is a
gradient. It reads as permanent softness at any render resolution, and it is the
one asset that looks wrong once a figure draws pieces at a legible size.

The repair is possible because these are flat shapes drawn in one or two colours:
the blur is a monotonic ramp across boundaries that used to be hard, so every
pixel still lies nearest the colour it started as. Supersample, snap each pixel
to the art's own palette and the alpha to in-or-out, then average back down.
Deciding at the target size instead would alias, because no sub-pixel coverage
would be left to produce a soft edge, and the downsample is premultiplied so
transparent black is not averaged into the silhouette as a dark fringe.

Snapping to the palette rebuilds the interior boundary too, which matters for the
filled set where a red outline meets a cream fill.

This is reconstruction, not restoration. The threshold follows the blur's own
contour, so a faint wobble the crisp pieces do not have survives into the result.
Re-exporting from vector source beats it, if source ever exists.

Fails closed on art it cannot safely treat: more than a few flat colours means
real tone, and snapping that to a palette would destroy detail.

    python3 scripts/resharpen-piece-art.py --check      # report, change nothing
    python3 scripts/resharpen-piece-art.py --write
"""

import argparse
import glob
import os
import sys

import numpy as np
from PIL import Image

PIECE_SETS = "apps/web/public/piece-sets"
# A median alpha ramp at or above this many pixels is blur, not antialiasing.
BLUR_RAMP_PX = 3
# More distinct flat colours than this means the art has real tone, and snapping
# it to a palette would destroy detail rather than sharpen it.
MAX_PALETTE = 4
SUPERSAMPLE = 4


def alpha_ramp_px(alpha: np.ndarray) -> float:
    """Median run length of partially transparent pixels, scanning rows."""
    widths = []
    for row in alpha:
        run = 0
        for value in row:
            if 8 < value < 247:
                run += 1
            else:
                if run:
                    widths.append(run)
                run = 0
        if run:
            widths.append(run)
    return float(np.median(widths)) if widths else 0.0


def palette_of(data: np.ndarray, solid: np.ndarray) -> list[tuple[int, int, int]]:
    """The handful of flat colours the art is drawn in, most common first.

    These sets are flat art: an outline in one colour, sometimes a fill in a
    second. Blur turns the boundaries into gradients, so the palette has to be
    read from the solid interior rather than from the whole image.
    """
    rgb = data[..., :3][solid]
    if rgb.size == 0:
        return []
    keys, counts = np.unique(rgb // 16, axis=0, return_counts=True)
    order = np.argsort(-counts)
    out: list[tuple[int, int, int]] = []
    for index in order:
        share = counts[index] / len(rgb)
        if share < 0.05:
            break
        bucket = keys[index]
        member = np.all(rgb // 16 == bucket, axis=1)
        out.append(tuple(int(np.median(rgb[member][:, c])) for c in range(3)))
    return out


def resharpen(path: str, write: bool) -> str:
    image = Image.open(path).convert("RGBA")
    data = np.array(image)
    alpha = data[..., 3]
    before = alpha_ramp_px(alpha.astype(float))
    if before < BLUR_RAMP_PX:
        return f"skip (ramp {before:.0f}px, already crisp)"

    solid = alpha >= 200
    if solid.sum() == 0:
        return "SKIP: no solid pixels to sample a palette from"
    palette = palette_of(data, solid)
    if not palette:
        return "REFUSED: no dominant colour found"
    if len(palette) > MAX_PALETTE:
        return f"REFUSED: {len(palette)} flat colours, too much tone to rebuild safely"

    # Supersample, decide, then average back down. Deciding at target size would
    # alias; there would be no sub-pixel coverage left to produce a soft edge.
    size = (image.width * SUPERSAMPLE, image.height * SUPERSAMPLE)
    big_alpha = np.array(Image.fromarray(alpha).resize(size, Image.BICUBIC))
    big_rgb = np.array(Image.fromarray(data[..., :3]).resize(size, Image.BICUBIC)).astype(float)

    inside = big_alpha >= 128
    # Snap every pixel to the nearest flat colour, which rebuilds the interior
    # boundary (outline against fill) as well as the silhouette.
    swatches = np.array(palette, dtype=float)
    distance = np.stack([((big_rgb - c) ** 2).sum(axis=2) for c in swatches], axis=0)
    picked = swatches[np.argmin(distance, axis=0)]

    # Premultiplied downsample: averaging raw RGB would pull transparent black
    # into every edge pixel and leave a dark fringe.
    mask = inside.astype(float)
    premultiplied = picked * mask[..., None]

    def box_down(plane: np.ndarray) -> np.ndarray:
        h, w = image.height, image.width
        return plane.reshape(h, SUPERSAMPLE, w, SUPERSAMPLE).mean(axis=(1, 3))

    coverage = box_down(mask)
    colour = np.stack([box_down(premultiplied[..., c]) for c in range(3)], axis=2)
    safe = np.maximum(coverage, 1e-6)[..., None]
    out = np.zeros_like(data)
    out[..., :3] = np.clip(colour / safe, 0, 255).astype(np.uint8)
    out[..., 3] = np.clip(coverage * 255, 0, 255).astype(np.uint8)

    after = alpha_ramp_px(out[..., 3].astype(float))
    if write:
        Image.fromarray(out).save(path)
    tones = ", ".join(str(c) for c in palette)
    return f"ramp {before:.0f}px -> {after:.0f}px, {len(palette)} tone(s) [{tones}]" + (
        "" if write else " (dry run)"
    )


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--write", action="store_true", help="rewrite the files in place")
    parser.add_argument("--check", action="store_true", help="report only (default)")
    args = parser.parse_args()
    root = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), PIECE_SETS)
    if not os.path.isdir(root):
        print(f"no piece sets at {root}", file=sys.stderr)
        return 1
    touched = 0
    for path in sorted(glob.glob(os.path.join(root, "*", "*", "*.png"))):
        result = resharpen(path, args.write and not args.check)
        if result.startswith("skip"):
            continue
        touched += 1
        print(f"{os.path.relpath(path, root)}: {result}")
    print(f"{touched} file(s) needed treatment")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
