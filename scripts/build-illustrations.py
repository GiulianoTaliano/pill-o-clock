# -*- coding: utf-8 -*-
"""Fuente de las 9 ilustraciones de producto (estados vacios + onboarding).

La version que CORRE en la app es components/Illustration.tsx, que toma los
colores del tema para funcionar en claro y en oscuro. Este archivo mantiene la
misma geometria y sirve para previsualizar las nueve en ambos temas antes de
tocar la app — que es como se detectaron los cuatro rehechos: el recipiente que
se leia como letra "U", el historial que parecia codigo de barras, la alarma
recargada y el candado que habia perdido el arco.

    python scripts/build-illustrations.py   ->  preview.html al lado del script

Si cambia una geometria aca, cambiarla tambien en el componente.
"""
import io, os, sys
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding="utf-8")

def cap(uid, cx, cy, ln, th, rot=45, gap=2.0):
    """Capsula bicolor con corte recto: mitad P (guia) + mitad I (cola)."""
    x, y = cx - ln/2, cy - th/2
    r = f"rotate({rot} {cx} {cy})"
    return f"""<defs><clipPath id="{uid}">
      <rect x="{x}" y="{y}" width="{ln}" height="{th}" rx="{th/2}" transform="{r}"/>
    </clipPath></defs>
    <g clip-path="url(#{uid})">
      <rect x="{x-3}" y="{y-5}" width="{ln/2-gap/2+3}" height="{th+10}" fill="P" transform="{r}"/>
      <rect x="{cx+gap/2}" y="{y-5}" width="{ln/2+3}" height="{th+10}" fill="I" transform="{r}"/>
    </g>"""

# Encuadre ajustado a la union de las 9 escenas: sin aire muerto alrededor.
VB = 'viewBox="12 16 96 70" xmlns="http://www.w3.org/2000/svg"'

SCENES = {
# ── Estados vacios ───────────────────────────────────────────────────────
"noMeds": f"""<svg {VB}>
  <!-- Compartimento de pastillero abierto, visto de frente. Antes era una "U"
       que se leia como letra; una caja con paredes y piso lee como recipiente. -->
  <path d="M32 30 h10 v34 h36 V30 h10 v40 a8 8 0 0 1-8 8 H40 a8 8 0 0 1-8-8 Z" fill="W"/>
  {cap("c1", 60, 66, 24, 10)}
</svg>""",

"noDoses": f"""<svg {VB}>
  {cap("c2", 26, 50, 26, 11)}
  {cap("c3", 60, 50, 26, 11)}
  {cap("c4", 94, 50, 26, 11)}
</svg>""",

"noHistory": f"""<svg {VB}>
  <!-- Linea de tiempo con marcas vacias: dice "todavia no se registro nada"
       mejor que unas barras, que se leian como codigo de barras. -->
  <rect x="24" y="56" width="72" height="4" rx="2" fill="W"/>
  <g fill="W"><circle cx="40" cy="58" r="6"/><circle cx="60" cy="58" r="6"/><circle cx="80" cy="58" r="6"/></g>
  {cap("c5", 60, 34, 26, 11)}
</svg>""",

"noAllergies": f"""<svg {VB}>
  <path d="M48 28 L68 22 L88 28 v22 c0 14-11 23-20 27-9-4-20-13-20-27 Z" fill="W"/>
  {cap("c6", 30, 62, 24, 10)}
</svg>""",

"obMeds": f"""<svg {VB}>
  {cap("o1", 46, 38, 30, 12)}
  {cap("o2", 76, 46, 22, 10)}
  {cap("o3", 44, 66, 22, 10)}
  {cap("o4", 74, 72, 16, 8)}
</svg>""",

"obAlarm": f"""<svg {VB}>
  <!-- Capsula vertical + arcos, sin el reloj: los arcos ya dicen "suena", y el
       circulo extra se montaba encima. Una cosa menos. -->
  <g stroke="A" stroke-width="4" fill="none" stroke-linecap="round">
    <path d="M40 40 a14 14 0 0 0 0 22"/><path d="M31 32 a23 23 0 0 0 0 38"/>
    <path d="M80 40 a14 14 0 0 1 0 22"/><path d="M89 32 a23 23 0 0 1 0 38"/>
  </g>
  {cap("o5", 60, 51, 42, 20, rot=90)}
</svg>""",

"obAppointments": f"""<svg {VB}>
  <g fill="W">
    <rect x="30" y="24" width="15" height="15" rx="4"/><rect x="50" y="24" width="15" height="15" rx="4"/>
    <rect x="70" y="24" width="15" height="15" rx="4"/><rect x="30" y="44" width="15" height="15" rx="4"/>
    <rect x="70" y="44" width="15" height="15" rx="4"/><rect x="30" y="64" width="15" height="15" rx="4"/>
    <rect x="50" y="64" width="15" height="15" rx="4"/>
  </g>
  <rect x="50" y="44" width="15" height="15" rx="4" fill="P"/>
  {cap("o6", 84, 73, 22, 10)}
</svg>""",

"obHealth": f"""<svg {VB}>
  <polyline points="30,70 48,56 66,62 90,32" fill="none" stroke="P" stroke-width="4"
            stroke-linecap="round" stroke-linejoin="round"/>
  <g fill="P"><circle cx="48" cy="56" r="4.5"/><circle cx="66" cy="62" r="4.5"/><circle cx="90" cy="32" r="4.5"/></g>
  {cap("o7", 30, 70, 20, 9)}
</svg>""",

"obPrivacy": f"""<svg {VB}>
  <!-- La capsula ES el arco del candado: se dibuja como un trazo grueso curvo
       partido en dos mitades, con las puntas redondeadas. Antes era una capsula
       recta apoyada arriba y se leia como una pastilla sobre una caja. -->
  <g fill="none" stroke-width="13" stroke-linecap="round">
    <path d="M45 52 v-8 a15 15 0 0 1 15-15" stroke="P"/>
    <path d="M60 29 a15 15 0 0 1 15 15 v8" stroke="I"/>
  </g>
  <rect x="35" y="50" width="50" height="32" rx="8" fill="W"/>
  <circle cx="60" cy="63" r="5" fill="I"/><rect x="57.8" y="63" width="4.4" height="10" rx="2.2" fill="I"/>
</svg>""",
}

LIGHT = {"P": "#2f7de1", "I": "#0e1a2d", "W": "#dce9fb", "A": "#a8541a", "BG": "#f1f6fd"}
DARK  = {"P": "#60a5fa", "I": "#e2e8f0", "W": "#24344a", "A": "#fbbf24", "BG": "#0b1220"}

def paint(svg, pal, uid_suffix):
    for k in ("P", "I", "W", "A"):
        svg = svg.replace(f'"{k}"', f'"{pal[k]}"')
    return svg.replace('id="', f'id="{uid_suffix}').replace('url(#', f'url(#{uid_suffix}')

cells_l = "".join(f'<div class="c"><div class="art">{paint(s, LIGHT, "L")}</div><span>{n}</span></div>'
                  for n, s in SCENES.items())
cells_d = "".join(f'<div class="c"><div class="art">{paint(s, DARK, "D")}</div><span>{n}</span></div>'
                  for n, s in SCENES.items())
html = f"""<style>
body{{margin:0;font:12px ui-sans-serif,system-ui}}
.pane{{padding:18px}} .light{{background:#f1f6fd;color:#0e1a2d}} .dark{{background:#0b1220;color:#cbd5e1}}
.grid{{display:flex;flex-wrap:wrap;gap:14px}}
.c{{width:180px;text-align:center}} .art svg{{width:150px;height:109px}}
.c span{{display:block;font-size:10px;opacity:.65;margin-top:2px}}
h4{{margin:0 0 10px;font-size:11px;letter-spacing:.1em;text-transform:uppercase;opacity:.6}}
</style>
<div class="pane light"><h4>Claro — tamano real (150px)</h4><div class="grid">{cells_l}</div></div>
<div class="pane dark"><h4>Oscuro</h4><div class="grid">{cells_d}</div></div>"""
io.open(os.path.join(os.path.dirname(os.path.abspath(__file__)), "preview.html"), "w", encoding="utf-8").write(html)
print("preview ok -", len(SCENES), "escenas")
