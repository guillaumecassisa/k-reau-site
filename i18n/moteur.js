/* K-Reau · version anglaise. Fichier généré par scripts/build-i18n.js à partir de i18n/*.json : ne pas modifier à la main.
   Traduit le texte affiché (nœuds texte, attributs, titres, données structurées) et ajoute /en aux liens internes. */
(function(){
  if(window.__kreauI18n) return; window.__kreauI18n = true;
  const D = __DICT__;
  const T = s => Object.prototype.hasOwnProperty.call(D, s) ? D[s] : s;
  const P = __PATTERNS__;
  const norm = s => s.replace(/\s+/g, ' ').trim();
  function tr(s){
    const k = norm(s); if(!k || !(/[A-Za-zÀ-ÿ€]/.test(k) || /^\d,\d$/.test(k))) return null;
    if(Object.prototype.hasOwnProperty.call(D, k)) return D[k];
    for(const [re, r] of P){ const m = k.match(re); if(m){ const t = typeof r === 'function' ? r(m, T) : k.replace(re, r); if(t != null) return t; } }
    return null;
  }
  window.kreauTraduire = tr;
  const avecLangue = u => {
    if(!u || !u.startsWith('/') || u.startsWith('//')) return u;
    const ch = u.split(/[?#]/)[0];
    if(/^\/(en(\/|$)|guides(\/|$)|img\/|api\/|data\/|_vercel)/.test(ch) || /\.[a-z0-9]+$/i.test(ch)) return u;
    return ch === '/' ? '/en' + u.slice(1) : '/en' + u;
  };
  const SAUTER = new Set(['SCRIPT','STYLE','NOSCRIPT','TEXTAREA','CODE']);
  const ATTRS = ['placeholder','aria-label','alt','title'];
  // élément « mixte » (texte + balises, ex. une phrase avec un lien) : traduit d'un bloc, les balises deviennent {0}, {1}…
  const aTexte = n => n.nodeType === 3 && /[A-Za-zÀ-ÿ]/.test(n.nodeValue);
  function mixte(el){
    if(SAUTER.has(el.nodeName) || el.namespaceURI !== 'http://www.w3.org/1999/xhtml') return false;
    const ch = [...el.childNodes]; if(!ch.some(aTexte) || !ch.some(c => c.nodeType === 1)) return false;
    if(el.closest('[translate="no"],[data-langue]')) return true;
    let i = 0; const elems = [];
    const cle = norm(ch.map(c => c.nodeType === 3 ? c.nodeValue : c.nodeType === 1 ? (elems.push(c), `{${i++}}`) : '').join(''));
    const t = tr(cle); if(t == null || t === cle) return true;
    const frag = document.createDocumentFragment();
    t.split(/(\{\d+\})/).forEach(m => { const k = m.match(/^\{(\d+)\}$/); if(k){ if(elems[+k[1]]) frag.appendChild(elems[+k[1]]); } else if(m) frag.appendChild(document.createTextNode(m)); });
    el.textContent = ''; el.appendChild(frag);
    return true;
  }
  function texte(n){
    const p = n.parentNode; if(!p || SAUTER.has(p.nodeName) || p.closest?.('[translate="no"],[data-langue]')) return;
    if(p.nodeType === 1 && [...p.childNodes].some(c => c.nodeType === 1) && [...p.childNodes].some(aTexte)) return; // géré par mixte()
    const v = n.nodeValue, t = tr(v); if(t == null || t === norm(v)) return;
    const a = v.match(/^\s*/)[0], b = v.match(/\s*$/)[0];
    n.nodeValue = (a ? ' ' : '') + t + (b && v.trim() ? ' ' : '');
  }
  function attrs(el){
    if(el.nodeType !== 1) return;
    if(el.closest('[translate="no"]')) return;
    for(const at of ATTRS){ const v = el.getAttribute(at); if(v){ const t = tr(v); if(t != null && t !== v) el.setAttribute(at, t); } }
    if(el.nodeName === 'INPUT' && /^(submit|button)$/.test(el.type) && el.value){ const t = tr(el.value); if(t != null) el.value = t; }
    if(el.nodeName === 'META' && /^(description|og:title|og:description|twitter:title|twitter:description)$/.test(el.getAttribute('name') || el.getAttribute('property') || '')){ const v = el.getAttribute('content') || '', t = tr(v); if(t != null && t !== v) el.setAttribute('content', t); }
    if(el.nodeName === 'A' && !el.hasAttribute('data-langue')){ const h = el.getAttribute('href'), n = avecLangue(h); if(n !== h) el.setAttribute('href', n); }
    if(el.nodeName === 'FORM'){ const h = el.getAttribute('action'), n = avecLangue(h); if(h && n !== h) el.setAttribute('action', n); }
    if(el.nodeName === 'SCRIPT' && el.type === 'application/ld+json' && !el.dataset.en){
      try{
        const prof = o => Array.isArray(o) ? o.map(prof) : o && typeof o === 'object' ? Object.fromEntries(Object.entries(o).map(([k, v]) => [k, k === 'inLanguage' ? 'en' : (k === 'url' || k === 'item' || k === '@id') && typeof v === 'string' ? v.replace(/^https:\/\/k-reau\.fr(\/.*)$/, (m, p) => 'https://k-reau.fr' + avecLangue(p)) : prof(v)])) : typeof o === 'string' ? (tr(o) ?? o) : o;
        el.textContent = JSON.stringify(prof(JSON.parse(el.textContent))); el.dataset.en = '1';
      }catch(e){}
    }
  }
  function tout(racine){
    if(racine.nodeType === 3){ texte(racine); return; }
    if(racine.nodeType !== 1 && racine.nodeType !== 9) return;
    if(racine.nodeType === 1){ if(SAUTER.has(racine.nodeName) && racine.nodeName !== 'SCRIPT') return; attrs(racine); mixte(racine); }
    const w = document.createTreeWalker(racine, 5 /* éléments + texte */);
    let n; while((n = w.nextNode())){ if(n.nodeType === 3) texte(n); else { attrs(n); mixte(n); } }
  }
  const obs = new MutationObserver(recs => {
    for(const r of recs){
      if(r.type === 'childList'){ r.addedNodes.forEach(tout); if(r.target.nodeType === 1 && r.addedNodes.length) mixte(r.target); }
      else if(r.type === 'characterData'){ texte(r.target); if(r.target.parentNode?.nodeType === 1) mixte(r.target.parentNode); }
      else if(r.type === 'attributes') attrs(r.target);
    }
  });
  obs.observe(document.documentElement, { childList:true, subtree:true, characterData:true, attributes:true, attributeFilter:['placeholder','aria-label','alt','title','content','href','action','value'] });
  tout(document.documentElement);
  document.addEventListener('DOMContentLoaded', () => tout(document.documentElement));
})();
