// Création d'une session de paiement Stripe Checkout à partir du panier.
// Le navigateur n'envoie que des choix (modèles, quantités, textes) ; les prix sont fixés côté serveur.
const { PRIX, PRODUITS, prixCarreau, prixCoffret, stripe, euros, texte, origineAutorisee, tropDeRequetes, ORIGINE_SITE } = require('./_commun');
// Pays européens livrés (hors France) au tarif Europe
// Codes « commande offerte » : listés dans la variable Vercel KREAU_CODES_OFFERTS (séparés par des virgules).
// Chacun devient à sa première utilisation un code Stripe à 100 %, utilisable une seule fois ; la livraison est alors offerte aussi.
const COUPON_OFFERT = 'COMMANDE-OFFERTE-100';
async function codePromo(code) {
  const liste = await stripe('GET', 'promotion_codes', { code, limit: 1 });
  let p = liste.data && liste.data[0];
  const offerts = (process.env.KREAU_CODES_OFFERTS || '').toUpperCase().split(',').map(x => x.trim()).filter(Boolean);
  if (!p && offerts.includes(code)) {
    try { await stripe('GET', `coupons/${COUPON_OFFERT}`); }
    catch (e) { if (e.statut !== 404) throw e; await stripe('POST', 'coupons', { id: COUPON_OFFERT, percent_off: 100, duration: 'once', name: 'Commande offerte' }); }
    p = await stripe('POST', 'promotion_codes', { coupon: COUPON_OFFERT, code, max_redemptions: 1, metadata: { offert: '1' } });
  }
  return p || null;
}

const PAYS_EUROPE = ['DE','AT','BE','BG','CY','HR','DK','ES','EE','FI','GR','HU','IE','IT','LV','LT','LU','MT','NL','PL','PT','CZ','RO','SK','SI','SE',
  'MC','AD','CH','GB','NO','IS','LI','SM','VA'];

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') { res.setHeader('Allow', 'POST'); return res.status(405).json({ erreur: 'Méthode non autorisée' }); }
  if (!origineAutorisee(req)) return res.status(403).json({ erreur: 'Requête refusée' });
  if (tropDeRequetes(req, 20, 10 * 60 * 1000)) return res.status(429).json({ erreur: 'Trop de tentatives, réessayez dans quelques minutes' });
  if (process.env.BOUTIQUE_OUVERTE !== 'true') return res.status(503).json({ erreur: 'Les commandes ne sont pas encore ouvertes' });
  if (!process.env.STRIPE_SECRET_KEY) return res.status(503).json({ erreur: 'Paiement non configuré' });

  let corps = req.body;
  if (typeof corps === 'string') { try { corps = JSON.parse(corps); } catch { corps = {}; } }
  const lignes = Array.isArray(corps && corps.lignes) ? corps.lignes.slice(0, 30) : [];
  const q = l => Math.max(1, Math.min(20, parseInt(l.q, 10) || 1));
  const hote = String(req.headers['x-forwarded-host'] || req.headers.host || '');
  const origine = /^(www\.)?k-reau\.fr$/.test(hote) || /^k-reau-[a-z0-9-]+\.vercel\.app$/.test(hote) ? `https://${hote}` : ORIGINE_SITE;
  const image = slug => `${origine}/${PRODUITS[slug].image_principale.replace(/^\//, '')}`;

  const items = []; const resume = []; const cartes = []; let physique = 0; let surMesure = 0; const smDetails = [];
  for (const l of lignes) {
    const type = l.type || 'carreau';
    if (type === 'carreau' && PRODUITS[l.slug]) {
      items.push({ quantity: q(l), price_data: { currency: 'eur', unit_amount: prixCarreau(l.slug), product_data: { name: `Carreau K-Reau · ${PRODUITS[l.slug].nom}`, images: [image(l.slug)] } } });
      physique += prixCarreau(l.slug) * q(l); resume.push(`${l.slug}x${q(l)}`);
    } else if (type === 'coffret' && Array.isArray(l.slugs) && l.slugs.length === 3 && l.slugs.every(s => PRODUITS[s])) {
      const noms = l.slugs.map(s => PRODUITS[s].nom);
      items.push({ quantity: q(l), price_data: { currency: 'eur', unit_amount: prixCoffret(l.slugs), product_data: {
        name: `Coffret 3 carreaux K-Reau${l.nom ? ' · ' + texte(l.nom, 40) : ''}`, description: noms.join(' · '), images: l.slugs.map(image) } } });
      physique += prixCoffret(l.slugs) * q(l); resume.push(`coffret(${l.slugs.join('+')})x${q(l)}`);
    } else if (type === 'sur-mesure' && texte(l.texte, 40)) {
      surMesure++;
      const desc = `Texte : « ${texte(l.texte, 40)} »${l.lieu ? ' · Lieu : ' + texte(l.lieu, 120) : ''}${l.details ? ' · ' + texte(l.details, 300) : ''}${l.photo ? ' · Photo : ' + texte(l.photo, 200) : ''}`;
      items.push({ quantity: q(l), price_data: { currency: 'eur', unit_amount: PRIX.surMesure, product_data: { name: 'Carreau K-Reau sur mesure', description: desc.slice(0, 480) } } });
      physique += PRIX.surMesure * q(l); resume.push(`sur-mesure(${texte(l.texte, 40)})x${q(l)}`);
      smDetails.push(desc);
    } else if (type === 'chevalet') {
      items.push({ quantity: q(l), price_data: { currency: 'eur', unit_amount: PRIX.chevalet, product_data: { name: 'Chevalet trépied en bois brut', description: 'Support pour carreau · L 8 × H 15 cm' } } });
      physique += PRIX.chevalet * q(l); resume.push(`chevalet x${q(l)}`);
    } else if (type === 'carte' && PRIX.cartes.includes(parseInt(l.montant, 10))) {
      const m = parseInt(l.montant, 10);
      items.push({ quantity: q(l), price_data: { currency: 'eur', unit_amount: m, product_data: { name: `Carte cadeau K-Reau ${euros(m)}`, description: 'Code envoyé après le paiement, valable 12 mois sur k-reau.fr' } } });
      for (let i = 0; i < q(l); i++) cartes.push(m);
      resume.push(`carte${m / 100}x${q(l)}`);
    }
  }
  if (!items.length) return res.status(400).json({ erreur: 'Panier vide' });

  // Code saisi sur le site (facultatif) : vérifié ici ; sinon, les codes restent saisissables sur la page Stripe
  const code = String(corps.code || '').trim().toUpperCase().replace(/[^A-Z0-9-]/g, '').slice(0, 40);
  let promo = null, offert = false;
  if (code) {
    try { promo = await codePromo(code); } catch (e) { console.error('Code promo', e.message); return res.status(502).json({ erreur: 'Le code n’a pas pu être vérifié' }); }
    if (!promo) return res.status(400).json({ erreur: corps.lang === 'en' ? 'Unknown code' : 'Code inconnu' });
    if (!promo.active) return res.status(400).json({ erreur: corps.lang === 'en' ? 'This code has already been used or has expired' : 'Ce code a déjà été utilisé ou a expiré' });
    const cp = promo.coupon || (promo.promotion && promo.promotion.coupon) || {};
    offert = (promo.metadata && promo.metadata.offert === '1') || (typeof cp === 'object' && cp.id === COUPON_OFFERT);
  }

  const message = texte(corps.message, 250);
  const en = corps.lang === 'en';
  const params = {
    mode: 'payment', locale: en ? 'en' : 'fr',
    success_url: `${origine}${en ? '/en' : ''}/merci?session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: `${origine}${en ? '/en' : ''}/panier`,
    billing_address_collection: 'auto',
    allow_promotion_codes: 'true',         // saisie des codes de cartes cadeaux sur la page de paiement
    line_items: items,
    metadata: {
      panier: resume.join(',').slice(0, 490),
      cartes: cartes.join(','),
      sur_mesure: String(surMesure),
      sur_mesure_details: smDetails.join(' ‖ ').slice(0, 490),
      message_cadeau: message,
      lang: en ? 'en' : 'fr'
    },
    // relance si le paiement est abandonné (uniquement avec l'accord du client, case proposée par Stripe)
    consent_collection: { promotions: 'auto' },
    after_expiration: { recovery: { enabled: 'true', allow_promotion_codes: 'true' } },
    payment_intent_data: { description: `K-Reau · ${resume.join(', ')}`.slice(0, 990), metadata: { message_cadeau: message } }
  };
  // Livraison uniquement s'il y a un objet à expédier ; offerte dès le seuil (cartes cadeaux exclues du calcul)
  if (physique > 0) {
    params.phone_number_collection = { enabled: 'true' };
    const dest = ['EU', 'CA'].includes(corps.destination) ? corps.destination : 'FR'; // pas de livraison aux États-Unis
    params.shipping_address_collection = { allowed_countries: dest === 'EU' ? PAYS_EUROPE : dest === 'CA' ? ['CA'] : ['FR'] };
    const frais = parseInt(process.env.FRAIS_LIVRAISON_CENTIMES || '', 10);
    const seuil = parseInt(process.env.SEUIL_LIVRAISON_GRATUITE_CENTIMES || '', 10);
    if (dest === 'CA') {
      params.shipping_options = [{ shipping_rate_data: { type: 'fixed_amount', display_name: en ? 'Shipping to Canada' : 'Livraison Canada',
        fixed_amount: { amount: parseInt(process.env.FRAIS_CANADA_CENTIMES || '3699', 10), currency: 'eur' },
        delivery_estimate: { minimum: { unit: 'business_day', value: 10 }, maximum: { unit: 'business_day', value: 20 } } } }];
    } else if (dest === 'EU') {
      params.shipping_options = [{ shipping_rate_data: { type: 'fixed_amount', display_name: en ? 'Shipping to Europe' : 'Livraison Europe',
        fixed_amount: { amount: parseInt(process.env.FRAIS_EUROPE_CENTIMES || '1650', 10), currency: 'eur' },
        delivery_estimate: { minimum: { unit: 'business_day', value: 8 }, maximum: { unit: 'business_day', value: 14 } } } }];
    } else if (frais >= 0) {
      const offerte = seuil > 0 && physique >= seuil;
      params.shipping_options = [{ shipping_rate_data: { type: 'fixed_amount',
        display_name: offerte ? (en ? 'Free shipping in France' : 'Livraison France offerte') : (en ? 'Shipping in France' : (process.env.LIBELLE_LIVRAISON || 'Livraison')),
        fixed_amount: { amount: offerte ? 0 : frais, currency: 'eur' } } }];
    }
  }
  if (promo) {
    params.discounts = [{ promotion_code: promo.id }];
    delete params.allow_promotion_codes;
    params.after_expiration = { recovery: { enabled: 'true' } };
    params.metadata.code = code + (offert ? ' (offert)' : '');
    if (offert && params.shipping_options) params.shipping_options.forEach(o => {
      o.shipping_rate_data.fixed_amount.amount = 0;
      o.shipping_rate_data.display_name = en ? 'Free shipping (gift order)' : 'Livraison offerte';
    });
  }
  if (message) params.custom_text = { submit: { message: en ? `Your gift message will be printed on the card in the box: “${message.slice(0, 200)}”` : `Votre message cadeau sera imprimé sur la carte du coffret : « ${message.slice(0, 200)} »` } };

  try {
    let s;
    try { s = await stripe('POST', 'checkout/sessions', params); }
    catch (e) {
      // si le compte Stripe refuse l'option de relance, on paie quand même sans elle
      if (!/consent|after_expiration|recovery|promotions/i.test(e.message)) throw e;
      console.warn('Stripe relance désactivée :', e.message);
      delete params.consent_collection; delete params.after_expiration;
      s = await stripe('POST', 'checkout/sessions', params);
    }
    return res.status(200).json({ url: s.url });
  } catch (e) {
    console.error('Stripe', e.message);
    if (promo && /minimum|promotion|coupon|discount/i.test(e.message)) return res.status(400).json({ erreur: en ? 'This code cannot be used with this basket' : 'Ce code ne peut pas être utilisé avec ce panier' });
    return res.status(502).json({ erreur: 'Le paiement n’a pas pu être préparé' });
  }
};
