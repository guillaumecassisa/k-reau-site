// Relais des formulaires (contact, inscription) envoyés par e-mail via Resend, côté serveur.
// L'adresse de destination reste dans la variable d'environnement CONTACT_DESTINATION, jamais dans la page.
const { origineAutorisee, tropDeRequetes, echap } = require('./_commun');

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') { res.setHeader('Allow', 'POST'); return res.status(405).json({ erreur: 'Méthode non autorisée' }); }
  if (!origineAutorisee(req)) return res.status(403).json({ erreur: 'Requête refusée' });
  if (tropDeRequetes(req, 5, 15 * 60 * 1000)) return res.status(429).json({ erreur: 'Trop de messages envoyés, réessayez plus tard' });
  const dest = process.env.CONTACT_DESTINATION;
  const cle = process.env.RESEND_API_KEY;
  if (!dest || !cle) return res.status(503).json({ erreur: 'Envoi non configuré' });

  let d = req.body;
  if (typeof d === 'string') { try { d = JSON.parse(d); } catch { d = {}; } }
  d = d && typeof d === 'object' ? d : {};
  const champ = (k, max) => String(d[k] ?? '').replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, '').slice(0, max).trim();

  const email = champ('email', 200);
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) return res.status(400).json({ erreur: 'Adresse e-mail invalide' });
  if (champ('_honey', 100)) return res.status(200).json({ ok: true }); // robot

  const t = champ('type', 20);
  const type = t === 'contacts' || t === 'projets' ? t : 'interets';
  const nom = champ('nom', 200), sujet = champ('sujet', 200), message = champ('message', 5000), contexte = champ('contexte', 200);
  const projet = champ('projet', 120), quantite = champ('quantite', 80), modeles = champ('modeles', 80);
  const date = new Date().toLocaleString('fr-FR', { timeZone: 'Europe/Paris' });
  // Message suspect (lien dans le texte, adresse jetable ou exotique) : transmis quand même, mais signalé dans l'objet
  const tout = [nom, sujet, message, champ('organisation', 150), modeles].join(' ');
  const raisons = [];
  if (/https?:\/\/|www\.|\b[a-z0-9-]+\.(?:online|site|xyz|top|click|shop|store|live|link|icu|buzz|ru|cn|info|biz)\b/i.test(tout)) raisons.push('lien dans le message');
  const dom = email.split('@')[1].toLowerCase();
  if (/\.(?:my\.id|id|xyz|top|click|online|site|icu|buzz|ru|cn|tk|ml|ga|cf|gq|pw|cyou|sbs|cfd)$/.test(dom) || /(?:temp|trash|jetable|yopmail|guerrilla|mailinator|10minute|probox|throwaway)/.test(dom)) raisons.push('adresse e-mail jetable ou inhabituelle');
  const objet = projet === 'Proposition de lieu' ? `K-Reau · Lieu proposé : ${modeles || 'sans nom'}${champ('ville', 80) ? ' (' + champ('ville', 80) + ')' : ''}`
    : type === 'projets' ? `K-Reau · ${/^Revendeur/.test(projet) ? '' : 'Projet spécifique : '}${projet || 'demande'}${quantite ? ' · ' + quantite : ''}`
    : type === 'contacts' ? `K-Reau · Contact : ${sujet || 'message'}` : `K-Reau · Inscription (${contexte || 'site'})`;
  const objetFinal = (raisons.length ? '[Suspect] ' : '') + objet;

  const lignes = [
    ['Type', projet === 'Proposition de lieu' ? 'Proposition de lieu (carte des lieux)' : type === 'projets' ? 'Demande de projet spécifique' : type === 'contacts' ? 'Message de contact' : 'Inscription'],
    ['Nom', nom], ['Organisation', champ('organisation', 150)], ['Ville', champ('ville', 80)], ['E-mail', email], ['Téléphone', champ('telephone', 30)],
    ['Projet', projet], ['Quantité', quantite], [projet === 'Proposition de lieu' ? 'Lieu proposé' : 'Modèles', modeles], ['Échéance', champ('echeance', 80)],
    ['Sujet', sujet], ['Modèle / page', contexte], ['Date', date]
  ].filter(([, v]) => v);
  const alerte = raisons.length ? `<p style="font-family:Arial,sans-serif;font-size:14px;background:#FBEAEA;color:#8A1C1C;padding:10px 12px;margin:0 0 12px"><b>Message probablement indésirable</b> (${raisons.join(', ')}). Vérifiez l’expéditeur avant de cliquer sur un lien ou de répondre.</p>` : '';
  const html = alerte + `<table style="font-family:Arial,sans-serif;font-size:14px;border-collapse:collapse">${lignes.map(([k, v]) =>
    `<tr><td style="padding:6px 12px 6px 0;color:#51573D;font-weight:bold">${k}</td><td style="padding:6px 0">${echap(v)}</td></tr>`).join('')}</table>`
    + (message ? `<p style="font-family:Arial,sans-serif;font-size:14px;white-space:pre-wrap;border-top:1px solid #E6DED3;padding-top:12px">${echap(message)}</p>` : '');

  try {
    const r = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${cle}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        from: process.env.CONTACT_EXPEDITEUR || 'Site K-Reau <onboarding@resend.dev>',
        to: [dest], reply_to: email, subject: objetFinal, html
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
