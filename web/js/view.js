// Piphin Foto · área de desenho: zoom, deslocamento, composição na tela, contorno da seleção e eventos do mouse.
"use strict";
PF.view = (() => {
  const el = $("#view"), stage = $("#stage"), g = el.getContext("2d");
  let raf = 0, dpr = 1, W = 0, H = 0, ants = 0, antsTimer = 0;
  let pan = null, spaceDown = false, drag = false, lastPointer = null;
  const mouse = { x: 0, y: 0, sx: 0, sy: 0, inside: false };

  // quadriculado do fundo transparente
  const checker = (() => {
    const c = PF.canvas(16, 16), cg = PF.g(c);
    cg.fillStyle = "#2a2733"; cg.fillRect(0, 0, 16, 16);
    cg.fillStyle = "#353140"; cg.fillRect(0, 0, 8, 8); cg.fillRect(8, 8, 8, 8);
    return g.createPattern(c, "repeat");
  })();

  const doc = () => PF.state.doc;
  const toDoc = (sx, sy) => { const v = doc().view; return { x: (sx - v.x) / v.zoom, y: (sy - v.y) / v.zoom }; };
  const toScreen = (x, y) => { const v = doc().view; return { x: x * v.zoom + v.x, y: y * v.zoom + v.y }; };

  function resize() {
    dpr = window.devicePixelRatio || 1;
    const r = stage.getBoundingClientRect();
    W = Math.max(1, r.width); H = Math.max(1, r.height);
    el.width = Math.round(W * dpr); el.height = Math.round(H * dpr);
    el.style.width = W + "px"; el.style.height = H + "px";
    const d = doc();
    if (d && d.view.fitted) fit(d);
    request();
  }

  function fit(d = doc()) {
    if (!d) return;
    // a área ainda não tem tamanho (tela escondida): ajusta quando ela aparecer (resize)
    if (W < 80 || H < 80) { d.view.fitted = true; return; }
    const z = Math.min((W - 48) / d.w, (H - 48) / d.h, 1);
    d.view.zoom = Math.max(0.01, z);
    d.view.x = Math.round((W - d.w * d.view.zoom) / 2);
    d.view.y = Math.round((H - d.h * d.view.zoom) / 2);
    d.view.fitted = true;
    PF.emit("zoom", d);
    request();
  }
  function zoomTo(z, sx = W / 2, sy = H / 2) {
    const d = doc(); if (!d) return;
    const p = toDoc(sx, sy);
    d.view.zoom = clamp(z, 0.01, 64);
    d.view.x = Math.round(sx - p.x * d.view.zoom);
    d.view.y = Math.round(sy - p.y * d.view.zoom);
    d.view.fitted = false;
    PF.emit("zoom", d);
    request();
  }
  const STEPS = [0.05, 0.1, 0.167, 0.25, 0.333, 0.5, 0.667, 1, 1.5, 2, 3, 4, 6, 8, 12, 16, 24, 32];
  const zoomStep = (dir) => {
    const z = doc().view.zoom;
    const next = dir > 0 ? STEPS.find((s) => s > z * 1.01) || 32 : [...STEPS].reverse().find((s) => s < z * 0.99) || 0.05;
    zoomTo(next);
  };

  function request() { if (!raf) raf = requestAnimationFrame(render); }
  PF.requestRender = request;

  function render() {
    raf = 0;
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    g.fillStyle = "#0b0a11";
    g.fillRect(0, 0, W, H);
    const d = doc();
    if (!d) return;
    const v = d.view, rw = d.w * v.zoom, rh = d.h * v.zoom;
    g.save();
    g.shadowColor = "rgba(0,0,0,.6)"; g.shadowBlur = 24;
    g.fillStyle = checker;
    g.fillRect(v.x, v.y, rw, rh);
    g.restore();
    g.imageSmoothingEnabled = v.zoom < 1;
    g.imageSmoothingQuality = "high";
    g.drawImage(d.composite(), v.x, v.y, rw, rh);
    // grade de pixels em zoom alto
    if (v.zoom >= 12 && PF.state.pixelGrid !== false) {
      g.beginPath();
      const x0 = Math.max(0, Math.floor(-v.x / v.zoom)), x1 = Math.min(d.w, Math.ceil((W - v.x) / v.zoom));
      const y0 = Math.max(0, Math.floor(-v.y / v.zoom)), y1 = Math.min(d.h, Math.ceil((H - v.y) / v.zoom));
      for (let x = x0; x <= x1; x++) { const sx = Math.round(v.x + x * v.zoom) + 0.5; g.moveTo(sx, v.y + y0 * v.zoom); g.lineTo(sx, v.y + y1 * v.zoom); }
      for (let y = y0; y <= y1; y++) { const sy = Math.round(v.y + y * v.zoom) + 0.5; g.moveTo(v.x + x0 * v.zoom, sy); g.lineTo(v.x + x1 * v.zoom, sy); }
      g.strokeStyle = "rgba(255,255,255,.08)"; g.lineWidth = 1; g.stroke();
    }
    // contorno da seleção ("formigas")
    if (d.selPath) {
      g.save();
      g.translate(v.x, v.y); g.scale(v.zoom, v.zoom);
      g.lineWidth = 1 / v.zoom;
      g.strokeStyle = "#000"; g.setLineDash([]); g.stroke(d.selPath);
      g.strokeStyle = "#fff"; g.setLineDash([4 / v.zoom, 4 / v.zoom]); g.lineDashOffset = -ants / v.zoom; g.stroke(d.selPath);
      g.restore();
      if (!antsTimer) antsTimer = setTimeout(() => { antsTimer = 0; ants = (ants + 1) % 8; request(); }, 120);
    }
    const tool = PF.tools[PF.state.tool];
    if (tool && tool.overlay) { g.save(); tool.overlay(g, { toScreen, zoom: v.zoom, mouse, drag }); g.restore(); }
  }

  // ---------------------------------------------------------------- mouse
  const activeTool = () => (spaceDown || PF.state.tool === "hand" ? PF.tools.hand : PF.tools[PF.state.tool]);
  function pos(e) {
    const r = el.getBoundingClientRect();
    const sx = e.clientX - r.left, sy = e.clientY - r.top, p = toDoc(sx, sy);
    return { x: p.x, y: p.y, sx, sy, pressure: e.pressure || 0.5, shift: e.shiftKey, alt: e.altKey, ctrl: e.ctrlKey, button: e.button };
  }
  el.addEventListener("pointerdown", (e) => {
    if (!doc()) return;
    el.setPointerCapture(e.pointerId);
    const p = pos(e);
    if (e.button === 1 || spaceDown || PF.state.tool === "hand") { pan = { sx: p.sx, sy: p.sy, x: doc().view.x, y: doc().view.y }; el.style.cursor = "grabbing"; return; }
    if (e.button !== 0) return;
    const t = PF.tools[PF.state.tool];
    drag = true; lastPointer = p;
    if (t && t.down) t.down(p, e);
    request();
  });
  el.addEventListener("pointermove", (e) => {
    if (!doc()) return;
    const p = pos(e);
    Object.assign(mouse, { x: p.x, y: p.y, sx: p.sx, sy: p.sy, inside: true });
    PF.emit("pointer", p);
    if (pan) {
      const v = doc().view;
      v.x = pan.x + (p.sx - pan.sx); v.y = pan.y + (p.sy - pan.sy); v.fitted = false;
      return request();
    }
    const t = PF.tools[PF.state.tool];
    if (drag && t && t.move) {
      // movimentos intermediários (traço suave mesmo com o mouse rápido)
      const list = e.getCoalescedEvents ? e.getCoalescedEvents() : [e];
      for (const ce of list.length ? list : [e]) t.move(pos(ce), ce);
    } else if (t && t.hover) t.hover(p, e);
    request();
  });
  const up = (e) => {
    if (pan) { pan = null; updateCursor(); return; }
    if (!drag) return;
    drag = false;
    const t = PF.tools[PF.state.tool];
    if (t && t.up) t.up(pos(e), e);
    request();
  };
  el.addEventListener("pointerup", up);
  el.addEventListener("pointercancel", up);
  el.addEventListener("pointerleave", () => { mouse.inside = false; request(); });
  el.addEventListener("dblclick", (e) => { const t = PF.tools[PF.state.tool]; if (t && t.dblclick && doc()) t.dblclick(pos(e), e); });
  el.addEventListener("wheel", (e) => {
    if (!doc()) return;
    e.preventDefault();
    const p = pos(e), v = doc().view;
    if (e.shiftKey) { v.x -= e.deltaY; v.fitted = false; return request(); }
    zoomTo(v.zoom * Math.exp(-e.deltaY * 0.0015), p.sx, p.sy);
  }, { passive: false });
  el.addEventListener("contextmenu", (e) => e.preventDefault());

  function updateCursor() {
    const t = activeTool();
    el.style.cursor = pan ? "grabbing" : (t && (typeof t.cursor === "function" ? t.cursor() : t.cursor)) || "default";
  }
  window.addEventListener("keydown", (e) => {
    if (e.code === "Space" && !e.repeat && !/INPUT|TEXTAREA|SELECT/.test(document.activeElement.tagName) && !document.activeElement.isContentEditable) {
      spaceDown = true; updateCursor(); e.preventDefault();
    }
  });
  window.addEventListener("keyup", (e) => { if (e.code === "Space") { spaceDown = false; updateCursor(); } });
  window.addEventListener("blur", () => { spaceDown = false; updateCursor(); });

  new ResizeObserver(resize).observe(stage);
  return { el, fit, zoomTo, zoomStep, request, toDoc, toScreen, mouse, updateCursor, size: () => ({ W, H }), isDragging: () => drag };
})();
