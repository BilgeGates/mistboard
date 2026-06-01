#!/usr/bin/env python3
# Reassemble the 8x8 grid of fog tiles back into the single source image.
#
# Inverse of scripts/slice-fog.py. The mistveil skin ships as 64 pre-sliced
# 128x128 tiles (fXrY.webp) for per-square chess rendering. The xiangqi boards
# render fog as one masked SVG region, not per square, so they need the ORIGINAL
# continuous image as a single texture. This stitches the tiles back together so
# the same art drives both surfaces (one global fog setting, rendered thematically
# on every board size).
#
# Usage:
#   python3 scripts/assemble-fog.py <tiles-dir> <output.webp>
#
# Example:
#   python3 scripts/assemble-fog.py \
#     apps/web/public/fog/mistveil \
#     apps/web/public/fog/mistveil.webp

import sys
from pathlib import Path
from PIL import Image


def main(argv):
    if len(argv) != 2:
        print('Usage: python3 scripts/assemble-fog.py <tiles-dir> <output.webp>', file=sys.stderr)
        return 1
    tiles_dir, out_path = argv
    tiles = Path(tiles_dir)

    sample = Image.open(tiles / 'f0r0.webp')
    tw, th = sample.size  # 128x128
    full = Image.new('RGB', (tw * 8, th * 8))

    for f in range(8):
        for r in range(8):
            tile = Image.open(tiles / f'f{f}r{r}.webp').convert('RGB')
            full.paste(tile, (f * tw, r * th))

    full.save(out_path, 'WEBP', quality=88, method=6)
    print(f'Assembled {out_path} ({full.size[0]}x{full.size[1]}) from 64 tiles in {tiles}')
    return 0


if __name__ == '__main__':
    sys.exit(main(sys.argv[1:]))
