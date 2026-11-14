// Envoi de la newsletter du dimanche (Vercel Cron, dimanche 9 h UTC, soit 10 h à Paris en hiver).
// Envoie la newsletter de api/_newsletters.js datée du jour (heure de Paris) et validée, à chaque abonné actif.
// Chaque envoi est réservé en base avant d'être fait : un abonné ne reçoit jamais deux fois la même newsletter.
const { base, gabarit, envoyerClient, envoyerMail, echap } = require('./_commun');
const { lienDesinscription } = require('./newsletter');
const { NEWSLETTERS } = require('./_newsletters');

const aujourdhuiParis = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Paris' }).format(new Date());   // AAAA-MM-JJ

function construire(n, email, en) {
  const lang = en ? 'en' : 'fr';
  const lien = lienDesinscription(email);
  const pre = `<div style="display:none;max-height:0;overflow:hidden;opacity:0">${echap(n.preheader[lang])}</div>`;
  const html = gabarit({ lang, titre: n.titre[lang], corps: pre + n.corps(en), bouton: n.bouton[lang], lien: n.lien[lang],
    pied: (en ? `You are receiving this email because you signed up on k-reau.fr. <a href="${lien}" style="color:#51573D">Unsubscribe</a>.`
              : `Vous recevez cet e-mail car vous vous êtes inscrit sur k-reau.fr. <a href="${lien}" style="color:#51573D">Se désinscrire</a>.`) + '<br><br>' });
  return { html, entetes: { 'List-Unsubscribe': `<${lien}>`, 'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click' } };
}

module.exports = async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  if (!process.env.CRON_SECRET || req.headers.authorization !== `Bearer ${process.env.CRON_SECRET}`) return res.status(401).json({ erreur: 'Non autorisé' });
  const jour = aujourdhuiParis();
  const n = NEWSLETTERS.find(x => x.date === jour && x.valide);
  if (!n) return res.status(200).json({ envoye: 0, raison: `aucune newsletter validée pour le ${jour}` });

  let abonnes = [];
  try { abonnes = await base('abonnes_liste', {}); } catch (e) { console.error('campagne abonnés', e.message); return res.status(502).json({ erreur: 'base indisponible' }); }
  let envoyes = 0, echecs = 0;
  for (const a of abonnes || []) {
    const email = String(a.email || '').toLowerCase(); if (!email) continue;
    const r = await base('envoi_reserver', { type: 'newsletter', ref: `${n.id}:${email}`, email });
    if (!r.reserve) continue;
    const en = a.langue === 'en';
    const { html, entetes } = construire(n, email, en);
    const ok = await envoyerClient(email, n.sujet[en ? 'en' : 'fr'], html, entetes);
    if (ok) envoyes++; else { echecs++; try { await base('envoi_annuler', { type: 'newsletter', ref: `${n.id}:${email}` }); } catch {} }
    await new Promise(r => setTimeout(r, 600));   // Resend : 2 envois par seconde au maximum
  }
  try { await envoyerMail(`K-Reau · Newsletter envoyée : ${n.sujet.fr}`, `<p>La newsletter « ${echap(n.sujet.fr)} » a été envoyée à ${envoyes} abonné${envoyes > 1 ? 's' : ''}${echecs ? ` (${echecs} échec${echecs > 1 ? 's' : ''} d’envoi)` : ''}.</p>`); } catch {}
  return res.status(200).json({ envoye: envoyes, echecs, newsletter: n.id });
};

// Dernière newsletter validée dont la date est passée (ou aujourd'hui) : envoyée aux nouveaux inscrits de la page /newsletter
async function envoyerDerniere(email, en) {
  const jour = aujourdhuiParis();
  const n = NEWSLETTERS.filter(x => x.valide && x.date <= jour).sort((a, b) => b.date.localeCompare(a.date))[0];
  if (!n) return false;
  const r = await base('envoi_reserver', { type: 'newsletter', ref: `${n.id}:${email}`, email });
  if (!r.reserve) return false;
  const { html, entetes } = construire(n, email, en);
  const ok = await envoyerClient(email, n.sujet[en ? 'en' : 'fr'], html, entetes);
  if (!ok) { try { await base('envoi_annuler', { type: 'newsletter', ref: `${n.id}:${email}` }); } catch {} }
  return ok;
}

module.exports.construire = construire;
module.exports.envoyerDerniere = envoyerDerniere;
