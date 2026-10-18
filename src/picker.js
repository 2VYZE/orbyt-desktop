let all = [], kind = 'screen', sel = null;
const grid = document.getElementById('grid'), go = document.getElementById('go');
function draw() {
  grid.textContent = '';
  for (const s of all.filter(x => (kind === 'screen') === x.screen)) {
    const b = document.createElement('button');
    b.className = 'src' + (sel === s.id ? ' on' : '');
    const img = document.createElement('img'); img.className = 'thumb'; img.src = s.thumb; b.append(img);
    const n = document.createElement('div'); n.className = 'name';
    if (s.icon) { const i = document.createElement('img'); i.src = s.icon; n.append(i); }
    n.append(document.createTextNode(s.name)); b.append(n);
    b.onclick = () => { sel = s.id; go.disabled = false; draw(); };
    b.ondblclick = () => { sel = s.id; choose(); };
    grid.append(b);
  }
}
function choose() { if (sel) window.picker.choose({ id: sel, audio: document.getElementById('audio').checked }); }
document.querySelectorAll('.tab').forEach(t => t.onclick = () => {
  document.querySelectorAll('.tab').forEach(x => x.classList.toggle('on', x === t)); kind = t.dataset.k; draw();
});
document.getElementById('cancel').onclick = () => window.picker.choose(null);
go.onclick = choose;
document.addEventListener('keydown', e => { if (e.key === 'Escape') window.picker.choose(null); if (e.key === 'Enter') choose(); });
window.picker.list().then(r => {
  all = r.sources;
  if (!r.canAudio) document.getElementById('audioRow').style.display = 'none';
  const first = all.find(s => s.screen); if (first) { sel = first.id; go.disabled = false; }
  draw();
});
