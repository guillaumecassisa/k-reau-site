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
async function envoyerClient(destinataire, sujet, html) {
  const cle = process.env.RESEND_API_KEY, exp = process.env.CONTACT_EXPEDITEUR;
  if (!cle || !exp || !/@k-reau\.fr>?$/.test(exp) || !destinataire) return false;
  const r = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${cle}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ from: exp, to: [destinataire], reply_to: 'contact@k-reau.fr', subject: sujet, html })
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
const echap = v => String(v ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

module.exports = { PRIX, PRODUITS, stripe, euros, texte, codeCadeau, envoyerMail, envoyerClient, origineAutorisee, tropDeRequetes, echap, ORIGINE_SITE };
