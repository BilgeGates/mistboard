#!/usr/bin/env python3
# Post-process gpt-image-2 output PNGs to convert the checkered
# transparency-indicator pattern into actual alpha-channel transparency.
#
# gpt-image-2 rejects the `background: 'transparent'` API parameter that
# gpt-image-1 accepted. Instead, it renders the standard checker pattern
# (#fefefe / #ededed light grey) as opaque image content. This script
# detects those pixels (light + near-greyscale) and sets their alpha to 0.
#
# Usage:
#   python3 scripts/key-transparency.py <path-or-glob> [<path-or-glob> ...]
#
# Operates in place. Run before serving sprites that need to composite on
# board squares.

import sys
import glob
from PIL import Image


def key_one(path):
    im = Image.open(path).convert('RGBA')
    w, h = im.size
    pixels = im.load()
    removed = 0
    for y in range(h):
        for x in range(w):
            r, g, b, _ = pixels[x, y]
            # Detect checker: bright + near-greyscale.
            if r >= 225 and g >= 225 and b >= 225 and max(r, g, b) - min(r, g, b) <= 12:
                pixels[x, y] = (r, g, b, 0)
                removed += 1
    im.save(path)
    return removed, w * h


def main(argv):
    if not argv:
        print('Usage: python3 scripts/key-transparency.py <path-or-glob> [...]', file=sys.stderr)
        return 1
    paths = []
    for arg in argv:
        if any(c in arg for c in '*?['):
            paths.extend(sorted(glob.glob(arg)))
        else:
            paths.append(arg)
    if not paths:
        print('No matching files.', file=sys.stderr)
        return 1
    for p in paths:
        removed, total = key_one(p)
        name = p.rsplit('/', 1)[-1]
        print(f'{name}: keyed {removed/total*100:.0f}% transparent')
    return 0


if __name__ == '__main__':
    sys.exit(main(sys.argv[1:]))
