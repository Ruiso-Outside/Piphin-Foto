// Piphin Foto · documentos abertos (abas), abrir e salvar arquivos, área de transferência e pedidos da IA.
"use strict";
PF.io = (() => {
  const S = PF.state;
  const call = async (ch, ...a) => { const r = await piphin.invoke(ch, ...a); if (!r.ok) throw new Error(r.error); return r.data; };
  PF.call = call;

  // ---------------------------------------------------------------- abas
  function show(doc) {
    if (PF.tools[S.tool] && PF.tools[S.tool].deactivate) PF.tools[S.tool].deactivate();
    S.doc = doc;
    $("#home").hidden = !!doc;
    if (doc && !doc.view.zoom0) { doc.view.zoom0 = true; PF.view.fit(doc); }
    if (PF.tools[S.tool] && PF.tools[S.tool].activate) PF.tools[S.tool].activate();
    PF.emit("doc", doc);
    PF.requestRender();
  }
  function add(doc) { S.docs.push(doc); show(doc); return doc; }
  async function close(doc = S.doc, force = false) {
    if (!doc) return;
    if (doc.dirty && !force) {
      const r = await PF.confirm(`Fechar "${doc.name}"?`, "As alterações que não foram salvas ou exportadas serão perdidas.", ["Fechar sem salvar", "Cancelar"], true);
      if (r !== 0) return false;
    }
    const i = S.docs.indexOf(doc);
    S.docs.splice(i, 1);
    if (S.doc === doc) show(S.docs[Math.min(i, S.docs.length - 1)] || null);
    else PF.emit("doc", S.doc);
    return true;
  }

  // ---------------------------------------------------------------- abrir
  const loadImg = (src) => new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("Não foi possível ler esta imagem"));
    img.src = src;
  });
  const imgToCanvas = (img) => { const c = PF.canvas(img.naturalWidth || img.width, img.naturalHeight || img.height); PF.g(c).drawImage(img, 0, 0); return c; };

  async function fromImageCanvas(c, name, path) {
    const doc = new PF.Doc({ w: c.width, h: c.height, name, path });
    doc.layers[0].name = "Fundo";
    doc.layers[0].canvas = c;
    doc.changed();
    return add(doc);
  }
  async function fromProject(p, name, path) {
    const doc = new PF.Doc({ w: p.w, h: p.h, name: name.replace(/\.pfoto$/i, ""), path: null });
    doc.projectPath = path;
    doc.layers = [];
    for (const L of p.layers) {
      const c = PF.canvas(p.w, p.h);
      if (L.png) PF.g(c).drawImage(await loadImg(L.png), 0, 0);
      doc.layers.push({ id: PF.uid(), name: L.name, canvas: c, visible: L.visible !== false, opacity: L.opacity ?? 1, blend: L.blend || "source-over",
        locked: !!L.locked, text: L.text || null });
    }
    if (!doc.layers.length) doc.addLayer("Camada 1");
    doc.activeId = doc.layers[clamp(p.active ?? doc.layers.length - 1, 0, doc.layers.length - 1)].id;
    doc.changed();
    return add(doc);
  }
  // resultado do motor (open-dialog / open-path): imagem ou projeto
  async function openLoaded(r) {
    if (!r) return null;
    if (r.kind === "project") return fromProject(r.project, r.name, r.path);
    const img = await loadImg(`data:${r.mime};base64,${r.data}`);
    return fromImageCanvas(imgToCanvas(img), r.name.replace(/\.[^.]+$/, ""), r.path);
  }
  const openDialog = async () => { try { return await openLoaded(await call("open-dialog")); } catch (e) { PF.toast(e.message, "err"); } };
  const openPath = async (p) => { try { return await openLoaded(await call("open-path", p)); } catch (e) { PF.toast(e.message, "err"); } };

  // arquivo arrastado (File): com imagem aberta vira camada; sem imagem, abre
  async function openFile(file, asLayer = !!S.doc) {
    if (/\.pfoto$/i.test(file.name)) return openLoaded({ kind: "project", name: file.name, path: null, project: JSON.parse(await file.text()) });
    if (!/^image\//.test(file.type)) throw new Error("Isso não parece uma imagem: " + file.name);
    const url = URL.createObjectURL(file);
    try {
      const c = imgToCanvas(await loadImg(url)), name = file.name.replace(/\.[^.]+$/, "");
      if (asLayer && S.doc) { PF.ops.pasteCanvas(c, name); return S.doc; }
      return fromImageCanvas(c, name, null);
    } finally { URL.revokeObjectURL(url); }
  }

  function newDoc({ w, h, background = "#ffffff", name }) {
    const n = name || `Sem título ${S.docs.length + 1}`;
    return add(new PF.Doc({ w, h, name: n, background }));
  }

  // ---------------------------------------------------------------- salvar
  function projectJson(doc) {
    return JSON.stringify({ schema: 1, app: "Piphin Foto", w: doc.w, h: doc.h, active: doc.layers.indexOf(doc.active),
      layers: doc.layers.map((l) => ({ name: l.name, visible: l.visible, opacity: l.opacity, blend: l.blend, locked: l.locked, text: l.text, png: l.canvas.toDataURL("image/png") })) });
  }
  async function saveProject(as = false) {
    const doc = S.doc; if (!doc) return;
    const r = await call("save", { text: projectJson(doc), path: as ? null : doc.projectPath, suggested: doc.name + ".pfoto", format: "pfoto" });
    if (!r) return;
    doc.projectPath = r.path; doc.name = r.name.replace(/\.pfoto$/i, ""); doc.dirty = false;
    PF.emit("doc", doc);
    PF.toast("Projeto salvo: " + r.name, "ok");
  }

  const TYPES = { png: "image/png", jpg: "image/jpeg", webp: "image/webp" };
  // imagem final (todas as camadas), opcionalmente redimensionada
  async function encode(doc, format, quality = 92, scale = 100) {
    let c = doc.composite({ fresh: true, background: format === "jpg" ? "#ffffff" : null });
    if (scale !== 100) {
      const s = PF.canvas(Math.max(1, Math.round(doc.w * scale / 100)), Math.max(1, Math.round(doc.h * scale / 100)));
      const g = PF.g(s); g.imageSmoothingQuality = "high"; g.drawImage(c, 0, 0, s.width, s.height); c = s;
    }
    const blob = await new Promise((r) => c.toBlob(r, TYPES[format], clamp(quality, 1, 100) / 100));
    return { bytes: new Uint8Array(await blob.arrayBuffer()), width: c.width, height: c.height };
  }
  async function exportImage({ format = "png", quality = 92, scale = 100 } = {}) {
    const doc = S.doc; if (!doc) return;
    const { bytes } = await encode(doc, format, quality, scale);
    const r = await call("save", { bytes, path: null, suggested: `${doc.name}.${format}`, format });
    if (!r) return;
    doc.dirty = false;
    PF.emit("doc", doc);
    PF.toast("Imagem exportada: " + r.name, "ok", { label: "Mostrar", run: () => call("show-item", r.path) });
  }

  // ---------------------------------------------------------------- área de transferência
  let clip = null; // { canvas, x, y } da última cópia feita aqui (cola no mesmo lugar)
  async function copy({ cut = false, merged = false } = {}) {
    const d = S.doc; if (!d) return;
    clip = PF.ops.copyCanvas(merged);
    if (cut) PF.ops.clearSelection();
    try {
      const blob = await new Promise((r) => clip.canvas.toBlob(r, "image/png"));
      await navigator.clipboard.write([new ClipboardItem({ "image/png": blob })]);
    } catch { /* sem acesso à área de transferência do Windows: a cópia vale só aqui */ }
    PF.toast(cut ? "Recortado" : "Copiado", "ok");
  }
  async function paste({ newDocument = false } = {}) {
    let c = null, at = null, name = "Colado";
    try {
      const r = await call("clipboard");
      if (r && r.image) c = imgToCanvas(await loadImg("data:image/png;base64," + r.image));
    } catch { /* sem imagem */ }
    if (clip && (!c || (c.width === clip.canvas.width && c.height === clip.canvas.height))) { c = clip.canvas; at = { x: clip.x, y: clip.y }; }
    if (!c) return PF.toast("Não há imagem na área de transferência", "warn");
    if (newDocument || !S.doc) return fromImageCanvas(PF.clone(c), name, null);
    PF.ops.pasteCanvas(c, name, at && at.x + c.width <= S.doc.w && at.y + c.height <= S.doc.h ? at : null);
  }

  // ---------------------------------------------------------------- arrastar e soltar
  let dragDepth = 0;
  window.addEventListener("dragenter", (e) => { if ([...(e.dataTransfer.types || [])].includes("Files")) { dragDepth++; $("#dropHint").hidden = false; } });
  window.addEventListener("dragleave", () => { if (--dragDepth <= 0) { dragDepth = 0; $("#dropHint").hidden = true; } });
  window.addEventListener("dragover", (e) => e.preventDefault());
  window.addEventListener("drop", async (e) => {
    e.preventDefault(); dragDepth = 0; $("#dropHint").hidden = true;
    for (const f of e.dataTransfer.files) { try { await openFile(f); } catch (err) { PF.toast(err.message, "err"); } }
  });

  // ---------------------------------------------------------------- pedidos da IA (Piphin LLM, via Hub)
  const POS = { top: [0.5, 0.06, "center"], center: [0.5, 0.45, "center"], bottom: [0.5, 0.86, "center"], "top-left": [0.05, 0.06, "left"],
    "top-right": [0.95, 0.06, "right"], "bottom-left": [0.05, 0.86, "left"], "bottom-right": [0.95, 0.86, "right"] };
  const need = () => { if (!S.doc) throw new Error("Nenhuma imagem aberta no Piphin Foto. Use open_image para abrir uma."); return S.doc; };
  const info = () => {
    const d = S.doc;
    if (!d) return { open: false, note: "Nenhuma imagem aberta. Use open_image." };
    return { open: true, name: d.name, width: d.w, height: d.h, unsaved: d.dirty, active_layer: d.active.name,
      layers: [...d.layers].reverse().map((l) => ({ name: l.name, visible: l.visible, opacity: Math.round(l.opacity * 100), text: l.text ? l.text.content : undefined })),
      selection: d.selection ? d.selectionBounds() : null, other_open_images: S.docs.filter((x) => x !== d).map((x) => x.name) };
  };
  const AI = {
    image_info: () => info(),
    open_image: async ({ file }) => { await openLoaded(file); return info(); },
    adjust_image: (a) => {
      need();
      const v = (k) => clamp(Number(a[k]) || 0, -180, 180);
      if (!["brightness", "contrast", "saturation", "hue", "temperature", "exposure"].some((k) => v(k))) throw new Error("Informe ao menos um ajuste diferente de 0");
      PF.ops.applyToLayer("IA: ajustar cores", (c) => {
        if (v("exposure")) c = PF.fx.exposure(c, { exposure: v("exposure") });
        if (v("brightness") || v("contrast")) c = PF.fx.brightnessContrast(c, { brightness: v("brightness"), contrast: v("contrast") });
        if (v("saturation") || v("hue")) c = PF.fx.hueSaturation(c, { saturation: v("saturation"), hue: v("hue") });
        if (v("temperature")) c = PF.fx.temperature(c, { temperature: v("temperature") });
        return c;
      });
      return { ok: true, applied_to: S.doc.selection ? "seleção" : "camada " + S.doc.active.name };
    },
    apply_filter: ({ filter, amount = 50 }) => {
      need();
      const a = clamp(Number(amount) || 50, 1, 100);
      const run = {
        blur: (c) => PF.fx.blur(c, { radius: a / 5 }), sharpen: (c) => PF.fx.sharpen(c, { amount: a * 1.5 }), noise: (c) => PF.fx.noise(c, { amount: a / 2 }),
        pixelate: (c) => PF.fx.pixelate(c, { size: 2 + a / 2 }), vignette: (c) => PF.fx.vignette(c, { amount: a, size: 50 }), grayscale: PF.fx.grayscale,
        sepia: (c) => PF.fx.sepia(c, { amount: a * 2 > 100 ? 100 : a * 2 }), invert: PF.fx.invert, emboss: (c) => PF.fx.emboss(c, { amount: a }),
        threshold: (c) => PF.fx.threshold(c, { level: Math.round(a * 2.55) }), posterize: (c) => PF.fx.posterize(c, { levels: 2 + Math.round(a / 10) }),
      }[filter];
      if (!run) throw new Error("Filtro desconhecido: " + filter);
      PF.ops.applyToLayer("IA: " + filter, run);
      return { ok: true };
    },
    transform_image: (a) => {
      const d = need();
      if (a.rotate) PF.ops.rotate(Number(a.rotate));
      if (a.flip) PF.ops.flip(a.flip === "vertical" ? "v" : "h");
      let w = Number(a.width) || 0, h = Number(a.height) || 0;
      if (a.percent) { w = d.w * a.percent / 100; h = d.h * a.percent / 100; }
      else if (w && !h) h = (d.h * w) / d.w;
      else if (h && !w) w = (d.w * h) / d.h;
      if (w && h) PF.ops.resizeImage(w, h);
      return info();
    },
    crop_image: (a) => {
      const d = need();
      if (a.aspect) {
        const [x, y] = String(a.aspect).split(/[:x/]/).map(Number);
        if (!x || !y) throw new Error("Proporção inválida: " + a.aspect);
        const k = x / y, w = Math.min(d.w, d.h * k), h = w / k;
        PF.ops.crop((d.w - w) / 2, (d.h - h) / 2, w, h);
      } else {
        const x = clamp(Number(a.x) || 0, 0, d.w - 1), y = clamp(Number(a.y) || 0, 0, d.h - 1);
        PF.ops.crop(x, y, clamp(Number(a.width) || d.w - x, 1, d.w - x), clamp(Number(a.height) || d.h - y, 1, d.h - y));
      }
      return info();
    },
    add_text: (a) => {
      const d = need();
      const [px, py, align] = POS[a.position] || POS.bottom;
      const size = clamp(Number(a.size) || Math.round(d.h * 0.08), 6, 2000);
      d.beginEdit("IA: texto", []);
      const l = d.addLayer("T · " + String(a.text).slice(0, 24));
      l.text = { content: String(a.text), x: Math.round(d.w * px), y: Math.round(d.h * py - (py > 0.5 ? size * 1.2 : 0)), font: a.font || "Segoe UI", size,
        color: a.color ? PF.hex(a.color) : "#ffffff", bold: a.bold !== false, italic: false, align, outline: a.outline !== false, outlineColor: "#000000", shadow: true, lineHeight: 1.2 };
      PF.renderText(l, d.w, d.h);
      d.changed(); PF.emit("layers", d);
      return { ok: true, layer: l.name };
    },
    export_image: async ({ format = "png", quality = 92 }) => {
      const d = need();
      const r = await encode(d, format, quality);
      return { ...r, suggested: d.name + "." + format };
    },
    undo: () => { const d = need(); const label = d.undo(); if (!label) throw new Error("Não há nada para desfazer"); return { undone: label }; },
  };
  piphin.on("ai-call", async ({ id, name, args }) => {
    try {
      const data = await AI[name](args || {});
      PF.toast(`A IA usou: ${name.replace(/_/g, " ")}`, "info");
      piphin.invoke("ai-reply", id, true, data);
    } catch (e) { piphin.invoke("ai-reply", id, false, e.message); }
  });
  window.addEventListener("beforeunload", () => { piphin.invoke("ui-unload"); });

  return { show, add, close, openDialog, openPath, openFile, openLoaded, newDoc, saveProject, exportImage, encode, copy, paste, fromImageCanvas };
})();
