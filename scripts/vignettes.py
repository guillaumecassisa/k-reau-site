"""Vignettes légères (220 px) des photos de fiche produit, utilisées par la galerie : img/vignettes/<dossier>/<fichier>.
Lancé automatiquement par scripts/prerender.js ; ne recrée que les vignettes manquantes ou plus anciennes que l'image."""
import json, os
from PIL import Image
R = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
cat = json.load(open(f'{R}/data/catalogue_produits.json', encoding='utf-8'))
n = 0
for p in cat:
    for k in ('image_principale', 'image_en_main', 'image_salon', 'image_etagere', 'image_detail', 'image_coffret', 'image_dimensions'):
        src = p.get(k)
        if not src: continue
        src = src.lstrip('/'); dst = 'img/vignettes/' + src[4:]
        a, b = f'{R}/{src}', f'{R}/{dst}'
        if not os.path.exists(a) or (os.path.exists(b) and os.path.getmtime(b) >= os.path.getmtime(a)): continue
        os.makedirs(os.path.dirname(b), exist_ok=True)
        im = Image.open(a).convert('RGB'); w, h = im.size; c = min(w, h)
        im.thumbnail((260, 260), Image.LANCZOS); im.save(b, 'WEBP', quality=80, method=6); n += 1
print('vignettes créées :', n)
