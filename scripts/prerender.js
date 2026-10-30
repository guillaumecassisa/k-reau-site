// Génère une page HTML statique par adresse (accueil, collections, 21 fiches…) à partir de app.html,
// pour que Google lise le contenu complet de chaque page. À relancer après chaque modification :
//   node scripts/prerender.js
const http = require('http'), fs = require('fs'), path = require('path');
const { chromium } = require('playwright');
const RACINE = path.resolve(__dirname, '..');
const cat = JSON.parse(fs.readFileSync(path.join(RACINE, 'data/catalogue_produits.json'), 'utf8'));
const pagesSimples = ['carreaux','notre-histoire','faq','contact','mentions-legales','cgv','livraison-retours','confidentialite','merci','panier','avant-lancement'];
const routes = ['/', '/collections/marseille', '/collections/cote-bleue', ...pagesSimples.map(p => '/' + p), ...cat.map(p => '/produits/' + p.slug), '/404'];
const types = { '.html':'text/html', '.js':'text/javascript', '.json':'application/json', '.webp':'image/webp', '.xml':'application/xml', '.txt':'text/plain' };

const serveur = http.createServer((req, res) => {
  const p = decodeURIComponent(req.url.split('?')[0]);
  const fichier = path.join(RACINE, p);
  if (p !== '/' && fichier.startsWith(RACINE) && fs.existsSync(fichier) && fs.statSync(fichier).isFile()) {
    res.writeHead(200, { 'Content-Type': types[path.extname(fichier)] || 'application/octet-stream' });
    return fs.createReadStream(fichier).pipe(res);
  }
  if (p.startsWith('/api/')) { res.writeHead(404); return res.end(); }
  res.writeHead(200, { 'Content-Type': 'text/html' }); fs.createReadStream(path.join(RACINE, 'app.html')).pipe(res);
});

(async () => {
  await new Promise(r => serveur.listen(0, r));
  const base = `http://localhost:${serveur.address().port}`;
  const nav = await chromium.launch();
  const page = await nav.newPage({ viewport: { width: 1280, height: 900 } });
  await page.route(/fonts\.(googleapis|gstatic)\.com/, r => r.abort());
  const erreurs = [];
  page.on('pageerror', e => erreurs.push(e.message));
  const urls = [];
  for (const r of routes) {
    await page.goto(base + r, { waitUntil: 'networkidle' });
    await page.waitForFunction(() => !document.querySelector('.squelette'), null, { timeout: 10000 });
    await page.evaluate(() => { document.getElementById('app').dataset.prerendu = '1'; document.getElementById('couche').innerHTML = ''; });
    const html = '<!doctype html>\n' + await page.evaluate(() => document.documentElement.outerHTML);
    const sortie = r === '/' ? 'index.html' : r === '/404' ? '404.html' : path.join('pages', r.slice(1) + '.html');
    fs.mkdirSync(path.join(RACINE, path.dirname(sortie)), { recursive: true });
    fs.writeFileSync(path.join(RACINE, sortie), html);
    if (!['/404', '/merci', '/panier', '/avant-lancement'].includes(r)) urls.push(r);
    console.log('✓', r, '→', sortie, await page.title());
  }
  await nav.close(); serveur.close();
  const jour = new Date().toISOString().slice(0, 10);
  fs.writeFileSync(path.join(RACINE, 'sitemap.xml'),
    '<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n' +
    urls.map(u => `  <url><loc>https://k-reau.fr${u}</loc><lastmod>${jour}</lastmod><priority>${u === '/' ? '1.0' : u.startsWith('/produits/') ? '0.8' : u.startsWith('/collections/') ? '0.9' : '0.5'}</priority></url>`).join('\n') +
    '\n</urlset>\n');
  console.log(`sitemap : ${urls.length} adresses`);
  if (erreurs.length) { console.error('Erreurs JS :', erreurs); process.exit(1); }
})();
