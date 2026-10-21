// Piphin Foto · núcleo: documento, camadas, histórico (desfazer/refazer) e seleção.
//
// Cada camada é um canvas do tamanho do documento. O histórico guarda "fotos" do documento que apontam
// para os canvas das camadas sem copiá-los: antes de alterar uma camada, beginEdit() troca o canvas dela
// por uma cópia (cópia na escrita). Assim só as camadas alteradas ocupam memória a mais em cada passo.
"use strict";
const PF = (window.PF = {});
const $ = (s, el = document) => el.querySelector(s);
const $$ = (s, el = document) => [...el.querySelectorAll(s)];
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const PT = "pt-BR";
const fmt = (v, d = 0) => Number(v).toLocaleString(PT, { maximumFractionDigits: d });

PF.canvas = (w, h) => { const c = document.createElement("canvas"); c.width = Math.max(1, Math.round(w)); c.height = Math.max(1, Math.round(h)); return c; };
PF.g = (c) => c.getContext("2d");
PF.clone = (src) => { const c = PF.canvas(src.width, src.height); PF.g(c).drawImage(src, 0, 0); return c; };
PF.pixels = (c) => c.getContext("2d", { willReadFrequently: true }).getImageData(0, 0, c.width, c.height);
let _uid = 0;
PF.uid = () => ++_uid;

PF.BLENDS = [["source-over", "Normal"], ["multiply", "Multiplicação"], ["screen", "Divisão de cor (Screen)"], ["overlay", "Sobrepor"],
  ["darken", "Escurecer"], ["lighten", "Clarear"], ["color-dodge", "Subexposição de cor"], ["color-burn", "Superexposição de cor"],
  ["hard-light", "Luz direta"], ["soft-light", "Luz indireta"], ["difference", "Diferença"], ["exclusion", "Exclusão"],
  ["hue", "Matiz"], ["saturation", "Saturação"], ["color", "Cor"], ["luminosity", "Luminosidade"]];

// ------------------------------------------------------------------ texto (camadas de texto editáveis)
PF.textFont = (t) => `${t.italic ? "italic " : ""}${t.bold ? "700 " : "400 "}${Math.max(1, t.size)}px "${t.font}", sans-serif`;
PF.textLines = (t) => String(t.content || "").split("\n");
PF.textBox = (t) => {
  const g = PF.g(PF.canvas(1, 1));
  g.font = PF.textFont(t);
  const lines = PF.textLines(t);
  const lh = t.size * (t.lineHeight || 1.2);
  const w = Math.max(t.size * 0.3, ...lines.map((l) => g.measureText(l || " ").width));
  const x = t.align === "center" ? t.x - w / 2 : t.align === "right" ? t.x - w : t.x;
  return { x, y: t.y, w, h: lh * lines.length, lh };
};
PF.renderText = (layer, w, h) => {
  const t = layer.text;
  const c = PF.canvas(w, h), g = PF.g(c);
  g.font = PF.textFont(t);
  g.textBaseline = "top";
  g.textAlign = t.align || "left";
  const lh = t.size * (t.lineHeight || 1.2);
  PF.textLines(t).forEach((line, i) => {
    const y = t.y + i * lh + (lh - t.size) / 2;
    if (t.shadow) { g.save(); g.shadowColor = "rgba(0,0,0,.6)"; g.shadowBlur = t.size * 0.12; g.shadowOffsetY = t.size * 0.05; g.fillStyle = t.color; g.fillText(line, t.x, y); g.restore(); }
    if (t.outline) { g.lineJoin = "round"; g.lineWidth = Math.max(1, t.size * 0.12); g.strokeStyle = t.outlineColor || "#000"; g.strokeText(line, t.x, y); }
    g.fillStyle = t.color;
    g.fillText(line, t.x, y);
  });
  layer.canvas = c;
};

// ------------------------------------------------------------------ documento
class Doc {
  constructor({ w, h, name = "Sem título", path = null, background = "transparent" }) {
    this.id = PF.uid();
    this.w = Math.round(w); this.h = Math.round(h);
    this.name = name; this.path = path; this.projectPath = null;
    this.layers = [];
    this.activeId = null;
    this.selection = null; // canvas: branco = selecionado (alfa = intensidade)
    this.selPath = null;   // contorno da seleção (Path2D), recalculado quando muda
    this.past = []; this.future = [];
    this.dirty = false;
    this.view = { zoom: 1, x: 0, y: 0, fitted: false };
    this.preview = null;   // { id, canvas }: substitui uma camada só na tela (pincel, ajuste com prévia)
    this.compDirty = true; this._comp = null;
    const bg = this.addLayer(background === "transparent" ? "Camada 1" : "Fundo");
    if (background !== "transparent") { const g = PF.g(bg.canvas); g.fillStyle = background; g.fillRect(0, 0, this.w, this.h); }
  }

  get active() { return this.layers.find((l) => l.id === this.activeId) || this.layers[this.layers.length - 1]; }
  layer(id) { return this.layers.find((l) => l.id === id); }

  addLayer(name, canvas, at) {
    const l = { id: PF.uid(), name: name || `Camada ${this.layers.length + 1}`, canvas: canvas || PF.canvas(this.w, this.h),
      visible: true, opacity: 1, blend: "source-over", locked: false, text: null };
    const i = at == null ? (this.activeId ? this.layers.indexOf(this.active) + 1 : this.layers.length) : at;
    this.layers.splice(i, 0, l);
    this.activeId = l.id;
    this.changed();
    return l;
  }

  changed() { this.compDirty = true; PF.requestRender && PF.requestRender(); }

  // composição de todas as camadas visíveis (cacheada)
  composite(opts = {}) {
    if (!this.compDirty && this._comp && !opts.fresh) return this._comp;
    const c = this._comp && this._comp.width === this.w && this._comp.height === this.h && !opts.fresh ? this._comp : PF.canvas(this.w, this.h);
    const g = PF.g(c);
    g.setTransform(1, 0, 0, 1, 0, 0);
    g.globalCompositeOperation = "source-over"; g.globalAlpha = 1;
    g.clearRect(0, 0, this.w, this.h);
    if (opts.background) { g.fillStyle = opts.background; g.fillRect(0, 0, this.w, this.h); }
    for (const l of this.layers) {
      if (!l.visible || l.opacity <= 0) continue;
      const src = this.preview && this.preview.id === l.id ? this.preview.canvas : l.canvas;
      g.globalAlpha = l.opacity;
      g.globalCompositeOperation = l.blend;
      g.drawImage(src, 0, 0);
    }
    g.globalAlpha = 1; g.globalCompositeOperation = "source-over";
    if (!opts.fresh) { this._comp = c; this.compDirty = false; }
    return c;
  }

  // ---------------------------------------------------------------- histórico
  snapshot() {
    return { w: this.w, h: this.h, activeId: this.activeId, selection: this.selection,
      layers: this.layers.map((l) => ({ ...l, text: l.text ? { ...l.text } : null })) };
  }
  restore(s) {
    this.w = s.w; this.h = s.h; this.activeId = s.activeId;
    this.layers = s.layers.map((l) => ({ ...l, text: l.text ? { ...l.text } : null }));
    this.setSelection(s.selection, "replace", true);
    this.preview = null;
    this.changed();
  }
  // marca um passo do histórico; ids = camadas que serão alteradas ("all" = todas); sel = a seleção também
  beginEdit(label, ids = [], { sel = false } = {}) {
    this.past.push({ label, snap: this.snapshot() });
    if (this.past.length > 60) this.past.shift();
    this.future = [];
    const list = ids === "all" ? this.layers : this.layers.filter((l) => ids.includes(l.id));
    for (const l of list) l.canvas = PF.clone(l.canvas);
    if (sel && this.selection) this.selection = PF.clone(this.selection);
    this.dirty = true;
    PF.emit && PF.emit("history", this);
  }
  undo() {
    const e = this.past.pop();
    if (!e) return false;
    this.future.push({ label: e.label, snap: this.snapshot() });
    this.restore(e.snap);
    this.dirty = true;
    PF.emit && PF.emit("history", this);
    return e.label;
  }
  redo() {
    const e = this.future.pop();
    if (!e) return false;
    this.past.push({ label: e.label, snap: this.snapshot() });
    this.restore(e.snap);
    this.dirty = true;
    PF.emit && PF.emit("history", this);
    return e.label;
  }

  // ---------------------------------------------------------------- seleção
  // mode: replace | add | sub | intersect
  setSelection(mask, mode = "replace", silent = false) {
    if (mode === "replace" || !this.selection) {
      this.selection = mode === "sub" || mode === "intersect" ? null : mask;
    } else if (mask) {
      const c = PF.clone(this.selection), g = PF.g(c);
      g.globalCompositeOperation = mode === "add" ? "source-over" : mode === "sub" ? "destination-out" : "destination-in";
      g.drawImage(mask, 0, 0);
      this.selection = c;
    }
    if (this.selection && PF.maskEmpty(this.selection)) this.selection = null;
    this.selPath = this.selection ? PF.maskOutline(this.selection) : null;
    if (!silent) PF.emit && PF.emit("selection", this);
    PF.requestRender && PF.requestRender();
  }
  selectionBounds() { return this.selection ? PF.maskBounds(this.selection) : { x: 0, y: 0, w: this.w, h: this.h }; }
}
PF.Doc = Doc;

// ------------------------------------------------------------------ máscaras
PF.mask = (w, h, draw) => { const c = PF.canvas(w, h), g = PF.g(c); g.fillStyle = "#fff"; g.strokeStyle = "#fff"; draw(g); return c; };
PF.maskEmpty = (m) => { const b = PF.maskBounds(m); return b.w <= 0 || b.h <= 0; };
PF.maskBounds = (m) => {
  const d = PF.pixels(m).data, w = m.width, h = m.height;
  let x0 = w, y0 = h, x1 = -1, y1 = -1;
  for (let y = 0; y < h; y++) {
    const row = y * w * 4;
    for (let x = 0; x < w; x++) if (d[row + x * 4 + 3] > 127) { if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; y1 = y; }
  }
  return x1 < 0 ? { x: 0, y: 0, w: 0, h: 0 } : { x: x0, y: y0, w: x1 - x0 + 1, h: y1 - y0 + 1 };
};
// contorno da seleção em coordenadas da imagem: bordas entre pixels dentro e fora, juntando trechos em linha reta
PF.maskOutline = (m) => {
  const w = m.width, h = m.height, d = PF.pixels(m).data;
  const inside = new Uint8Array(w * h);
  for (let i = 0; i < w * h; i++) inside[i] = d[i * 4 + 3] > 127 ? 1 : 0;
  const p = new Path2D();
  let n = 0;
  for (let y = 0; y <= h; y++) { // bordas horizontais
    let start = -1;
    for (let x = 0; x <= w; x++) {
      const a = y > 0 && x < w ? inside[(y - 1) * w + x] : 0, b = y < h && x < w ? inside[y * w + x] : 0;
      if (a !== b && x < w) { if (start < 0) start = x; }
      else if (start >= 0) { p.moveTo(start, y); p.lineTo(x, y); start = -1; n++; }
    }
  }
  for (let x = 0; x <= w; x++) { // bordas verticais
    let start = -1;
    for (let y = 0; y <= h; y++) {
      const a = x > 0 && y < h ? inside[y * w + x - 1] : 0, b = x < w && y < h ? inside[y * w + x] : 0;
      if (a !== b && y < h) { if (start < 0) start = y; }
      else if (start >= 0) { p.moveTo(x, start); p.lineTo(x, y); start = -1; n++; }
    }
  }
  p.segments = n;
  return p;
};
// aplica "resultado" à camada só dentro da seleção (com bordas suaves); devolve o canvas novo
PF.withinSelection = (doc, base, result) => {
  if (!doc.selection) return result;
  const out = PF.clone(base), g = PF.g(out);
  g.globalCompositeOperation = "destination-out"; g.drawImage(doc.selection, 0, 0);
  const t = PF.clone(result), tg = PF.g(t);
  tg.globalCompositeOperation = "destination-in"; tg.drawImage(doc.selection, 0, 0);
  g.globalCompositeOperation = "source-over"; g.drawImage(t, 0, 0);
  return out;
};

// ------------------------------------------------------------------ cores
PF.hex = (c) => {
  if (/^#[0-9a-f]{6}$/i.test(c)) return c.toLowerCase();
  if (/^#[0-9a-f]{3}$/i.test(c)) return "#" + c.slice(1).split("").map((x) => x + x).join("").toLowerCase();
  const g = PF.g(PF.canvas(1, 1)); g.fillStyle = c || "#000"; return g.fillStyle.startsWith("#") ? g.fillStyle : "#000000";
};
PF.rgb = (hex) => { const h = PF.hex(hex); return [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)]; };
PF.toHex = (r, g, b) => "#" + [r, g, b].map((v) => clamp(Math.round(v), 0, 255).toString(16).padStart(2, "0")).join("");

// ------------------------------------------------------------------ eventos internos
const _ev = new Map();
PF.on = (name, fn) => { if (!_ev.has(name)) _ev.set(name, []); _ev.get(name).push(fn); };
PF.emit = (name, data) => { for (const fn of _ev.get(name) || []) { try { fn(data); } catch (e) { console.error(e); } } };

// ------------------------------------------------------------------ estado do app
PF.state = {
  docs: [], doc: null,
  tool: "brush",
  fg: "#000000", bg: "#ffffff",
  brush: { size: 24, hardness: 80, opacity: 100 },
  eraser: { size: 40, hardness: 60, opacity: 100 },
  clone: { size: 40, hardness: 60, opacity: 100 },
  select: { mode: "replace", feather: 0 },
  wand: { tolerance: 32, contiguous: true, sample: "layer" },
  fill: { tolerance: 32, contiguous: true, opacity: 100 },
  gradient: { type: "linear", toTransparent: false, opacity: 100 },
  shape: { kind: "rect", fill: true, stroke: false, strokeWidth: 4, radius: 0 },
  text: { font: "Segoe UI", size: 64, bold: false, italic: false, align: "left", outline: false, shadow: false },
  crop: { ratio: "free" },
};
