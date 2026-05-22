#!/usr/bin/env python3
# Slice a square fog image into a 8x8 grid of equal sub-tiles.
#
# The fog-of-war board renders a fog overlay on hidden squares. To make the
# overlay look like ONE continuous mist across the board (instead of 64 copies
# of the same tile), we pre-slice a single source image into 64 named tiles
# and let CSS map each fog-hidden square's per-position class (fog-tile-fXrY)
# to the corresponding tile URL. No JS positioning is needed at render time —
# the class string carries the position, chessground stamps it on each square
# at render time, and CSS resolves the right URL synchronously.
#
# Usage:
#   python3 scripts/slice-fog.py <source.png|webp> <output-dir>
#
# Example:
#   python3 scripts/slice-fog.py \
#     apps/web/public/fog/mistveil.webp \
#     apps/web/public/fog/mistveil

import sys
from pathlib import Path
from PIL import Image


def main(argv):
    if len(argv) != 2:
        print('Usage: python3 scripts/slice-fog.py <source> <output-dir>', file=sys.stderr)
        return 1
    src_path, out_dir = argv
    src = Path(src_path)
    out = Path(out_dir)
    out.mkdir(parents=True, exist_ok=True)

    im = Image.open(src).convert('RGB')
    w, h = im.size
    if w != h or w % 8 != 0:
        print(f'Warning: source is {w}x{h}; tiles will be approximate.', file=sys.stderr)
    tile_w = w // 8
    tile_h = h // 8

    count = 0
    for f in range(8):
        for r in range(8):
            box = (f * tile_w, r * tile_h, (f + 1) * tile_w, (r + 1) * tile_h)
            tile = im.crop(box)
            tile.save(out / f'f{f}r{r}.webp', 'WEBP', quality=85, method=6)
            count += 1
    print(f'Sliced {src} ({w}x{h}) into {count} tiles ({tile_w}x{tile_h} each) in {out}')
    return 0


if __name__ == '__main__':
    sys.exit(main(sys.argv[1:]))
