// Newsletters K-Reau, envoyées le dimanche à 10 h (heure de Paris) par api/campagne.js.
// Une newsletter part seulement si sa date est celle du jour et si elle a été validée (valide: true)
// après relecture par Guillaume. Chaque abonné ne la reçoit qu'une fois.
const S = 'https://k-reau.fr';
const IMG = `${S}/img/newsletter`;

const p = t => `<p style="margin:0 0 14px">${t}</p>`;
const h2 = t => `<h2 style="font-family:Georgia,serif;font-weight:400;font-size:21px;margin:26px 0 10px;color:#22211E">${t}</h2>`;
const img = (src, alt, w = 496) => `<img src="${src}" width="${w}" alt="${alt}" style="display:block;width:100%;max-width:${w}px;height:auto;border:0">`;

function grille(cols, en) {
  const cell = c => `<td width="33%" valign="top" style="padding:4px"><a href="${S}${en ? '/en' : ''}/collections/${c.slug}" style="color:#22211E;text-decoration:none">
<img src="${IMG}/col-${c.slug}.jpg" width="156" alt="${en ? c.en : c.fr}" style="display:block;width:100%;height:auto;border:0">
<span style="display:block;font-size:13px;padding:6px 0 8px;text-align:center">${en ? c.en : c.fr}</span></a></td>`;
  const lignes = [cols.slice(0, 3), cols.slice(3, 6)];
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:4px 0 6px">${lignes.map(l => `<tr>${l.map(cell).join('')}</tr>`).join('')}</table>`;
}

const COLS = [
  { slug: 'marseille', fr: 'Marseille', en: 'Marseille' },
  { slug: 'cote-bleue', fr: 'La Côte Bleue', en: 'Côte Bleue' },
  { slug: 'luberon', fr: 'Le Luberon', en: 'Luberon' },
  { slug: 'cote-d-azur', fr: 'La Côte d’Azur', en: 'French Riviera' },
  { slug: 'montagnes-du-sud', fr: 'Les Montagnes du Sud', en: 'Southern Mountains' },
  { slug: 'alpes', fr: 'Les Alpes', en: 'The Alps' }
];

const NEWSLETTERS = [
  {
    id: '2026-11-15-la-marque',
    date: '2026-11-15',
    valide: true,   // validée par Guillaume le 14/11/2026
    sujet: { fr: 'Bienvenue chez K-Reau : les lieux qu’on aime, à garder chez soi', en: 'Welcome to K-Reau: the places we love, to keep at home' },
    preheader: { fr: 'Des carreaux en céramique dessinés à la main, imprimés en Provence. Et -25 % pour le Black Friday.', en: 'Hand-drawn ceramic tiles, printed in Provence. Plus 25% off for Black Friday.' },
    titre: { fr: 'Les lieux qu’on aime, à garder chez soi', en: 'The places we love, to keep at home' },
    bouton: { fr: 'Découvrir les carreaux', en: 'Discover the tiles' },
    lien: { fr: `${S}/carreaux`, en: `${S}/en/carreaux` },
    corps(en) {
      if (en) return `${img(`${IMG}/marque-hero.jpg`, 'K-Reau ceramic tiles on a rock by the sea, with Notre-Dame de la Garde in the background')}
<div style="height:18px"></div>
${p('Hello,')}
${p('K-Reau was born from a simple idea: some places stay with us. The harbour we grew up next to, the village of our holidays, the cove of our summers, the mountain we see from the window. We draw them, and we put them on ceramic so you can keep them at home.')}
${h2('A tile, a place, a story')}
${p('Each tile is a 15 × 15 cm glossy white ceramic tile, with a line drawing of a real place and its name in calligraphy. Every drawing is made for K-Reau, then printed in our workshop in Mallemort, in Provence.')}
${p('Hang it on the wall, set it on a shelf with its wooden easel, or slip it into a kitchen splashback.')}
${h2('More than 70 places of the South')}
${grille(COLS, true)}
${p(`And our Châteaux de France collection. <a href="${S}/en/carreaux" style="color:#51573D">See all the places</a>.`)}
${h2('Your own place, made to measure')}
${p(`Your family home, the beach of your childhood, the place where you said yes? Send us a photo, tell us your story, and we draw your tile by hand. You approve the drawing before printing. <a href="${S}/en/sur-mesure" style="color:#51573D">Custom tile from €34.90</a>.`)}
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#111;margin:22px 0 6px"><tr><td style="padding:18px 20px;color:#fff;text-align:center;font-size:15px;line-height:1.6">
<strong style="letter-spacing:3px">BLACK FRIDAY</strong><br>25% off all our tiles and gift boxes, from 15 to 27 November.<br><span style="color:#ccc;font-size:13px">Automatically applied in your basket, no code needed.</span></td></tr></table>
${p('<span style="font-size:13px;color:#5E5A52">For a delivery before Christmas in France, order before 13 December.</span>')}`;
      return `${img(`${IMG}/marque-hero.jpg`, 'Carreaux K-Reau posés sur un rocher au bord de la mer, avec Notre-Dame de la Garde au loin')}
<div style="height:18px"></div>
${p('Bonjour,')}
${p('K-Reau est né d’une idée simple : certains lieux nous accompagnent toute une vie. Le port de notre enfance, le village des vacances, la calanque de nos étés, la montagne qu’on voit depuis la fenêtre. Nous les dessinons, et nous les mettons sur céramique pour que vous puissiez les garder chez vous.')}
${h2('Un carreau, un lieu, une histoire')}
${p('Chaque carreau est une céramique blanche brillante de 15 × 15 cm, avec le dessin au trait d’un vrai lieu et son nom en calligraphie. Chaque dessin est réalisé pour K-Reau, puis imprimé dans notre atelier à Mallemort, en Provence.')}
${p('Accroché au mur, posé sur une étagère avec son chevalet en bois, ou glissé dans une crédence de cuisine : il trouve sa place partout.')}
${img(`${IMG}/marque-salon.jpg`, 'Carreau K-Reau de la Bonne Mère, avec sa statue dorée, accroché au mur d’un salon')}
${h2('Plus de 70 lieux du Sud')}
${grille(COLS, false)}
${p(`Sans oublier notre collection Châteaux de France. <a href="${S}/carreaux" style="color:#51573D">Voir tous les lieux</a>.`)}
${h2('Votre lieu à vous, sur mesure')}
${p(`La maison de famille, la plage de votre enfance, l’endroit où vous vous êtes dit oui ? Envoyez-nous votre photo, racontez-nous votre histoire : nous dessinons votre carreau à la main. Vous validez le dessin avant l’impression. <a href="${S}/sur-mesure" style="color:#51573D">Carreau sur mesure dès 34,90 €</a>.`)}
${h2('Le coffret, l’idée cadeau')}
${p(`Trois carreaux au choix dans un coffret prêt à offrir, avec un message imprimé sur la carte : 54,90 €. <a href="${S}/coffrets" style="color:#51573D">Composer un coffret</a>.`)}
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#111;margin:22px 0 6px"><tr><td style="padding:18px 20px;color:#fff;text-align:center;font-size:15px;line-height:1.6">
<strong style="letter-spacing:3px">BLACK FRIDAY</strong><br>-25 % sur tous nos carreaux et coffrets, du 15 au 27 novembre.<br><span style="color:#ccc;font-size:13px">Remise appliquée automatiquement au panier, sans code.</span></td></tr></table>
${p('<span style="font-size:13px;color:#5E5A52">Pour une livraison avant Noël en France, commandez avant le 13 décembre.</span>')}`;
    }
  }
];

module.exports = { NEWSLETTERS };
