// Génère une page HTML statique par adresse (accueil, collections, 21 fiches…) à partir de app.html,
// pour que Google lise le contenu complet de chaque page. À relancer après chaque modification :
//   node scripts/prerender.js
const http = require('http'), fs = require('fs'), path = require('path');
const { chromium } = require('playwright');
const RACINE = path.resolve(__dirname, '..');
const cat = JSON.parse(fs.readFileSync(path.join(RACINE, 'data/catalogue_produits.json'), 'utf8')).filter(p => p.publie !== false);
const collections = [...new Set(cat.map(p => p.collection_slug))].filter(c => c !== 'les-embiez');
const pagesSimples = ['carreaux','coffrets','sur-mesure','carte-cadeau','projet-specifique','guides','notre-histoire','faq','contact','mentions-legales','cgv','livraison-retours','confidentialite','merci','panier','avis'];
const appSrc = fs.readFileSync(path.join(RACINE, 'app.html'), 'utf8');
const guides = [...appSrc.slice(appSrc.indexOf('/*GUIDES-DEBUT*/'), appSrc.indexOf('/*GUIDES-FIN*/')).matchAll(/slug: '([a-z0-9-]+)'/g)].map(m => m[1]);
const routes = ['/', ...guides.map(g => '/guides/' + g), ...collections.map(c => '/collections/' + c), ...pagesSimples.map(p => '/' + p), ...cat.map(p => '/produits/' + p.slug), '/404'];
// version anglaise (/en) : tout sauf les guides, qui restent en français
const routesEN = ['/en', ...collections.map(c => '/en/collections/' + c), ...pagesSimples.filter(p => p !== 'guides').map(p => '/en/' + p), ...cat.map(p => '/en/produits/' + p.slug)];
routes.splice(routes.length - 1, 0, ...routesEN);
const types = { '.html':'text/html', '.js':'text/javascript', '.json':'application/json', '.webp':'image/webp', '.xml':'application/xml', '.txt':'text/plain' };

const serveur = http.createServer((req, res) => {
  const p = decodeURIComponent(req.url.split('?')[0]);
  const fichier = path.join(RACINE, p);
  if (p !== '/' && fichier.startsWith(RACINE) && fs.existsSync(fichier) && fs.statSync(fichier).isFile()) {
    res.writeHead(200, { 'Content-Type': types[path.extname(fichier)] || 'application/octet-stream' });
    return fs.createReadStream(fichier).pipe(res);
  }
  if (p.startsWith('/api/') || p.startsWith('/_vercel/')) { res.writeHead(404); return res.end(); }
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
  fs.rmSync(path.join(RACINE, 'pages'), { recursive: true, force: true });
  const urls = [];
  for (const r of routes) {
    await page.goto(base + r, { waitUntil: 'networkidle' });
    await page.waitForFunction(() => !document.querySelector('.squelette'), null, { timeout: 10000 });
    await page.evaluate(() => { document.getElementById('app').dataset.prerendu = '1'; document.getElementById('couche').innerHTML = ''; document.getElementById('i18n-js')?.remove(); });
    const html = '<!doctype html>\n' + await page.evaluate(() => document.documentElement.outerHTML);
    const sortie = r === '/' ? 'index.html' : r === '/404' ? '404.html' : path.join('pages', r.slice(1) + '.html');
    fs.mkdirSync(path.join(RACINE, path.dirname(sortie)), { recursive: true });
    fs.writeFileSync(path.join(RACINE, sortie), html);
    if (!['/404', '/merci', '/panier', '/avis', '/en/merci', '/en/panier', '/en/avis'].includes(r)) urls.push(r);
    console.log('✓', r, '→', sortie, await page.title());
  }
  await nav.close(); serveur.close();
  const jour = new Date().toISOString().slice(0, 10);
  fs.writeFileSync(path.join(RACINE, 'sitemap.xml'),
    '<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:xhtml="http://www.w3.org/1999/xhtml">\n' +
    urls.map(u => {
      const fr = u.replace(/^\/en(?=\/|$)/, '') || '/', en = fr === '/' ? '/en' : '/en' + fr, base = fr;
      const alt = urls.includes(en) ? `<xhtml:link rel="alternate" hreflang="fr" href="https://k-reau.fr${fr}"/><xhtml:link rel="alternate" hreflang="en" href="https://k-reau.fr${en}"/><xhtml:link rel="alternate" hreflang="x-default" href="https://k-reau.fr${fr}"/>` : '';
      return `  <url><loc>https://k-reau.fr${u}</loc><lastmod>${jour}</lastmod><priority>${base === '/' ? (u === '/' ? '1.0' : '0.9') : base.startsWith('/produits/') ? '0.8' : base.startsWith('/collections/') ? '0.9' : base.startsWith('/guides/') ? '0.7' : '0.5'}</priority>${alt}</url>`;
    }).join('\n') +
    '\n</urlset>\n');
  console.log(`sitemap : ${urls.length} adresses`);
  // Flux produits pour Google Merchant Center (fiches gratuites dans Google Shopping)
  const xml = t => String(t).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
  const items = cat.map(p => {
    const region = p.collection === 'Marseille' ? 'Marseille' : p.collection === 'Côte Bleue' ? 'la Côte Bleue' : p.collection === 'Montagnes du Sud' ? 'Provence' : p.region || 'Méditerranée';
    return `  <item>
    <g:id>${p.slug}</g:id>
    <g:title>${xml(`Carreau décoratif ${p.nom} – céramique 15 x 15 cm`)}</g:title>
    <g:description>${xml(`${p.description} ${p.a_propos || ''} Carreau en céramique blanche brillante de 15 x 15 cm, illustration noire imprimée en UV. Idée cadeau souvenir ${/^Val /.test(region) ? 'du '+region : /^[AEIOUÎÉ]/.test(region) ? 'd’'+region : 'de '+region}.`)}</g:description>
    <g:link>https://k-reau.fr/produits/${p.slug}</g:link>
    <g:image_link>https://k-reau.fr/${p.image_principale.replace(/^\//,'')}</g:image_link>
${[p.image_en_main,p.image_etagere,p.image_coffret,p.image_detail,p.image_dimensions].filter(Boolean).map(u=>`    <g:additional_image_link>https://k-reau.fr/${u.replace(/^\//,'')}</g:additional_image_link>`).join('\n')}
    <g:availability>in_stock</g:availability>
    <g:price>19.90 EUR</g:price>
    <g:condition>new</g:condition>
    <g:brand>K-Reau</g:brand>
    <g:identifier_exists>no</g:identifier_exists>
    <g:google_product_category>696</g:google_product_category>
    <g:product_type>${xml(`Décoration > Carreaux décoratifs > ${p.collection === 'Signature' ? 'Les Embiez' : p.collection}`)}</g:product_type>
    <g:material>Céramique</g:material>
  </item>`; }).join('\n');
  fs.writeFileSync(path.join(RACINE, 'google-merchant.xml'),
    `<?xml version="1.0" encoding="UTF-8"?>\n<rss version="2.0" xmlns:g="http://base.google.com/ns/1.0">\n<channel>\n  <title>K-Reau – carreaux décoratifs</title>\n  <link>https://k-reau.fr/</link>\n  <description>Carreaux décoratifs illustrés en céramique : Marseille, Côte Bleue, montagnes de Provence, châteaux de France</description>\n${items}\n</channel>\n</rss>\n`);
  console.log(`flux Merchant : ${cat.length} produits`);
  if (erreurs.length) { console.error('Erreurs JS :', erreurs); process.exit(1); }
})();
