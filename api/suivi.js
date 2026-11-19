// Suivi anonyme du parcours d'achat : visite → fiche produit → ajout au panier → début de paiement.
// Aucune donnée personnelle : seulement un compteur par jour, par étape et par source (pinterest, instagram…).
// Le navigateur n'envoie chaque étape qu'une fois par visite (sessionStorage), et la durée de la visite au départ du visiteur.
// Fiches vues et ajouts au panier sont aussi comptés par produit (une fois par visite et par produit).
const { base, origineAutorisee, tropDeRequetes, PRODUITS } = require('./_commun');
const AUTRES = ['coffret', 'sur-mesure', 'chevalet', 'carte-cadeau'];   // articles du panier qui ne sont pas des fiches carreaux
const ETAPES = ['visite', 'fiche', 'panier', 'paiement'];
const SOURCES = ['pinterest', 'instagram', 'facebook', 'google', 'newsletter', 'direct', 'autre'];
const ROBOTS = /bot|crawl|spider|slurp|preview|lighthouse|headless|facebookexternalhit|pinterest\/|bingpreview/i;

module.exports = async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  if (req.method !== 'POST') { res.setHeader('Allow', 'POST'); return res.status(405).end(); }
  if (!origineAutorisee(req) || ROBOTS.test(req.headers['user-agent'] || '')) return res.status(204).end();
  if (tropDeRequetes(req, 30, 10 * 60000)) return res.status(204).end();
  let d = req.body;
  if (typeof d === 'string') { try { d = JSON.parse(d); } catch { d = {}; } }
  d = d && typeof d === 'object' ? d : {};
  if (d.etape === 'duree') {   // durée de la visite, rangée par tranche
    const sec = Math.max(0, Math.min(3600, parseInt(d.secondes, 10) || 0));
    const tranche = sec < 10 ? '0-10' : sec < 30 ? '10-30' : sec < 60 ? '30-60' : sec < 180 ? '60-180' : '180+';
    const source = SOURCES.includes(d.source) ? d.source : 'autre';
    try { await base('duree_ajout', { tranche, source, secondes: sec }); } catch (e) { console.error('suivi durée', e.message); }
    return res.status(204).end();
  }
  const etape = ETAPES.includes(d.etape) ? d.etape : null;
  if (!etape) return res.status(204).end();
  const source = SOURCES.includes(d.source) ? d.source : 'autre';
  if (d.compte !== false) { try { await base('parcours_ajout', { etape, source }); } catch (e) { console.error('suivi', e.message); } }
  const slugs = [...new Set((Array.isArray(d.produits) ? d.produits : []).map(String))].filter(x => PRODUITS[x] || AUTRES.includes(x)).slice(0, 6);
  if (slugs.length && (etape === 'fiche' || etape === 'panier')) { try { await base('parcours_produit', { etape, slugs }); } catch (e) { console.error('suivi produit', e.message); } }
  return res.status(204).end();
};
