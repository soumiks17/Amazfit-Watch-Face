"""Original 7- and 14-segment LCD glyphs, drawn from polygons.

Everything here is generated geometry, so the glyph artwork carries no font
licence and can ship under the repo's own licence.
"""
import math

SEVEN = {
    "0": "abcdef", "1": "bc", "2": "abdeg", "3": "abcdg", "4": "bcfg",
    "5": "acdfg", "6": "acdefg", "7": "abc", "8": "abcdefg", "9": "abcdfg",
    "-": "g", " ": "",
}

# 14-segment map. Outer ring a-f like a 7-seg, g1/g2 the split middle bar,
# i/l the centre verticals, h/j/k/m the four diagonals
# (h upper-left, j upper-right, k lower-left, m lower-right).
FOURTEEN = {
    "A": ["a", "b", "c", "e", "f", "g1", "g2"],
    "B": ["a", "b", "c", "d", "i", "l", "g2"],
    "C": ["a", "d", "e", "f"],
    "D": ["a", "b", "c", "d", "i", "l"],
    "E": ["a", "d", "e", "f", "g1", "g2"],
    "F": ["a", "e", "f", "g1"],
    "G": ["a", "c", "d", "e", "f", "g2"],
    "H": ["b", "c", "e", "f", "g1", "g2"],
    "I": ["a", "d", "i", "l"],
    "J": ["b", "c", "d", "e"],
    "K": ["e", "f", "g1", "j", "m"],
    "L": ["d", "e", "f"],
    "M": ["b", "c", "e", "f", "h", "j"],
    "N": ["b", "c", "e", "f", "h", "m"],
    "O": ["a", "b", "c", "d", "e", "f"],
    "P": ["a", "b", "e", "f", "g1", "g2"],
    "Q": ["a", "b", "c", "d", "e", "f", "m"],
    "R": ["a", "b", "e", "f", "g1", "g2", "m"],
    "S": ["a", "c", "d", "f", "g1", "g2"],
    "T": ["a", "i", "l"],
    "U": ["b", "c", "d", "e", "f"],
    "V": ["e", "f", "k", "j"],
    "W": ["b", "c", "e", "f", "k", "m"],
    "X": ["h", "j", "k", "m"],
    "Y": ["h", "j", "l"],
    "Z": ["a", "d", "j", "k"],
    "0": ["a", "b", "c", "d", "e", "f", "j", "k"],
    "1": ["b", "c", "j"],
    "2": ["a", "b", "d", "e", "g1", "g2"],
    "3": ["a", "b", "c", "d", "g2"],
    "4": ["b", "c", "f", "g1", "g2"],
    "5": ["a", "c", "d", "f", "g1", "g2"],
    "6": ["a", "c", "d", "e", "f", "g1", "g2"],
    "7": ["a", "b", "c"],
    "8": ["a", "b", "c", "d", "e", "f", "g1", "g2"],
    "9": ["a", "b", "c", "d", "f", "g1", "g2"],
    "-": ["g1", "g2"],
    "·": [],
    " ": [],
}
ALL14 = ["a", "b", "c", "d", "e", "f", "g1", "g2", "h", "i", "j", "k", "l", "m"]


def _hbar(x0, x1, y, t):
    h = t / 2
    return [(x0, y), (x0 + h, y - h), (x1 - h, y - h), (x1, y), (x1 - h, y + h), (x0 + h, y + h)]


def _vbar(x, y0, y1, t):
    h = t / 2
    return [(x, y0), (x + h, y0 + h), (x + h, y1 - h), (x, y1), (x - h, y1 - h), (x - h, y0 + h)]


def _line(p0, p1, t):
    (x0, y0), (x1, y1) = p0, p1
    dx, dy = x1 - x0, y1 - y0
    n = math.hypot(dx, dy) or 1
    ox, oy = -dy / n * t / 2, dx / n * t / 2
    return [(x0 + ox, y0 + oy), (x1 + ox, y1 + oy), (x1 - ox, y1 - oy), (x0 - ox, y0 - oy)]


def seven_polys(w, h, t, g):
    ht = t / 2
    m = h / 2
    return {
        "a": _hbar(ht + g, w - ht - g, ht, t),
        "b": _vbar(w - ht, ht + g, m - g, t),
        "c": _vbar(w - ht, m + g, h - ht - g, t),
        "d": _hbar(ht + g, w - ht - g, h - ht, t),
        "e": _vbar(ht, m + g, h - ht - g, t),
        "f": _vbar(ht, ht + g, m - g, t),
        "g": _hbar(ht + g, w - ht - g, m, t),
    }


def fourteen_polys(w, h, t, g):
    ht = t / 2
    m = h / 2
    c = w / 2
    p = {
        "a": _hbar(ht + g, w - ht - g, ht, t),
        "b": _vbar(w - ht, ht + g, m - g, t),
        "c": _vbar(w - ht, m + g, h - ht - g, t),
        "d": _hbar(ht + g, w - ht - g, h - ht, t),
        "e": _vbar(ht, m + g, h - ht - g, t),
        "f": _vbar(ht, ht + g, m - g, t),
        "g1": _hbar(ht + g, c - g, m, t),
        "g2": _hbar(c + g, w - ht - g, m, t),
        "i": _vbar(c, ht + g + t / 2, m - g, t),
        "l": _vbar(c, m + g, h - ht - g - t / 2, t),
    }
    dt = t * 0.85
    inset = t + g
    p["h"] = _line((inset, inset), (c - ht - g, m - ht - g), dt)
    p["j"] = _line((w - inset, inset), (c + ht + g, m - ht - g), dt)
    p["k"] = _line((inset, h - inset), (c - ht - g, m + ht + g), dt)
    p["m"] = _line((w - inset, h - inset), (c + ht + g, m + ht + g), dt)
    return p


def shear(poly, h, slant_deg):
    k = math.tan(math.radians(slant_deg))
    return [(x + (h - y) * k, y) for x, y in poly]
