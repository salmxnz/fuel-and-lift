"""Turn shapely polygons built from known circles/lines back into clean SVG arcs."""
import math
from shapely.geometry import Polygon
from geo import fmt

def _on_circle(p, c, tol):
    return abs(math.hypot(p[0] - c[0], p[1] - c[1]) - c[2]) < tol

def ring_to_d(coords, circles, tol=0.08):
    pts = list(coords)[:-1]
    n = len(pts)
    # label each segment with a circle index or None (straight)
    lab = []
    for i in range(n):
        a, b = pts[i], pts[(i + 1) % n]
        m = ((a[0] + b[0]) / 2, (a[1] + b[1]) / 2)
        k = None
        for j, c in enumerate(circles):
            if _on_circle(a, c, tol) and _on_circle(b, c, tol) and _on_circle(m, c, tol + 0.05):
                k = j
                break
        lab.append(k)
    # rotate so we start at a label change (or anywhere if uniform)
    start = next((i for i in range(n) if lab[i] != lab[i - 1]), 0)
    pts = pts[start:] + pts[:start]
    lab = lab[start:] + lab[:start]
    d = "M%s %s" % (fmt(pts[0][0]), fmt(pts[0][1]))
    i = 0
    while i < n:
        k = lab[i]
        j = i
        while j + 1 < n and lab[j + 1] == k:
            j += 1
        seg = [pts[t % n] for t in range(i, j + 2)]
        if k is None:
            # straight run: keep only direction changes
            keep = [seg[0]]
            for t in range(1, len(seg) - 1):
                (x0, y0), (x1, y1), (x2, y2) = keep[-1], seg[t], seg[t + 1]
                if abs((x1 - x0) * (y2 - y0) - (y1 - y0) * (x2 - x0)) > 0.5:
                    keep.append(seg[t])
            for p in keep[1:] + [seg[-1]]:
                d += "L%s %s" % (fmt(p[0]), fmt(p[1]))
        else:
            cx, cy, r = circles[k]
            span = 0.0
            for a, b in zip(seg, seg[1:]):
                t0 = math.atan2(a[1] - cy, a[0] - cx)
                t1 = math.atan2(b[1] - cy, b[0] - cx)
                dt = (t1 - t0 + math.pi) % (2 * math.pi) - math.pi
                span += dt
            sweep = 1 if span > 0 else 0
            end = seg[-1]
            if abs(span) > 2 * math.pi - 0.01:  # full circle: two halves
                a = seg[0]
                opp = (2 * cx - a[0], 2 * cy - a[1])
                d += "A%s %s 0 1 %d %s %s" % (fmt(r), fmt(r), sweep, fmt(opp[0]), fmt(opp[1]))
                d += "A%s %s 0 1 %d %s %s" % (fmt(r), fmt(r), sweep, fmt(a[0]), fmt(a[1]))
            else:
                large = 1 if abs(span) > math.pi else 0
                d += "A%s %s 0 %d %d %s %s" % (fmt(r), fmt(r), large, sweep, fmt(end[0]), fmt(end[1]))
        i = j + 1
    return d + "Z"

def to_d(g, circles):
    polys = [g] if isinstance(g, Polygon) else list(g.geoms)
    d = ""
    for p in polys:
        d += ring_to_d(p.exterior.coords, circles)
        for h in p.interiors:
            d += ring_to_d(h.coords, circles)
    return d
