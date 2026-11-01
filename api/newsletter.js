// Newsletter K-Reau : inscription (avec un code de bienvenue -10 % à usage unique) et désinscription en un clic.
//  POST /api/newsletter { email, lang }          → inscription depuis le site
//  GET|POST /api/newsletter?e=<email>&s=<sig>     → désinscription (lien des e-mails, compatible « List-Unsubscribe »)
const crypto = require('crypto');
const { stripe, base, signer, signatureOk, gabarit, emailValide, envoyerClient, origineAutorisee, tropDeRequetes, ORIGINE_SITE } = require('./_commun');

const COUPON = 'BIENVENUE10';
const lienDesinscription = email => `${ORIGINE_SITE}/api/newsletter?e=${Buffer.from(email).toString('base64url')}&s=${signer('desinscription:' + email)}`;

async function couponBienvenue() {
  try { return await stripe('GET', `coupons/${COUPON}`); }
  catch (e) {
    if (e.statut !== 404) throw e;
    return stripe('POST', 'coupons', { id: COUPON, percent_off: 10, duration: 'once', name: 'Bienvenue -10 %' });
  }
}

async function creerCode() {
  await couponBienvenue();
  const alpha = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  const b = crypto.randomBytes(6); let suffixe = ''; for (const x of b) suffixe += alpha[x % alpha.length];
  const code = `BIENVENUE-${suffixe}`;
  await stripe('POST', 'promotion_codes', {
    coupon: COUPON, code, max_redemptions: 1,
    expires_at: Math.floor(Date.now() / 1000) + 183 * 24 * 3600,               // valable 6 mois
    restrictions: { minimum_amount: 1990, minimum_amount_currency: 'eur' },  // dès un carreau acheté
    metadata: { origine: 'newsletter' }
  });
  return code;
}

function mailBienvenue(email, code, en) {
  const corps = en
    ? `<p style="margin:0 0 14px">Thank you for joining us. We will write occasionally: new places, gift ideas before the holidays, and a little news from the workshop in Provence. Never more than a couple of emails a month.</p>
<p style="margin:0 0 6px">As promised, here is your welcome code: <strong>10% off your first order</strong>.</p>
<div style="background:#EFE7DC;padding:16px 18px;text-align:center;margin:10px 0 6px"><span style="font-family:Courier New,monospace;font-size:22px;letter-spacing:2px">${code}</span></div>
<p style="margin:0;font-size:13px;color:#5E5A52">Enter it on the payment page. Single use, valid for 6 months.</p>`
    : `<p style="margin:0 0 14px">Merci de nous rejoindre. Nous vous écrirons de temps en temps : les nouveaux lieux, des idées cadeaux avant les fêtes et quelques nouvelles de l’atelier, en Provence. Jamais plus de deux e-mails par mois.</p>
<p style="margin:0 0 6px">Comme promis, voici votre code de bienvenue : <strong>-10 % sur votre première commande</strong>.</p>
<div style="background:#EFE7DC;padding:16px 18px;text-align:center;margin:10px 0 6px"><span style="font-family:Courier New,monospace;font-size:22px;letter-spacing:2px">${code}</span></div>
<p style="margin:0;font-size:13px;color:#5E5A52">À saisir sur la page de paiement. Utilisable une fois, valable 6 mois.</p>`;
  const lien = lienDesinscription(email);
  return gabarit({ lang: en ? 'en' : 'fr', titre: en ? 'Welcome to K-Reau' : 'Bienvenue chez K-Reau', corps,
    bouton: en ? 'Choose my tile' : 'Choisir mon carreau', lien: `${ORIGINE_SITE}${en ? '/en' : ''}/carreaux`,
    pied: (en ? `You are receiving this email because you signed up on k-reau.fr. <a href="${lien}" style="color:#51573D">Unsubscribe</a>.` : `Vous recevez cet e-mail car vous vous êtes inscrit sur k-reau.fr. <a href="${lien}" style="color:#51573D">Se désinscrire</a>.`) + '<br><br>' });
}

const page = (titre, texteFr, texteEn) => `<!doctype html><html lang="fr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex"><title>${titre}</title></head>
<body style="margin:0;background:#F7F5F0;font-family:Arial,Helvetica,sans-serif;color:#22211E;display:grid;place-items:center;min-height:100vh;padding:24px;box-sizing:border-box">
<div style="max-width:440px;text-align:center"><h1 style="font-family:Georgia,serif;font-weight:400">${titre}</h1><p>${texteFr}</p><p style="color:#5E5A52" lang="en">${texteEn}</p><p><a href="/" style="color:#51573D">k-reau.fr</a></p></div></body></html>`;

module.exports = async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  const q = req.query || {};
  try {
    // Désinscription (lien signé, aucun autre contrôle nécessaire)
    if (q.e && q.s) {
      let email = '';
      try { email = Buffer.from(String(q.e), 'base64url').toString('utf8').toLowerCase(); } catch {}
      if (!emailValide(email) || !signatureOk('desinscription:' + email, q.s)) {
        res.setHeader('Content-Type', 'text/html; charset=utf-8');
        return res.status(400).send(page('Lien invalide', 'Ce lien de désinscription n’est pas valide. Écrivez-nous à contact@k-reau.fr, nous vous retirerons de la liste.', 'This unsubscribe link is not valid. Write to contact@k-reau.fr and we will remove you from the list.'));
      }
      await base('abonne_desinscription', { email });
      if (req.method === 'POST') return res.status(200).json({ ok: true });
      res.setHeader('Content-Type', 'text/html; charset=utf-8');
      return res.status(200).send(page('C’est fait', 'Vous ne recevrez plus nos e-mails. Merci d’avoir suivi K-Reau.', 'You will no longer receive our emails. Thank you for following K-Reau.'));
    }

    if (req.method !== 'POST') { res.setHeader('Allow', 'POST'); return res.status(405).json({ erreur: 'Méthode non autorisée' }); }
    if (!origineAutorisee(req)) return res.status(403).json({ erreur: 'Requête refusée' });
    if (tropDeRequetes(req, 5, 15 * 60 * 1000)) return res.status(429).json({ erreur: 'Trop de tentatives, réessayez dans quelques minutes' });
    let d = req.body; if (typeof d === 'string') { try { d = JSON.parse(d); } catch { d = {}; } }
    d = d && typeof d === 'object' ? d : {};
    if (d.site) return res.status(200).json({ ok: true });                     // champ piège anti-robots
    const email = String(d.email || '').trim().toLowerCase(), en = d.lang === 'en';
    if (!emailValide(email)) return res.status(400).json({ erreur: 'Saisissez une adresse e-mail valide.' });

    const ab = await base('abonne_ajout', { email, source: 'site', langue: en ? 'en' : 'fr' });
    let code = ab.code;
    if (!code) {
      code = await creerCode();
      const r = await base('abonne_code', { email, code });
      if (!r.ok) code = (await base('abonne_ajout', { email, source: 'site' })).code || code;
    }
    // le code est toujours envoyé par e-mail (jamais affiché) : seule la personne qui possède l'adresse peut l'utiliser
    if (ab.nouveau || ab.desinscrit || d.renvoyer) {
      const lien = lienDesinscription(email);
      await envoyerClient(email, en ? 'Your K-Reau welcome code: 10% off' : 'Votre code de bienvenue K-Reau : -10 %', mailBienvenue(email, code, en),
        { 'List-Unsubscribe': `<${lien}>`, 'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click' });
    }
    return res.status(200).json({ ok: true, deja: !ab.nouveau });
  } catch (e) {
    console.error('newsletter', e.message);
    return res.status(500).json({ erreur: 'Inscription impossible pour le moment, réessayez plus tard.' });
  }
};
module.exports.lienDesinscription = lienDesinscription;
