// Petit générateur de PDF sans dépendance (polices standard Helvetica, encodage Windows-1252).
// Coordonnées en points, origine en haut à gauche ; page A4 (595 × 842).
const L = {
  R: [278, 278, 355, 556, 556, 889, 667, 191, 333, 333, 389, 584, 278, 333, 278, 278, 556, 556, 556, 556, 556, 556, 556, 556, 556, 556, 278, 278, 584, 584, 584, 556, 1015, 667, 667, 722, 722, 667, 611, 778, 722, 278, 500, 667, 556, 833, 722, 778, 667, 778, 722, 667, 611, 722, 667, 944, 667, 667, 611, 278, 278, 278, 469, 556, 333, 556, 556, 500, 556, 556, 278, 556, 556, 222, 222, 500, 222, 833, 556, 556, 556, 556, 333, 500, 278, 556, 500, 722, 500, 500, 500, 334, 260, 334, 584, 761, 556, 0, 222, 556, 333, 1000, 556, 556, 333, 1000, 667, 333, 1000, 0, 611, 0, 0, 222, 222, 333, 333, 350, 556, 1000, 333, 1000, 500, 333, 944, 0, 500, 667, 278, 333, 556, 556, 556, 556, 260, 556, 333, 737, 370, 556, 584, 333, 737, 333, 400, 584, 333, 333, 333, 556, 537, 278, 333, 333, 365, 556, 834, 834, 834, 611, 667, 667, 667, 667, 667, 667, 1000, 722, 667, 667, 667, 667, 278, 278, 278, 278, 722, 722, 778, 778, 778, 778, 778, 584, 778, 722, 722, 722, 722, 667, 667, 611, 556, 556, 556, 556, 556, 556, 889, 500, 556, 556, 556, 556, 278, 278, 278, 278, 556, 556, 556, 556, 556, 556, 556, 584, 611, 556, 556, 556, 556, 500, 556, 500],
  B: [278, 333, 474, 556, 556, 889, 722, 238, 333, 333, 389, 584, 278, 333, 278, 278, 556, 556, 556, 556, 556, 556, 556, 556, 556, 556, 333, 333, 584, 584, 584, 611, 975, 722, 722, 722, 722, 667, 611, 778, 722, 278, 556, 722, 611, 833, 722, 778, 667, 778, 722, 667, 611, 722, 667, 944, 667, 667, 611, 333, 278, 333, 584, 556, 333, 556, 611, 556, 611, 556, 333, 611, 611, 278, 278, 556, 278, 889, 611, 611, 611, 611, 389, 556, 333, 611, 556, 778, 556, 556, 500, 389, 280, 389, 584, 761, 556, 0, 278, 556, 500, 1000, 556, 556, 333, 1000, 667, 333, 1000, 0, 611, 0, 0, 278, 278, 500, 500, 350, 556, 1000, 333, 1000, 556, 333, 944, 0, 500, 667, 278, 333, 556, 556, 556, 556, 280, 556, 333, 737, 370, 556, 584, 333, 737, 333, 400, 584, 333, 333, 333, 611, 556, 278, 333, 333, 365, 556, 834, 834, 834, 611, 722, 722, 722, 722, 722, 722, 1000, 722, 667, 667, 667, 667, 278, 278, 278, 278, 722, 722, 778, 778, 778, 778, 778, 584, 778, 722, 722, 722, 722, 667, 667, 611, 556, 556, 556, 556, 556, 556, 889, 556, 556, 556, 556, 556, 278, 278, 278, 278, 611, 611, 611, 611, 611, 611, 611, 584, 611, 611, 611, 611, 611, 556, 611, 556]
};
const SPECIAUX = { 0x20ac: 0x80, 0x201a: 0x82, 0x0192: 0x83, 0x201e: 0x84, 0x2026: 0x85, 0x2020: 0x86, 0x2021: 0x87, 0x02c6: 0x88, 0x2030: 0x89,
  0x0160: 0x8a, 0x2039: 0x8b, 0x0152: 0x8c, 0x017d: 0x8e, 0x2018: 0x91, 0x2019: 0x92, 0x201c: 0x93, 0x201d: 0x94, 0x2022: 0x95, 0x2013: 0x96,
  0x2014: 0x97, 0x02dc: 0x98, 0x2122: 0x99, 0x0161: 0x9a, 0x203a: 0x9b, 0x0153: 0x9c, 0x017e: 0x9e, 0x0178: 0x9f, 0x202f: 0xa0, 0x2009: 0x20, 0x2011: 0x2d, 0x2010: 0x2d };
function octets(s) {
  const out = [];
  for (const ch of String(s ?? '').normalize('NFC')) {
    const c = ch.codePointAt(0);
    if (c >= 0x20 && c < 0x7f) out.push(c);
    else if (SPECIAUX[c] !== undefined) out.push(SPECIAUX[c]);
    else if (c >= 0xa0 && c <= 0xff) out.push(c);
    else if (c === 0x09 || c === 0x0a) out.push(0x20);
    else { const base = ch.normalize('NFD')[0].codePointAt(0); out.push(base >= 0x20 && base < 0x7f ? base : 0x3f); }
  }
  return out;
}
const largeur = (s, taille, gras) => octets(s).reduce((t, b) => t + ((gras ? L.B : L.R)[b - 32] || 556), 0) * taille / 1000;
const litteral = s => '(' + octets(s).map(b => b === 0x28 || b === 0x29 || b === 0x5c ? '\\' + String.fromCharCode(b) : String.fromCharCode(b)).join('') + ')';
const rvb = h => { const n = parseInt(String(h).replace('#', ''), 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255].map(v => (v / 255).toFixed(3)).join(' '); };

class PDF {
  constructor() { this.pages = []; this.H = 842; this.W = 595; this.page(); }
  page() { this.flux = []; this.pages.push(this.flux); return this; }
  texte(x, y, s, { taille = 10, gras = false, couleur = '#22211E', aligne = 'gauche' } = {}) {
    let x0 = x; if (aligne !== 'gauche') { const w = largeur(s, taille, gras); x0 = aligne === 'droite' ? x - w : x - w / 2; }
    this.flux.push(`BT /${gras ? 'F2' : 'F1'} ${taille} Tf ${rvb(couleur)} rg ${x0.toFixed(2)} ${(this.H - y).toFixed(2)} Td ${litteral(s)} Tj ET`);
  }
  ligne(x1, y1, x2, y2, { couleur = '#D9BEA3', epaisseur = 0.6 } = {}) {
    this.flux.push(`${rvb(couleur)} RG ${epaisseur} w ${x1} ${this.H - y1} m ${x2} ${this.H - y2} l S`);
  }
  rect(x, y, w, h, { fond = '#F5F1EA', bord } = {}) {
    this.flux.push(`${rvb(fond)} rg ${bord ? rvb(bord) + ' RG 0.6 w ' : ''}${x} ${this.H - y - h} ${w} ${h} re ${bord ? 'B' : 'f'}`);
  }
  couper(s, max, taille, gras) {
    const lignes = [];
    for (const para of String(s ?? '').split('\n')) {
      let cur = '';
      for (const mot of para.split(/\s+/).filter(Boolean)) {
        const essai = cur ? cur + ' ' + mot : mot;
        if (largeur(essai, taille, gras) <= max || !cur) cur = essai; else { lignes.push(cur); cur = mot; }
      }
      lignes.push(cur);
    }
    return lignes;
  }
  build() {
    const objs = [];
    const add = s => { objs.push(s); return objs.length; };
    add('<< /Type /Catalog /Pages 2 0 R >>');
    add('');
    add('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>');
    add('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>');
    const kids = [];
    for (const f of this.pages) {
      const contenu = f.join('\n');
      const c = add(`<< /Length ${Buffer.byteLength(contenu, 'latin1')} >>\nstream\n${contenu}\nendstream`);
      kids.push(add(`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${this.W} ${this.H}] /Resources << /Font << /F1 3 0 R /F2 4 0 R >> >> /Contents ${c} 0 R >>`));
    }
    objs[1] = `<< /Type /Pages /Kids [${kids.map(k => k + ' 0 R').join(' ')}] /Count ${kids.length} >>`;
    let out = '%PDF-1.4\n%\xe2\xe3\xcf\xd3\n'; const pos = [];
    objs.forEach((o, i) => { pos.push(Buffer.byteLength(out, 'latin1')); out += `${i + 1} 0 obj\n${o}\nendobj\n`; });
    const xref = Buffer.byteLength(out, 'latin1');
    out += `xref\n0 ${objs.length + 1}\n0000000000 65535 f \n` + pos.map(p => String(p).padStart(10, '0') + ' 00000 n \n').join('');
    out += `trailer\n<< /Size ${objs.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
    return Buffer.from(out, 'latin1');
  }
}
module.exports = { PDF, largeur };
