// Tâche quotidienne (Vercel Cron, chaque matin) :
//  1. demande d'avis environ 10 jours après la livraison (une seule fois par commande) ;
//  2. relance des paiements abandonnés, uniquement si le client a accepté les e-mails sur la page de paiement Stripe ;
//  3. ajout à la newsletter des clients qui l'ont acceptée au paiement.
// Chaque envoi est « réservé » en base avant d'être fait : un même e-mail n'est jamais envoyé deux fois.
const { PRODUITS, stripe, base, signer, gabarit, envoyerClient, envoyerMail, echap, tropDeRequetes, ORIGINE_SITE } = require('./_commun');
const { carreauxDeLaCommande } = require('./avis');
const { lienDesinscription } = require('./newsletter');

const JOUR = 24 * 3600;
// délai entre la commande et la demande d'avis : expédition (5 à 7 j) + acheminement + ~10 jours
const delaiAvis = pays => (pays === 'FR' || pays === 'MC' ? 20 : pays === 'CA' ? 32 : 25) * JOUR;

function mailAvis(s, en) {
  const slugs = carreauxDeLaCommande(s.metadata && s.metadata.panier);
  const prenom = echap(((s.customer_details && s.customer_details.name) || '').trim().split(/\s+/)[0] || '');
  const noms = slugs.map(sl => echap(PRODUITS[sl].nom));
  const lien = `${ORIGINE_SITE}${en ? '/en' : ''}/avis?c=${encodeURIComponent(s.id)}&s=${signer(s.id)}`;
  const vignettes = slugs.slice(0, 3).map(sl => `<img src="${ORIGINE_SITE}/${PRODUITS[sl].miniature.replace(/^\//, '')}" width="120" height="120" alt="" style="border:1px solid #E6DED3;margin:0 4px">`).join('');
  const corps = en
    ? `<p style="margin:0 0 14px">${prenom ? `Hello ${prenom},<br>` : ''}Your K-Reau order should have arrived a few days ago. We hope ${noms.length > 1 ? 'your tiles have' : 'your tile has'} found a good spot at home, or made someone happy.</p>
<p style="margin:0 0 14px">Would you take one minute to tell us what you think? Your review helps other people choose, and it means a great deal to a small brand like ours.</p>
<p style="text-align:center;margin:0">${vignettes}</p>`
    : `<p style="margin:0 0 14px">${prenom ? `Bonjour ${prenom},<br>` : ''}Votre commande K-Reau est arrivée il y a quelques jours. Nous espérons que ${noms.length > 1 ? 'vos carreaux ont' : 'votre carreau a'} trouvé sa place chez vous, ou fait plaisir à la personne qui l’a reçu.</p>
<p style="margin:0 0 14px">Auriez-vous une minute pour nous dire ce que vous en pensez ? Votre avis aide d’autres personnes à choisir, et compte beaucoup pour une petite marque comme la nôtre.</p>
<p style="text-align:center;margin:0">${vignettes}</p>`;
  return gabarit({ lang: en ? 'en' : 'fr', titre: en ? 'How do you like it?' : 'Alors, ce carreau ?', corps,
    bouton: en ? 'Leave a review' : 'Donner mon avis', lien,
    pied: (en ? 'This is the only email we will send you about this order. A problem with your tile? Just reply to this email.' : 'Nous ne vous écrirons qu’une fois à ce sujet. Un souci avec votre carreau ? Répondez simplement à cet e-mail.') + '<br><br>' });
}

function mailRelance(s, en, email) {
  const slugs = carreauxDeLaCommande(s.metadata && s.metadata.panier);
  const lienDes = lienDesinscription(email);
  const vignettes = slugs.slice(0, 3).map(sl => `<img src="${ORIGINE_SITE}/${PRODUITS[sl].miniature.replace(/^\//, '')}" width="120" height="120" alt="${echap(PRODUITS[sl].nom)}" style="border:1px solid #E6DED3;margin:0 4px">`).join('');
  const liste = slugs.length ? `<p style="margin:0 0 14px">${slugs.map(sl => echap(PRODUITS[sl].nom)).join(' · ')}</p>` : '';
  const corps = en
    ? `<p style="margin:0 0 14px">You started an order on k-reau.fr but did not get to the end of the payment. No problem: we have kept your basket, you can pick up where you left off.</p>${liste}<p style="text-align:center;margin:0">${vignettes}</p>`
    : `<p style="margin:0 0 14px">Vous avez commencé une commande sur k-reau.fr sans aller jusqu’au bout du paiement. Pas de souci : votre panier vous attend, vous pouvez reprendre là où vous vous étiez arrêté.</p>${liste}<p style="text-align:center;margin:0">${vignettes}</p>`;
  return gabarit({ lang: en ? 'en' : 'fr', titre: en ? 'Your basket is waiting for you' : 'Votre panier vous attend', corps,
    bouton: en ? 'Complete my order' : 'Reprendre ma commande', lien: s.after_expiration.recovery.url,
    pied: (en ? `A question, or a problem paying? Just reply to this email.<br>You are receiving this email because you agreed to receive news from K-Reau on the payment page. <a href="${lienDes}" style="color:#51573D">Unsubscribe</a>.`
      : `Une question ou un souci au moment de payer ? Répondez simplement à cet e-mail.<br>Vous recevez cet e-mail car vous avez accepté de recevoir les actualités de K-Reau sur la page de paiement. <a href="${lienDes}" style="color:#51573D">Se désinscrire</a>.`) + '<br><br>' });
}

async function sessionsRecentes(depuis) {
  const toutes = []; let apres;
  for (let i = 0; i < 20; i++) {
    const p = { limit: 100, created: { gte: depuis } }; if (apres) p.starting_after = apres;
    const r = await stripe('GET', 'checkout/sessions', p);
    toutes.push(...r.data);
    if (!r.has_more || !r.data.length) break;
    apres = r.data[r.data.length - 1].id;
  }
  return toutes;
}

module.exports = async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  if (process.env.CRON_SECRET && req.headers.authorization !== `Bearer ${process.env.CRON_SECRET}`) return res.status(401).json({ erreur: 'Non autorisé' });
  if (tropDeRequetes(req, 3, 60 * 60 * 1000)) return res.status(429).json({ erreur: 'Trop de requêtes' });
  if (!process.env.STRIPE_SECRET_KEY) return res.status(503).json({ erreur: 'Paiement non configuré' });
  const bilan = { avis: 0, relances: 0, abonnes: 0, erreurs: [] };
  const maintenant = Math.floor(Date.now() / 1000);
  let sessions;
  try { sessions = await sessionsRecentes(maintenant - 50 * JOUR); }
  catch (e) { console.error('cron stripe', e.message); return res.status(502).json({ erreur: 'Stripe indisponible' }); }

  const payeesParEmail = new Map(); // dernière commande payée par adresse (pour ne pas relancer quelqu'un qui a fini par commander)
  for (const s of sessions) {
    const em = s.customer_details && s.customer_details.email && s.customer_details.email.toLowerCase();
    if (em && s.status === 'complete') payeesParEmail.set(em, Math.max(payeesParEmail.get(em) || 0, s.created));
  }

  for (const s of sessions) {
    const email = s.customer_details && s.customer_details.email && s.customer_details.email.toLowerCase();
    const en = s.metadata && s.metadata.lang === 'en';
    const accord = s.consent && s.consent.promotions === 'opt_in';
    try {
      if (s.status === 'complete' && s.payment_status === 'paid' && email) {
        if (accord) { const r = await base('abonne_ajout', { email, source: 'commande', langue: en ? 'en' : 'fr' }); if (r.nouveau) bilan.abonnes++; }
        const pays = s.shipping_details && s.shipping_details.address && s.shipping_details.address.country;
        const age = maintenant - s.created, delai = delaiAvis(pays);
        if (pays && carreauxDeLaCommande(s.metadata && s.metadata.panier).length && age >= delai && age <= delai + 14 * JOUR) {
          const r = await base('envoi_reserver', { type: 'avis', ref: s.id, email });
          if (r.reserve) {
            const ok = await envoyerClient(email, en ? 'How do you like your K-Reau tile?' : 'Alors, ce carreau K-Reau ?', mailAvis(s, en));
            if (ok) bilan.avis++; else { await base('envoi_annuler', { type: 'avis', ref: s.id }); bilan.erreurs.push('avis ' + s.id); }
          }
        }
      } else if (s.status === 'expired' && accord && email && s.after_expiration && s.after_expiration.recovery && s.after_expiration.recovery.url) {
        const rec = s.after_expiration.recovery;
        const expiree = s.expires_at || s.created;
        if (maintenant - expiree > 3 * JOUR || (rec.expires_at && rec.expires_at < maintenant + JOUR)) continue;
        if ((payeesParEmail.get(email) || 0) >= s.created) continue;      // a finalement commandé
        if ((await base('abonne_desinscrit', { email })).desinscrit) continue; // s'est désinscrit
        const r = await base('envoi_reserver', { type: 'relance', ref: s.id, email });
        if (!r.reserve) continue;
        const r2 = await base('envoi_reserver', { type: 'relance-email', ref: email + ':' + new Date().toISOString().slice(0, 10), email });
        if (!r2.reserve) continue;                                          // une seule relance par jour et par personne
        const lien = lienDesinscription(email);
        const ok = await envoyerClient(email, en ? 'Your K-Reau basket is waiting for you' : 'Votre panier K-Reau vous attend', mailRelance(s, en, email),
          { 'List-Unsubscribe': `<${lien}>`, 'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click' });
        if (ok) bilan.relances++; else { await base('envoi_annuler', { type: 'relance', ref: s.id }); bilan.erreurs.push('relance ' + s.id); }
      }
    } catch (e) { console.error('cron', s.id, e.message); bilan.erreurs.push(s.id + ' : ' + e.message.slice(0, 80)); }
  }
  if (bilan.erreurs.length) await envoyerMail('K-Reau · Tâche quotidienne : erreurs', `<pre>${echap(JSON.stringify(bilan, null, 1))}</pre>`).catch(() => {});
  console.log('cron', JSON.stringify(bilan));
  return res.status(200).json(bilan);
};
