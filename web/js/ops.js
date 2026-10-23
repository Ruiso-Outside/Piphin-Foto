// Piphin Foto · operações na imagem e nas camadas (usadas pelos menus, atalhos e pela IA).
// Toda operação marca um passo no histórico antes de alterar algo.
"use strict";
PF.ops = (() => {
  const doc = () => PF.state.doc;
  const need = () => { const d = doc(); if (!d) throw new Error("Nenhuma imagem aberta"); return d; };
  const done = (d) => { d.changed(); PF.emit("layers", d); };

  // camada de texto vira pixels antes de pintar ou filtrar
  function rasterize(d, l) {
    if (!l.text) return;
    l.text = null;
    l.name = l.name.replace(/^T · /, "");
  }

  // aplica fn(canvas) -> canvas na camada ativa (só dentro da seleção, se houver)
  function applyToLayer(label, fn) {
    const d = need(), l = d.active;
    if (!l) throw new Error("Nenhuma camada");
    if (!l.visible) throw new Error("A camada ativa está oculta");
    if (l.locked) throw new Error("A camada ativa está bloqueada");
    const base = l.canvas;
    const result = fn(base);
    d.beginEdit(label, []);
    rasterize(d, l);
    l.canvas = PF.withinSelection(d, base, result);
    done(d);
  }

  // ---------------------------------------------------------------- imagem
  function resizeImage(w, h, quality = "high") {
    const d = need();
    w = Math.round(clamp(w, 1, 20000)); h = Math.round(clamp(h, 1, 20000));
    if (w === d.w && h === d.h) return;
    d.beginEdit("Tamanho da imagem", []);
    const sx = w / d.w, sy = h / d.h;
    for (const l of d.layers) {
      if (l.text) { l.text.x *= sx; l.text.y *= sy; l.text.size *= Math.min(sx, sy); }
      const c = PF.canvas(w, h), g = PF.g(c);
      g.imageSmoothingEnabled = quality !== "pixel"; g.imageSmoothingQuality = "high";
      g.drawImage(stepDown(l.canvas, w, h), 0, 0, w, h);
      l.canvas = c;
    }
    d.w = w; d.h = h;
    if (d.selection) d.setSelection(null);
    PF.view.fit(d);
    done(d);
  }
  // reduzir muito de uma vez fica serrilhado: reduz pela metade até chegar perto
  function stepDown(src, w, h) {
    let c = src;
    while (c.width / 2 >= w && c.height / 2 >= h) {
      const n = PF.canvas(c.width / 2, c.height / 2), g = PF.g(n);
      g.imageSmoothingQuality = "high"; g.drawImage(c, 0, 0, n.width, n.height); c = n;
    }
    return c;
  }

  // anchor: [ax, ay] de 0 a 1 (0,0 = canto superior esquerdo; 0.5,0.5 = centro)
  function canvasSize(w, h, anchor = [0.5, 0.5], fill = null) {
    const d = need();
    w = Math.round(clamp(w, 1, 20000)); h = Math.round(clamp(h, 1, 20000));
    const dx = Math.round((w - d.w) * anchor[0]), dy = Math.round((h - d.h) * anchor[1]);
    d.beginEdit("Tamanho da tela", []);
    d.layers.forEach((l, i) => {
      const c = PF.canvas(w, h), g = PF.g(c);
      if (fill && i === 0) { g.fillStyle = fill; g.fillRect(0, 0, w, h); }
      g.drawImage(l.canvas, dx, dy);
      if (l.text) { l.text.x += dx; l.text.y += dy; }
      l.canvas = c;
    });
    d.w = w; d.h = h;
    if (d.selection) d.setSelection(null);
    PF.view.fit(d);
    done(d);
  }

  function crop(x, y, w, h) {
    const d = need();
    x = Math.round(x); y = Math.round(y); w = Math.round(w); h = Math.round(h);
    if (w < 1 || h < 1) throw new Error("Área de recorte vazia");
    d.beginEdit("Recortar", []);
    for (const l of d.layers) {
      const c = PF.canvas(w, h);
      PF.g(c).drawImage(l.canvas, -x, -y);
      if (l.text) { l.text.x -= x; l.text.y -= y; }
      l.canvas = c;
    }
    d.w = w; d.h = h;
    if (d.selection) d.setSelection(null);
    PF.view.fit(d);
    done(d);
  }
  function cropToSelection() {
    const d = need();
    if (!d.selection) throw new Error("Faça uma seleção primeiro");
    const b = d.selectionBounds();
    crop(b.x, b.y, b.w, b.h);
  }
  // recorta as bordas transparentes (ou da cor do canto)
  function trim() {
    const d = need(), c = d.composite(), px = PF.pixels(c).data;
    let x0 = d.w, y0 = d.h, x1 = -1, y1 = -1;
    for (let y = 0; y < d.h; y++) for (let x = 0; x < d.w; x++) if (px[(y * d.w + x) * 4 + 3] > 8) { x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = y; }
    if (x1 < 0) throw new Error("A imagem está vazia");
    crop(x0, y0, x1 - x0 + 1, y1 - y0 + 1);
  }

  // gira 90/180/270 ou espelha a imagem inteira (ou só a camada ativa)
  function rotate(deg, onlyLayer = false) {
    const d = need(), r = ((deg % 360) + 360) % 360;
    if (!r) return;
    const swap = r === 90 || r === 270;
    if (onlyLayer && swap) throw new Error("Girar 90° só a camada mudaria o tamanho; gire a imagem inteira");
    d.beginEdit(onlyLayer ? "Girar camada" : "Girar imagem", []);
    const nw = swap ? d.h : d.w, nh = swap ? d.w : d.h;
    for (const l of onlyLayer ? [d.active] : d.layers) {
      rasterize(d, l);
      const c = PF.canvas(nw, nh), g = PF.g(c);
      g.translate(nw / 2, nh / 2); g.rotate((r * Math.PI) / 180); g.drawImage(l.canvas, -d.w / 2, -d.h / 2);
      l.canvas = c;
    }
    d.w = nw; d.h = nh;
    if (d.selection) d.setSelection(null);
    if (swap) PF.view.fit(d);
    done(d);
  }
  function flip(dir, onlyLayer = false) {
    const d = need();
    d.beginEdit(dir === "h" ? "Espelhar na horizontal" : "Espelhar na vertical", []);
    for (const l of onlyLayer ? [d.active] : d.layers) {
      rasterize(d, l);
      const c = PF.canvas(d.w, d.h), g = PF.g(c);
      if (dir === "h") { g.translate(d.w, 0); g.scale(-1, 1); } else { g.translate(0, d.h); g.scale(1, -1); }
      g.drawImage(l.canvas, 0, 0);
      l.canvas = c;
    }
    done(d);
  }

  // transformação livre simples da camada ativa: escala (%), rotação (graus) e deslocamento, a partir do centro
  function transformLayer({ scale = 100, scaleY = null, angle = 0, dx = 0, dy = 0 }, label = "Transformar camada") {
    const d = need(), l = d.active;
    d.beginEdit(label, []);
    rasterize(d, l);
    const src = l.canvas, c = PF.canvas(d.w, d.h), g = PF.g(c);
    g.imageSmoothingQuality = "high";
    g.translate(d.w / 2 + dx, d.h / 2 + dy); g.rotate((angle * Math.PI) / 180); g.scale(scale / 100, (scaleY ?? scale) / 100);
    g.drawImage(src, -d.w / 2, -d.h / 2);
    l.canvas = c;
    done(d);
  }

  // ---------------------------------------------------------------- camadas
  function newLayer(name) { const d = need(); d.beginEdit("Nova camada", []); d.addLayer(name); done(d); }
  function duplicateLayer() {
    const d = need(), l = d.active;
    d.beginEdit("Duplicar camada", []);
    const n = d.addLayer(l.name + " (cópia)", PF.clone(l.canvas));
    Object.assign(n, { opacity: l.opacity, blend: l.blend, text: l.text ? { ...l.text } : null });
    done(d);
  }
  function deleteLayer(id) {
    const d = need();
    if (d.layers.length <= 1) throw new Error("A imagem precisa de pelo menos uma camada");
    const i = d.layers.findIndex((l) => l.id === (id || d.activeId));
    d.beginEdit("Apagar camada", []);
    d.layers.splice(i, 1);
    d.activeId = d.layers[Math.max(0, i - 1)].id;
    done(d);
  }
  function moveLayer(id, to) {
    const d = need(), i = d.layers.findIndex((l) => l.id === id);
    to = clamp(to, 0, d.layers.length - 1);
    if (i < 0 || i === to) return;
    d.beginEdit("Mover camada", []);
    const [l] = d.layers.splice(i, 1);
    d.layers.splice(to, 0, l);
    done(d);
  }
  function mergeDown() {
    const d = need(), i = d.layers.indexOf(d.active);
    if (i <= 0) throw new Error("Não há camada abaixo para mesclar");
    const top = d.layers[i], below = d.layers[i - 1];
    d.beginEdit("Mesclar para baixo", []);
    const c = PF.clone(below.canvas), g = PF.g(c);
    if (below.opacity < 1 || !below.visible) { // a de baixo leva a opacidade dela para os pixels
      const t = PF.canvas(d.w, d.h), tg = PF.g(t); tg.globalAlpha = below.visible ? below.opacity : 0; tg.drawImage(below.canvas, 0, 0);
      g.clearRect(0, 0, d.w, d.h); g.drawImage(t, 0, 0);
    }
    if (top.visible) { g.globalAlpha = top.opacity; g.globalCompositeOperation = top.blend; g.drawImage(top.canvas, 0, 0); }
    Object.assign(below, { canvas: c, opacity: 1, visible: true, text: null });
    d.layers.splice(i, 1);
    d.activeId = below.id;
    done(d);
  }
  function flatten() {
    const d = need();
    d.beginEdit("Achatar imagem", []);
    const c = d.composite({ fresh: true });
    d.layers = [];
    d.activeId = null;
    d.addLayer("Fundo", c);
    done(d);
  }
  function setLayer(id, patch, label) {
    const d = need(), l = d.layer(id);
    if (!l) return;
    if (label) d.beginEdit(label, []);
    Object.assign(l, patch);
    done(d);
  }

  // ---------------------------------------------------------------- seleção
  function selectAll() { const d = need(); d.beginEdit("Selecionar tudo", []); d.setSelection(PF.mask(d.w, d.h, (g) => g.fillRect(0, 0, d.w, d.h))); }
  function deselect() { const d = need(); if (!d.selection) return; d.beginEdit("Desmarcar", []); d.setSelection(null); }
  function invertSelection() {
    const d = need();
    d.beginEdit("Inverter seleção", []);
    const m = PF.mask(d.w, d.h, (g) => g.fillRect(0, 0, d.w, d.h));
    if (d.selection) { const g = PF.g(m); g.globalCompositeOperation = "destination-out"; g.drawImage(d.selection, 0, 0); }
    d.setSelection(m);
  }
  function featherSelection(px) {
    const d = need();
    if (!d.selection) throw new Error("Faça uma seleção primeiro");
    d.beginEdit("Suavizar seleção", []);
    d.setSelection(PF.fx.css(d.selection, `blur(${px}px)`));
  }
  function growSelection(px) {
    const d = need();
    if (!d.selection) throw new Error("Faça uma seleção primeiro");
    d.beginEdit(px > 0 ? "Expandir seleção" : "Contrair seleção", []);
    // expande/contrai: desfoca e corta no meio-termo
    const b = PF.fx.css(d.selection, `blur(${Math.abs(px) / 2}px)`);
    const m = PF.fx.map(b, () => null), g = m.getContext("2d", { willReadFrequently: true }), img = g.getImageData(0, 0, m.width, m.height), a = img.data;
    const cut = px > 0 ? 20 : 235;
    for (let i = 3; i < a.length; i += 4) { const on = a[i] > cut; a[i - 3] = a[i - 2] = a[i - 1] = 255; a[i] = on ? 255 : 0; }
    g.putImageData(img, 0, 0);
    d.setSelection(m);
  }
  // apaga os pixels selecionados da camada ativa
  function clearSelection() {
    const d = need(), l = d.active;
    if (!d.selection) throw new Error("Faça uma seleção primeiro");
    d.beginEdit("Apagar", []);
    rasterize(d, l);
    const c = PF.clone(l.canvas), g = PF.g(c);
    g.globalCompositeOperation = "destination-out"; g.drawImage(d.selection, 0, 0);
    l.canvas = c;
    done(d);
  }
  function fillSelection(color) {
    applyToLayer("Preencher", (base) => {
      const c = PF.clone(base), g = PF.g(c);
      g.fillStyle = color; g.fillRect(0, 0, c.width, c.height);
      return c;
    });
  }

  // ---------------------------------------------------------------- copiar e colar
  function copyCanvas(merged = false) {
    const d = need(), src = merged ? d.composite({ fresh: true }) : d.active.canvas;
    const b = d.selectionBounds();
    if (b.w < 1) throw new Error("Seleção vazia");
    let piece = src;
    if (d.selection) { piece = PF.clone(src); const g = PF.g(piece); g.globalCompositeOperation = "destination-in"; g.drawImage(d.selection, 0, 0); }
    const out = PF.canvas(b.w, b.h);
    PF.g(out).drawImage(piece, -b.x, -b.y);
    return { canvas: out, x: b.x, y: b.y };
  }
  // ---------------------------------------------------------------- imagem posicionada (mudar tamanho e girar sem perder qualidade)
  // layer.placed = { img, x, y, w, h, angle, canvas }: a camada é a imagem original desenhada nesse retângulo. Vale enquanto
  // placed.canvas === layer.canvas; pintar, filtrar etc. trocam o canvas e a camada volta a ser pixels comuns.
  const placedOf = (l) => (l && !l.text && l.placed && l.placed.canvas === l.canvas ? l.placed : null);
  function renderPlaced(d, p) {
    const c = PF.canvas(d.w, d.h), g = PF.g(c);
    g.imageSmoothingQuality = "high";
    g.translate(p.x + p.w / 2, p.y + p.h / 2); g.rotate((p.angle * Math.PI) / 180);
    g.drawImage(p.img, -p.w / 2, -p.h / 2, p.w, p.h);
    return c;
  }
  // origem para transformar a camada: a imagem posicionada ou, numa camada de pixels, o que estiver visível nela
  const bounds = new WeakMap();
  const boundsOf = (c) => { let b = bounds.get(c); if (!b) { b = PF.maskBounds(c, 0); bounds.set(c, b); } return b; };
  function placeSource(l) {
    const p = placedOf(l);
    if (p) return p;
    const b = boundsOf(l.canvas);
    if (b.w <= 0) return null;
    const img = PF.canvas(b.w, b.h);
    PF.g(img).drawImage(l.canvas, -b.x, -b.y);
    return { img, x: b.x, y: b.y, w: b.w, h: b.h, angle: 0 };
  }
  // caixa da camada para as alças da ferramenta Mover: { x, y, w, h, angle, text? }; null se a camada está vazia
  function layerBox(l) {
    if (!l) return null;
    if (l.text) { const b = PF.textBox(l.text); return { x: b.x, y: b.y, w: b.w, h: b.h, angle: 0, text: true }; }
    const p = placedOf(l);
    if (p) return { x: p.x, y: p.y, w: p.w, h: p.h, angle: p.angle };
    const b = boundsOf(l.canvas);
    return b.w > 0 ? { ...b, angle: 0 } : null;
  }
  // r = { x, y, w, h, angle }; sem label, só devolve o canvas (prévia)
  function placeLayer(l, src, r, label) {
    const d = need();
    const p = { img: src.img, x: r.x, y: r.y, w: Math.max(1, r.w), h: Math.max(1, r.h), angle: ((r.angle % 360) + 540) % 360 - 180 };
    const c = renderPlaced(d, p);
    if (!label) return c;
    d.beginEdit(label, []);
    l.canvas = c; p.canvas = c; l.placed = p;
    done(d);
    return c;
  }

  // cola uma imagem como camada nova: centralizada, com o centro em at = { cx, cy } ou no canto at = { x, y } (mesmo lugar
  // da cópia). Maior que a imagem aberta: diminui para caber (menos no mesmo lugar da cópia).
  function pasteCanvas(img, name = "Colado", at = null) {
    const d = need(), exact = at && at.x != null;
    const k = exact ? 1 : Math.min(1, d.w / img.width, d.h / img.height);
    const w = Math.max(1, Math.round(img.width * k)), h = Math.max(1, Math.round(img.height * k));
    const p = { img, w, h, angle: 0, x: exact ? at.x : Math.round((at ? at.cx : d.w / 2) - w / 2), y: exact ? at.y : Math.round((at ? at.cy : d.h / 2) - h / 2) };
    d.beginEdit("Colar", []);
    const l = d.addLayer(name, renderPlaced(d, p));
    p.canvas = l.canvas; l.placed = p;
    if (d.selection) d.setSelection(null);
    done(d);
    return { layer: l, fitted: k < 1 };
  }

  return { applyToLayer, rasterize, resizeImage, canvasSize, crop, cropToSelection, trim, rotate, flip, transformLayer,
    newLayer, duplicateLayer, deleteLayer, moveLayer, mergeDown, flatten, setLayer,
    selectAll, deselect, invertSelection, featherSelection, growSelection, clearSelection, fillSelection, copyCanvas, pasteCanvas,
    placedOf, placeSource, placeLayer, layerBox };
})();
