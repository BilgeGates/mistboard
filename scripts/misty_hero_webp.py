"""Stitch board frames (misty-hero-frames.ts output) into the looping README hero.

    python3 scripts/misty_hero_webp.py \
      --frames tmp/hero/frames/jungle --out ~/projects/misty-jungle/assets/game.webp \
      --ms-per-ply 720 --opening-hold 1200 --final-hold 4000

Animated WebP, not GIF: GIF's 256-colour palette cannot hold the board art at a sane
size (an earlier GIF of the same clip was 12 MB against ~450 KB for lossy WebP), and
GitHub renders animated WebP inline in a README the same way it renders a GIF. Pass
--gif to write a GIF alongside for comparison.

Frames are rendered at 2x their display width and downscaled by the README's own
`width` attribute, which keeps the tokens crisp on high-DPI screens.
"""

from __future__ import annotations

import argparse
from pathlib import Path

from PIL import Image


def load_frames(frame_dir: Path) -> list[Image.Image]:
    paths = sorted(frame_dir.glob("*.png"))
    if not paths:
        raise SystemExit(f"no frames in {frame_dir}")
    return [Image.open(p).convert("RGBA") for p in paths]


def durations(count: int, per_ply: int, opening_hold: int, final_hold: int) -> list[int]:
    """One entry per frame: a longer beat on the start position (so a loop reads as a
    fresh start rather than a jump cut) and a long hold on the final position."""
    if count == 1:
        return [final_hold]
    out = [opening_hold] + [per_ply] * (count - 2) + [final_hold]
    return out


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--frames", required=True)
    ap.add_argument("--out", required=True)
    ap.add_argument("--ms-per-ply", type=int, default=720)
    ap.add_argument("--opening-hold", type=int, default=1200)
    ap.add_argument("--final-hold", type=int, default=4000)
    ap.add_argument("--quality", type=int, default=72)
    ap.add_argument("--gif", action="store_true", help="also write a .gif next to --out")
    args = ap.parse_args()

    frames = load_frames(Path(args.frames))
    times = durations(len(frames), args.ms_per_ply, args.opening_hold, args.final_hold)

    out = Path(args.out).expanduser()
    out.parent.mkdir(parents=True, exist_ok=True)
    frames[0].save(
        out,
        format="WEBP",
        save_all=True,
        append_images=frames[1:],
        duration=times,
        loop=0,
        lossless=False,
        quality=args.quality,
        method=6,
    )
    total = sum(times) / 1000
    print(f"{out}: {len(frames)} frames, {total:.1f}s loop, {out.stat().st_size / 1024:.0f} KB")

    if args.gif:
        gif = out.with_suffix(".gif")
        flat = [f.convert("RGB").quantize(colors=256, method=Image.MEDIANCUT) for f in frames]
        flat[0].save(
            gif,
            save_all=True,
            append_images=flat[1:],
            duration=times,
            loop=0,
            optimize=True,
        )
        print(f"{gif}: {gif.stat().st_size / 1024:.0f} KB")


if __name__ == "__main__":
    main()
