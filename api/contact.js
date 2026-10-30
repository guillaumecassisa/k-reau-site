// Relais des formulaires (contact, inscription) vers FormSubmit, côté serveur.
// L'adresse de destination reste dans la variable d'environnement CONTACT_DESTINATION, jamais dans la page.
module.exports = async function handler(req, res) {
  if (req.method !== 'POST') { res.setHeader('Allow', 'POST'); return res.status(405).json({ erreur: 'Méthode non autorisée' }); }
  const dest = process.env.CONTACT_DESTINATION;
  if (!dest) return res.status(503).json({ erreur: 'Formulaire non configuré' });
  let d = req.body;
  if (typeof d === 'string') { try { d = JSON.parse(d); } catch { d = {}; } }
  d = d && typeof d === 'object' ? d : {};
  const champ = (k, max) => String(d[k] ?? '').slice(0, max).trim();
  const email = champ('email', 200);
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) return res.status(400).json({ erreur: 'Adresse e-mail invalide' });
  if (champ('_honey', 100)) return res.status(200).json({ ok: true }); // robot
  const type = champ('type', 20) === 'contacts' ? 'contacts' : 'interets';
  const corps = {
    type, email,
    nom: champ('nom', 200), sujet: champ('sujet', 200), message: champ('message', 5000), contexte: champ('contexte', 200),
    date: new Date().toLocaleString('fr-FR', { timeZone: 'Europe/Paris' }),
    _subject: type === 'contacts' ? `K-Reau · Contact : ${champ('sujet', 100)}` : `K-Reau · Inscription (${champ('contexte', 100)})`,
    _template: 'table', _captcha: 'false', _replyto: email
  };
  const site = `https://${req.headers['x-forwarded-host'] || req.headers.host}`;
  try {
    const r = await fetch(`https://formsubmit.co/ajax/${encodeURIComponent(dest)}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json', Origin: site, Referer: site + '/' },
      body: JSON.stringify(corps)
    });
    const texte = await r.text();
    let j = {}; try { j = JSON.parse(texte); } catch {}
    if (!r.ok || String(j.success) === 'false') {
      console.error('FormSubmit', r.status, texte.slice(0, 300));
      return res.status(502).json({ erreur: j.message || `Service d’envoi indisponible (${r.status})` });
    }
    return res.status(200).json({ ok: true });
  } catch (e) {
    console.error('FormSubmit', e);
    return res.status(502).json({ erreur: 'Service d’envoi injoignable' });
  }
};
