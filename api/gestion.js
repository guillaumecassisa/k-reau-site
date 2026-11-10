// Espace de gestion des commandes (page /gestion) : liste des commandes Stripe avec leur détail,
// et suivi de préparation (à faire, en préparation, envoyé, livré, annulé) enregistré en base.
// Accès par code : variable d'environnement KREAU_GESTION_CODE (jamais dans la page).
const crypto = require('crypto');
const { stripe, payee, base, origineAutorisee, PRODUITS } = require('./_commun');
const { lire } = require('./rapport');

const STATUTS = ['a-faire', 'en-preparation', 'envoye', 'livre', 'annule'];
const echecs = new Map();   // tentatives de code erronées par adresse IP (10 par quart d'heure)
const ip = req => String(req.headers['x-real-ip'] || req.headers['x-forwarded-for'] || '').split(',')[0].trim() || 'inconnue';
function bloque(req) { const t = (echecs.get(ip(req)) || []).filter(x => Date.now() - x < 15 * 60000); echecs.set(ip(req), t); return t.length >= 10; }
function echec(req) { const t = echecs.get(ip(req)) || []; t.push(Date.now()); echecs.set(ip(req), t); if (echecs.size > 5000) echecs.clear(); }
function codeOk(code) {
  const attendu = process.env.KREAU_GESTION_CODE || '';
  if (attendu.length < 8) return false;
  const a = crypto.createHash('sha256').update(String(code || '')).digest(), b = crypto.createHash('sha256').update(attendu).digest();
  return crypto.timingSafeEqual(a, b);
}

async function commandes(jours) {
  const depuis = Math.floor(Date.now() / 1000) - jours * 86400;
  const liste = []; let apres;
  for (let i = 0; i < 10; i++) {
    // frais Stripe réels : paiement → transaction de solde (4 niveaux d'extension au maximum)
    const p = { limit: 100, status: 'complete', created: { gte: depuis }, expand: ['data.line_items', 'data.payment_intent.latest_charge.balance_transaction'] };
    if (apres) p.starting_after = apres;
    const r = await stripe('GET', 'checkout/sessions', p);
    liste.push(...r.data.filter(payee));
    if (!r.has_more || !r.data.length) break;
    apres = r.data[r.data.length - 1].id;
  }
  return liste.map(s => {
    const c = lire(s);
    // composition des coffrets, retrouvée dans le résumé du panier (coffret(slug+slug+slug)x1)
    const coffrets = [...String((s.metadata || {}).panier || '').matchAll(/coffret\(([^)]+)\)x(\d+)/g)].map(m => m[1].split('+').map(x => (PRODUITS[x] || {}).nom || x));
    let k = 0;
    for (const a of c.articles) {
      if (a.type === 'coffret' && coffrets[k]) { a.modeles = coffrets[k++]; a.detail = a.modeles.join(' · '); }
      if (a.type === 'sur-mesure' && !a.detail) a.detail = c.surMesure;
    }
    const liv = s.shipping_details || {};
    const pi = s.payment_intent && typeof s.payment_intent === 'object' ? s.payment_intent : null;
    const bt = pi && pi.latest_charge && typeof pi.latest_charge === 'object' ? pi.latest_charge.balance_transaction : null;
    const n = t => c.articles.filter(a => a.type === t).reduce((x, a) => x + a.q, 0);
    return { ...c, pays: (liv.address || {}).country || '', livraison: (s.shipping_cost && s.shipping_cost.amount_total) || 0,
      frais: bt && typeof bt === 'object' ? bt.fee || 0 : 0,
      nb: { carreaux: n('carreau') + 3 * n('coffret') + n('sur-mesure'), coffrets: n('coffret'), surMesure: n('sur-mesure'), chevalets: n('accessoire'), cartes: n('carte') },
      colis: c.adresse.length > 0 && c.articles.some(a => a.type !== 'carte') };
  });
}

module.exports = async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('X-Robots-Tag', 'noindex, nofollow');
  if (req.method !== 'POST') { res.setHeader('Allow', 'POST'); return res.status(405).json({ erreur: 'Méthode non autorisée' }); }
  if (!origineAutorisee(req)) return res.status(403).json({ erreur: 'Requête refusée' });
  if (!process.env.KREAU_GESTION_CODE) return res.status(503).json({ erreur: 'Espace de gestion non configuré' });
  if (bloque(req)) return res.status(429).json({ erreur: 'Trop de tentatives, réessayez dans 15 minutes' });
  let d = req.body;
  if (typeof d === 'string') { try { d = JSON.parse(d); } catch { d = {}; } }
  d = d && typeof d === 'object' ? d : {};
  if (!codeOk(d.code)) { echec(req); return res.status(401).json({ erreur: 'Code incorrect' }); }

  try {
    if (d.action === 'maj') {
      const id = String(d.session_id || '');
      if (!/^cs_(live|test)_[A-Za-z0-9]+$/.test(id)) return res.status(400).json({ erreur: 'Commande inconnue' });
      const statut = STATUTS.includes(d.statut) ? d.statut : 'a-faire';
      await base('commande_maj', { session_id: id, statut, suivi: String(d.suivi || '').slice(0, 120), note: String(d.note || '').slice(0, 1000) });
      return res.status(200).json({ ok: true });
    }
    if (d.action === 'couts') {
      if (d.valeur && typeof d.valeur === 'object') {
        const v = {}; for (const k of ['carreau', 'chevalet', 'coffret', 'emballage', 'envoiFrance', 'envoiEtranger', 'urssaf', 'surMesure']) { const x = parseFloat(String(d.valeur[k] ?? '').replace(',', '.')); if (isFinite(x) && x >= 0 && x < 1000) v[k] = Math.round(x * 100) / 100; }
        await base('reglages_maj', { cle: 'couts', valeur: v });
        return res.status(200).json({ couts: v });
      }
      return res.status(200).json({ couts: await base('reglages_lire', { cle: 'couts' }) });
    }
    const jours = Math.max(7, Math.min(400, parseInt(d.jours, 10) || 90));
    const cmds = await commandes(jours);
    let suivis = {};
    try { suivis = cmds.length ? await base('commandes_statuts', { ids: cmds.map(c => c.id) }) : {}; } catch (e) { console.error('gestion base', e.message); }
    let couts = {};
    try { couts = await base('reglages_lire', { cle: 'couts' }); } catch (e) { console.error('gestion couts', e.message); }
    return res.status(200).json({ couts, commandes: cmds.map(c => ({ ...c, suivi: suivis[c.id] || { statut: 'a-faire', suivi: '', note: '' } })) });
  } catch (e) {
    console.error('gestion', e.message);
    return res.status(502).json({ erreur: 'Service indisponible pour le moment' });
  }
};
