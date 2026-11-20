"""Erzeugt die PNG-Icons der PWA aus den SVG-Quellen in public/icons.

Aufruf: python tools/icons_bauen.py   (braucht CairoSVG; Ergebnis wird committet)
"""
from pathlib import Path

import cairosvg

ICONS = Path(__file__).resolve().parent.parent / "public" / "icons"
AUFTRAEGE = [
    ("icon.svg", "icon-192.png", 192),
    ("icon.svg", "icon-512.png", 512),
    ("icon-maskable.svg", "icon-maskable-512.png", 512),
    ("icon-maskable.svg", "apple-touch-icon.png", 180),
]


def main() -> None:
    for quelle, ziel, px in AUFTRAEGE:
        cairosvg.svg2png(
            url=str(ICONS / quelle),
            write_to=str(ICONS / ziel),
            output_width=px,
            output_height=px,
        )
        print(f"{ziel} ({px}px)")


if __name__ == "__main__":
    main()
