// Rapport quotidien des commandes (PDF envoyé par e-mail à K-Reau vers 19 h, heure de Paris).
// Période : de la veille 19 h 00 au jour même 19 h 00 (heure de Paris), commandes réglées ou offertes.
// Deux tâches Vercel (17 h et 18 h UTC) : seule celle qui tombe à 19 h à Paris envoie (heure d'hiver comme d'été).
const { stripe, euros, payee, envoyerMail, base, tropDeRequetes, echap } = require('./_commun');
const { PDF } = require('./_pdf');

const HEURE = 19;
const PAYS = { FR: 'France', MC: 'Monaco', BE: 'Belgique', CH: 'Suisse', LU: 'Luxembourg', DE: 'Allemagne', ES: 'Espagne', IT: 'Italie', NL: 'Pays-Bas', PT: 'Portugal', AT: 'Autriche', IE: 'Irlande', CA: 'Canada', GB: 'Royaume-Uni' };

// Décalage de Paris par rapport à UTC (en minutes) à un instant donné
function decalageParis(t) {
  const n = new Intl.DateTimeFormat('en-US', { timeZone: 'Europe/Paris', timeZoneName: 'shortOffset' }).formatToParts(new Date(t)).find(p => p.type === 'timeZoneName').value;
  const m = n.match(/GMT([+-]\d+)(?::(\d+))?/); return m ? parseInt(m[1], 10) * 60 + (m[2] ? Math.sign(parseInt(m[1], 10)) * parseInt(m[2], 10) : 0) : 60;
}
function partiesParis(t) {
  const p = Object.fromEntries(new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/Paris', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).formatToParts(new Date(t)).map(x => [x.type, x.value]));
  return { a: +p.year, m: +p.month, j: +p.day, h: +p.hour, min: +p.minute };
}
// Instant UTC correspondant à « jour (a-m-j) à HEURE:00 heure de Paris »
function instantParis(a, m, j, h) {
  const approx = Date.UTC(a, m - 1, j, h, 0) - 60 * 60000;
  return Date.UTC(a, m - 1, j, h, 0) - decalageParis(approx) * 60000;
}
const fmt = (t, o) => new Intl.DateTimeFormat('fr-FR', { timeZone: 'Europe/Paris', ...o }).format(new Date(t));
const heure = t => fmt(t, { hour: '2-digit', minute: '2-digit' }).replace(':', 'h');

async function sessionsDuJour(debut, fin) {
  const liste = []; let apres;
  for (let i = 0; i < 10; i++) {
    const p = { limit: 100, status: 'complete', created: { gte: Math.floor(debut / 1000), lt: Math.floor(fin / 1000) } };
    if (apres) p.starting_after = apres;
    const r = await stripe('GET', 'checkout/sessions', p);
    liste.push(...r.data.filter(payee));
    if (!r.has_more || !r.data.length) break;
    apres = r.data[r.data.length - 1].id;
  }
  const completes = [];
  for (const s of liste) completes.push(await stripe('GET', `checkout/sessions/${s.id}`, { 'expand[]': 'line_items.data.price.product' }));
  return completes.sort((a, b) => a.created - b.created);
}

// Lecture d'une commande : client, adresse, articles classés (carreau, coffret, sur mesure, accessoire, carte cadeau)
function lire(s) {
  const md = s.metadata || {};
  const cli = s.customer_details || {};
  const liv = s.shipping_details || {};
  const adr = liv.address || (cli.address && cli.address.line1 ? cli.address : null);
  const articles = (s.line_items && s.line_items.data || []).map(l => {
    const prod = l.price && typeof l.price.product === 'object' ? l.price.product : {};
    const nom = prod.name || l.description || '';
    const desc = prod.description || '';
    let type = 'autre', modele = nom, detail = '', modeles = [];
    if (/^Carreau K-Reau · /.test(nom)) { type = 'carreau'; modele = nom.replace(/^Carreau K-Reau · /, ''); modeles = [modele]; }
    else if (/^Coffret/.test(nom)) { type = 'coffret'; modeles = desc.split(' · ').filter(Boolean); detail = desc; }
    else if (/sur mesure/i.test(nom)) { type = 'sur-mesure'; modele = 'Carreau sur mesure'; detail = desc; }
    else if (/^Chevalet/.test(nom)) { type = 'accessoire'; }
    else if (/^Carte cadeau/.test(nom)) { type = 'carte'; detail = 'Code envoyé par e-mail (pas d’envoi postal)'; }
    return { q: l.quantity || 1, type, nom, modele, detail, modeles, montant: l.amount_total || 0 };
  });
  return {
    id: s.id, heure: s.created * 1000,
    nom: liv.name || cli.name || '', email: cli.email || '', tel: cli.phone || '',
    adresse: adr ? [adr.line1, adr.line2, [adr.postal_code, adr.city].filter(Boolean).join(' '), adr.country && adr.country !== 'FR' ? (PAYS[adr.country] || adr.country) : ''].filter(Boolean) : [],
    articles, total: s.amount_total || 0, port: (s.shipping_cost && s.shipping_cost.amount_total) || 0,
    code: md.code || '', message: md.message_cadeau || '', surMesure: md.sur_mesure_details || ''
  };
}

function bilan(cmds) {
  const parModele = new Map(); let carreaux = 0, chevalets = 0, coffrets = 0, surMesure = 0, cartes = 0, encaisse = 0;
  for (const c of cmds) {
    encaisse += c.total;
    for (const a of c.articles) {
      if (a.type === 'carreau' || a.type === 'coffret') for (const m of a.modeles) { parModele.set(m, (parModele.get(m) || 0) + a.q); carreaux += a.q; }
      if (a.type === 'coffret') coffrets += a.q;
      if (a.type === 'sur-mesure') { surMesure += a.q; carreaux += a.q; }
      if (a.type === 'accessoire') chevalets += a.q;
      if (a.type === 'carte') cartes += a.q;
    }
  }
  return { parModele: [...parModele].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], 'fr')), carreaux, chevalets, coffrets, surMesure, cartes, encaisse };
}

const VERT = '#51573D', GRIS = '#5E5A52', CREME = '#F5F1EA', SABLE = '#D9BEA3';

function fabriquerPDF(cmds, b, debut, fin) {
  const doc = new PDF(); const G = 48, D = 547, LARG = D - G;
  let y = 0; let numPage = 1;
  const entete = () => {
    doc.rect(0, 0, 595, 74, { fond: VERT });
    doc.texte(G, 34, 'K-Reau · Commandes du jour', { taille: 18, gras: true, couleur: '#FFFEFB' });
    doc.texte(G, 56, `${fmt(fin, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })} · du ${fmt(debut, { day: 'numeric', month: 'short' })} ${heure(debut)} au ${fmt(fin, { day: 'numeric', month: 'short' })} ${heure(fin)}`, { taille: 9.5, couleur: '#EFE7DC' });
    doc.texte(D, 34, `Page ${numPage}`, { taille: 9, couleur: '#EFE7DC', aligne: 'droite' });
    y = 100;
  };
  const place = h => { if (y + h > 800) { doc.page(); numPage++; entete(); } };
  entete();

  // Chiffres clés
  const cles = [['Commandes', String(cmds.length)], ['Carreaux', String(b.carreaux)], ['Chevalets', String(b.chevalets)], ['Encaissé', euros(b.encaisse)]];
  const wc = (LARG - 3 * 10) / 4;
  cles.forEach(([l, v], i) => {
    const x = G + i * (wc + 10);
    doc.rect(x, y, wc, 50, { fond: CREME });
    doc.texte(x + 12, y + 18, l.toUpperCase(), { taille: 7.5, gras: true, couleur: VERT });
    doc.texte(x + 12, y + 40, v, { taille: 17, gras: true });
  });
  y += 72;

  if (!cmds.length) { doc.texte(G, y + 10, 'Aucune commande sur cette période.', { taille: 12, couleur: GRIS }); return doc.build(); }

  // À préparer
  doc.texte(G, y, 'À PRÉPARER', { taille: 8.5, gras: true, couleur: VERT }); y += 8; doc.ligne(G, y, D, y); y += 16;
  const prep = [...b.parModele.map(([m, q]) => [q, m])];
  if (b.surMesure) prep.push([b.surMesure, 'Carreau sur mesure (dessin à faire valider)']);
  if (b.chevalets) prep.push([b.chevalets, 'Chevalet trépied (accessoire)']);
  if (b.coffrets) prep.push([b.coffrets, 'Coffret de 3 (carreaux comptés ci-dessus)']);
  if (b.cartes) prep.push([b.cartes, 'Carte cadeau (numérique)']);
  const col = prep.length > 8 ? 2 : 1, wcol = (LARG - 20) / col, lignesCol = Math.ceil(prep.length / col);
  prep.forEach(([q, m], i) => {
    const c = Math.floor(i / lignesCol), r = i % lignesCol, x = G + c * (wcol + 20), yy = y + r * 17;
    doc.texte(x, yy, `${q} ×`, { taille: 10, gras: true });
    doc.texte(x + 32, yy, m, { taille: 10 });
  });
  y += lignesCol * 17 + 14;

  // Détail par commande
  cmds.forEach((c, i) => {
    const lignesArt = c.articles.map(a => {
      const titre = a.type === 'carreau' ? a.modele : a.type === 'accessoire' ? `${a.nom} — accessoire` : a.nom;
      const det = a.type === 'coffret' ? a.modeles.join(' · ') : a.detail;
      return { a, titre, det: det ? doc.couper(det, LARG - 150, 8.5, false) : [] };
    });
    const extra = [];
    if (c.surMesure && !c.articles.some(a => a.type === 'sur-mesure' && a.detail)) extra.push(['Sur mesure', c.surMesure]);
    if (c.message) extra.push(['Message cadeau', `« ${c.message} »`]);
    const extraL = extra.map(([l, v]) => [l, doc.couper(v, LARG - 110, 9, false)]);
    const hAdr = Math.max(3, c.adresse.length + 1) * 13;
    const hArt = lignesArt.reduce((t, l) => t + 16 + l.det.length * 11 + (l.det.length ? 4 : 0), 0);
    const hExtra = extraL.reduce((t, [, ls]) => t + ls.length * 12 + 4, 0);
    const h = 30 + hAdr + 18 + hArt + hExtra + 14;
    place(h);

    doc.rect(G, y, LARG, 24, { fond: CREME });
    doc.texte(G + 10, y + 16, `Commande ${i + 1} · ${heure(c.heure)}`, { taille: 10.5, gras: true });
    doc.texte(D - 10, y + 16, `${euros(c.total)}${c.port ? ` (dont port ${euros(c.port)})` : ''}${c.code ? ` · code ${c.code}` : ''}`, { taille: 9, couleur: GRIS, aligne: 'droite' });
    y += 40;

    const yBloc = y;
    doc.texte(G, y, 'CLIENT', { taille: 7.5, gras: true, couleur: VERT });
    doc.texte(G, y + 14, c.nom || '(nom non renseigné)', { taille: 11, gras: true });
    doc.texte(G, y + 28, c.email, { taille: 9, couleur: GRIS });
    if (c.tel) doc.texte(G, y + 41, c.tel, { taille: 9, couleur: GRIS });
    const xa = G + 260;
    doc.texte(xa, y, 'ADRESSE D’ENVOI', { taille: 7.5, gras: true, couleur: VERT });
    if (c.adresse.length) c.adresse.forEach((l, k) => doc.texte(xa, y + 14 + k * 13, l, { taille: 10, gras: k === 0 && false }));
    else doc.texte(xa, y + 14, 'Pas d’envoi postal', { taille: 10, couleur: GRIS });
    y = yBloc + hAdr + 6;

    doc.texte(G, y, 'QTÉ', { taille: 7.5, gras: true, couleur: VERT });
    doc.texte(G + 40, y, 'MODÈLE / ARTICLE', { taille: 7.5, gras: true, couleur: VERT });
    y += 5; doc.ligne(G, y, D, y, { couleur: SABLE }); y += 13;
    for (const l of lignesArt) {
      doc.texte(G, y, `${l.a.q}`, { taille: 10.5, gras: true });
      doc.texte(G + 40, y, l.titre, { taille: 10.5, gras: l.a.type !== 'accessoire' });
      if (l.a.type === 'accessoire') doc.rect(G + 34, y - 9, 2, 11, { fond: SABLE });
      y += 3;
      l.det.forEach(t => { y += 11; doc.texte(G + 40, y, t, { taille: 8.5, couleur: GRIS }); });
      y += l.det.length ? 17 : 13;
    }
    extraL.forEach(([lab, ls]) => {
      doc.texte(G, y, lab, { taille: 8.5, gras: true, couleur: VERT });
      ls.forEach((t, k) => doc.texte(G + 110, y + k * 12, t, { taille: 9 }));
      y += ls.length * 12 + 4;
    });
    y += 6; doc.ligne(G, y, D, y, { couleur: '#E6DED3' }); y += 18;
  });
  return doc.build();
}

module.exports = async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  if (process.env.CRON_SECRET && req.headers.authorization !== `Bearer ${process.env.CRON_SECRET}`) return res.status(401).json({ erreur: 'Non autorisé' });
  if (tropDeRequetes(req, 4, 60 * 60 * 1000)) return res.status(429).json({ erreur: 'Trop de requêtes' });
  if (!process.env.STRIPE_SECRET_KEY) return res.status(503).json({ erreur: 'Paiement non configuré' });

  const maintenant = Date.now(); const p = partiesParis(maintenant);
  const force = req.query && req.query.force === '1';
  if (!force && p.h !== HEURE) return res.status(200).json({ envoye: false, raison: `il est ${p.h} h à Paris` });

  const fin = instantParis(p.a, p.m, p.j, HEURE);
  const veille = partiesParis(fin - 20 * 3600000);
  const debut = instantParis(veille.a, veille.m, veille.j, HEURE);
  const jour = `${p.a}-${String(p.m).padStart(2, '0')}-${String(p.j).padStart(2, '0')}`;

  if (!force) {
    try { const r = await base('envoi_reserver', { type: 'rapport', ref: 'rapport-' + jour, email: '' }); if (!r.reserve) return res.status(200).json({ envoye: false, raison: 'déjà envoyé' }); }
    catch (e) { console.error('rapport base', e.message); }
  }

  let cmds;
  try { cmds = (await sessionsDuJour(debut, fin)).map(lire); }
  catch (e) { console.error('rapport stripe', e.message); return res.status(502).json({ erreur: 'Stripe indisponible' }); }
  const b = bilan(cmds);
  const pdf = fabriquerPDF(cmds, b, debut, fin);
  const titreJour = fmt(fin, { weekday: 'long', day: 'numeric', month: 'long' });
  const sujet = cmds.length ? `K-Reau · ${cmds.length} commande${cmds.length > 1 ? 's' : ''} aujourd’hui (${euros(b.encaisse)})` : 'K-Reau · Aucune commande aujourd’hui';
  const html = `<div style="font-family:Arial,sans-serif;font-size:14px;line-height:1.6">
    <h2 style="color:#51573D;margin:0 0 8px">Rapport du ${echap(titreJour)}</h2>
    <p>Période : du ${echap(fmt(debut, { day: 'numeric', month: 'long' }))} ${heure(debut)} au ${echap(fmt(fin, { day: 'numeric', month: 'long' }))} ${heure(fin)}.</p>
    <p><b>${cmds.length}</b> commande${cmds.length > 1 ? 's' : ''} · <b>${b.carreaux}</b> carreau${b.carreaux > 1 ? 'x' : ''} · <b>${b.chevalets}</b> chevalet${b.chevalets > 1 ? 's' : ''} · encaissé <b>${euros(b.encaisse)}</b></p>
    ${cmds.length ? `<ul>${cmds.map(c => `<li>${heure(c.heure)} — ${echap(c.nom || c.email)} : ${c.articles.map(a => `${a.q} × ${echap(a.type === 'carreau' ? a.modele : a.nom)}`).join(', ')}</li>`).join('')}</ul><p>Le détail complet (adresses, modèles, accessoires) est dans le PDF joint.</p>` : ''}
  </div>`;
  const ok = await envoyerMail(sujet, html, undefined, [{ filename: `K-Reau_commandes_${jour}.pdf`, content: pdf.toString('base64') }]);
  if (!ok && !force) { try { await base('envoi_annuler', { type: 'rapport', ref: 'rapport-' + jour }); } catch {} }
  return res.status(ok ? 200 : 502).json({ envoye: ok, commandes: cmds.length, periode: [new Date(debut).toISOString(), new Date(fin).toISOString()] });
};

module.exports.fabriquerPDF = fabriquerPDF;
module.exports.lire = lire;
module.exports.bilan = bilan;
