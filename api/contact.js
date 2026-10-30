// Relais des formulaires (contact, inscription) envoyés par e-mail via Resend, côté serveur.
// L'adresse de destination reste dans la variable d'environnement CONTACT_DESTINATION, jamais dans la page.
const echap = t => String(t).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') { res.setHeader('Allow', 'POST'); return res.status(405).json({ erreur: 'Méthode non autorisée' }); }
  const dest = process.env.CONTACT_DESTINATION;
  const cle = process.env.RESEND_API_KEY;
  if (!dest || !cle) return res.status(503).json({ erreur: 'Envoi non configuré' });

  let d = req.body;
  if (typeof d === 'string') { try { d = JSON.parse(d); } catch { d = {}; } }
  d = d && typeof d === 'object' ? d : {};
  const champ = (k, max) => String(d[k] ?? '').slice(0, max).trim();

  const email = champ('email', 200);
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) return res.status(400).json({ erreur: 'Adresse e-mail invalide' });
  if (champ('_honey', 100)) return res.status(200).json({ ok: true }); // robot

  const t = champ('type', 20);
  const type = t === 'contacts' || t === 'projets' ? t : 'interets';
  const nom = champ('nom', 200), sujet = champ('sujet', 200), message = champ('message', 5000), contexte = champ('contexte', 200);
  const projet = champ('projet', 120), quantite = champ('quantite', 80), modeles = champ('modeles', 80);
  const date = new Date().toLocaleString('fr-FR', { timeZone: 'Europe/Paris' });
  const objet = type === 'projets' ? `K-Reau · Projet spécifique : ${projet || 'demande'}${quantite ? ' · ' + quantite : ''}`
    : type === 'contacts' ? `K-Reau · Contact : ${sujet || 'message'}` : `K-Reau · Inscription (${contexte || 'site'})`;

  const lignes = [
    ['Type', type === 'projets' ? 'Demande de projet spécifique' : type === 'contacts' ? 'Message de contact' : 'Inscription'],
    ['Nom', nom], ['Organisation', champ('organisation', 150)], ['E-mail', email], ['Téléphone', champ('telephone', 30)],
    ['Projet', projet], ['Quantité', quantite], ['Modèles', modeles], ['Échéance', champ('echeance', 80)],
    ['Sujet', sujet], ['Modèle / page', contexte], ['Date', date]
  ].filter(([, v]) => v);
  const html = `<table style="font-family:Arial,sans-serif;font-size:14px;border-collapse:collapse">${lignes.map(([k, v]) =>
    `<tr><td style="padding:6px 12px 6px 0;color:#51573D;font-weight:bold">${k}</td><td style="padding:6px 0">${echap(v)}</td></tr>`).join('')}</table>`
    + (message ? `<p style="font-family:Arial,sans-serif;font-size:14px;white-space:pre-wrap;border-top:1px solid #E6DED3;padding-top:12px">${echap(message)}</p>` : '');

  try {
    const r = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${cle}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        from: process.env.CONTACT_EXPEDITEUR || 'Site K-Reau <onboarding@resend.dev>',
        to: [dest], reply_to: email, subject: objet, html
      })
    });
    if (!r.ok) {
      console.error('Resend', r.status, (await r.text()).slice(0, 300));
      return res.status(502).json({ erreur: `Service d’envoi indisponible (${r.status})` });
    }
    return res.status(200).json({ ok: true });
  } catch (e) {
    console.error('Resend', e);
    return res.status(502).json({ erreur: 'Service d’envoi injoignable' });
  }
};
