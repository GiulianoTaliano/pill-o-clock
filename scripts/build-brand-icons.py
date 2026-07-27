# -*- coding: utf-8 -*-
"""Genera todos los assets de icono a partir del brand mark.

Fuente de verdad: assets/brand-mark.svg (la geometria vive tambien en
components/BrandMark.tsx; si cambia una, cambiar la otra).

    python scripts/build-brand-icons.py

Escribe assets/*.png. Para propagarlos a android/app/src/main/res/ hay un paso
aparte: NO correr `expo prebuild`, porque el manifest persistente tiene
ediciones (showWhenLocked, strips de AD_ID) que un --clean se lleva puesto.

La escala 0.72 no es arbitraria: la capsula es diagonal, asi que sus puntas
quedan a bbox/2*sqrt(2) del centro y no deben salirse del circulo seguro de
Android (66.7% del lienzo -> radio 341px sobre 1024).
"""
import io, os, json, sys
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding="utf-8")
from playwright.sync_api import sync_playwright

OUT = r"A:\Repositories\pill-o-clock\assets"
TMP = r"C:\Temp\claude\A--Repositories-pill-o-clock\d576be85-6503-465a-9865-5c8b93d5ca2d\scratchpad\mark"

BLUE, NAVY, BG = "#2f7de1", "#0e1a2d", "#f0f6ff"

def svg(primary, secondary, mono=False):
    hands = ('<g stroke="%s" stroke-linecap="round" fill="none">'
             '<path d="M18.3 18.3 L18.3 12.6" stroke-width="2.9"/>'
             '<path d="M18.3 18.3 L23.4 18.3" stroke-width="2.9"/></g>')
    mask = ('<mask id="m"><rect x="0" y="0" width="48" height="48" fill="#fff"/>'
            + (hands % "#000") + '</mask>')
    body = (
      '<g clip-path="url(#c)"%s>'
      '<rect x="5" y="13" width="18.6" height="22" fill="%s" transform="rotate(45 24 24)"/>'
      '<rect x="24.4" y="13" width="18.6" height="22" fill="%s" transform="rotate(45 24 24)"/>'
      '</g>') % (' mask="url(#m)"' if mono else '', primary, primary if mono else secondary)
    return ('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 48 48">'
            '<defs><clipPath id="c">'
            '<rect x="7" y="16" width="34" height="16" rx="8" transform="rotate(45 24 24)"/>'
            '</clipPath>' + (mask if mono else '') + '</defs>'
            + body + ('' if mono else hands % secondary) + '</svg>')

def page(size, art, scale, bg=None):
    """art centrado ocupando `scale` del lienzo."""
    inner = round(size * scale)
    pad = (size - inner) // 2
    bgcss = ("background:%s;" % bg) if bg else ""
    return ("<style>html,body{margin:0;padding:0}"
            "body{width:%dpx;height:%dpx;%s display:flex;align-items:center;justify-content:center}"
            "svg{width:%dpx;height:%dpx;display:block}</style>%s"
            % (size, size, bgcss, inner, inner, art))

JOBS = [
  # (archivo, tamano, svg, escala del arte, fondo, transparente)
  ("android-icon-foreground.png", 1024, svg(BLUE, NAVY),          0.72, None, True),
  ("android-icon-background.png", 1024, "",                        1.00, BG,   False),
  ("android-icon-monochrome.png", 1024, svg("#ffffff", "#ffffff", mono=True), 0.72, None, True),
  ("icon.png",                    1024, svg(BLUE, NAVY),          0.80, BG,   False),
  ("splash-icon.png",              512, svg(BLUE, NAVY),          0.78, None, True),
  ("favicon.png",                   96, svg(BLUE, NAVY),          0.88, None, True),
]

with sync_playwright() as p:
    b = p.chromium.launch(channel="chrome")
    for name, size, art, scale, bg, transparent in JOBS:
        html = page(size, art, scale, bg)
        f = os.path.join(TMP, "gen.html")
        io.open(f, "w", encoding="utf-8").write(html)
        pg = b.new_page(viewport={"width": size, "height": size}, device_scale_factor=1)
        pg.goto("file:///" + f.replace("\\", "/"))
        pg.wait_for_timeout(220)
        pg.screenshot(path=os.path.join(OUT, name), omit_background=transparent)
        pg.close()
        print("  %-30s %dx%d" % (name, size, size))
    b.close()
print("listo")
