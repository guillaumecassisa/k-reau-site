# Fond de carte « au trait » pour la page /carte de k-reau.fr
# Entrée : contours des départements (france-geojson, données IGN/OSM simplifiées)
# Sortie : k-reau-site/data/carte.json (deux vues : Provence et zoom Marseille), chemins SVG prêts à l'emploi
import json, math
from shapely.geometry import shape, box, LineString, MultiLineString, Polygon, MultiPolygon
from shapely.ops import unary_union, linemerge

SRC = '/home/claude/kreau-carte-lieux/geo/dep-fin.geojson'
OUT = '/home/claude/k-reau-site/data/carte.json'
deps = [(f['properties']['code'], f['properties']['nom'], shape(f['geometry'])) for f in json.load(open(SRC))['features']]

VUES = {
  'provence': dict(bbox=(4.45, 42.95, 7.40, 44.33), w=1000, tol=0.0035,
                   villes=[('Marseille', 5.3698, 43.2965), ('Aix-en-Provence', 5.4474, 43.5297), ('Toulon', 5.9280, 43.1242),
                           ('Avignon', 4.8057, 43.9493), ('Apt', 5.3964, 43.8763), ('Martigues', 5.0548, 43.4053), ('Salon-de-Provence', 5.0970, 43.6403), ('Nice', 7.2620, 43.7102)]),
  'marseille': dict(bbox=(5.00, 43.14, 5.66, 43.40), w=1000, tol=0.0006,
                    villes=[('Marseille', 5.4000, 43.3150), ('Cassis', 5.5380, 43.2250), ('Aubagne', 5.5700, 43.2928), ('Carry-le-Rouet', 5.1530, 43.3420)]),
}

def proj(v):
    x0, y0, x1, y1 = v['bbox']; c = math.cos(math.radians((y0 + y1) / 2))
    k = v['w'] / ((x1 - x0) * c); h = (y1 - y0) * k
    return (lambda lon, lat: ((lon - x0) * c * k, (y1 - lat) * k)), round(h)

def chemin(geom, p, fermer):
    out = []
    def ligne(coords, ferme):
        pts = [p(x, y) for x, y in coords]
        if len(pts) < 2: return
        s = 'M' + ' L'.join(f'{x:.1f} {y:.1f}' for x, y in pts)
        out.append(s + ('Z' if ferme else ''))
    def visite(g):
        if g.is_empty: return
        if isinstance(g, Polygon):
            ligne(g.exterior.coords, True); [ligne(i.coords, True) for i in g.interiors]
        elif isinstance(g, LineString): ligne(g.coords, False)
        elif hasattr(g, 'geoms'): [visite(x) for x in g.geoms]
    visite(geom)
    return ' '.join(out)

res = {}
for nom, v in VUES.items():
    p, h = proj(v); cadre = box(*v['bbox']); grand = cadre.buffer(0.3)
    loc = [(c, n, g.intersection(grand)) for c, n, g in deps if g.intersects(grand)]
    terre = unary_union([g for _, _, g in loc]).buffer(0)
    cote = terre.boundary
    frontieres = unary_union([g.simplify(v['tol'] * 1.5, preserve_topology=True).boundary for _, _, g in loc]).difference(cote.buffer(0.01))
    terre_c = terre.intersection(cadre).simplify(v['tol'], preserve_topology=True)
    fr = frontieres.intersection(cadre)
    fr = linemerge(fr) if fr.geom_type == 'MultiLineString' else fr
    front_c = fr
    res[nom] = {'w': v['w'], 'h': h, 'bbox': v['bbox'], 'terre': chemin(terre_c, p, True), 'frontieres': chemin(front_c, p, False),
                'villes': [{'nom': n, 'x': round(p(lo, la)[0], 1), 'y': round(p(lo, la)[1], 1)} for n, lo, la in v['villes']]}
    print(nom, h, len(res[nom]['terre']) // 1024, 'Ko terre', len(res[nom]['frontieres']) // 1024, 'Ko frontières')
json.dump(res, open(OUT, 'w'), separators=(',', ':'))
