// Outils partagés par les fonctions de paiement (préfixe « _ » : non exposé comme route).
const crypto = require('crypto');
const CATALOGUE = require('../data/catalogue_produits.json');

// Tous les prix sont fixés ici, côté serveur (en centimes).
const PRIX = {
  carreau: 1990,
  coffret: 5490,          // 3 carreaux au choix (au lieu de 3 × 19,90 €)
  surMesure: 3490,
  chevalet: 290,          // chevalet trépied en bois brut (accessoire)
  cartes: [2500, 5000, 7500, 10000]
};
const PRODUITS = Object.fromEntries(CATALOGUE.filter(p => p.publie !== false).map(p => [p.slug, p]));
const STRIPE_VERSION = '2024-06-20'; // version d'API figée : paramètres stables

function encoder(obj, prefix, out = []) {
  for (const [k, v] of Object.entries(obj)) {
    const cle = prefix ? `${prefix}[${k}]` : k;
    if (v !== null && typeof v === 'object') encoder(v, cle, out);
    else if (v !== undefined) out.push(`${encodeURIComponent(cle)}=${encodeURIComponent(v)}`);
  }
  return out;
}

async function stripe(methode, chemin, params) {
  const cle = process.env.STRIPE_SECRET_KEY;
  const opts = { method: methode, headers: { Authorization: `Bearer ${cle}`, 'Stripe-Version': STRIPE_VERSION } };
  let url = `https://api.stripe.com/v1/${chemin}`;
  if (params && methode === 'GET') url += '?' + encoder(params).join('&');
  else if (params) { opts.headers['Content-Type'] = 'application/x-www-form-urlencoded'; opts.body = encoder(params).join('&'); }
  const r = await fetch(url, opts);
  const j = await r.json();
  if (!r.ok) { const e = new Error((j.error && j.error.message) || `Stripe ${r.status}`); e.statut = r.status; throw e; }
  return j;
}

const euros = c => (c / 100).toLocaleString('fr-FR', { style: 'currency', currency: 'EUR' });
const texte = (v, max) => String(v ?? '').replace(/[\u0000-\u001f]/g, ' ').trim().slice(0, max);

// Code de carte cadeau déterministe pour une commande (évite les doublons si la page est rechargée).
function codeCadeau(sessionId, i) {
  const h = crypto.createHmac('sha256', process.env.STRIPE_SECRET_KEY || 'k').update(`${sessionId}:${i}`).digest();
  const alpha = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let c = ''; for (let k = 0; k < 8; k++) c += alpha[h[k] % alpha.length];
  return `KREAU-${c.slice(0, 4)}-${c.slice(4)}`;
}

async function envoyerMail(sujet, html, repondreA) {
  const cle = process.env.RESEND_API_KEY, dest = process.env.CONTACT_DESTINATION;
  if (!cle || !dest) return false;
  const r = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${cle}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ from: process.env.CONTACT_EXPEDITEUR || 'Site K-Reau <onboarding@resend.dev>', to: [dest], reply_to: repondreA || undefined, subject: sujet, html })
  });
  if (!r.ok) console.error('Resend', r.status, (await r.text()).slice(0, 200));
  return r.ok;
}

// E-mail au client : uniquement si un expéditeur sur le domaine vérifié est configuré (CONTACT_EXPEDITEUR).
async function envoyerClient(destinataire, sujet, html, entetes) {
  const cle = process.env.RESEND_API_KEY, exp = process.env.CONTACT_EXPEDITEUR;
  if (!cle || !exp || !/@k-reau\.fr>?$/.test(exp) || !destinataire) return false;
  const r = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${cle}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ from: exp, to: [destinataire], reply_to: 'contact@k-reau.fr', subject: sujet, html, headers: entetes || undefined })
  });
  if (!r.ok) console.error('Resend client', r.status, (await r.text()).slice(0, 200));
  return r.ok;
}

// Sécurité : seules les pages du site peuvent appeler ces fonctions.
const ORIGINES = ['https://k-reau.fr', 'https://www.k-reau.fr'];
const ORIGINE_SITE = 'https://k-reau.fr';
function origineAutorisee(req) {
  const o = req.headers.origin || '';
  const r = req.headers.referer || '';
  if (o) return ORIGINES.includes(o) || /^https:\/\/k-reau-[a-z0-9-]+\.vercel\.app$/.test(o);
  return ORIGINES.some(x => r.startsWith(x + '/'));
}
// Limiteur de débit simple par adresse IP (mémoire de l'instance) : freine les abus et le spam.
const compteurs = new Map();
function tropDeRequetes(req, max, fenetreMs) {
  const ip = String(req.headers['x-real-ip'] || req.headers['x-forwarded-for'] || '').split(',')[0].trim() || 'inconnue';
  const now = Date.now(), cle = ip + ':' + max;
  const t = (compteurs.get(cle) || []).filter(x => now - x < fenetreMs);
  t.push(now); compteurs.set(cle, t);
  if (compteurs.size > 5000) compteurs.clear();
  return t.length > max;
}

// Base de données K-Reau (Supabase) : une seule fonction SQL « kreau », protégée par la clé secrète KREAU_DB_CLE.
async function base(action, data) {
  const url = process.env.KREAU_DB_URL, anon = process.env.KREAU_DB_ANON, cle = process.env.KREAU_DB_CLE;
  if (!url || !anon || !cle) throw new Error('Base non configurée');
  const r = await fetch(`${url}/rest/v1/rpc/kreau`, {
    method: 'POST',
    headers: { apikey: anon, Authorization: `Bearer ${anon}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ p_cle: cle, p_action: action, p_data: data || {} })
  });
  const t = await r.text();
  if (!r.ok) throw new Error(`Base ${r.status} ${t.slice(0, 160)}`);
  return JSON.parse(t);
}
// Signature des liens envoyés par e-mail (avis, désinscription) : impossible à fabriquer sans la clé.
const signer = v => crypto.createHmac('sha256', 'kreau-liens:' + (process.env.KREAU_DB_CLE || '')).update(String(v)).digest('base64url').slice(0, 22);
const signatureOk = (v, sig) => { const a = Buffer.from(signer(v)), b = Buffer.from(String(sig || '')); return a.length === b.length && crypto.timingSafeEqual(a, b); };

// Gabarit commun des e-mails clients (même présentation que l'e-mail de commande).
function gabarit({ lang = 'fr', titre, corps, bouton, lien, pied = '' }) {
  const en = lang === 'en';
  return `<!doctype html><html lang="${en ? 'en' : 'fr'}"><body style="margin:0;background:#F5F1EA;font-family:Arial,Helvetica,sans-serif;color:#22211E">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#F5F1EA"><tr><td align="center" style="padding:28px 12px">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:#FFFEFB;border:1px solid #E6DED3">
<tr><td align="center" style="padding:28px 28px 8px"><img src="https://k-reau.fr/img/01_Identite/logo-kreau-email.png" width="120" alt="K-Reau" style="display:block;border:0"></td></tr>
<tr><td style="padding:8px 32px 0;font-size:15px;line-height:1.6">
<h1 style="font-family:Georgia,serif;font-weight:400;font-size:26px;margin:12px 0 14px">${titre}</h1>
${corps}
</td></tr>
${bouton ? `<tr><td align="center" style="padding:20px 32px 8px"><a href="${lien}" style="display:inline-block;background:#51573D;color:#fff;text-decoration:none;padding:12px 22px;font-weight:600">${bouton}</a></td></tr>` : ''}
<tr><td style="padding:16px 32px 28px;font-size:13px;line-height:1.6;color:#5E5A52">${pied}
<em style="font-family:Georgia,serif;font-size:15px;color:#22211E">${en ? 'The places we love, to keep at home.' : 'Les lieux qu’on aime, à garder chez soi.'}</em><br>K-Reau · <a href="https://k-reau.fr${en ? '/en' : ''}" style="color:#51573D">k-reau.fr</a> · <a href="https://www.instagram.com/kreau.studio/" style="color:#51573D">Instagram</a></td></tr>
</table></td></tr></table></body></html>`;
}
const emailValide = v => /^[^\s@<>"]{1,64}@[^\s@<>"]+\.[a-z]{2,}$/i.test(String(v || '')) && String(v).length <= 120;
const echap = v => String(v ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

module.exports = { PRIX, PRODUITS, stripe, euros, texte, codeCadeau, envoyerMail, envoyerClient, origineAutorisee, tropDeRequetes, echap, ORIGINE_SITE, base, signer, signatureOk, gabarit, emailValide };
