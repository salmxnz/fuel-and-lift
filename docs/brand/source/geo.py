"""Tiny geometry kit: build shapes with shapely, emit clean SVG paths."""
from shapely.geometry import Point, box, Polygon, MultiPolygon
from shapely.ops import unary_union
from shapely import affinity

Q = 128  # segments per quarter circle -> smooth at any size


def disc(cx, cy, r):
    return Point(cx, cy).buffer(r, quad_segs=Q)


def ring(cx, cy, ro, ri):
    return disc(cx, cy, ro).difference(disc(cx, cy, ri))


def rect(x0, y0, x1, y1):
    return box(x0, y0, x1, y1)


def rrect(x0, y0, x1, y1, r):
    return box(x0 + r, y0 + r, x1 - r, y1 - r).buffer(r, quad_segs=Q)


def union(*gs):
    return unary_union(gs)


def _ring_d(coords):
    pts = list(coords)[:-1]
    out = "M%s,%s" % (fmt(pts[0][0]), fmt(pts[0][1]))
    out += "L" + " ".join("%s,%s" % (fmt(x), fmt(y)) for x, y in pts[1:]) + "Z"
    return out


def fmt(v):
    s = "%.2f" % v
    s = s.rstrip("0").rstrip(".")
    return "0" if s == "-0" else s


def path_d(g):
    g = g.simplify(0.02)
    polys = [g] if isinstance(g, Polygon) else list(g.geoms)
    d = ""
    for p in polys:
        d += _ring_d(p.exterior.coords)
        for h in p.interiors:
            d += _ring_d(h.coords)
    return d


def svg(g, w=256, h=256, fill="#111111", title="adebite logo", extra=""):
    return (f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {w} {h}" width="{w}" height="{h}" '
            f'role="img" aria-labelledby="title"><title id="title">{title}</title>{extra}'
            f'<path fill="{fill}" fill-rule="evenodd" d="{path_d(g)}"/></svg>\n')


def save(path, g, **kw):
    with open(path, "w") as f:
        f.write(svg(g, **kw))
