#!/usr/bin/env python3
"""3 行×6 列精灵图 → action-0/1/2-strip.png（每行一组 6 帧动画）"""
from pathlib import Path

try:
    from PIL import Image
except ImportError:
    raise SystemExit("需要 Pillow: pip install pillow")

ROOT = Path(__file__).resolve().parents[1]
DEFAULT = ROOT / (
    "assets/c__Users_AI10_AppData_Roaming_Cursor_User_workspaceStorage_"
    "empty-window_images_image-575dc6b2-1a1f-41c5-a03e-6253b0935f88.png"
)
OUT = ROOT / "apps/tauri/public/mascot"
COLS, ROWS, SIZE = 6, 3, 30


def process_frame(fr: Image.Image) -> Image.Image:
    fr = fr.resize((SIZE, SIZE), Image.Resampling.NEAREST)
    px = fr.load()
    for y in range(SIZE):
        for x in range(SIZE):
            r, g, b, a = px[x, y]
            if r < 30 and g < 30 and b < 30:
                px[x, y] = (0, 0, 0, 0)
    return fr


def main(src: Path) -> None:
    im = Image.open(src).convert("RGBA")
    w, h = im.size
    fw, fh = w // COLS, h // ROWS
    OUT.mkdir(parents=True, exist_ok=True)
    for row in range(ROWS):
        frames = []
        for c in range(COLS):
            fr = im.crop((c * fw, row * fh, (c + 1) * fw, (row + 1) * fh))
            fr = process_frame(fr)
            frames.append(fr)
            fr.save(OUT / f"action{row}_{c:02d}.png")
        strip = Image.new("RGBA", (SIZE * COLS, SIZE), (0, 0, 0, 0))
        for i, fr in enumerate(frames):
            strip.paste(fr, (i * SIZE, 0), fr)
        strip.save(OUT / f"action-{row}-strip.png")
    im.save(OUT / "sheet-source.png")
    print(f"[cursorq] {ROWS} actions × {COLS} frames → {OUT}")


if __name__ == "__main__":
    import sys

    main(Path(sys.argv[1]) if len(sys.argv) > 1 else DEFAULT)
