#!/usr/bin/env python3
"""
NOMÉS PER A PROVES: genera tessel·les SINTÈTIQUES (quadrícula + coordenades, cap cartografia real)
per comprovar la descàrrega offline i el visor sense haver de baixar el mapa real.
Atribució del manifest: "DEMO - NO ÉS CARTOGRAFIA". No publicar-les.

    python tools/demo_tiles.py [carpeta_sortida=mapa]
"""
import json, math, os, sys
from PIL import Image, ImageDraw

out = sys.argv[1] if len(sys.argv) > 1 else "mapa"
Z0, Z1, MARGE = 11, 16, 0.008
ruta = json.load(open(os.path.join(out, "ruta.json"), encoding="utf-8"))
pts = [p for t in ruta["trams"].values() for p in t]
w, e = min(p[0] for p in pts) - MARGE, max(p[0] for p in pts) + MARGE
s, n = min(p[1] for p in pts) - MARGE, max(p[1] for p in pts) + MARGE

def tile(lon, lat, z):
    k = 2 ** z
    sn = math.sin(math.radians(lat))
    return int((lon + 180) / 360 * k), int((0.5 - math.log((1 + sn) / (1 - sn)) / (4 * math.pi)) * k)

llista = []
for z in range(Z0, Z1 + 1):
    x0, y1 = tile(w, s, z); x1, y0 = tile(e, n, z)
    for x in range(x0, x1 + 1):
        for y in range(y0, y1 + 1):
            im = Image.new("RGB", (256, 256), (222 + (x * 7) % 25, 226 + (y * 5) % 20, 205))
            d = ImageDraw.Draw(im)
            d.rectangle([0, 0, 255, 255], outline=(120, 120, 120))
            d.line([0, 0, 255, 255], fill=(190, 190, 190)); d.line([0, 255, 255, 0], fill=(190, 190, 190))
            d.text((8, 8), f"DEMO {z}/{x}/{y}", fill=(60, 60, 60))
            os.makedirs(f"{out}/{z}/{x}", exist_ok=True)
            im.save(f"{out}/{z}/{x}/{y}.webp", "WEBP", quality=60)
            llista.append(f"{z}/{x}/{y}")
json.dump({"versio": "demo", "format": "webp", "tileSize": 256, "minzoom": Z0, "maxzoom": Z1,
           "bbox": [w, s, e, n], "attribution": "DEMO - NO ÉS CARTOGRAFIA", "bytes": 0, "tiles": llista},
          open(f"{out}/manifest.json", "w"), separators=(",", ":"))
print(len(llista), "tessel·les demo")
