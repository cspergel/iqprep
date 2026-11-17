"""Draws the Brain Camp app icons (camp tent on pine green). Run: python scripts/make_icons.py"""
from pathlib import Path
from PIL import Image, ImageDraw

OUT = Path(__file__).resolve().parent.parent / 'public' / 'icons'
OUT.mkdir(parents=True, exist_ok=True)

PINE = (47, 93, 80)
CAMPFIRE = (232, 116, 59)
SUN = (244, 197, 66)
INK = (29, 43, 42)
PAPER = (251, 244, 228)


def draw(size: int, maskable: bool) -> Image.Image:
    s = size * 4  # supersample for smooth edges
    img = Image.new('RGB', (s, s), PINE)
    d = ImageDraw.Draw(img)
    # Maskable icons must keep content inside the central 80% safe zone.
    pad = s * (0.2 if maskable else 0.12)
    w = s - 2 * pad
    # stars
    for (x, y, r) in [(0.22, 0.2, 0.018), (0.78, 0.16, 0.014), (0.66, 0.3, 0.012)]:
        d.ellipse([s * x - s * r, s * y - s * r, s * x + s * r, s * y + s * r], fill=PAPER)
    top = (s / 2, pad + w * 0.04)
    left = (pad + w * 0.02, pad + w * 0.9)
    right = (pad + w * 0.98, pad + w * 0.9)
    line = max(4, int(s * 0.03))
    d.polygon([top, left, right], fill=CAMPFIRE, outline=INK)
    d.line([top, left, right, top], fill=INK, width=line, joint='curve')
    # door
    dtop = (s / 2, pad + w * 0.42)
    dl = (s / 2 - w * 0.2, pad + w * 0.9)
    dr = (s / 2 + w * 0.2, pad + w * 0.9)
    d.polygon([dtop, dl, dr], fill=SUN)
    d.line([dtop, dl, dr, dtop], fill=INK, width=int(line * 0.8), joint='curve')
    # ground
    d.line([(pad - w * 0.04, pad + w * 0.9), (s - pad + w * 0.04, pad + w * 0.9)], fill=INK, width=line)
    return img.resize((size, size), Image.LANCZOS)


for size, name, mask in [(180, 'apple-touch-icon.png', False), (192, 'icon-192.png', False), (512, 'icon-512.png', False), (512, 'maskable-512.png', True)]:
    draw(size, mask).save(OUT / name)
    print('wrote', name)
