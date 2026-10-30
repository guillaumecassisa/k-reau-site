// Création d'une session de paiement Stripe Checkout à partir du panier.
// Les prix sont fixés ici, côté serveur : le navigateur n'envoie que les modèles et les quantités.
const PRIX_CENTIMES = 1990;
const PRODUITS = {"marseille-vieux-port": {"nom": "Le Vieux-Port de Marseille", "img": "img/03_Produits_Marseille/marseille-vieux-port.webp"}, "marseille-notre-dame-de-la-garde": {"nom": "Notre-Dame de la Garde", "img": "img/03_Produits_Marseille/marseille-notre-dame-de-la-garde.webp"}, "marseille-mucem": {"nom": "Le Mucem", "img": "img/03_Produits_Marseille/marseille-mucem.webp"}, "marseille-la-major": {"nom": "La Major", "img": "img/03_Produits_Marseille/marseille-la-major.webp"}, "marseille-vallon-des-auffes": {"nom": "Le Vallon des Auffes", "img": "img/03_Produits_Marseille/marseille-vallon-des-auffes.webp"}, "marseille-chateau-d-if": {"nom": "Le Château d’If", "img": "img/03_Produits_Marseille/marseille-chateau-d-if.webp"}, "marseille-iles-du-frioul": {"nom": "Les Îles du Frioul", "img": "img/03_Produits_Marseille/marseille-iles-du-frioul.webp"}, "marseille-calanque-sormiou": {"nom": "La Calanque de Sormiou", "img": "img/03_Produits_Marseille/marseille-calanque-sormiou.webp"}, "marseille-calanque-morgiou": {"nom": "La Calanque de Morgiou", "img": "img/03_Produits_Marseille/marseille-calanque-morgiou.webp"}, "marseille-palais-longchamp": {"nom": "Le Palais Longchamp", "img": "img/03_Produits_Marseille/marseille-palais-longchamp.webp"}, "cote-bleue-port-niolon": {"nom": "Le Port de Niolon", "img": "img/04_Produits_Cote_Bleue/cote-bleue-port-niolon.webp"}, "cote-bleue-calanque-mejean": {"nom": "La Calanque de Méjean", "img": "img/04_Produits_Cote_Bleue/cote-bleue-calanque-mejean.webp"}, "cote-bleue-port-la-redonne": {"nom": "Le Port de La Redonne", "img": "img/04_Produits_Cote_Bleue/cote-bleue-port-la-redonne.webp"}, "cote-bleue-carry-le-rouet": {"nom": "Carry-le-Rouet", "img": "img/04_Produits_Cote_Bleue/cote-bleue-carry-le-rouet.webp"}, "cote-bleue-sausset-les-pins": {"nom": "Sausset-les-Pins", "img": "img/04_Produits_Cote_Bleue/cote-bleue-sausset-les-pins.webp"}, "cote-bleue-port-carro": {"nom": "Le Port de Carro", "img": "img/04_Produits_Cote_Bleue/cote-bleue-port-carro.webp"}, "cote-bleue-cap-couronne": {"nom": "Le Cap Couronne", "img": "img/04_Produits_Cote_Bleue/cote-bleue-cap-couronne.webp"}, "cote-bleue-plage-sainte-croix": {"nom": "La Plage de Sainte-Croix", "img": "img/04_Produits_Cote_Bleue/cote-bleue-plage-sainte-croix.webp"}, "cote-bleue-ensues-la-redonne": {"nom": "Ensuès-la-Redonne", "img": "img/04_Produits_Cote_Bleue/cote-bleue-ensues-la-redonne.webp"}, "cote-bleue-estaque": {"nom": "L’Estaque", "img": "img/04_Produits_Cote_Bleue/cote-bleue-estaque.webp"}, "les-embiez": {"nom": "Les Embiez", "img": "img/05_Produits_Signature/les-embiez.webp"}};

function encoder(obj, prefix, out = []) {
  for (const [k, v] of Object.entries(obj)) {
    const cle = prefix ? `${prefix}[${k}]` : k;
    if (v !== null && typeof v === 'object') encoder(v, cle, out);
    else if (v !== undefined) out.push(`${encodeURIComponent(cle)}=${encodeURIComponent(v)}`);
  }
  return out;
}

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') { res.setHeader('Allow', 'POST'); return res.status(405).json({ erreur: 'Méthode non autorisée' }); }
  if (process.env.BOUTIQUE_OUVERTE !== 'true') return res.status(503).json({ erreur: 'Les commandes ne sont pas encore ouvertes' });
  const cle = process.env.STRIPE_SECRET_KEY;
  if (!cle) return res.status(503).json({ erreur: 'Paiement non configuré' });
  let corps = req.body;
  if (typeof corps === 'string') { try { corps = JSON.parse(corps); } catch { corps = {}; } }
  const lignes = Array.isArray(corps && corps.lignes) ? corps.lignes : [];
  const valides = lignes
    .filter(l => l && PRODUITS[l.slug])
    .map(l => ({ slug: l.slug, q: Math.max(1, Math.min(20, parseInt(l.q, 10) || 1)) }))
    .slice(0, 30);
  if (!valides.length) return res.status(400).json({ erreur: 'Panier vide' });

  const origine = `https://${req.headers['x-forwarded-host'] || req.headers.host}`;
  const params = {
    mode: 'payment',
    locale: 'fr',
    success_url: `${origine}/merci`,
    cancel_url: `${origine}/panier`,
    billing_address_collection: 'auto',
    phone_number_collection: { enabled: 'true' },
    shipping_address_collection: { allowed_countries: (process.env.PAYS_LIVRES || 'FR').split(',').map(s => s.trim()) },
    line_items: valides.map(l => ({
      quantity: l.q,
      price_data: {
        currency: 'eur',
        unit_amount: PRIX_CENTIMES,
        product_data: { name: `Carreau K-Reau · ${PRODUITS[l.slug].nom}`, images: [`${origine}/${PRODUITS[l.slug].img}`] }
      }
    })),
    metadata: { modeles: valides.map(l => `${l.slug}x${l.q}`).join(',').slice(0, 490) }
  };
  const frais = parseInt(process.env.FRAIS_LIVRAISON_CENTIMES || '', 10);
  const seuil = parseInt(process.env.SEUIL_LIVRAISON_GRATUITE_CENTIMES || '', 10);
  const sousTotal = valides.reduce((t, l) => t + l.q * PRIX_CENTIMES, 0);
  if (frais >= 0) {
    const offerte = seuil > 0 && sousTotal >= seuil;
    params.shipping_options = [{ shipping_rate_data: {
      type: 'fixed_amount',
      display_name: offerte ? 'Livraison France offerte' : (process.env.LIBELLE_LIVRAISON || 'Livraison'),
      fixed_amount: { amount: offerte ? 0 : frais, currency: 'eur' }
    } }];
  }
  try {
    const r = await fetch('https://api.stripe.com/v1/checkout/sessions', {
      method: 'POST',
      headers: { Authorization: `Bearer ${cle}`, 'Content-Type': 'application/x-www-form-urlencoded' },
      body: encoder(params).join('&')
    });
    const s = await r.json();
    if (!r.ok) { console.error('Stripe', s.error && s.error.message); return res.status(502).json({ erreur: 'Le paiement n’a pas pu être préparé' }); }
    return res.status(200).json({ url: s.url });
  } catch (e) {
    console.error(e); return res.status(502).json({ erreur: 'Service de paiement injoignable' });
  }
};
