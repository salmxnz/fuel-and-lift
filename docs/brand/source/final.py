"""Builds the adebite logo masters in docs/brand/logo.

Run: python3 final.py ../logo   (needs shapely: pip install shapely)
"""
import math, sys, os
from geo import disc, ring, rect, union, Polygon
from shapely import affinity
from arcs import to_d

PINK, PLUM, WHITE, BLACK = "#F6B8CA", "#2E1A24", "#FFFFFF", "#000000"

# ---------- symbol: bitten "a" on a 256 grid ----------
def symbol():
    cx, cy, R, S = 128, 126, 88, 48
    circles = [(cx, cy, R), (cx, cy, R - S)]
    g = union(ring(cx, cy, R, R - S), rect(cx + R - S, cy - R + 2, cx + R, cy + R - 2))
    for a in (-138, -110):
        bx, by = cx + (R + 6) * math.cos(math.radians(a)), cy + (R + 6) * math.sin(math.radians(a))
        circles.append((bx, by, 28))
        g = g.difference(disc(bx, by, 28))
    return to_d(g, circles)

# ---------- wordmark: geometric lowercase, stroke 32, x-height 120 ----------
S, XH, BASE, ASC, CY, RO, RI = 32, 88, 208, 32, 148, 62, 30

def wordmark():
    circles, parts = [], []
    def bowl(cx):
        circles.extend([(cx, CY, RO), (cx, CY, RI)])
        return ring(cx, CY, RO, RI)
    def a(x): cx = x + RO; return union(bowl(cx), rect(cx + RO - S, XH, cx + RO, BASE)), 2 * RO
    def d(x): cx = x + RO; return union(bowl(cx), rect(cx + RO - S, ASC, cx + RO, BASE)), 2 * RO
    def b(x): cx = x + RO; return union(bowl(cx), rect(cx - RO, ASC, cx - RO + S, BASE)), 2 * RO
    def e(x):
        cx = x + RO
        t = math.tan(math.radians(38))
        g = bowl(cx).difference(Polygon([(cx + 14 / t, 162), (cx + 90, 162), (cx + 90, CY + 90 * t)]))
        return union(g, rect(cx - RI - 1, 136, cx + RI + 1, 162)), 2 * RO
    def i(x):
        circles.append((x + S / 2, 52, 19))
        return union(rect(x, XH, x + S, BASE), disc(x + S / 2, 52, 19)), S
    def t(x): return union(rect(x + 22, 48, x + 22 + S, BASE), rect(x, XH, x + 22 + S + 24, XH + 26)), 22 + S + 24
    seq = [("a", a), ("d", d), ("e", e), ("b", b), ("i", i), ("t", t), ("e", e)]
    kern = {("a", "d"): 14, ("d", "e"): 16, ("e", "b"): 16, ("b", "i"): 20, ("i", "t"): 14, ("t", "e"): 12}
    x, prev = 0, None
    for name, fn in seq:
        if prev: x += kern[(prev, name)]
        g, w = fn(x); parts.append(g); x += w; prev = name
    g = union(*parts)
    minx, miny, maxx, maxy = g.bounds
    return to_d(g, circles), (minx, miny, maxx, maxy)

def svg(w, h, body, title="adebite"):
    return (f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {w:g} {h:g}" width="{w:g}" height="{h:g}" '
            f'role="img" aria-labelledby="title"><title id="title">{title}</title>{body}</svg>\n')

def path(d, fill, tf=""):
    t = f' transform="{tf}"' if tf else ""
    return f'<path fill="{fill}" fill-rule="evenodd"{t} d="{d}"/>'

if __name__ == "__main__":
    out = sys.argv[1]; os.makedirs(out, exist_ok=True)
    sd = symbol()
    wd, (x0, y0, x1, y1) = wordmark()
    W = lambda name, s: open(os.path.join(out, name), "w").write(s)
    for nm, c in (("pink", PINK), ("plum", PLUM), ("white", WHITE), ("black", BLACK)):
        W(f"adebite-symbol-{nm}.svg", svg(256, 256, path(sd, c), "adebite symbol"))
    # wordmark cropped to its ink box (height 176 incl. ascender), 16 padding
    ww, wh = x1 - x0, y1 - y0
    for nm, c in (("plum", PLUM), ("pink", PINK), ("white", WHITE), ("black", BLACK)):
        W(f"adebite-wordmark-{nm}.svg", svg(round(ww + 32), round(wh + 32), path(wd, c, f"translate({16 - x0:g} {16 - y0:g})"), "adebite"))
    # horizontal lockup: symbol 256 tall; wordmark x-height optically matched to the bowl
    k = 0.62
    sym_box = 256
    tx = sym_box + 16
    ty = 126 - (CY * k)  # centre the x-height on the bowl centre
    lw = tx + (x1) * k + 24
    for nm, cs, cw in (("color", PINK, PLUM), ("on-pink", WHITE, PLUM), ("plum", PLUM, PLUM), ("white", WHITE, WHITE), ("black", BLACK, BLACK), ("pink", PINK, PINK)):
        body = path(sd, cs) + path(wd, cw, f"translate({tx:g} {ty:.2f}) scale({k})")
        W(f"adebite-lockup-{nm}.svg", svg(round(lw), 256, body, "adebite"))
    # app icons: rounded (transparent outside) and full-bleed square
    icon = lambda rx, scale: svg(1024, 1024, f'<rect width="1024" height="1024" rx="{rx}" fill="{PINK}"/>' +
        path(sd, WHITE, f"translate({512 - 128 * scale * 4:g} {512 - 128 * scale * 4:g}) scale({scale * 4:g})"), "adebite app icon")
    W("adebite-icon.svg", icon(229, 0.68))
    W("adebite-icon-square.svg", icon(0, 0.68))
    W("adebite-icon-maskable.svg", icon(0, 0.56))
    # Paths for web/components/brand/logo.tsx and web/scripts/make-icons.mjs
    print(f"SYMBOL={sd}\nWORDMARK={wd}")
