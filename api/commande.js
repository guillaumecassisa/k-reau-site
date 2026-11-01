// Récapitulatif affiché sur la page « Merci » : vérifie le paiement, crée les codes des cartes cadeaux
// (une seule fois par commande) et prévient K-Reau par e-mail des éléments à préparer.
const { stripe, euros, texte, codeCadeau, envoyerMail, envoyerClient, tropDeRequetes, echap } = require('./_commun');
const t = (v, n) => echap(texte(v, n));

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
  if (tropDeRequetes(req, 30, 10 * 60 * 1000)) return res.status(429).json({ erreur: 'Trop de requêtes' });
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
      const lignes = (s.line_items && s.line_items.data || []).map(l => `<li>${l.quantity} × ${t(l.description, 200)}</li>`).join('');
      const adr = s.shipping_details && s.shipping_details.address;
      const html = `<div style="font-family:Arial,sans-serif;font-size:14px">
        <h2 style="color:#51573D">Nouvelle commande K-Reau · ${euros(s.amount_total)}</h2>
        <p><b>Client :</b> ${t(s.customer_details && s.customer_details.name, 120)} — ${t(s.customer_details && s.customer_details.email, 160)}</p>
        <ul>${lignes}</ul>
        ${md.message_cadeau ? `<p><b>Message cadeau à imprimer :</b><br>« ${t(md.message_cadeau, 300)} »</p>` : ''}
        ${md.sur_mesure && md.sur_mesure !== '0' ? `<p><b>Carreau sur mesure :</b> détails dans la ligne de commande ci-dessus. Envoyer le dessin au client pour validation.</p>` : ''}
        ${montants.length ? `<p><b>Cartes cadeaux :</b> ${cartes.map(c => `${c.code} (${euros(c.montant)})`).join(', ') || 'création à faire à la main dans Stripe'}${erreurCartes ? ' — ⚠ création automatique impossible, à créer dans Stripe' : ''}</p>` : ''}
        ${adr ? `<p><b>Livraison :</b> ${t(s.shipping_details.name, 120)}, ${t(adr.line1, 160)} ${t(adr.line2, 120)}, ${t(adr.postal_code, 12)} ${t(adr.city, 80)} ${adr.country && adr.country !== 'FR' ? '(' + t(adr.country, 4) + ')' : ''}</p>` : ''}
      </div>`;
      const ok = await envoyerMail(`K-Reau · Nouvelle commande ${euros(s.amount_total)}`, html, s.customer_details && s.customer_details.email);
      if (ok) await stripe('POST', `payment_intents/${s.payment_intent}`, { metadata: { k_notifie: '1' } }).catch(() => {});
    }
  } catch (e) { console.error('Notification', e.message); }

  // E-mail de confirmation au client, une seule fois par commande
  try {
    const pi = s.payment_intent ? await stripe('GET', `payment_intents/${s.payment_intent}`) : null;
    const email = s.customer_details && s.customer_details.email;
    if (pi && email && !(pi.metadata || {}).k_client) {
      const ok = await envoyerClient(email, `Merci pour votre commande K-Reau · ${euros(s.amount_total)}`, mailClient(s, md, cartes, montants.length && erreurCartes));
      if (ok) await stripe('POST', `payment_intents/${s.payment_intent}`, { metadata: { k_client: '1' } }).catch(() => {});
    }
  } catch (e) { console.error('Confirmation client', e.message); }

  return res.status(200).json({
    paye: true,
    email: s.customer_details && s.customer_details.email,
    cartes: cartes.map(c => ({ code: c.code, montant: c.montant })),
    cartesEnAttente: erreurCartes,
    surMesure: md.sur_mesure && md.sur_mesure !== '0',
    message: md.message_cadeau || ''
  });
};

function mailClient(s, md, cartes, cartesEnAttente) {
  const e = v => texte(v, 300).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const prenom = e(((s.customer_details && s.customer_details.name) || '').split(' ')[0]);
  const lignes = (s.line_items && s.line_items.data || []).map(l =>
    `<tr><td style="padding:10px 0;border-bottom:1px solid #E6DED3">${l.quantity} × ${e(l.description)}</td><td style="padding:10px 0;border-bottom:1px solid #E6DED3;text-align:right;white-space:nowrap">${euros(l.amount_total)}</td></tr>`).join('');
  const port = s.total_details && s.total_details.amount_shipping;
  const adr = s.shipping_details && s.shipping_details.address;
  const physique = !!adr;
  const btn = (href, t) => `<a href="${href}" style="display:inline-block;background:#51573D;color:#fff;text-decoration:none;padding:12px 22px;font-weight:600">${t}</a>`;
  return `<!doctype html><html lang="fr"><body style="margin:0;background:#F5F1EA;font-family:Arial,Helvetica,sans-serif;color:#22211E">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#F5F1EA"><tr><td align="center" style="padding:28px 12px">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:#FFFEFB;border:1px solid #E6DED3">
<tr><td align="center" style="padding:28px 28px 8px"><img src="https://k-reau.fr/img/01_Identite/logo-kreau-email.png" width="120" alt="K-Reau, carreaux d’ici" style="display:block;border:0"></td></tr>
<tr><td style="padding:8px 32px 0;font-size:15px;line-height:1.6">
<h1 style="font-family:Georgia,serif;font-weight:400;font-size:26px;margin:12px 0 14px">Merci${prenom ? ' ' + prenom : ''} !</h1>
<p style="margin:0 0 14px">Votre commande est bien enregistrée et votre paiement confirmé. ${physique ? 'Nous préparons vos carreaux avec soin : ils seront expédiés <strong>sous 5 à 7 jours</strong> dans leur coffret kraft.' : ''}</p>
${md.sur_mesure && md.sur_mesure !== '0' ? '<p style="margin:0 0 14px"><strong>Carreau sur mesure :</strong> nous vous envoyons le dessin par e-mail sous 5 jours ouvrés pour validation, avant toute impression. Vous pouvez répondre à cet e-mail pour nous transmettre vos photos.</p>' : ''}
</td></tr>
${cartes.length || cartesEnAttente ? `<tr><td style="padding:6px 32px 0"><div style="background:#EFE7DC;padding:16px 18px;font-size:15px;line-height:1.6">
<strong>${cartes.length > 1 ? 'Vos cartes cadeaux' : 'Votre carte cadeau'}</strong><br>
${cartes.map(c => `<span style="font-family:Courier New,monospace;font-size:18px;letter-spacing:1px">${c.code}</span> · ${euros(c.montant)}`).join('<br>')}
${cartesEnAttente ? 'Votre code vous sera envoyé par e-mail très rapidement.' : ''}
<br><span style="font-size:13px;color:#5E5A52">Valable 12 mois sur k-reau.fr, à saisir sur la page de paiement.</span></div></td></tr>` : ''}
<tr><td style="padding:18px 32px 0"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="font-size:14px">${lignes}
${port !== undefined && physique ? `<tr><td style="padding:10px 0;color:#5E5A52">Livraison</td><td style="padding:10px 0;text-align:right;color:#5E5A52">${port ? euros(port) : 'Offerte'}</td></tr>` : ''}
<tr><td style="padding:10px 0;font-weight:700">Total payé</td><td style="padding:10px 0;text-align:right;font-weight:700">${euros(s.amount_total)}</td></tr></table></td></tr>
${md.message_cadeau ? `<tr><td style="padding:10px 32px 0;font-size:14px;line-height:1.6"><strong>Message cadeau imprimé :</strong><br><em>« ${e(md.message_cadeau)} »</em></td></tr>` : ''}
${adr ? `<tr><td style="padding:10px 32px 0;font-size:14px;line-height:1.6"><strong>Livraison à :</strong><br>${e(s.shipping_details.name)}<br>${e(adr.line1)}${adr.line2 ? '<br>' + e(adr.line2) : ''}<br>${e(adr.postal_code)} ${e(adr.city)}</td></tr>` : ''}
<tr><td align="center" style="padding:24px 32px 8px">${btn('https://k-reau.fr/carreaux', 'Découvrir d’autres lieux')}</td></tr>
<tr><td style="padding:12px 32px 28px;font-size:13px;line-height:1.6;color:#5E5A52">Une question ? Répondez simplement à cet e-mail. Un carreau arrivé abîmé ? Écrivez-nous avec une photo : nous vous le remplaçons ou vous remboursons.<br><br>
<em style="font-family:Georgia,serif;font-size:15px;color:#22211E">Les lieux qu’on aime, à garder chez soi.</em><br>K-Reau · <a href="https://k-reau.fr" style="color:#51573D">k-reau.fr</a> · <a href="https://www.instagram.com/kreau.studio/" style="color:#51573D">Instagram</a> · <a href="https://www.pinterest.com/kreaustudio/" style="color:#51573D">Pinterest</a></td></tr>
</table></td></tr></table></body></html>`;
}
