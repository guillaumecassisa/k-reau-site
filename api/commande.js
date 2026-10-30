// Récapitulatif affiché sur la page « Merci » : vérifie le paiement, crée les codes des cartes cadeaux
// (une seule fois par commande) et prévient K-Reau par e-mail des éléments à préparer.
const { stripe, euros, texte, codeCadeau, envoyerMail } = require('./_commun');

async function carteCadeau(sessionId, i, montant) {
  const code = codeCadeau(sessionId, i);
  const existant = await stripe('GET', 'promotion_codes', { code, limit: 1 });
  if (existant.data && existant.data.length) return { code, montant, nouveau: false };
  const expire = Math.floor(Date.now() / 1000) + 365 * 24 * 3600;
  const coupon = await stripe('POST', 'coupons', {
    amount_off: montant, currency: 'eur', duration: 'once', max_redemptions: 1, redeem_by: expire,
    name: `Carte cadeau K-Reau ${euros(montant)}`, metadata: { session: sessionId }
  });
  await stripe('POST', 'promotion_codes', { coupon: coupon.id, code, max_redemptions: 1, expires_at: expire, metadata: { session: sessionId } });
  return { code, montant, nouveau: true, expire };
}

module.exports = async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  const id = String(req.query.session_id || '');
  if (!/^cs_(live|test)_[A-Za-z0-9]+$/.test(id)) return res.status(400).json({ erreur: 'Commande inconnue' });
  let s;
  try { s = await stripe('GET', `checkout/sessions/${id}`, { 'expand[]': 'line_items' }); }
  catch (e) { return res.status(404).json({ erreur: 'Commande introuvable' }); }
  if (s.payment_status !== 'paid') return res.status(200).json({ paye: false });

  const md = s.metadata || {};
  const montants = (md.cartes || '').split(',').map(n => parseInt(n, 10)).filter(Boolean);
  const cartes = []; let erreurCartes = false;
  for (let i = 0; i < montants.length; i++) {
    try { cartes.push(await carteCadeau(id, i, montants[i])); }
    catch (e) { console.error('Carte cadeau', e.message); erreurCartes = true; }
  }

  // E-mail à K-Reau, une seule fois par commande (marqueur posé sur le paiement)
  try {
    const pi = s.payment_intent ? await stripe('GET', `payment_intents/${s.payment_intent}`) : null;
    if (pi && !(pi.metadata || {}).k_notifie) {
      const lignes = (s.line_items && s.line_items.data || []).map(l => `<li>${l.quantity} × ${texte(l.description, 200)}</li>`).join('');
      const adr = s.shipping_details && s.shipping_details.address;
      const html = `<div style="font-family:Arial,sans-serif;font-size:14px">
        <h2 style="color:#51573D">Nouvelle commande K-Reau · ${euros(s.amount_total)}</h2>
        <p><b>Client :</b> ${texte(s.customer_details && s.customer_details.name, 120)} — ${texte(s.customer_details && s.customer_details.email, 160)}</p>
        <ul>${lignes}</ul>
        ${md.message_cadeau ? `<p><b>Message cadeau à imprimer :</b><br>« ${texte(md.message_cadeau, 300)} »</p>` : ''}
        ${md.sur_mesure && md.sur_mesure !== '0' ? `<p><b>Carreau sur mesure :</b> détails dans la ligne de commande ci-dessus. Envoyer le dessin au client pour validation.</p>` : ''}
        ${montants.length ? `<p><b>Cartes cadeaux :</b> ${cartes.map(c => `${c.code} (${euros(c.montant)})`).join(', ') || 'création à faire à la main dans Stripe'}${erreurCartes ? ' — ⚠ création automatique impossible, à créer dans Stripe' : ''}</p>` : ''}
        ${adr ? `<p><b>Livraison :</b> ${texte(s.shipping_details.name, 120)}, ${texte(adr.line1, 160)} ${texte(adr.line2, 120)}, ${texte(adr.postal_code, 12)} ${texte(adr.city, 80)}</p>` : ''}
      </div>`;
      const ok = await envoyerMail(`K-Reau · Nouvelle commande ${euros(s.amount_total)}`, html, s.customer_details && s.customer_details.email);
      if (ok) await stripe('POST', `payment_intents/${s.payment_intent}`, { metadata: { k_notifie: '1' } }).catch(() => {});
    }
  } catch (e) { console.error('Notification', e.message); }

  return res.status(200).json({
    paye: true,
    email: s.customer_details && s.customer_details.email,
    cartes: cartes.map(c => ({ code: c.code, montant: c.montant })),
    cartesEnAttente: erreurCartes,
    surMesure: md.sur_mesure && md.sur_mesure !== '0',
    message: md.message_cadeau || ''
  });
};
