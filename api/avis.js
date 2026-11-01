// Avis clients vérifiés.
//  GET  /api/avis?slug=…              → avis publiés d'un carreau (public, mis en cache)
//  GET  /api/avis?stats=1             → note moyenne et nombre d'avis par carreau
//  GET  /api/avis?c=<session>&s=<sig> → carreaux d'une commande à noter (lien reçu par e-mail)
//  POST /api/avis                      → enregistre les avis d'une commande (lien signé obligatoire)
const { PRODUITS, stripe, base, signatureOk, texte, echap, envoyerMail, origineAutorisee, tropDeRequetes } = require('./_commun');

// Carreaux d'une commande, d'après le résumé enregistré dans Stripe (« slugx1,coffret(a+b+c)x1,… »)
function carreauxDeLaCommande(panier) {
  const slugs = [];
  for (const t of String(panier || '').split(',')) {
    let m = t.match(/^coffret\(([a-z0-9+-]+)\)x\d+$/);
    if (m) { m[1].split('+').forEach(s => PRODUITS[s] && slugs.push(s)); continue; }
    m = t.match(/^([a-z0-9-]+)x\d+$/);
    if (m && PRODUITS[m[1]]) slugs.push(m[1]);
  }
  return [...new Set(slugs)];
}

async function commandeValide(sid, sig) {
  if (!/^cs_(live|test)_[A-Za-z0-9]{10,}$/.test(String(sid || '')) || !signatureOk(sid, sig)) return null;
  const s = await stripe('GET', `checkout/sessions/${sid}`);
  if (s.payment_status !== 'paid') return null;
  return s;
}

module.exports = async function handler(req, res) {
  try {
    if (req.method === 'GET') {
      const q = req.query || {};
      if (q.slug) {
        if (!PRODUITS[q.slug]) return res.status(404).json({ erreur: 'Carreau inconnu' });
        const avis = await base('avis_liste', { slug: q.slug });
        res.setHeader('Cache-Control', 'public, s-maxage=300, stale-while-revalidate=3600');
        const n = avis.length, moy = n ? Math.round(avis.reduce((a, x) => a + x.note, 0) / n * 10) / 10 : 0;
        return res.status(200).json({ n, moy, avis });
      }
      if (q.stats) {
        res.setHeader('Cache-Control', 'public, s-maxage=600, stale-while-revalidate=3600');
        return res.status(200).json(await base('avis_stats', {}));
      }
      res.setHeader('Cache-Control', 'no-store');
      if (tropDeRequetes(req, 30, 10 * 60 * 1000)) return res.status(429).json({ erreur: 'Trop de requêtes' });
      const s = await commandeValide(q.c, q.s);
      if (!s) return res.status(403).json({ erreur: 'Lien invalide ou expiré' });
      const slugs = carreauxDeLaCommande(s.metadata && s.metadata.panier);
      const deja = await base('avis_session', { session_id: s.id });
      const prenom = ((s.customer_details && s.customer_details.name) || '').trim().split(/\s+/)[0] || '';
      const ville = (s.shipping_details && s.shipping_details.address && s.shipping_details.address.city) || '';
      return res.status(200).json({ carreaux: slugs.map(sl => ({ slug: sl, nom: PRODUITS[sl].nom, image: '/' + PRODUITS[sl].miniature.replace(/^\//, '') })), deja, prenom: texte(prenom, 40), ville: texte(ville, 60) });
    }

    if (req.method !== 'POST') { res.setHeader('Allow', 'GET, POST'); return res.status(405).json({ erreur: 'Méthode non autorisée' }); }
    res.setHeader('Cache-Control', 'no-store');
    if (!origineAutorisee(req)) return res.status(403).json({ erreur: 'Requête refusée' });
    if (tropDeRequetes(req, 10, 15 * 60 * 1000)) return res.status(429).json({ erreur: 'Trop de tentatives, réessayez dans quelques minutes' });
    let d = req.body; if (typeof d === 'string') { try { d = JSON.parse(d); } catch { d = {}; } }
    d = d && typeof d === 'object' ? d : {};
    const s = await commandeValide(d.c, d.s);
    if (!s) return res.status(403).json({ erreur: 'Lien invalide ou expiré' });
    const permis = carreauxDeLaCommande(s.metadata && s.metadata.panier);
    const prenom = texte(d.prenom, 40), ville = texte(d.ville, 60), langue = d.lang === 'en' ? 'en' : 'fr';
    if (!prenom) return res.status(400).json({ erreur: 'Indiquez votre prénom' });
    const liste = (Array.isArray(d.avis) ? d.avis : []).slice(0, 20)
      .map(a => ({ slug: String(a.slug || ''), note: parseInt(a.note, 10), texte: texte(String(a.texte || '').replace(/\s+/g, ' '), 1000) }))
      .filter(a => permis.includes(a.slug) && a.note >= 1 && a.note <= 5);
    if (!liste.length) return res.status(400).json({ erreur: 'Choisissez une note pour au moins un carreau' });
    const ajoutes = [];
    for (const a of liste) {
      const r = await base('avis_ajout', { ...a, prenom, ville, session_id: s.id, langue });
      if (r.ajoute) ajoutes.push(a);
    }
    if (ajoutes.length) {
      await envoyerMail(`K-Reau · Nouvel avis ${ajoutes.map(a => '★'.repeat(a.note)).join(' ')}`,
        `<div style="font-family:Arial,sans-serif;font-size:14px"><h2 style="color:#51573D">Nouvel avis client</h2><p><b>${echap(prenom)}</b>${ville ? ' · ' + echap(ville) : ''}</p>` +
        ajoutes.map(a => `<p><b>${echap(PRODUITS[a.slug].nom)}</b> : ${'★'.repeat(a.note)}${'☆'.repeat(5 - a.note)}<br>${echap(a.texte) || '<i>(sans commentaire)</i>'}</p>`).join('') +
        `<p style="color:#777">L’avis est publié automatiquement sur la fiche du carreau. Pour masquer un avis injurieux ou hors sujet (jamais un avis simplement négatif), passez la colonne « statut » à « masque » dans Supabase (schéma kreau, table avis).</p></div>`).catch(() => {});
    }
    return res.status(200).json({ ok: true, ajoutes: ajoutes.length });
  } catch (e) {
    console.error('avis', e.message);
    return res.status(500).json({ erreur: 'Service momentanément indisponible' });
  }
};
module.exports.carreauxDeLaCommande = carreauxDeLaCommande;
