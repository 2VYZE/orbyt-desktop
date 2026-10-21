// Zeichnet die Leute im Sprachkanal; wer redet, bekommt einen grünen Ring
const box = document.getElementById('box'), list = document.getElementById('list'), chan = document.getElementById('chan');
const MIC_OFF = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><path d="M3 3l18 18M9 9v3a3 3 0 0 0 5.1 2.1M15 9.3V5a3 3 0 0 0-5.9-.7M19 11a7 7 0 0 1-1.2 3.9M5 11a7 7 0 0 0 11 5.7M12 18v3"/></svg>';
const DEAF = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><path d="M3 3l18 18M4 14v-2a8 8 0 0 1 12.7-6.5M20 12v2M4 14h3v5H5a1 1 0 0 1-1-1zM20 14h-3v5h2a1 1 0 0 0 1-1z"/></svg>';
const el = (tag, cls, text) => { const e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; };
window.overlay.onState(st => {
  const p = st.prefs || {};
  box.className = `pos-${p.pos || 'tl'} size-${p.size || 'large'}`;
  list.textContent = '';
  const users = (st.users || []).filter(u => p.users !== 'speaking' || u.speaking);
  for (const u of users) {
    const row = el('div', 'row' + (u.speaking ? ' speaking' : ''));
    const av = el('div', 'av');
    if (u.color) av.style.background = u.color;
    if (u.avatar) { const img = el('img'); img.src = u.avatar; img.alt = ''; img.onerror = () => { img.remove(); av.textContent = (u.name || '?')[0].toUpperCase(); }; av.append(img); }
    else av.textContent = (u.name || '?')[0].toUpperCase();
    row.append(av);
    if (p.names === 'always' || (p.names === 'speaking' && u.speaking)) row.append(el('span', 'name', u.name));
    if (u.deafened || u.muted) { const ic = el('span', 'ic'); ic.innerHTML = u.deafened ? DEAF : MIC_OFF; row.append(ic); }
    list.append(row);
  }
  chan.textContent = '';
  if (st.channel && users.length) chan.append(el('span', null, st.channel));
});
