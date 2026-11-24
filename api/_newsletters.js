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

// Compte à rebours figé au moment de l'envoi (un e-mail ne peut pas faire tourner un vrai minuteur)
const FIN_BF = Date.parse('2026-11-28T00:00:00+01:00');
function decompte(en) {
  const r = Math.max(0, FIN_BF - Date.now()), j = Math.floor(r / 86400000), h = Math.floor(r % 86400000 / 3600000), m = Math.floor(r % 3600000 / 60000);
  const bloc = (v, l) => `<td align="center" style="padding:0 6px"><div style="background:#22211E;color:#FFFEFB;font-family:Georgia,serif;font-size:30px;line-height:1;padding:12px 0;width:64px;text-align:center">${String(v).padStart(2, '0')}</div><div style="font-size:11px;letter-spacing:1.5px;text-transform:uppercase;color:#5E5A52;padding-top:6px">${l}</div></td>`;
  return `<table role="presentation" align="center" cellpadding="0" cellspacing="0" style="margin:6px auto 4px"><tr>${bloc(j, en ? 'days' : 'jours')}${bloc(h, en ? 'hours' : 'heures')}${bloc(m, 'min')}</tr></table>
<p style="margin:6px 0 16px;text-align:center;font-size:13px;color:#5E5A52">${en ? 'Ends Thursday 27 November at midnight' : 'Fin jeudi 27 novembre à minuit'}</p>`;
}
const MODELES = [
  { slug: 'marseille-bonne-mere-doree', fr: 'La Bonne Mère', en: 'La Bonne Mère', prix: 2190 },
  { slug: 'cote-d-azur-saint-tropez-terrasses', fr: 'Les terrasses de Saint-Tropez', en: 'The terraces of Saint-Tropez', prix: 2190 },
  { slug: 'cote-d-azur-nice', fr: 'Nice', en: 'Nice', prix: 2190 },
  { slug: 'alpes-ceuse', fr: 'Céüse', en: 'Céüse', prix: 1990 }
];
const eur = c => (c / 100).toFixed(2).replace('.', ',') + ' €';
function modeles(en) {
  const cell = m => `<td width="50%" valign="top" style="padding:5px"><a href="${S}${en ? '/en' : ''}/produits/${m.slug}?utm_source=newsletter" style="color:#22211E;text-decoration:none">
<img src="${IMG}/bf-${m.slug}.jpg" width="236" alt="${en ? m.en : m.fr}" style="display:block;width:100%;height:auto;border:0">
<span style="display:block;font-size:14px;padding:7px 0 0;text-align:center">${en ? m.en : m.fr}</span>
<span style="display:block;font-size:13px;padding:2px 0 8px;text-align:center"><s style="color:#8A8478">${eur(m.prix)}</s> <b>${eur(m.prix - Math.round(m.prix * 25 / 100))}</b></span></a></td>`;
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:4px 0 10px"><tr>${cell(MODELES[0])}${cell(MODELES[1])}</tr><tr>${cell(MODELES[2])}${cell(MODELES[3])}</tr></table>`;
}

const NEWSLETTERS = [
  {
    id: '2026-11-25-black-friday',
    date: '2026-11-25',
    expire: '2026-11-28',   // plus envoyée aux nouveaux inscrits après la fin du Black Friday
    valide: false,   // à valider par Guillaume
    sujet: { fr: 'Mes derniers dessins (et le Black Friday finit jeudi)', en: 'My latest drawings (and Black Friday ends Thursday)' },
    preheader: { fr: 'La Bonne Mère en doré, Saint-Tropez en couleur… et -25 % sur tout jusqu’à jeudi minuit.', en: 'La Bonne Mère in gold, Saint-Tropez in colour… and 25% off everything until Thursday midnight.' },
    titre: { fr: 'Bonjour,', en: 'Hello,' },
    bouton: { fr: 'Voir tous les carreaux', en: 'See all the tiles' },
    lien: { fr: `${S}/carreaux?utm_source=newsletter`, en: `${S}/en/carreaux?utm_source=newsletter` },
    corps(en) {
      if (en) return `${p('I wanted to take a couple of minutes to write to you before Black Friday ends.')}
${p('Over the last few weeks I have spent quite a few evenings drawing new places. I am especially proud of <b>La Bonne Mère</b>: for the first time, the statue is in gold, the way it shines when the sun goes down over Marseille. I also tried colour with <b>the terraces of Saint-Tropez</b> and <b>Nice</b>, and I went up into the Alps with <b>Céüse</b>, for climbers and lovers of the Hautes-Alpes.')}
${modeles(true)}
${p('Black Friday ends on Thursday at midnight: <b>25% off all tiles and gift boxes</b>, applied automatically in your basket.')}
${decompte(true)}
${p('If you are already thinking about Christmas: a gift box of 3 tiles of your choice is €41.17 instead of €54.90, and for delivery before Christmas, order by 13 December.')}
${p('And if you have a question, or a place you would love to see on a tile, just reply to this email. I read every one myself.')}
${p('Speak soon,<br><b>Guillaume</b><br><span style="color:#5E5A52">K-Reau, in Mallemort (Provence)</span>')}
${p('PS: I share my new drawings (and sometimes a peek behind the scenes at the workshop) on Instagram. If you would like to see them first, come and follow me: <a href="https://www.instagram.com/kreau.studio/" style="color:#51573D;font-weight:bold">@kreau.studio</a>')}`;
      return `${p('Je voulais prendre deux minutes pour vous écrire avant la fin du Black Friday.')}
${p('Ces dernières semaines, j’ai passé pas mal de soirées à dessiner de nouveaux lieux. Je suis particulièrement fier de <b>La Bonne Mère</b> : pour la première fois, la statue est en doré, comme quand elle brille au soleil couchant sur Marseille. J’ai aussi tenté la couleur avec <b>les terrasses de Saint-Tropez</b> et <b>Nice</b>, et je suis monté dans les Alpes avec <b>Céüse</b>, pour les grimpeurs et les amoureux des Hautes-Alpes.')}
${modeles(false)}
${p('Le Black Friday se termine jeudi à minuit : <b>-25 % sur tous les carreaux et les coffrets</b>, appliqué automatiquement dans le panier.')}
${decompte(false)}
${p('Si vous pensez déjà à Noël : un coffret de 3 carreaux de votre choix passe à 41,17 € au lieu de 54,90 €, et pour une livraison avant Noël, il faut commander avant le 13 décembre.')}
${p('Et si vous avez une question, ou l’envie d’un lieu qui n’existe pas encore en carreau, répondez simplement à ce mail. Je les lis tous moi-même.')}
${p('À très vite,<br><b>Guillaume</b><br><span style="color:#5E5A52">K-Reau, à Mallemort</span>')}
${p('PS : je partage mes nouveaux dessins (et parfois les coulisses de l’atelier) sur Instagram. Si vous voulez les découvrir en avant-première, venez me suivre : <a href="https://www.instagram.com/kreau.studio/" style="color:#51573D;font-weight:bold">@kreau.studio</a>')}`;
    }
  },
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
