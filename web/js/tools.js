// Piphin Foto · ferramentas. Cada uma: { name, icon, key, cursor, options(), down/move/up/hover(p), overlay(g, v), key(e) }.
// Pinturas usam doc.preview (a camada com o traço em andamento aparece só na tela) e viram um passo do
// histórico ao soltar o mouse.
"use strict";
PF.tools = {};
(() => {
  const S = PF.state;
  const doc = () => S.doc;
  const toast = (t, k) => PF.toast && PF.toast(t, k);
  const dist = (a, b) => Math.hypot(b.x - a.x, b.y - a.y);
  let schedule = 0;
  const later = (fn) => { if (!schedule) schedule = requestAnimationFrame(() => { schedule = 0; fn(); }); };

  // camada pronta para pintar? (texto vira pixels, oculta/bloqueada avisa)
  function paintable(d, { allowText = false } = {}) {
    const l = d.active;
    if (!l) return null;
    if (!l.visible) { toast("A camada ativa está oculta", "warn"); return null; }
    if (l.locked) { toast("A camada ativa está bloqueada", "warn"); return null; }
    if (l.text && !allowText) { toast("Camada de texto convertida em pixels para pintar", "info"); }
    return l;
  }

  // ---------------------------------------------------------------- pincel (ponta redonda com dureza)
  const tips = new Map();
  function tip(size, hardness, color) {
    const key = `${Math.round(size * 2)}|${hardness}|${color}`;
    if (tips.has(key)) return tips.get(key);
    const r = Math.max(0.5, size / 2), d = Math.ceil(r * 2) + 2, c = PF.canvas(d, d), g = PF.g(c);
    if (hardness >= 99) { g.fillStyle = color; g.beginPath(); g.arc(d / 2, d / 2, r, 0, Math.PI * 2); g.fill(); }
    else {
      const [R, G, B] = PF.rgb(color);
      const grad = g.createRadialGradient(d / 2, d / 2, r * (hardness / 100), d / 2, d / 2, r);
      grad.addColorStop(0, `rgba(${R},${G},${B},1)`); grad.addColorStop(1, `rgba(${R},${G},${B},0)`);
      g.fillStyle = grad; g.fillRect(0, 0, d, d);
    }
    if (tips.size > 40) tips.clear();
    tips.set(key, c);
    return c;
  }

  function makePainter({ group, erase = false, label, cloneMode = false }) {
    let base = null, stroke = null, sg = null, last = null, lastEnd = null, prev = null, pg = null, masked = null, layer = null;
    let source = null, offset = null; // carimbo
    const opt = () => S[group];
    const sizeAt = (p, e) => { const s = opt().size; return e && e.pointerType === "pen" ? Math.max(1, s * (0.25 + 0.75 * (p.pressure || 0.5))) : s; };

    function stamp(p, size) {
      if (cloneMode) {
        const r = size / 2, d2 = Math.ceil(size) + 2, t = PF.canvas(d2, d2), tg = PF.g(t);
        tg.drawImage(base, -(p.x - offset.x - d2 / 2), -(p.y - offset.y - d2 / 2));
        tg.globalCompositeOperation = "destination-in";
        tg.drawImage(tip(size, opt().hardness, "#000"), 0, 0, d2, d2);
        sg.drawImage(t, p.x - d2 / 2, p.y - d2 / 2);
        return;
      }
      const t = tip(size, opt().hardness, erase ? "#000000" : S.fg);
      sg.drawImage(t, p.x - t.width / 2, p.y - t.height / 2);
    }
    function line(a, b, e) {
      const size = sizeAt(b, e), step = Math.max(0.5, size * 0.12), n = Math.max(1, Math.ceil(dist(a, b) / step));
      for (let i = 1; i <= n; i++) stamp({ x: a.x + ((b.x - a.x) * i) / n, y: a.y + ((b.y - a.y) * i) / n }, size);
    }
    function updatePreview() {
      const d = doc();
      if (!d || !base) return;
      pg.globalCompositeOperation = "copy"; pg.globalAlpha = 1; pg.drawImage(base, 0, 0);
      let s = stroke;
      if (d.selection) { const mg = PF.g(masked); mg.globalCompositeOperation = "copy"; mg.drawImage(stroke, 0, 0); mg.globalCompositeOperation = "destination-in"; mg.drawImage(d.selection, 0, 0); s = masked; }
      pg.globalAlpha = opt().opacity / 100;
      pg.globalCompositeOperation = erase ? "destination-out" : "source-over";
      pg.drawImage(s, 0, 0);
      pg.globalAlpha = 1; pg.globalCompositeOperation = "source-over";
      d.preview = { id: layer.id, canvas: prev };
      d.changed();
    }
    return {
      cursor: "none",
      down(p, e) {
        const d = doc();
        if (cloneMode && p.alt) { source = { x: p.x, y: p.y }; offset = null; toast("Origem do carimbo definida", "ok"); return; }
        if (cloneMode && !source) { toast("Segure Alt e clique para escolher de onde copiar", "info"); return; }
        layer = paintable(d);
        if (!layer) return;
        base = layer.canvas;
        stroke = PF.canvas(d.w, d.h); sg = PF.g(stroke);
        prev = PF.canvas(d.w, d.h); pg = PF.g(prev);
        masked = d.selection ? PF.canvas(d.w, d.h) : null;
        if (cloneMode) offset = offset && S.cloneAligned !== false ? offset : { x: p.x - source.x, y: p.y - source.y };
        // Shift + clique: linha reta desde o fim do traço anterior
        if (p.shift && lastEnd) line(lastEnd, p, e); else stamp(p, sizeAt(p, e));
        last = p;
        updatePreview();
      },
      move(p, e) {
        if (!stroke) return;
        line(last, p, e);
        last = p;
        later(updatePreview);
      },
      up() {
        const d = doc();
        if (!stroke) return;
        updatePreview();
        d.beginEdit(label, []);
        PF.ops.rasterize(d, layer);
        layer.canvas = prev;
        d.preview = null;
        lastEnd = last;
        base = stroke = sg = prev = pg = masked = null;
        d.changed();
        PF.emit("layers", d);
      },
      overlay(g, v) {
        if (!v.mouse.inside) return;
        const r = (opt().size * v.zoom) / 2;
        g.beginPath(); g.arc(v.mouse.sx, v.mouse.sy, Math.max(1.5, r), 0, Math.PI * 2);
        g.lineWidth = 1; g.strokeStyle = "rgba(0,0,0,.7)"; g.stroke();
        g.beginPath(); g.arc(v.mouse.sx, v.mouse.sy, Math.max(1.5, r) + 1, 0, Math.PI * 2); g.strokeStyle = "rgba(255,255,255,.8)"; g.stroke();
        if (r < 4) { g.fillStyle = "#fff"; g.fillRect(v.mouse.sx - 0.5, v.mouse.sy - 6, 1, 12); g.fillRect(v.mouse.sx - 6, v.mouse.sy - 0.5, 12, 1); }
        if (cloneMode && source) {
          const o = offset && v.drag ? { x: v.mouse.x - offset.x, y: v.mouse.y - offset.y } : source, s = v.toScreen(o.x, o.y);
          g.strokeStyle = "#fff"; g.lineWidth = 1.5;
          g.beginPath(); g.moveTo(s.x - 7, s.y); g.lineTo(s.x + 7, s.y); g.moveTo(s.x, s.y - 7); g.lineTo(s.x, s.y + 7); g.stroke();
        }
      },
      options: () => sizeOptions(group) + (cloneMode ? `<label class="opt"><input type="checkbox" data-opt="cloneAligned" ${S.cloneAligned !== false ? "checked" : ""}> Alinhado</label><span class="opt-hint">Alt + clique escolhe a origem</span>` : ""),
    };
  }
  const sizeOptions = (group) => `
    <label class="opt">Tamanho <input type="range" min="1" max="500" data-opt="${group}.size" value="${S[group].size}"><input type="number" min="1" max="2000" data-opt="${group}.size" value="${S[group].size}" class="num-in"> px</label>
    <label class="opt">Dureza <input type="range" min="0" max="100" data-opt="${group}.hardness" value="${S[group].hardness}"><span class="val" data-show="${group}.hardness">${S[group].hardness}%</span></label>
    <label class="opt">Opacidade <input type="range" min="1" max="100" data-opt="${group}.opacity" value="${S[group].opacity}"><span class="val" data-show="${group}.opacity">${S[group].opacity}%</span></label>`;

  PF.tools.brush = { name: "Pincel", icon: "brush", key: "B", ...makePainter({ group: "brush", label: "Pincel" }) };
  PF.tools.eraser = { name: "Borracha", icon: "eraser", key: "E", ...makePainter({ group: "eraser", erase: true, label: "Borracha" }) };
  PF.tools.clone = { name: "Carimbo", icon: "stamp", key: "S", ...makePainter({ group: "clone", label: "Carimbo", cloneMode: true }) };

  // ---------------------------------------------------------------- seleções
  const selModeOptions = () => `
    <div class="seg mini" title="Modo da seleção (Shift soma, Alt subtrai)">
      ${[["replace", "square-dashed", "Nova"], ["add", "plus", "Somar"], ["sub", "minus", "Subtrair"], ["intersect", "merge", "Interseção"]]
        .map(([m, ic, t]) => `<button class="${S.select.mode === m ? "on" : ""}" data-set="select.mode" data-val="${m}" title="${t}"><i class="i i-${ic}"></i></button>`).join("")}
    </div>
    <label class="opt">Suavizar <input type="number" min="0" max="200" data-opt="select.feather" value="${S.select.feather}" class="num-in"> px</label>`;
  const modeFor = (p) => (p.shift && p.alt ? "intersect" : p.shift ? "add" : p.alt ? "sub" : S.select.mode);
  function commitMask(label, mask, mode) {
    const d = doc();
    d.beginEdit(label, []);
    if (S.select.feather > 0 && mask) mask = PF.fx.css(mask, `blur(${S.select.feather}px)`);
    d.setSelection(mask, mode);
  }

  function marquee(kind) {
    let a = null, b = null, mode = "replace";
    const rect = () => {
      let x0 = a.x, y0 = a.y, w = b.x - a.x, h = b.y - a.y;
      if (b.shift) { const s = Math.max(Math.abs(w), Math.abs(h)); w = Math.sign(w || 1) * s; h = Math.sign(h || 1) * s; }
      if (b.alt && b.ctrl) { x0 -= w; y0 -= h; w *= 2; h *= 2; }
      return { x: Math.min(x0, x0 + w), y: Math.min(y0, y0 + h), w: Math.abs(w), h: Math.abs(h) };
    };
    return {
      cursor: "crosshair",
      down(p) { a = { x: Math.round(p.x), y: Math.round(p.y) }; b = { ...p }; mode = modeFor(p); },
      move(p) { if (a) b = { ...p, x: Math.round(p.x), y: Math.round(p.y) }; },
      up() {
        const d = doc(), r = rect();
        a = null;
        if (r.w < 2 || r.h < 2) { if (mode === "replace" && d.selection) PF.ops.deselect(); return; }
        commitMask(kind === "rect" ? "Seleção retangular" : "Seleção elíptica", PF.mask(d.w, d.h, (g) => {
          if (kind === "rect") g.fillRect(r.x, r.y, r.w, r.h);
          else { g.beginPath(); g.ellipse(r.x + r.w / 2, r.y + r.h / 2, r.w / 2, r.h / 2, 0, 0, Math.PI * 2); g.fill(); }
        }), mode);
      },
      overlay(g, v) {
        if (!a) return;
        const r = rect(), s = v.toScreen(r.x, r.y), w = r.w * v.zoom, h = r.h * v.zoom;
        g.setLineDash([4, 4]); g.lineWidth = 1; g.strokeStyle = "#fff";
        g.beginPath();
        if (kind === "rect") g.rect(s.x + 0.5, s.y + 0.5, w, h); else g.ellipse(s.x + w / 2, s.y + h / 2, w / 2, h / 2, 0, 0, Math.PI * 2);
        g.stroke();
        PF.status && PF.status(`${Math.round(r.w)} × ${Math.round(r.h)} px`);
      },
      options: selModeOptions,
    };
  }
  PF.tools.rect = { name: "Seleção retangular", icon: "square-dashed", key: "M", ...marquee("rect") };
  PF.tools.ellipse = { name: "Seleção elíptica", icon: "circle-dashed", key: "M", ...marquee("ellipse") };

  PF.tools.lasso = (() => {
    let pts = null, mode = "replace";
    return {
      name: "Laço", icon: "lasso", key: "L", cursor: "crosshair",
      down(p) { pts = [p]; mode = modeFor(p); },
      move(p) { if (pts && dist(pts[pts.length - 1], p) > 1 / doc().view.zoom) pts.push(p); },
      up() {
        const d = doc(), list = pts;
        pts = null;
        if (!list || list.length < 3) { if (mode === "replace" && d.selection) PF.ops.deselect(); return; }
        commitMask("Laço", PF.mask(d.w, d.h, (g) => { g.beginPath(); list.forEach((q, i) => (i ? g.lineTo(q.x, q.y) : g.moveTo(q.x, q.y))); g.closePath(); g.fill(); }), mode);
      },
      overlay(g, v) {
        if (!pts) return;
        g.beginPath(); pts.forEach((q, i) => { const s = v.toScreen(q.x, q.y); i ? g.lineTo(s.x, s.y) : g.moveTo(s.x, s.y); });
        g.lineWidth = 1; g.strokeStyle = "#fff"; g.setLineDash([4, 4]); g.stroke();
      },
      options: selModeOptions,
    };
  })();

  // ---------------------------------------------------------------- preenchimento por cor (varinha e balde)
  // devolve um Uint8Array (1 = dentro) com os pixels parecidos com o do ponto clicado
  function floodMask(img, w, h, x0, y0, tol, contiguous) {
    const d = img.data, out = new Uint8Array(w * h), i0 = (y0 * w + x0) * 4;
    const r0 = d[i0], g0 = d[i0 + 1], b0 = d[i0 + 2], a0 = d[i0 + 3], t = tol * 4.4; // 0..100 -> distância de cor
    const same = (i) => { const p = i * 4; return Math.abs(d[p] - r0) + Math.abs(d[p + 1] - g0) + Math.abs(d[p + 2] - b0) + Math.abs(d[p + 3] - a0) * 1.2 <= t; };
    if (!contiguous) { for (let i = 0; i < w * h; i++) if (same(i)) out[i] = 1; return out; }
    const stack = [x0, y0];
    while (stack.length) {
      const y = stack.pop(), x = stack.pop();
      let l = x;
      while (l >= 0 && !out[y * w + l] && same(y * w + l)) l--;
      l++;
      let up = false, dn = false;
      for (let r = l; r < w && !out[y * w + r] && same(y * w + r); r++) {
        out[y * w + r] = 1;
        if (y > 0) { const s = !out[(y - 1) * w + r] && same((y - 1) * w + r); if (s && !up) { stack.push(r, y - 1); up = true; } else if (!s) up = false; }
        if (y < h - 1) { const s = !out[(y + 1) * w + r] && same((y + 1) * w + r); if (s && !dn) { stack.push(r, y + 1); dn = true; } else if (!s) dn = false; }
      }
    }
    return out;
  }
  function bitsToMask(bits, w, h) {
    const c = PF.canvas(w, h), g = c.getContext("2d", { willReadFrequently: true }), img = g.createImageData(w, h), a = img.data;
    for (let i = 0; i < bits.length; i++) if (bits[i]) { const p = i * 4; a[p] = a[p + 1] = a[p + 2] = a[p + 3] = 255; }
    g.putImageData(img, 0, 0);
    return c;
  }
  const inside = (d, p) => p.x >= 0 && p.y >= 0 && p.x < d.w && p.y < d.h;

  PF.tools.wand = {
    name: "Varinha mágica", icon: "wand-sparkles", key: "W", cursor: "crosshair",
    down(p) {
      const d = doc();
      if (!inside(d, p)) return;
      const src = S.wand.sample === "all" ? d.composite() : d.active.canvas;
      const bits = floodMask(PF.pixels(src), d.w, d.h, Math.floor(p.x), Math.floor(p.y), S.wand.tolerance, S.wand.contiguous);
      commitMask("Varinha mágica", bitsToMask(bits, d.w, d.h), modeFor(p));
    },
    options: () => selModeOptions() + `
      <label class="opt">Tolerância <input type="range" min="0" max="100" data-opt="wand.tolerance" value="${S.wand.tolerance}"><span class="val" data-show="wand.tolerance">${S.wand.tolerance}</span></label>
      <label class="opt"><input type="checkbox" data-opt="wand.contiguous" ${S.wand.contiguous ? "checked" : ""}> Contíguo</label>
      <label class="opt"><select data-opt="wand.sample"><option value="layer" ${S.wand.sample === "layer" ? "selected" : ""}>Camada ativa</option><option value="all" ${S.wand.sample === "all" ? "selected" : ""}>Todas as camadas</option></select></label>`,
  };

  PF.tools.fill = {
    name: "Balde de tinta", icon: "paint-bucket", key: "G", cursor: "crosshair",
    down(p) {
      const d = doc();
      if (!inside(d, p) || !paintable(d)) return;
      const bits = floodMask(PF.pixels(d.active.canvas), d.w, d.h, Math.floor(p.x), Math.floor(p.y), S.fill.tolerance, S.fill.contiguous);
      const mask = bitsToMask(bits, d.w, d.h);
      PF.ops.applyToLayer("Balde de tinta", (base) => {
        const color = PF.canvas(d.w, d.h), cg = PF.g(color);
        cg.fillStyle = S.fg; cg.fillRect(0, 0, d.w, d.h);
        cg.globalCompositeOperation = "destination-in"; cg.drawImage(mask, 0, 0);
        const c = PF.clone(base), g = PF.g(c);
        g.globalAlpha = S.fill.opacity / 100; g.drawImage(color, 0, 0);
        return c;
      });
    },
    options: () => `
      <label class="opt">Tolerância <input type="range" min="0" max="100" data-opt="fill.tolerance" value="${S.fill.tolerance}"><span class="val" data-show="fill.tolerance">${S.fill.tolerance}</span></label>
      <label class="opt"><input type="checkbox" data-opt="fill.contiguous" ${S.fill.contiguous ? "checked" : ""}> Contíguo</label>
      <label class="opt">Opacidade <input type="range" min="1" max="100" data-opt="fill.opacity" value="${S.fill.opacity}"><span class="val" data-show="fill.opacity">${S.fill.opacity}%</span></label>`,
  };

  // ---------------------------------------------------------------- degradê
  PF.tools.gradient = (() => {
    let a = null, b = null, layer = null, base = null;
    function paint(d) {
      const c = PF.canvas(d.w, d.h), g = PF.g(c), o = S.gradient;
      const grad = o.type === "radial" ? g.createRadialGradient(a.x, a.y, 0, a.x, a.y, Math.max(1, dist(a, b))) : g.createLinearGradient(a.x, a.y, b.x, b.y);
      const [r2, g2, b2] = PF.rgb(o.toTransparent ? S.fg : S.bg);
      grad.addColorStop(0, S.fg); grad.addColorStop(1, `rgba(${r2},${g2},${b2},${o.toTransparent ? 0 : 1})`);
      g.fillStyle = grad; g.fillRect(0, 0, d.w, d.h);
      const out = PF.clone(base), og = PF.g(out);
      og.globalAlpha = o.opacity / 100; og.drawImage(PF.withinSelection(d, PF.canvas(d.w, d.h), c), 0, 0);
      return out;
    }
    return {
      name: "Degradê", icon: "blend", key: "G", cursor: "crosshair",
      down(p) { const d = doc(); layer = paintable(d); if (!layer) return; base = layer.canvas; a = p; b = p; },
      move(p) {
        if (!a) return;
        b = p;
        if (p.shift) { const ang = Math.round(Math.atan2(p.y - a.y, p.x - a.x) / (Math.PI / 4)) * (Math.PI / 4), r = dist(a, p); b = { x: a.x + Math.cos(ang) * r, y: a.y + Math.sin(ang) * r }; }
        later(() => { const d = doc(); if (a) { d.preview = { id: layer.id, canvas: paint(d) }; d.changed(); } });
      },
      up() {
        const d = doc();
        if (!a) return;
        if (dist(a, b) < 2) { a = null; d.preview = null; d.changed(); return; }
        const out = paint(d);
        d.beginEdit("Degradê", []);
        PF.ops.rasterize(d, layer);
        layer.canvas = out; d.preview = null; a = null;
        d.changed(); PF.emit("layers", d);
      },
      overlay(g, v) {
        if (!a) return;
        const s = v.toScreen(a.x, a.y), e = v.toScreen(b.x, b.y);
        g.lineWidth = 2; g.strokeStyle = "rgba(0,0,0,.6)"; g.beginPath(); g.moveTo(s.x, s.y); g.lineTo(e.x, e.y); g.stroke();
        g.lineWidth = 1; g.strokeStyle = "#fff"; g.stroke();
        for (const q of [s, e]) { g.beginPath(); g.arc(q.x, q.y, 4, 0, Math.PI * 2); g.fillStyle = "#fff"; g.fill(); g.stroke(); }
      },
      options: () => `
        <div class="seg mini">${[["linear", "Linear"], ["radial", "Radial"]].map(([k, t]) => `<button class="${S.gradient.type === k ? "on" : ""}" data-set="gradient.type" data-val="${k}">${t}</button>`).join("")}</div>
        <label class="opt"><input type="checkbox" data-opt="gradient.toTransparent" ${S.gradient.toTransparent ? "checked" : ""}> Até transparente</label>
        <label class="opt">Opacidade <input type="range" min="1" max="100" data-opt="gradient.opacity" value="${S.gradient.opacity}"><span class="val" data-show="gradient.opacity">${S.gradient.opacity}%</span></label>`,
    };
  })();

  // ---------------------------------------------------------------- conta-gotas
  PF.tools.picker = {
    name: "Conta-gotas", icon: "pipette", key: "I", cursor: "crosshair",
    pick(p) {
      const d = doc();
      if (!inside(d, p)) return;
      const px = d.composite().getContext("2d", { willReadFrequently: true }).getImageData(Math.floor(p.x), Math.floor(p.y), 1, 1).data;
      const hex = PF.toHex(px[0], px[1], px[2]);
      if (p.alt) S.bg = hex; else S.fg = hex;
      PF.emit("colors");
    },
    down(p) { this.pick(p); },
    move(p) { this.pick(p); },
    options: () => `<span class="opt-hint">Clique para escolher a cor principal · Alt + clique para a secundária</span>`,
  };

  // ---------------------------------------------------------------- mover
  PF.tools.move = (() => {
    let start = null, layer = null, base = null, float = null, hole = null, sel = null, moved = { x: 0, y: 0 }, text0 = null;
    function build(d) {
      const c = PF.canvas(d.w, d.h), g = PF.g(c);
      if (float) { g.drawImage(hole, 0, 0); g.drawImage(float, moved.x, moved.y); }
      else g.drawImage(base, moved.x, moved.y);
      return c;
    }
    function nudge(dx, dy) {
      const d = doc(), l = d.active;
      if (!l || l.locked) return;
      if (l.text) { d.beginEdit("Mover", []); l.text.x += dx; l.text.y += dy; PF.renderText(l, d.w, d.h); d.changed(); return; }
      start = { x: 0, y: 0 }; layer = l; base = l.canvas; prep(d); moved = { x: dx, y: dy }; finish(d);
    }
    function prep(d) {
      float = hole = sel = null;
      if (d.selection && !layer.text) {
        sel = d.selection;
        float = PF.clone(base); const fg = PF.g(float); fg.globalCompositeOperation = "destination-in"; fg.drawImage(sel, 0, 0);
        hole = PF.clone(base); const hg = PF.g(hole); hg.globalCompositeOperation = "destination-out"; hg.drawImage(sel, 0, 0);
      }
    }
    function finish(d) {
      if (!moved.x && !moved.y) { d.preview = null; start = null; d.changed(); return; }
      const out = layer.text ? null : build(d);
      d.beginEdit("Mover", []);
      if (layer.text) { layer.text.x = text0.x + moved.x; layer.text.y = text0.y + moved.y; PF.renderText(layer, d.w, d.h); }
      else layer.canvas = out;
      if (sel) { const m = PF.canvas(d.w, d.h); PF.g(m).drawImage(sel, moved.x, moved.y); d.setSelection(m); }
      d.preview = null; start = null;
      d.changed(); PF.emit("layers", d);
    }
    return {
      name: "Mover", icon: "move", key: "V", cursor: "move",
      down(p) {
        const d = doc(); layer = d.active;
        if (!layer || layer.locked) return toast("A camada ativa está bloqueada", "warn");
        start = p; base = layer.canvas; moved = { x: 0, y: 0 }; text0 = layer.text ? { x: layer.text.x, y: layer.text.y } : null;
        prep(d);
      },
      move(p) {
        if (!start) return;
        const d = doc();
        moved = { x: Math.round(p.x - start.x), y: Math.round(p.y - start.y) };
        if (p.shift) { if (Math.abs(moved.x) > Math.abs(moved.y)) moved.y = 0; else moved.x = 0; }
        later(() => {
          if (!start) return;
          if (layer.text) { const t = { ...layer, text: { ...layer.text, x: text0.x + moved.x, y: text0.y + moved.y } }; PF.renderText(t, d.w, d.h); d.preview = { id: layer.id, canvas: t.canvas }; }
          else d.preview = { id: layer.id, canvas: build(d) };
          d.changed();
        });
      },
      up() { if (start) finish(doc()); },
      onKey(e) {
        const k = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] }[e.key];
        if (!k) return false;
        const s = e.shiftKey ? 10 : 1;
        nudge(k[0] * s, k[1] * s);
        return true;
      },
      options: () => `<span class="opt-hint">Arraste a camada (ou a seleção). Setas movem 1 px, Shift + setas 10 px.</span>`,
    };
  })();

  // ---------------------------------------------------------------- recortar
  PF.tools.crop = (() => {
    let r = null, drag = null;
    const RATIOS = { free: null, original: "orig", "1:1": 1, "4:3": 4 / 3, "3:4": 3 / 4, "16:9": 16 / 9, "9:16": 9 / 16, "3:2": 3 / 2, "2:3": 2 / 3 };
    const ratio = () => { const v = RATIOS[S.crop.ratio]; return v === "orig" ? doc().w / doc().h : v; };
    function reset() { const d = doc(); r = d ? { x: 0, y: 0, w: d.w, h: d.h } : null; }
    function handleAt(v, p) {
      const s = v.toScreen(r.x, r.y), w = r.w * v.zoom, h = r.h * v.zoom;
      const hs = [["nw", s.x, s.y], ["n", s.x + w / 2, s.y], ["ne", s.x + w, s.y], ["e", s.x + w, s.y + h / 2], ["se", s.x + w, s.y + h], ["s", s.x + w / 2, s.y + h], ["sw", s.x, s.y + h], ["w", s.x, s.y + h / 2]];
      const hit = hs.find(([, x, y]) => Math.abs(p.sx - x) < 9 && Math.abs(p.sy - y) < 9);
      if (hit) return hit[0];
      if (p.sx > s.x && p.sx < s.x + w && p.sy > s.y && p.sy < s.y + h) return "move";
      return "new";
    }
    function apply() {
      if (!r) return;
      const d = doc(), x = Math.round(r.x), y = Math.round(r.y), w = Math.round(r.w), h = Math.round(r.h);
      if (x === 0 && y === 0 && w === d.w && h === d.h) return;
      PF.ops.crop(x, y, w, h);
      reset();
      toast("Imagem recortada", "ok");
    }
    return {
      name: "Recortar", icon: "crop", key: "C", cursor: "crosshair",
      activate() { reset(); PF.requestRender(); },
      deactivate() { r = null; },
      down(p) {
        if (!r) reset();
        const v = { toScreen: PF.view.toScreen, zoom: doc().view.zoom };
        const h = handleAt(v, p);
        drag = { h, p0: p, r0: { ...r } };
        if (h === "new") { r = { x: p.x, y: p.y, w: 0, h: 0 }; drag.r0 = { ...r }; drag.h = "se"; }
      },
      move(p) {
        if (!drag) return;
        const d = doc(), dx = p.x - drag.p0.x, dy = p.y - drag.p0.y, o = drag.r0, h = drag.h;
        let x = o.x, y = o.y, w = o.w, hh = o.h;
        if (h === "move") { x += dx; y += dy; }
        else {
          if (h.includes("w")) { x = o.x + dx; w = o.w - dx; }
          if (h.includes("e")) w = o.w + dx;
          if (h.includes("n")) { y = o.y + dy; hh = o.h - dy; }
          if (h.includes("s")) hh = o.h + dy;
          const k = ratio();
          if (k) { if (h === "n" || h === "s") w = hh * k; else hh = w / k; if (h.includes("n")) y = o.y + o.h - hh; if (h.includes("w")) x = o.x + o.w - w; }
          if (w < 0) { x += w; w = -w; }
          if (hh < 0) { y += hh; hh = -hh; }
        }
        // o recorte fica sempre dentro da imagem
        if (h === "move") { x = clamp(x, 0, d.w - w); y = clamp(y, 0, d.h - hh); }
        else {
          const x2 = Math.min(d.w, x + w), y2 = Math.min(d.h, y + hh);
          x = Math.max(0, x); y = Math.max(0, y); w = x2 - x; hh = y2 - y;
        }
        r = { x: Math.round(x), y: Math.round(y), w: Math.max(1, Math.round(w)), h: Math.max(1, Math.round(hh)) };
        PF.status && PF.status(`${r.w} × ${r.h} px`);
      },
      up() { drag = null; },
      dblclick() { apply(); },
      onKey(e) { if (e.key === "Enter") { apply(); return true; } if (e.key === "Escape") { reset(); PF.requestRender(); return true; } return false; },
      overlay(g, v) {
        const d = doc();
        if (!r) reset();
        const s = v.toScreen(r.x, r.y), w = r.w * v.zoom, h = r.h * v.zoom, o = v.toScreen(0, 0);
        g.fillStyle = "rgba(0,0,0,.55)";
        g.beginPath(); g.rect(o.x, o.y, d.w * v.zoom, d.h * v.zoom); g.rect(s.x, s.y, w, h); g.fill("evenodd");
        g.strokeStyle = "#fff"; g.lineWidth = 1; g.strokeRect(s.x + 0.5, s.y + 0.5, w, h);
        g.strokeStyle = "rgba(255,255,255,.35)"; g.beginPath();
        for (const k of [1, 2]) { g.moveTo(s.x + (w * k) / 3, s.y); g.lineTo(s.x + (w * k) / 3, s.y + h); g.moveTo(s.x, s.y + (h * k) / 3); g.lineTo(s.x + w, s.y + (h * k) / 3); }
        g.stroke();
        g.fillStyle = "#fff";
        for (const [x, y] of [[0, 0], [0.5, 0], [1, 0], [1, 0.5], [1, 1], [0.5, 1], [0, 1], [0, 0.5]]) g.fillRect(s.x + w * x - 4, s.y + h * y - 4, 8, 8);
      },
      options: () => `
        <label class="opt">Proporção <select data-opt="crop.ratio">${Object.keys(RATIOS).map((k) => `<option value="${k}" ${S.crop.ratio === k ? "selected" : ""}>${k === "free" ? "Livre" : k === "original" ? "Original" : k}</option>`).join("")}</select></label>
        <button class="btn sm primary" data-cmd="crop-apply"><i class="i i-check"></i>Recortar</button>
        <button class="btn sm ghost" data-cmd="crop-reset"><i class="i i-x"></i>Cancelar</button>
        <span class="opt-hint">Enter recorta · Esc cancela</span>`,
      apply, reset: () => { reset(); PF.requestRender(); },
    };
  })();

  // ---------------------------------------------------------------- formas
  PF.tools.shape = (() => {
    let a = null, b = null, layer = null, base = null;
    function draw(g, a, b) {
      const o = S.shape;
      let x = Math.min(a.x, b.x), y = Math.min(a.y, b.y), w = Math.abs(b.x - a.x), h = Math.abs(b.y - a.y);
      if (b.shift && o.kind !== "line") { const s = Math.max(w, h); w = h = s; if (b.x < a.x) x = a.x - s; if (b.y < a.y) y = a.y - s; }
      g.lineWidth = o.strokeWidth; g.lineJoin = "round"; g.lineCap = "round";
      g.fillStyle = S.fg; g.strokeStyle = o.fill ? S.bg : S.fg;
      g.beginPath();
      if (o.kind === "line") { let e = b; if (b.shift) { const ang = Math.round(Math.atan2(b.y - a.y, b.x - a.x) / (Math.PI / 4)) * (Math.PI / 4), r = dist(a, b); e = { x: a.x + Math.cos(ang) * r, y: a.y + Math.sin(ang) * r }; } g.moveTo(a.x, a.y); g.lineTo(e.x, e.y); g.stroke(); return; }
      if (o.kind === "rect") g.roundRect(x, y, w, h, Math.min(o.radius, w / 2, h / 2));
      else if (o.kind === "ellipse") g.ellipse(x + w / 2, y + h / 2, w / 2, h / 2, 0, 0, Math.PI * 2);
      else if (o.kind === "triangle") { g.moveTo(x + w / 2, y); g.lineTo(x + w, y + h); g.lineTo(x, y + h); g.closePath(); }
      else if (o.kind === "star") { for (let i = 0; i < 10; i++) { const ang = -Math.PI / 2 + (i * Math.PI) / 5, rr = i % 2 ? 0.42 : 1; const px = x + w / 2 + Math.cos(ang) * (w / 2) * rr, py = y + h / 2 + Math.sin(ang) * (h / 2) * rr; i ? g.lineTo(px, py) : g.moveTo(px, py); } g.closePath(); }
      if (o.fill) g.fill();
      if (o.stroke || !o.fill) g.stroke();
    }
    function render(d) {
      const c = PF.canvas(d.w, d.h); draw(PF.g(c), a, b);
      const out = PF.clone(base); PF.g(out).drawImage(PF.withinSelection(d, PF.canvas(d.w, d.h), c), 0, 0);
      return out;
    }
    return {
      name: "Formas", icon: "shapes", key: "U", cursor: "crosshair",
      down(p) { const d = doc(); layer = paintable(d); if (!layer) return; base = layer.canvas; a = p; b = p; },
      move(p) { if (!a) return; b = p; later(() => { const d = doc(); if (a) { d.preview = { id: layer.id, canvas: render(d) }; d.changed(); } }); },
      up() {
        const d = doc();
        if (!a) return;
        if (dist(a, b) < 2) { a = null; d.preview = null; d.changed(); return; }
        const out = render(d);
        d.beginEdit("Forma", []);
        PF.ops.rasterize(d, layer);
        layer.canvas = out; d.preview = null; a = null;
        d.changed(); PF.emit("layers", d);
      },
      options: () => `
        <div class="seg mini">${[["rect", "square", "Retângulo"], ["ellipse", "circle", "Elipse"], ["line", "slash", "Linha"], ["triangle", "triangle", "Triângulo"], ["star", "star", "Estrela"]]
          .map(([k, ic, t]) => `<button class="${S.shape.kind === k ? "on" : ""}" data-set="shape.kind" data-val="${k}" title="${t}"><i class="i i-${ic}"></i></button>`).join("")}</div>
        <label class="opt"><input type="checkbox" data-opt="shape.fill" ${S.shape.fill ? "checked" : ""}> Preencher (cor principal)</label>
        <label class="opt"><input type="checkbox" data-opt="shape.stroke" ${S.shape.stroke ? "checked" : ""}> Contorno</label>
        <label class="opt">Espessura <input type="number" min="1" max="500" data-opt="shape.strokeWidth" value="${S.shape.strokeWidth}" class="num-in"></label>
        <label class="opt">Cantos <input type="number" min="0" max="2000" data-opt="shape.radius" value="${S.shape.radius}" class="num-in"></label>`,
    };
  })();

  // ---------------------------------------------------------------- texto (camada editável)
  PF.tools.text = (() => {
    let editing = null; // { layer, ta, isNew }
    const box = $("#textEdit");
    function place() {
      if (!editing) return;
      const d = doc(), t = editing.layer.text, b = PF.textBox(t), s = PF.view.toScreen(b.x, b.y), z = d.view.zoom;
      Object.assign(box.style, { left: s.x + "px", top: s.y + "px", width: Math.max(40, b.w * z + 30) + "px", height: Math.max(20, b.h * z + 6) + "px",
        font: PF.textFont({ ...t, size: t.size * z }), lineHeight: t.size * (t.lineHeight || 1.2) * z + "px", textAlign: t.align });
    }
    function start(layer, isNew) {
      stop();
      const d = doc();
      if (!isNew) d.beginEdit("Editar texto", []);
      editing = { layer, isNew, before: layer.text.content };
      box.hidden = false;
      box.value = layer.text.content;
      place();
      setTimeout(() => { box.focus(); box.select(); }, 0);
      PF.emit("options");
    }
    function stop() {
      if (!editing) return;
      const d = doc(), { layer, isNew, before, styled } = editing;
      editing = null;
      box.hidden = true;
      if (!layer.text.content.trim()) { // texto vazio: some
        if (isNew) { d.undo(); d.future = []; }
        else { const i = d.layers.indexOf(layer); if (i >= 0 && d.layers.length > 1) { d.layers.splice(i, 1); d.activeId = d.layers[Math.max(0, i - 1)].id; } }
      } else {
        layer.name = "T · " + layer.text.content.split("\n")[0].slice(0, 28);
        // abriu para editar e não mudou nada: o passo do histórico sai
        if (!isNew && !styled && before === layer.text.content && d.past.length && d.past[d.past.length - 1].label === "Editar texto") d.past.pop();
      }
      d.changed(); PF.emit("layers", d);
      PF.emit("options");
    }
    box.addEventListener("input", () => {
      if (!editing) return;
      const d = doc();
      editing.layer.text.content = box.value;
      PF.renderText(editing.layer, d.w, d.h);
      d.changed(); place();
    });
    box.addEventListener("keydown", (e) => {
      e.stopPropagation();
      if (e.key === "Escape" || (e.key === "Enter" && e.ctrlKey)) { e.preventDefault(); stop(); }
    });
    PF.on("zoom", place);
    const hitText = (d, p) => [...d.layers].reverse().find((l) => l.text && l.visible && (() => { const b = PF.textBox(l.text); return p.x >= b.x - 4 && p.x <= b.x + b.w + 4 && p.y >= b.y - 4 && p.y <= b.y + b.h + 4; })());
    return {
      name: "Texto", icon: "type", key: "T", cursor: "text",
      down(p) {
        const d = doc();
        if (editing) { stop(); return; }
        const hit = hitText(d, p);
        if (hit) { d.activeId = hit.id; PF.emit("layers", d); return start(hit, false); }
        const o = S.text;
        d.beginEdit("Novo texto", []);
        const l = d.addLayer("T · Texto");
        l.text = { content: "", x: Math.round(p.x), y: Math.round(p.y), font: o.font, size: o.size, color: S.fg, bold: o.bold, italic: o.italic,
          align: o.align, outline: o.outline, outlineColor: S.bg, shadow: o.shadow, lineHeight: 1.2 };
        PF.renderText(l, d.w, d.h);
        PF.emit("layers", d);
        start(l, true);
      },
      deactivate: stop,
      stop,
      isEditing: () => !!editing,
      // mudanças nas opções valem para o texto que está sendo editado (ou para a camada de texto ativa)
      optionChanged(key) {
        const d = doc(), l = editing ? editing.layer : d && d.active && d.active.text ? d.active : null;
        if (!l) return;
        if (!editing) d.beginEdit("Estilo do texto", []); else editing.styled = true;
        const map = { "text.font": "font", "text.size": "size", "text.bold": "bold", "text.italic": "italic", "text.align": "align", "text.outline": "outline", "text.shadow": "shadow" };
        if (map[key]) l.text[map[key]] = S.text[map[key]];
        PF.renderText(l, d.w, d.h); d.changed(); place();
      },
      colorChanged() {
        const d = doc(), l = editing ? editing.layer : d && d.active && d.active.text ? d.active : null;
        if (!l) return;
        if (editing) editing.styled = true;
        l.text.color = S.fg; l.text.outlineColor = S.bg;
        PF.renderText(l, d.w, d.h); d.changed();
      },
      overlay(g, v) {
        const d = doc();
        for (const l of d.layers) {
          if (!l.text || !l.visible) continue;
          const b = PF.textBox(l.text), s = v.toScreen(b.x, b.y);
          g.setLineDash(l === d.active ? [] : [3, 3]); g.lineWidth = 1; g.strokeStyle = l === d.active ? "rgba(251,146,60,.9)" : "rgba(255,255,255,.35)";
          g.strokeRect(s.x - 3.5, s.y - 3.5, b.w * v.zoom + 7, b.h * v.zoom + 7);
        }
      },
      options: () => {
        const fonts = ["Segoe UI", "Segoe UI Black", "Arial", "Arial Black", "Bahnschrift", "Impact", "Georgia", "Times New Roman", "Verdana", "Trebuchet MS", "Tahoma", "Courier New", "Consolas", "Comic Sans MS", "Segoe Print", "Segoe Script", "Gabriola"];
        const o = S.text;
        return `
          <label class="opt"><select data-opt="text.font">${fonts.map((f) => `<option ${o.font === f ? "selected" : ""} style="font-family:'${f}'">${f}</option>`).join("")}</select></label>
          <label class="opt"><input type="number" min="4" max="2000" data-opt="text.size" value="${o.size}" class="num-in"> px</label>
          <button class="btn sm icon ${o.bold ? "on" : ""}" data-toggle="text.bold" title="Negrito"><i class="i i-bold"></i></button>
          <button class="btn sm icon ${o.italic ? "on" : ""}" data-toggle="text.italic" title="Itálico"><i class="i i-italic"></i></button>
          <div class="seg mini">${[["left", "align-left"], ["center", "align-center"], ["right", "align-right"]].map(([k, ic]) => `<button class="${o.align === k ? "on" : ""}" data-set="text.align" data-val="${k}"><i class="i i-${ic}"></i></button>`).join("")}</div>
          <label class="opt"><input type="checkbox" data-opt="text.outline" ${o.outline ? "checked" : ""}> Contorno</label>
          <label class="opt"><input type="checkbox" data-opt="text.shadow" ${o.shadow ? "checked" : ""}> Sombra</label>
          <span class="opt-hint">${editing ? "Ctrl + Enter ou Esc termina" : "Clique para escrever · clique num texto para editar"}</span>`;
      },
    };
  })();

  // ---------------------------------------------------------------- mão e zoom
  PF.tools.hand = { name: "Mão", icon: "hand", key: "H", cursor: "grab", options: () => `<span class="opt-hint">Arraste para mover a imagem · segure Espaço com qualquer ferramenta</span>` };
  PF.tools.zoom = {
    name: "Zoom", icon: "zoom-in", key: "Z", cursor: "zoom-in",
    down(p) { const z = doc().view.zoom; PF.view.zoomTo(p.alt ? z / 1.6 : z * 1.6, p.sx, p.sy); },
    options: () => `<span class="opt-hint">Clique aproxima · Alt + clique afasta · rodinha do mouse também</span>
      <button class="btn sm" data-cmd="zoom-fit">Ajustar à tela</button><button class="btn sm" data-cmd="zoom-100">100%</button>`,
  };

  // ordem da barra de ferramentas (grupos separados por null)
  PF.TOOLBAR = ["move", null, "rect", "ellipse", "lasso", "wand", null, "crop", null, "brush", "eraser", "clone", "fill", "gradient", null, "text", "shape", null, "picker", "hand", "zoom"];
})();
