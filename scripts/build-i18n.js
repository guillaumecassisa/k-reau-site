// Assemble i18n-en.js (moteur + dictionnaire + motifs) : node scripts/build-i18n.js
const fs = require('fs'), path = require('path');
const R = path.resolve(__dirname, '..'), dir = path.join(R, 'i18n');
const dict = {};
for (const f of fs.readdirSync(dir).filter(f => /^en-.*\.json$/.test(f)).sort()) {
  const d = JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8'));
  for (const [k, v] of Object.entries(d)) if (v) dict[k.replace(/\s+/g, ' ').trim()] = v;
}
// textes des carreaux (traduits par fiche) + forme anglaise du nom pour les titres
const cat = JSON.parse(fs.readFileSync(path.join(R, 'data/catalogue_produits.json'), 'utf8')).filter(p => p.publie !== false);
const prods = Object.assign({}, ...fs.readdirSync(dir).filter(f => /^produits-en.*\.json$/.test(f)).map(f => JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8'))));
const n = s => s.replace(/\s+/g, ' ').trim();
const manquants = [];
for (const p of cat) {
  const e = prods[p.slug]; if (!e) { manquants.push(p.slug); continue; }
  prods.__liste = prods.__liste || [];
  prods.__liste.push([n(p.description), n(p.a_propos || ''), e.d, e.a || '']);   // textes des fiches (la combinaison « description + à propos » est recréée par le moteur)
  dict['§n:' + p.nom] = e.n;
}
if (manquants.length) console.warn('Carreaux sans traduction :', manquants.join(', '));
const motifs = fs.readFileSync(path.join(dir, 'motifs.js'), 'utf8').trim().replace(/;$/, '');
const js = fs.readFileSync(path.join(dir, 'moteur.js'), 'utf8').replace('__DICT__', JSON.stringify(dict)).replace('__PATTERNS__', motifs).replace('__PROD__', JSON.stringify(prods.__liste || []));
fs.writeFileSync(path.join(R, 'i18n-en.js'), js);
console.log('i18n-en.js :', Object.keys(dict).length, 'entrées,', Math.round(js.length / 1024), 'Ko');
