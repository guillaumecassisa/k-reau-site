// Réception des photos du carreau sur mesure : la photo (déjà réduite par le navigateur) est transmise
// à K-Reau par e-mail en pièce jointe, avec une référence qui se retrouve ensuite dans la commande.
const { origineAutorisee, tropDeRequetes, echap, texte } = require('./_commun');

const TYPES = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp' };
const MAX_OCTETS = 3 * 1024 * 1024; // 3 Mo par photo après réduction

function signatureValide(buf, type) {
  if (type === 'image/jpeg') return buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff;
  if (type === 'image/png') return buf.slice(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]));
  if (type === 'image/webp') return buf.slice(0, 4).toString() === 'RIFF' && buf.slice(8, 12).toString() === 'WEBP';
  return false;
}

module.exports = async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  if (req.method !== 'POST') { res.setHeader('Allow', 'POST'); return res.status(405).json({ erreur: 'Méthode non autorisée' }); }
  if (!origineAutorisee(req)) return res.status(403).json({ erreur: 'Requête refusée' });
  if (tropDeRequetes(req, 15, 15 * 60 * 1000)) return res.status(429).json({ erreur: 'Trop de photos envoyées, réessayez dans quelques minutes' });
  const cle = process.env.RESEND_API_KEY, dest = process.env.CONTACT_DESTINATION;
  if (!cle || !dest) return res.status(503).json({ erreur: 'Envoi non configuré' });

  let d = req.body;
  if (typeof d === 'string') { try { d = JSON.parse(d); } catch { d = {}; } }
  d = d && typeof d === 'object' ? d : {};
  const ref = String(d.ref || '');
  if (!/^SM-[A-Z0-9]{6}$/.test(ref)) return res.status(400).json({ erreur: 'Référence invalide' });
  const type = String(d.type || '');
  if (!TYPES[type]) return res.status(415).json({ erreur: 'Format non accepté (JPG, PNG ou WebP)' });
  const b64 = String(d.data || '').replace(/^data:[^,]+,/, '');
  if (!/^[A-Za-z0-9+/=]+$/.test(b64)) return res.status(400).json({ erreur: 'Fichier illisible' });
  const buf = Buffer.from(b64, 'base64');
  if (!buf.length || buf.length > MAX_OCTETS) return res.status(413).json({ erreur: 'Photo trop lourde' });
  if (!signatureValide(buf, type)) return res.status(415).json({ erreur: 'Ce fichier n’est pas une image valide' });

  const n = Math.max(1, Math.min(5, parseInt(d.index, 10) || 1));
  const total = Math.max(n, Math.min(5, parseInt(d.total, 10) || 1));
  const nomCalli = texte(d.texte, 40), lieu = texte(d.lieu, 120), details = texte(d.details, 300);
  const html = `<div style="font-family:Arial,sans-serif;font-size:14px">
    <h2 style="color:#51573D">Photo carreau sur mesure · ${ref} (${n}/${total})</h2>
    <p>Photo envoyée depuis la page Sur mesure, avant le paiement. La référence <b>${ref}</b> apparaîtra dans la commande si le client la valide.</p>
    ${nomCalli ? `<p><b>Nom en calligraphie :</b> ${echap(nomCalli)}</p>` : ''}
    ${lieu ? `<p><b>Lieu :</b> ${echap(lieu)}</p>` : ''}
    ${details ? `<p><b>Souhaits :</b> ${echap(details)}</p>` : ''}
  </div>`;
  try {
    const r = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${cle}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        from: process.env.CONTACT_EXPEDITEUR || 'Site K-Reau <onboarding@resend.dev>',
        to: [dest], subject: `K-Reau · Photo sur mesure ${ref} (${n}/${total})`, html,
        attachments: [{ filename: `${ref}-${n}.${TYPES[type]}`, content: b64 }]
      })
    });
    if (!r.ok) { console.error('Resend photo', r.status, (await r.text()).slice(0, 200)); return res.status(502).json({ erreur: 'Envoi de la photo impossible pour le moment' }); }
    return res.status(200).json({ ok: true });
  } catch (e) {
    console.error('Resend photo', e.message);
    return res.status(502).json({ erreur: 'Envoi de la photo impossible pour le moment' });
  }
};
