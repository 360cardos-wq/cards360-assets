#!/usr/bin/env python3
"""
Genera el paquet de cartografia offline de Campirme (mapa/{z}/{x}/{y}.webp + mapa/manifest.json).

Executa'l al TEU ordinador (amb internet), des de la carpeta campirme-pwa:

    pip install pillow requests
    python tools/build_tiles.py

Font per defecte: ICGC - Mapa topogràfic base (relleu + corbes de nivell), dades obertes
CC BY 4.0 (cal citar l'ICGC: ja ho fa el manifest). Comprova els termes vigents a
https://www.icgc.cat/ca/Descarregues/Condicions-d-us abans de publicar-ho.
Pots canviar la font amb --url (plantilla amb {z}/{x}/{y}); respecta la seva llicència.

Només descarrega les tessel·les que envolten el track (mapa/ruta.json) + marge.
"""
import argparse, io, json, math, os, sys, time
import requests
from PIL import Image

ICGC = "https://geoserveis.icgc.cat/servei/catalunya/mapa-base/wmts/topografic/MON3857/{z}/{x}/{y}.jpeg"

def tile(lon, lat, z):
    n = 2 ** z
    x = int((lon + 180) / 360 * n)
    s = math.sin(math.radians(lat))
    y = int((0.5 - math.log((1 + s) / (1 - s)) / (4 * math.pi)) * n)
    return x, y

def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--url", default=ICGC)
    ap.add_argument("--minzoom", type=int, default=11)
    ap.add_argument("--maxzoom", type=int, default=16)
    ap.add_argument("--marge", type=float, default=0.008, help="graus de marge al voltant del track")
    ap.add_argument("--qualitat", type=int, default=72)
    ap.add_argument("--sortida", default="mapa")
    ap.add_argument("--atribucio", default="© Institut Cartogràfic i Geològic de Catalunya (CC BY 4.0)")
    a = ap.parse_args()

    ruta = json.load(open(os.path.join(a.sortida, "ruta.json"), encoding="utf-8"))
    pts = [p for t in ruta["trams"].values() for p in t]
    w, e = min(p[0] for p in pts) - a.marge, max(p[0] for p in pts) + a.marge
    s, n = min(p[1] for p in pts) - a.marge, max(p[1] for p in pts) + a.marge

    llista = []
    for z in range(a.minzoom, a.maxzoom + 1):
        x0, y1 = tile(w, s, z)
        x1, y0 = tile(e, n, z)
        llista += [(z, x, y) for x in range(x0, x1 + 1) for y in range(y0, y1 + 1)]
    print(len(llista), "tessel·les per descarregar")

    ses = requests.Session()
    ses.headers["User-Agent"] = "Cards360-Campirme-offline-map/1.0"
    total, ok = 0, []
    for i, (z, x, y) in enumerate(llista, 1):
        r = ses.get(a.url.format(z=z, x=x, y=y), timeout=30)
        if r.status_code != 200:
            sys.exit(f"Error {r.status_code} a {z}/{x}/{y}. Revisa la URL (--url).")
        im = Image.open(io.BytesIO(r.content)).convert("RGB")
        d = os.path.join(a.sortida, str(z), str(x))
        os.makedirs(d, exist_ok=True)
        f = os.path.join(d, f"{y}.webp")
        im.save(f, "WEBP", quality=a.qualitat, method=6)
        total += os.path.getsize(f)
        ok.append(f"{z}/{x}/{y}")
        if i % 25 == 0:
            print(f"  {i}/{len(llista)}")
        time.sleep(0.05)   # no saturem el servidor

    json.dump({
        "versio": time.strftime("%Y%m%d"),
        "format": "webp", "tileSize": 256,
        "minzoom": a.minzoom, "maxzoom": a.maxzoom,
        "bbox": [w, s, e, n],
        "attribution": a.atribucio,
        "bytes": total, "tiles": ok,
    }, open(os.path.join(a.sortida, "manifest.json"), "w", encoding="utf-8"), separators=(",", ":"))
    print(f"Fet: {len(ok)} tessel·les, {total/1e6:.1f} MB. Puja la carpeta mapa/ a GitHub.")

main()
