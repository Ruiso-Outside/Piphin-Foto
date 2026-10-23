// Piphin Foto · interface: menus, atalhos, ferramentas, painéis (cor, camadas, histórico), diálogos e tela inicial.
"use strict";
(() => {
  const S = PF.state;
  const doc = () => S.doc;
  const io = PF.io, ops = PF.ops;

  // ---------------------------------------------------------------- avisos
  PF.toast = (text, kind = "", action = null) => {
    const el = document.createElement("div");
    el.className = "toast " + kind;
    el.innerHTML = `<span class="grow">${esc(text)}</span>` + (action ? `<button class="btn sm">${esc(action.label)}</button>` : "");
    if (action) el.querySelector("button").onclick = () => { action.run(); el.remove(); };
    $("#toasts").appendChild(el);
    setTimeout(() => el.remove(), action ? 7000 : 3200);
  };
  const guard = (fn) => async (...a) => { try { return await fn(...a); } catch (e) { PF.toast(e.message, "err"); } };
  PF.status = (text) => { $("#stInfo").textContent = text || ""; };

  // ---------------------------------------------------------------- diálogos
  const modal = $("#modal"), box = $("#modalBox");
  let onClose = null;
  function openModal(html, { cls = "", floating = false, close } = {}) {
    box.className = "modal-box " + cls;
    modal.classList.toggle("fxm", floating);
    box.innerHTML = html;
    modal.hidden = false;
    onClose = close || null;
    const first = box.querySelector("input:not([type=range]):not([type=checkbox]), select, button.primary");
    if (first) setTimeout(() => first.focus(), 0);
  }
  function closeModal(ok = false) {
    if (modal.hidden) return;
    modal.hidden = true; box.innerHTML = "";
    const f = onClose; onClose = null;
    if (f) f(ok);
  }
  modal.addEventListener("mousedown", (e) => { if (e.target === modal && !modal.classList.contains("fxm")) closeModal(false); });
  PF.confirm = (title, text, buttons = ["OK", "Cancelar"], danger = false) => new Promise((resolve) => {
    openModal(`<h3>${esc(title)}</h3><p>${esc(text)}</p><div class="modal-actions">${buttons.map((b, i) => `<button class="btn ${i === 0 ? (danger ? "danger solid" : "primary") : ""}" data-i="${i}">${esc(b)}</button>`).join("")}</div>`,
      { close: () => resolve(buttons.length - 1) });
    box.querySelectorAll("[data-i]").forEach((b) => (b.onclick = () => { onClose = null; closeModal(); resolve(Number(b.dataset.i)); }));
  });
  // pede um texto (renomear, nome da pasta); resolve null se cancelar
  PF.prompt = (title, label, value = "") => new Promise((resolve) => {
    openModal(`<h3>${esc(title)}</h3><div class="form"><label>${esc(label)}<input type="text" id="dlgTxt" maxlength="80" value="${esc(value)}"></label></div>
      <div class="modal-actions"><button class="btn" data-x>Cancelar</button><button class="btn primary" data-ok>OK</button></div>`, { close: () => resolve(null) });
    const ok = () => { const v = $("#dlgTxt").value.trim(); onClose = null; closeModal(); resolve(v || null); };
    box.querySelector("[data-x]").onclick = () => closeModal();
    box.querySelector("[data-ok]").onclick = ok;
    $("#dlgTxt").onkeydown = (e) => { if (e.key === "Enter") { e.stopPropagation(); ok(); } };
    setTimeout(() => $("#dlgTxt") && $("#dlgTxt").select(), 0);
  });
  function numberDialog(title, label, value, min, max, unit, run) {
    openModal(`<h3>${esc(title)}</h3><div class="form"><label>${esc(label)}<input type="number" id="dlgNum" value="${value}" min="${min}" max="${max}"></label></div>
      <div class="modal-actions"><button class="btn" data-x>Cancelar</button><button class="btn primary" data-ok>OK</button></div>`);
    box.querySelector("[data-x]").onclick = () => closeModal();
    const ok = guard(() => { const v = clamp(Number($("#dlgNum").value) || 0, min, max); closeModal(); run(v); });
    box.querySelector("[data-ok]").onclick = ok;
    $("#dlgNum").onkeydown = (e) => { if (e.key === "Enter") ok(); };
    void unit;
  }

  // ajuste/filtro com prévia ao vivo na imagem
  function fxDialog(def) {
    const d = doc(); if (!d) return;
    const l = d.active;
    if (!l.visible) return PF.toast("A camada ativa está oculta", "warn");
    if (!def.fields || !def.fields.length) return guard(() => ops.applyToLayer(def.name, (c) => def.run(c, {})))();
    const vals = Object.fromEntries(def.fields.map((f) => [f[0], f[4]]));
    const base = l.canvas;
    let raf = 0, previewOn = true;
    const preview = () => {
      if (raf) return;
      raf = requestAnimationFrame(() => {
        raf = 0;
        if (!previewOn) { d.preview = null; d.changed(); return; }
        d.preview = { id: l.id, canvas: PF.withinSelection(d, base, def.run(base, vals)) };
        d.changed();
      });
    };
    openModal(`<h3>${esc(def.name)}</h3>
      ${def.fields.map(([k, label, min, max, v, step]) => min === "check"
        ? `<label class="fx-field"><span class="top"><span><input type="checkbox" data-k="${k}" ${v ? "checked" : ""}> ${esc(label)}</span></span></label>`
        : `<div class="fx-field"><div class="top"><span>${esc(label)}</span><input type="number" data-k="${k}" value="${v}" min="${min}" max="${max}" step="${step || 1}"></div>
           <input type="range" data-k="${k}" value="${v}" min="${min}" max="${max}" step="${step || 1}"></div>`).join("")}
      <label class="fx-field"><span class="top"><span><input type="checkbox" id="fxPrev" checked> Prévia</span><button class="btn sm ghost" id="fxReset">Zerar</button></span></label>
      <div class="modal-actions"><button class="btn" data-x>Cancelar</button><button class="btn primary" data-ok>Aplicar</button></div>`,
    { cls: "fx", floating: true, close: (ok) => { if (!ok) { d.preview = null; d.changed(); } } });
    box.querySelectorAll("[data-k]").forEach((inp) => {
      inp.addEventListener("input", () => {
        const k = inp.dataset.k;
        vals[k] = inp.type === "checkbox" ? inp.checked : Number(inp.value);
        box.querySelectorAll(`[data-k="${k}"]`).forEach((o) => { if (o !== inp && o.type !== "checkbox") o.value = inp.value; });
        preview();
      });
    });
    $("#fxPrev").onchange = (e) => { previewOn = e.target.checked; preview(); };
    $("#fxReset").onclick = () => { def.fields.forEach(([k, , min, , v]) => { vals[k] = v; box.querySelectorAll(`[data-k="${k}"]`).forEach((o) => { if (o.type === "checkbox") o.checked = v; else o.value = v; }); void min; }); preview(); };
    box.querySelector("[data-x]").onclick = () => closeModal(false);
    box.querySelector("[data-ok]").onclick = guard(() => {
      const result = PF.withinSelection(d, base, def.run(base, vals));
      d.preview = null;
      d.beginEdit(def.name, []);
      ops.rasterize(d, l);
      l.canvas = result;
      d.changed(); PF.emit("layers", d);
      closeModal(true);
    });
    preview();
  }

  const PRESETS = [["Full HD", 1920, 1080], ["HD", 1280, 720], ["4K", 3840, 2160], ["Quadrado (Instagram)", 1080, 1080], ["Story / Reels", 1080, 1920],
    ["Retrato (Instagram)", 1080, 1350], ["Miniatura do YouTube", 1280, 720], ["Banner do YouTube", 2560, 1440], ["Ícone", 512, 512], ["A4 (300 dpi)", 2480, 3508],
    ["Papel de parede 1440p", 2560, 1440], ["Pequeno", 800, 600]];
  function newDialog(w = 1920, h = 1080) {
    openModal(`<h3>Nova imagem</h3>
      <div class="presets-grid">${PRESETS.map(([n, pw, ph]) => `<button data-w="${pw}" data-h="${ph}">${esc(n)} <span>${pw} × ${ph}</span></button>`).join("")}</div>
      <div class="form">
        <div class="dims"><label>Largura (px)<input type="number" id="nW" value="${w}" min="1" max="20000"></label><span></span><label>Altura (px)<input type="number" id="nH" value="${h}" min="1" max="20000"></label></div>
        <label>Fundo<div class="seg" id="nBg"><button class="on" data-bg="#ffffff">Branco</button><button data-bg="#000000">Preto</button><button data-bg="transparent">Transparente</button><button data-bg="fg">Cor principal</button></div></label>
      </div>
      <div class="modal-actions"><button class="btn" data-x>Cancelar</button><button class="btn primary" data-ok>Criar</button></div>`, { cls: "wide" });
    box.querySelectorAll("[data-w]").forEach((b) => (b.onclick = () => { $("#nW").value = b.dataset.w; $("#nH").value = b.dataset.h; box.querySelectorAll("[data-w]").forEach((x) => x.classList.toggle("on", x === b)); }));
    box.querySelectorAll("[data-bg]").forEach((b) => (b.onclick = () => box.querySelectorAll("[data-bg]").forEach((x) => x.classList.toggle("on", x === b))));
    box.querySelector("[data-x]").onclick = () => closeModal();
    box.querySelector("[data-ok]").onclick = () => {
      const bg = box.querySelector("[data-bg].on").dataset.bg;
      const W = clamp(Number($("#nW").value) || 1920, 1, 20000), H = clamp(Number($("#nH").value) || 1080, 1, 20000);
      closeModal();
      io.newDoc({ w: W, h: H, background: bg === "fg" ? S.fg : bg });
    };
  }

  function imageSizeDialog() {
    const d = doc(); if (!d) return;
    const k = d.w / d.h;
    openModal(`<h3>Tamanho da imagem</h3><p>Atual: ${d.w} × ${d.h} px</p>
      <div class="form">
        <div class="dims"><label>Largura (px)<input type="number" id="sW" value="${d.w}" min="1" max="20000"></label>
          <button class="btn icon lock on" id="sLock" title="Manter a proporção"><i class="i i-lock"></i></button>
          <label>Altura (px)<input type="number" id="sH" value="${d.h}" min="1" max="20000"></label></div>
        <label>Porcentagem<input type="number" id="sP" value="100" min="1" max="1000"></label>
        <label>Qualidade<select id="sQ"><option value="high">Suave (fotos)</option><option value="pixel">Pixels nítidos (pixel art)</option></select></label>
      </div>
      <div class="modal-actions"><button class="btn" data-x>Cancelar</button><button class="btn primary" data-ok>Aplicar</button></div>`);
    let lock = true;
    $("#sLock").onclick = () => { lock = !lock; $("#sLock").classList.toggle("on", lock); $("#sLock").innerHTML = `<i class="i i-lock${lock ? "" : "-open"}"></i>`; };
    $("#sW").oninput = () => { if (lock) $("#sH").value = Math.round($("#sW").value / k); $("#sP").value = Math.round(($("#sW").value / d.w) * 100); };
    $("#sH").oninput = () => { if (lock) $("#sW").value = Math.round($("#sH").value * k); };
    $("#sP").oninput = () => { $("#sW").value = Math.round((d.w * $("#sP").value) / 100); $("#sH").value = Math.round((d.h * $("#sP").value) / 100); };
    box.querySelector("[data-x]").onclick = () => closeModal();
    box.querySelector("[data-ok]").onclick = guard(() => { const w = Number($("#sW").value), h = Number($("#sH").value), q = $("#sQ").value; closeModal(); ops.resizeImage(w, h, q); });
  }

  function canvasSizeDialog() {
    const d = doc(); if (!d) return;
    let anchor = [0.5, 0.5];
    openModal(`<h3>Tamanho da tela</h3><p>Aumenta ou corta a área da imagem sem esticar. Atual: ${d.w} × ${d.h} px</p>
      <div class="form">
        <div class="dims"><label>Largura (px)<input type="number" id="cW" value="${d.w}" min="1" max="20000"></label><span></span><label>Altura (px)<input type="number" id="cH" value="${d.h}" min="1" max="20000"></label></div>
        <label>Posição da imagem<div class="anchor" id="cA">${[0, 0.5, 1].flatMap((y) => [0, 0.5, 1].map((x) => `<button data-ax="${x}" data-ay="${y}" class="${x === 0.5 && y === 0.5 ? "on" : ""}"></button>`)).join("")}</div></label>
        <label>Área nova<select id="cF"><option value="">Transparente</option><option value="#ffffff">Branca</option><option value="#000000">Preta</option><option value="bg">Cor secundária</option></select></label>
      </div>
      <div class="modal-actions"><button class="btn" data-x>Cancelar</button><button class="btn primary" data-ok>Aplicar</button></div>`);
    box.querySelectorAll("[data-ax]").forEach((b) => (b.onclick = () => { anchor = [Number(b.dataset.ax), Number(b.dataset.ay)]; box.querySelectorAll("[data-ax]").forEach((x) => x.classList.toggle("on", x === b)); }));
    box.querySelector("[data-x]").onclick = () => closeModal();
    box.querySelector("[data-ok]").onclick = guard(() => {
      const f = $("#cF").value;
      const w = Number($("#cW").value), h = Number($("#cH").value);
      closeModal();
      ops.canvasSize(w, h, anchor, f === "bg" ? S.bg : f || null);
    });
  }

  function exportDialog() {
    const d = doc(); if (!d) return;
    const pref = S.exportPrefs || { format: "png", quality: 92, scale: 100 };
    openModal(`<h3>Exportar imagem</h3><p>Junta todas as camadas visíveis num arquivo.</p>
      <div class="form">
        <label>Formato<div class="seg" id="eF">${[["png", "PNG", "sem perda, com transparência"], ["jpg", "JPG", "fotos, arquivo menor"], ["webp", "WebP", "moderno, bem menor"]]
          .map(([k, t, h]) => `<button data-f="${k}" class="${pref.format === k ? "on" : ""}" title="${h}">${t}</button>`).join("")}</div></label>
        <div class="fx-field" id="eQw"><div class="top"><span>Qualidade</span><span id="eQv">${pref.quality}</span></div><input type="range" id="eQ" min="1" max="100" value="${pref.quality}"></div>
        <div class="fx-field"><div class="top"><span>Tamanho</span><span id="eSv"></span></div><input type="range" id="eS" min="5" max="200" step="5" value="${pref.scale}"></div>
        <div class="size-note" id="eNote">Calculando o tamanho do arquivo...</div>
      </div>
      <div class="modal-actions"><button class="btn" data-x>Cancelar</button><button class="btn primary" data-ok><i class="i i-download"></i>Exportar...</button></div>`);
    let f = pref.format, t = 0;
    const update = () => {
      $("#eQw").style.display = f === "png" ? "none" : "";
      const s = Number($("#eS").value);
      $("#eSv").textContent = `${s}% · ${Math.round((d.w * s) / 100)} × ${Math.round((d.h * s) / 100)} px`;
      $("#eQv").textContent = $("#eQ").value;
      clearTimeout(t);
      t = setTimeout(async () => {
        const r = await io.encode(d, f, Number($("#eQ").value), s);
        if ($("#eNote")) $("#eNote").textContent = `Tamanho estimado do arquivo: ${r.bytes.length > 1048576 ? fmt(r.bytes.length / 1048576, 1) + " MB" : fmt(r.bytes.length / 1024) + " KB"}`;
      }, 250);
    };
    box.querySelectorAll("[data-f]").forEach((b) => (b.onclick = () => { f = b.dataset.f; box.querySelectorAll("[data-f]").forEach((x) => x.classList.toggle("on", x === b)); update(); }));
    $("#eQ").oninput = update; $("#eS").oninput = update;
    box.querySelector("[data-x]").onclick = () => closeModal();
    box.querySelector("[data-ok]").onclick = guard(async () => {
      S.exportPrefs = { format: f, quality: Number($("#eQ").value), scale: Number($("#eS").value) };
      PF.call("prefs", { exportPrefs: S.exportPrefs }).catch(() => {});
      closeModal();
      await io.exportImage(S.exportPrefs);
    });
    update();
  }

  function transformDialog() {
    const d = doc(); if (!d) return;
    const l = d.active, base = l.canvas;
    const vals = { scale: 100, angle: 0, dx: 0, dy: 0 };
    const prev = () => {
      const c = PF.canvas(d.w, d.h), g = PF.g(c);
      g.imageSmoothingQuality = "high";
      g.translate(d.w / 2 + vals.dx, d.h / 2 + vals.dy); g.rotate((vals.angle * Math.PI) / 180); g.scale(vals.scale / 100, vals.scale / 100);
      g.drawImage(base, -d.w / 2, -d.h / 2);
      d.preview = { id: l.id, canvas: c }; d.changed();
    };
    openModal(`<h3>Transformar camada</h3>
      ${[["scale", "Escala (%)", 1, 400, 100], ["angle", "Rotação (graus)", -180, 180, 0], ["dx", "Mover na horizontal (px)", -d.w, d.w, 0], ["dy", "Mover na vertical (px)", -d.h, d.h, 0]]
        .map(([k, t, min, max, v]) => `<div class="fx-field"><div class="top"><span>${t}</span><input type="number" data-k="${k}" value="${v}" min="${min}" max="${max}"></div><input type="range" data-k="${k}" value="${v}" min="${min}" max="${max}"></div>`).join("")}
      <div class="modal-actions"><button class="btn" data-x>Cancelar</button><button class="btn primary" data-ok>Aplicar</button></div>`,
    { cls: "fx", floating: true, close: (ok) => { if (!ok) { d.preview = null; d.changed(); } } });
    box.querySelectorAll("[data-k]").forEach((inp) => inp.addEventListener("input", () => {
      vals[inp.dataset.k] = Number(inp.value);
      box.querySelectorAll(`[data-k="${inp.dataset.k}"]`).forEach((o) => { if (o !== inp) o.value = inp.value; });
      prev();
    }));
    box.querySelector("[data-x]").onclick = () => closeModal(false);
    box.querySelector("[data-ok]").onclick = guard(() => { d.preview = null; ops.transformLayer(vals); closeModal(true); });
  }

  function layerPropsDialog() {
    const d = doc(); if (!d) return;
    const l = d.active;
    openModal(`<h3>Propriedades da camada</h3><div class="form"><label>Nome<input type="text" id="lpN" value="${esc(l.name)}"></label></div>
      <div class="modal-actions"><button class="btn" data-x>Cancelar</button><button class="btn primary" data-ok>OK</button></div>`);
    box.querySelector("[data-x]").onclick = () => closeModal();
    const ok = () => { const n = $("#lpN").value.trim(); closeModal(); if (n && n !== l.name) ops.setLayer(l.id, { name: n }, "Renomear camada"); };
    box.querySelector("[data-ok]").onclick = ok;
    $("#lpN").onkeydown = (e) => { if (e.key === "Enter") ok(); };
  }

  function shortcutsDialog() {
    const rows = [["V", "Mover"], ["M", "Seleção retangular / elíptica"], ["L", "Laço"], ["W", "Varinha mágica"], ["C", "Recortar"], ["B", "Pincel"], ["E", "Borracha"], ["S", "Carimbo"],
      ["G", "Balde / Degradê"], ["T", "Texto"], ["U", "Formas"], ["I", "Conta-gotas"], ["H ou Espaço", "Mão"], ["Z", "Zoom"], ["[ e ]", "Tamanho do pincel"], ["X", "Trocar cores"], ["D", "Preto e branco"],
      ["Ctrl+Z / Ctrl+Shift+Z", "Desfazer / refazer"], ["Ctrl+A / Ctrl+D", "Selecionar tudo / desmarcar"], ["Ctrl+Shift+I", "Inverter seleção"], ["Delete", "Apagar a seleção"],
      ["Ctrl+C / Ctrl+X / Ctrl+V", "Copiar / recortar / colar"], ["Ctrl+J", "Duplicar camada"], ["Ctrl+E", "Mesclar para baixo"], ["Ctrl+T", "Mudar tamanho / girar camada"],
      ["Ctrl+0 / Ctrl+1", "Ajustar à tela / 100%"], ["Ctrl+= / Ctrl+-", "Aproximar / afastar"], ["Ctrl+S", "Salvar projeto"], ["Ctrl+Shift+E", "Exportar"], ["Ctrl+N / Ctrl+O", "Nova / abrir"]];
    openModal(`<h3>Atalhos do teclado</h3><div class="kv" style="display:grid;grid-template-columns:auto 1fr;gap:6px 18px;margin-top:12px;font-size:13px">
      ${rows.map(([k, t]) => `<b class="mono" style="color:var(--fx-accent);font-weight:500">${k}</b><span>${t}</span>`).join("")}</div>
      <div class="modal-actions"><button class="btn primary" data-x>Fechar</button></div>`, { cls: "wide" });
    box.querySelector("[data-x]").onclick = () => closeModal();
  }

  // ---------------------------------------------------------------- comandos
  const needDoc = (fn) => guard((...a) => { if (!doc()) throw new Error("Abra ou crie uma imagem primeiro"); return fn(...a); });
  const CMD = {
    new: () => newDialog(), open: () => io.openDialog(), save: needDoc(() => io.saveProject(false)), "save-as": needDoc(() => io.saveProject(true)),
    export: needDoc(exportDialog), close: needDoc(() => io.close()),
    undo: needDoc(() => { const l = doc().undo(); if (l) PF.status("Desfeito: " + l); }), redo: needDoc(() => { const l = doc().redo(); if (l) PF.status("Refeito: " + l); }),
    copy: needDoc(() => io.copy()), "copy-merged": needDoc(() => io.copy({ merged: true })), cut: needDoc(() => io.copy({ cut: true })),
    paste: () => io.paste(), "paste-new": () => io.paste({ newDocument: true }),
    library: async () => { try { const r = await PF.call("library-pick"); if (r) await io.openLoaded(r); } catch (e) { PF.toast(e.message, "err"); } },
    clear: needDoc(() => ops.clearSelection()), "fill-fg": needDoc(() => ops.fillSelection(S.fg)), "fill-bg": needDoc(() => ops.fillSelection(S.bg)),
    // Ctrl+T: alças da ferramenta Mover; com seleção, o diálogo de valores
    transform: needDoc(() => { if (doc().selection) return transformDialog(); selectTool("move"); PF.toast("Arraste os cantos da caixa para mudar o tamanho e a bolinha de cima para girar", "info"); }),
    "transform-values": needDoc(transformDialog),
    "tf-fit": needDoc(() => PF.tools.move.place("fit")), "tf-fill": needDoc(() => PF.tools.move.place("fill")),
    "tf-original": needDoc(() => PF.tools.move.place("original")), "tf-center": needDoc(() => PF.tools.move.place("center")),
    "image-size": needDoc(imageSizeDialog), "canvas-size": needDoc(canvasSizeDialog),
    "rot-cw": needDoc(() => ops.rotate(90)), "rot-ccw": needDoc(() => ops.rotate(270)), "rot-180": needDoc(() => ops.rotate(180)),
    "flip-h": needDoc(() => ops.flip("h")), "flip-v": needDoc(() => ops.flip("v")),
    "crop-sel": needDoc(() => ops.cropToSelection()), trim: needDoc(() => ops.trim()), flatten: needDoc(() => ops.flatten()),
    "layer-new": needDoc(() => ops.newLayer()), "layer-dup": needDoc(() => ops.duplicateLayer()), "layer-del": needDoc(() => ops.deleteLayer()),
    "layer-merge": needDoc(() => ops.mergeDown()), "layer-flip-h": needDoc(() => ops.flip("h", true)), "layer-flip-v": needDoc(() => ops.flip("v", true)),
    "layer-rot-180": needDoc(() => ops.rotate(180, true)), "layer-props": needDoc(layerPropsDialog),
    "layer-raster": needDoc(() => { const d = doc(), l = d.active; if (!l.text) throw new Error("A camada ativa não é de texto"); d.beginEdit("Converter em pixels", []); ops.rasterize(d, l); PF.emit("layers", d); }),
    "layer-up": needDoc(() => { const d = doc(); ops.moveLayer(d.activeId, d.layers.indexOf(d.active) + 1); }),
    "layer-down": needDoc(() => { const d = doc(); ops.moveLayer(d.activeId, d.layers.indexOf(d.active) - 1); }),
    "select-all": needDoc(() => ops.selectAll()), deselect: needDoc(() => ops.deselect()), "select-invert": needDoc(() => ops.invertSelection()),
    feather: needDoc(() => numberDialog("Suavizar seleção", "Raio (px)", 8, 1, 250, "px", ops.featherSelection)),
    grow: needDoc(() => numberDialog("Expandir seleção", "Pixels", 8, 1, 500, "px", ops.growSelection)),
    shrink: needDoc(() => numberDialog("Contrair seleção", "Pixels", 8, 1, 500, "px", (v) => ops.growSelection(-v))),
    "zoom-in": needDoc(() => PF.view.zoomStep(1)), "zoom-out": needDoc(() => PF.view.zoomStep(-1)), "zoom-fit": needDoc(() => PF.view.fit()),
    "zoom-100": needDoc(() => PF.view.zoomTo(1)), "zoom-200": needDoc(() => PF.view.zoomTo(2)),
    "pixel-grid": () => { S.pixelGrid = S.pixelGrid === false; PF.requestRender(); },
    "swap-colors": () => { [S.fg, S.bg] = [S.bg, S.fg]; colorsChanged(); }, "reset-colors": () => { S.fg = "#000000"; S.bg = "#ffffff"; colorsChanged(); },
    "crop-apply": needDoc(() => PF.tools.crop.apply()), "crop-reset": () => PF.tools.crop.reset(),
    shortcuts: shortcutsDialog,
  };
  for (const [k, def] of Object.entries(PF.ADJUST)) CMD["adj-" + k] = needDoc(() => fxDialog(def));
  for (const [k, def] of Object.entries(PF.QUICK)) CMD["adj-" + k] = needDoc(() => ops.applyToLayer(def.name, (c) => def.run(c, {})));
  for (const [k, def] of Object.entries(PF.FILTERS)) CMD["flt-" + k] = needDoc(() => fxDialog(def));
  PF.cmd = (name) => { if (CMD[name]) CMD[name](); };
  PF.addCmd = (name, fn, { doc: withDoc = false } = {}) => { CMD[name] = withDoc ? needDoc(fn) : guard(fn); };

  // ---------------------------------------------------------------- menus
  const MENUS = [
    ["Arquivo", [["new", "file-plus", "Nova imagem...", "Ctrl+N"], ["open", "folder-open", "Abrir...", "Ctrl+O"], ["paste-new", "clipboard-paste", "Nova a partir da área de transferência"], ["library", "library", "Abrir da Mídia do Hub..."], "-",
      ["inv-save-image", "archive", "Guardar imagem no inventário"],
      ["save", "save", "Salvar projeto", "Ctrl+S"], ["save-as", "save", "Salvar projeto como...", "Ctrl+Shift+S"], ["export", "download", "Exportar imagem...", "Ctrl+Shift+E"], "-", ["close", "x", "Fechar imagem", "Ctrl+W"]]],
    ["Editar", [["undo", "undo-2", "Desfazer", "Ctrl+Z"], ["redo", "redo-2", "Refazer", "Ctrl+Shift+Z"], "-", ["cut", "scissors", "Recortar", "Ctrl+X"], ["copy", "copy", "Copiar", "Ctrl+C"],
      ["copy-merged", "copy", "Copiar mesclado", "Ctrl+Shift+C"], ["paste", "clipboard-paste", "Colar", "Ctrl+V"], ["clear", "eraser", "Apagar seleção", "Delete"], "-",
      ["fill-fg", "paint-bucket", "Preencher com a cor principal", "Alt+Backspace"], ["fill-bg", "paint-bucket", "Preencher com a cor secundária", "Ctrl+Backspace"], "-",
      ["transform", "scaling", "Mudar tamanho / girar camada", "Ctrl+T"], ["transform-values", "sliders-horizontal", "Transformar com valores..."], "-", ["shortcuts", "keyboard", "Atalhos do teclado"]]],
    ["Imagem", [["image-size", "scaling", "Tamanho da imagem...", "Ctrl+Alt+I"], ["canvas-size", "expand", "Tamanho da tela...", "Ctrl+Alt+C"], "-",
      ["rot-cw", "rotate-cw", "Girar 90° no sentido horário"], ["rot-ccw", "rotate-ccw", "Girar 90° no sentido anti-horário"], ["rot-180", "rotate-cw", "Girar 180°"],
      ["flip-h", "flip-horizontal-2", "Espelhar na horizontal"], ["flip-v", "flip-vertical-2", "Espelhar na vertical"], "-",
      ["crop-sel", "crop", "Recortar para a seleção"], ["trim", "shrink", "Aparar bordas transparentes"], ["flatten", "layers", "Achatar imagem"]]],
    ["Camada", [["layer-new", "plus", "Nova camada", "Ctrl+Shift+N"], ["layer-dup", "copy", "Duplicar camada", "Ctrl+J"], ["layer-del", "trash-2", "Apagar camada"], "-",
      ["layer-merge", "merge", "Mesclar para baixo", "Ctrl+E"], ["layer-up", "arrow-up", "Subir camada", "Ctrl+]"], ["layer-down", "arrow-down", "Descer camada", "Ctrl+["], "-",
      ["layer-flip-h", "flip-horizontal-2", "Espelhar camada na horizontal"], ["layer-flip-v", "flip-vertical-2", "Espelhar camada na vertical"], ["layer-rot-180", "rotate-cw", "Girar camada 180°"],
      ["layer-raster", "type", "Converter texto em pixels"], ["inv-save-layer", "archive", "Guardar camada no inventário"], ["layer-props", "pencil", "Renomear camada..."]]],
    ["Seleção", [["select-all", "square-dashed", "Selecionar tudo", "Ctrl+A"], ["deselect", "x", "Desmarcar", "Ctrl+D"], ["select-invert", "repeat-2", "Inverter seleção", "Ctrl+Shift+I"], "-",
      ["feather", "droplet", "Suavizar..."], ["grow", "expand", "Expandir..."], ["shrink", "shrink", "Contrair..."]]],
    ["Ajustes", [...Object.entries(PF.ADJUST).map(([k, d]) => ["adj-" + k, d.icon, d.name + "..."]), "-", ...Object.entries(PF.QUICK).map(([k, d]) => ["adj-" + k, d.icon, d.name])]],
    ["Filtros", Object.entries(PF.FILTERS).map(([k, d]) => ["flt-" + k, d.icon, d.name + (d.fields.length ? "..." : "")])],
    ["Exibir", [["zoom-in", "zoom-in", "Aproximar", "Ctrl+="], ["zoom-out", "zoom-out", "Afastar", "Ctrl+-"], ["zoom-fit", "maximize", "Ajustar à tela", "Ctrl+0"],
      ["zoom-100", "scan", "Tamanho real (100%)", "Ctrl+1"], ["zoom-200", "zoom-in", "200%", "Ctrl+2"], "-", ["pixel-grid", "grid-3x3", "Grade de pixels (zoom alto)"]]],
  ];
  const pop = $("#menuPop");
  let openMenu = null;
  let hubLib = false; // Hub 1.7.0+: Mídia compartilhada entre os módulos
  function showMenu(i, btn) {
    const [, items] = MENUS[i];
    pop.innerHTML = items.map((it) => it === "-" ? `<div class="sep"></div>`
      : `<button class="mi" data-cmd="${it[0]}" ${!doc() && !["new", "open", "paste-new", "library", "shortcuts"].includes(it[0]) ? "disabled" : ""}><i class="i i-${it[1]}"></i>${esc(it[2])}${it[3] ? `<span class="k">${it[3]}</span>` : ""}</button>`).join("");
    const r = btn.getBoundingClientRect();
    pop.style.left = r.left + "px"; pop.style.top = r.bottom + 4 + "px";
    pop.hidden = false;
    $$("#menus button").forEach((b, j) => b.classList.toggle("open", j === i));
    openMenu = i;
  }
  const hideMenu = () => { pop.hidden = true; openMenu = null; $$("#menus button").forEach((b) => b.classList.remove("open")); };
  $("#menus").innerHTML = MENUS.map(([n], i) => `<button data-menu="${i}">${n}</button>`).join("");
  $$("#menus button").forEach((b) => {
    b.addEventListener("mousedown", (e) => { e.preventDefault(); const i = Number(b.dataset.menu); openMenu === i ? hideMenu() : showMenu(i, b); });
    b.addEventListener("mouseenter", () => { if (openMenu !== null && openMenu !== Number(b.dataset.menu)) showMenu(Number(b.dataset.menu), b); });
  });
  document.addEventListener("mousedown", (e) => { if (openMenu !== null && !pop.contains(e.target) && !e.target.closest("#menus")) hideMenu(); });

  // cliques em qualquer [data-cmd] (menus, botões, opções da ferramenta)
  document.addEventListener("click", (e) => {
    const b = e.target.closest("[data-cmd]");
    if (!b || b.disabled) return;
    hideMenu();
    PF.cmd(b.dataset.cmd);
  });

  // ---------------------------------------------------------------- ferramentas e opções
  function selectTool(id) {
    if (!PF.tools[id]) return;
    const old = PF.tools[S.tool];
    if (old && old.deactivate && S.tool !== id) old.deactivate();
    S.tool = id;
    if (PF.tools[id].activate) PF.tools[id].activate();
    renderToolbar(); renderOptions();
    PF.view.updateCursor();
    PF.requestRender();
    PF.call("prefs", { tool: id }).catch(() => {});
  }
  PF.selectTool = selectTool;
  function renderToolbar() {
    $("#toolBtns").innerHTML = PF.TOOLBAR.map((id) => id === null ? `<div class="tool-sep"></div>`
      : `<button class="tool ${S.tool === id ? "on" : ""}" data-tool="${id}" title="${esc(PF.tools[id].name)} (${PF.tools[id].key})"><i class="i i-${PF.tools[id].icon}"></i></button>`).join("");
  }
  $("#toolBtns").addEventListener("click", (e) => { const b = e.target.closest("[data-tool]"); if (b) selectTool(b.dataset.tool); });
  function renderOptions() {
    const t = PF.tools[S.tool];
    $("#optbar").innerHTML = `<span class="tname"><i class="i i-${t.icon}"></i>${esc(t.name)}</span>` + (t.options ? t.options() : "");
    $("#stHint").textContent = "";
  }
  PF.on("options", renderOptions);
  const getOpt = (path) => path.split(".").reduce((o, k) => o && o[k], S);
  const setOpt = (path, v) => { const ks = path.split("."); let o = S; for (const k of ks.slice(0, -1)) o = o[k]; o[ks[ks.length - 1]] = v; };
  function optChanged(path) {
    const t = PF.tools[S.tool];
    if (t && t.optionChanged) t.optionChanged(path);
    PF.requestRender();
    savePrefsSoon();
  }
  $("#optbar").addEventListener("input", (e) => {
    const el = e.target, path = el.dataset.opt;
    if (!path) return;
    const v = el.type === "checkbox" ? el.checked : el.type === "range" || el.type === "number" ? Number(el.value) : el.value;
    setOpt(path, v);
    $$(`[data-opt="${path}"]`, $("#optbar")).forEach((o) => { if (o !== el && o.type !== "checkbox") o.value = v; });
    $$(`[data-show="${path}"]`, $("#optbar")).forEach((o) => (o.textContent = v + (/opacity|hardness/.test(path) ? "%" : "")));
    optChanged(path);
  });
  $("#optbar").addEventListener("change", (e) => {
    const tf = e.target.dataset.tf;
    if (tf) { PF.tools.move.setField(tf, Number(e.target.value)); return; }
    if (e.target.tagName === "SELECT") { setOpt(e.target.dataset.opt, e.target.value); optChanged(e.target.dataset.opt); } });
  $("#optbar").addEventListener("click", (e) => {
    const s = e.target.closest("[data-set]"), t = e.target.closest("[data-toggle]");
    if (s) { setOpt(s.dataset.set, s.dataset.val); optChanged(s.dataset.set); renderOptions(); }
    if (t) { setOpt(t.dataset.toggle, !getOpt(t.dataset.toggle)); optChanged(t.dataset.toggle); renderOptions(); }
  });
  let prefsTimer = 0;
  const PREF_KEYS = ["brush", "eraser", "clone", "select", "wand", "fill", "gradient", "shape", "text", "crop", "move", "fg", "bg", "recentColors"];
  function savePrefsSoon() {
    clearTimeout(prefsTimer);
    prefsTimer = setTimeout(() => PF.call("prefs", Object.fromEntries(PREF_KEYS.map((k) => [k, S[k]]))).catch(() => {}), 800);
  }

  // ---------------------------------------------------------------- cores
  const PALETTE = ["#000000", "#ffffff", "#7f7f7f", "#c3c3c3", "#ff3b30", "#ff9500", "#ffcc00", "#34c759", "#00c7be", "#30b0c7",
    "#007aff", "#5856d6", "#af52de", "#ff2d55", "#a2845e", "#fb923c", "#f472b6", "#a855f7", "#22d3ee", "#39ff88"];
  function colorsChanged(fromInput) {
    $("#swFg").style.background = S.fg; $("#swBg").style.background = S.bg;
    if (!fromInput) { const c = $("#cFg"); if (c) c.value = S.fg; const h = $("#cHex"); if (h) h.value = S.fg; }
    S.recentColors = [S.fg, ...(S.recentColors || []).filter((c) => c !== S.fg)].slice(0, 10);
    const t = PF.tools.text; if (S.tool === "text" && t.colorChanged) t.colorChanged();
    renderRecent();
    savePrefsSoon();
  }
  PF.on("colors", () => colorsChanged());
  function renderColor() {
    $("#colorBody").innerHTML = `
      <div class="color-main"><input type="color" id="cFg" value="${S.fg}" title="Escolher a cor principal"><input type="text" id="cHex" value="${S.fg}" maxlength="7" spellcheck="false"></div>
      <div class="palette">${PALETTE.map((c) => `<button style="background:${c}" data-c="${c}" title="${c}"></button>`).join("")}</div>
      <div class="palette" id="recentCols"></div>`;
    $("#cFg").addEventListener("input", (e) => { S.fg = e.target.value; $("#cHex").value = S.fg; colorsChanged(true); });
    $("#cHex").addEventListener("change", (e) => { if (/^#?[0-9a-f]{3}([0-9a-f]{3})?$/i.test(e.target.value.trim())) { S.fg = PF.hex(e.target.value.trim().replace(/^#?/, "#")); colorsChanged(); } });
    $("#colorBody").addEventListener("click", (e) => { const b = e.target.closest("[data-c]"); if (b) { if (e.altKey) S.bg = b.dataset.c; else S.fg = b.dataset.c; colorsChanged(); } });
    renderRecent();
  }
  function renderRecent() {
    const el = $("#recentCols"); if (!el) return;
    el.innerHTML = (S.recentColors || []).map((c) => `<button style="background:${c}" data-c="${c}" title="Recente: ${c}"></button>`).join("");
  }
  $("#swFg").onclick = () => $("#cFg").click();
  $("#swBg").onclick = () => { const i = document.createElement("input"); i.type = "color"; i.value = S.bg; i.oninput = () => { S.bg = i.value; colorsChanged(); }; i.click(); };

  // ---------------------------------------------------------------- camadas
  const thumbs = new Map();
  function thumbOf(l) {
    let c = thumbs.get(l.id);
    const d = doc(), k = Math.min(44 / d.w, 34 / d.h);
    if (!c) { c = PF.canvas(1, 1); thumbs.set(l.id, c); }
    c.width = Math.max(1, Math.round(d.w * k)); c.height = Math.max(1, Math.round(d.h * k));
    const g = PF.g(c); g.imageSmoothingQuality = "high"; g.clearRect(0, 0, c.width, c.height);
    g.drawImage(d.preview && d.preview.id === l.id ? d.preview.canvas : l.canvas, 0, 0, c.width, c.height);
    return c;
  }
  let dragId = null;
  function renderLayers() {
    const d = doc(), list = $("#layerList"), props = $("#layerProps");
    if (!d) { list.innerHTML = `<div class="opt-hint" style="padding:10px">Sem imagem aberta</div>`; props.innerHTML = ""; return; }
    const a = d.active;
    props.innerHTML = `<select id="lBlend" title="Modo de mesclagem">${PF.BLENDS.map(([k, n]) => `<option value="${k}" ${a.blend === k ? "selected" : ""}>${n}</option>`).join("")}</select>
      <button class="btn sm ${a.locked ? "on" : ""}" id="lLock" title="Bloquear a camada"><i class="i i-lock${a.locked ? "" : "-open"}"></i></button>
      <div class="op">Opacidade <input type="range" id="lOp" min="0" max="100" value="${Math.round(a.opacity * 100)}"><b id="lOpV">${Math.round(a.opacity * 100)}%</b></div>`;
    $("#lBlend").onchange = (e) => ops.setLayer(a.id, { blend: e.target.value }, "Modo da camada");
    $("#lLock").onclick = () => ops.setLayer(a.id, { locked: !a.locked }, a.locked ? "Desbloquear camada" : "Bloquear camada");
    let opStart = null;
    $("#lOp").oninput = (e) => {
      if (opStart === null) { opStart = a.opacity; d.beginEdit("Opacidade da camada", []); }
      a.opacity = Number(e.target.value) / 100; $("#lOpV").textContent = e.target.value + "%"; d.changed();
    };
    $("#lOp").onchange = () => { opStart = null; };
    list.innerHTML = "";
    [...d.layers].reverse().forEach((l) => {
      const row = document.createElement("div");
      row.className = `layer ${l.id === d.activeId ? "on" : ""} ${l.visible ? "" : "hidden-l"}`;
      row.draggable = true; row.dataset.id = l.id;
      row.innerHTML = `<button class="lb ${l.visible ? "lit" : ""}" data-vis title="Mostrar/ocultar"><i class="i i-${l.visible ? "eye" : "eye-off"}"></i></button>
        <div class="thumb">${l.text ? `<i class="i i-type"></i>` : ""}</div>
        <div class="lname">${esc(l.name)}</div>${l.locked ? `<i class="i i-lock" style="color:var(--p-text-3);font-size:13px"></i>` : ""}`;
      if (!l.text) row.querySelector(".thumb").appendChild(thumbOf(l));
      row.addEventListener("click", (e) => {
        if (e.target.closest("[data-vis]")) { ops.setLayer(l.id, { visible: !l.visible }, l.visible ? "Ocultar camada" : "Mostrar camada"); return; }
        if (d.activeId !== l.id) { d.activeId = l.id; renderLayers(); PF.emit("active", d); }
      });
      row.querySelector(".lname").addEventListener("dblclick", () => {
        const nm = row.querySelector(".lname");
        nm.innerHTML = `<input type="text" value="${esc(l.name)}">`;
        const inp = nm.querySelector("input"); inp.focus(); inp.select();
        const done = (save) => { const v = inp.value.trim(); if (save && v && v !== l.name) ops.setLayer(l.id, { name: v }, "Renomear camada"); else renderLayers(); };
        inp.onkeydown = (e) => { e.stopPropagation(); if (e.key === "Enter") done(true); if (e.key === "Escape") done(false); };
        inp.onblur = () => done(true);
      });
      row.addEventListener("dragstart", () => { dragId = l.id; });
      row.addEventListener("dragover", (e) => {
        if (dragId == null) return;
        e.preventDefault();
        const r = row.getBoundingClientRect(), above = e.clientY < r.top + r.height / 2;
        row.classList.toggle("drop-above", above); row.classList.toggle("drop-below", !above);
      });
      row.addEventListener("dragleave", () => row.classList.remove("drop-above", "drop-below"));
      row.addEventListener("drop", (e) => {
        e.preventDefault(); e.stopPropagation();
        if (dragId == null) return;
        const above = row.classList.contains("drop-above");
        row.classList.remove("drop-above", "drop-below");
        const from = d.layers.findIndex((x) => x.id === dragId), target = d.layers.indexOf(l);
        let to = above ? target + 1 : target;
        if (from < to) to--;
        const id = dragId;
        dragId = null;
        ops.moveLayer(id, to);
      });
      list.appendChild(row);
    });
  }
  let thumbTimer = 0;
  const refreshThumbsSoon = () => { clearTimeout(thumbTimer); thumbTimer = setTimeout(renderLayers, 250); };

  // ---------------------------------------------------------------- histórico
  function renderHistory() {
    const d = doc(), el = $("#historyList");
    if (!d) { el.innerHTML = ""; return; }
    const items = [["Abertura", -1], ...d.past.map((e, i) => [e.label, i])];
    el.innerHTML = items.map(([label, i], n) => `<button class="hist ${n === items.length - 1 ? "cur" : ""}" data-h="${n}"><i class="i i-${n ? "history" : "image"}"></i>${esc(n ? label : d.past.length >= 60 ? "Passos mais antigos" : "Abertura")}</button>`).join("")
      + [...d.future].reverse().map((e) => `<button class="hist future" data-f="1"><i class="i i-redo-2"></i>${esc(e.label)}</button>`).join("");
    el.scrollTop = el.scrollHeight;
  }
  $("#historyList").addEventListener("click", (e) => {
    const d = doc(), b = e.target.closest(".hist");
    if (!d || !b) return;
    if (b.dataset.h != null) { const target = Number(b.dataset.h); while (d.past.length > target) d.undo(); }
    else { const idx = $$(".hist.future").indexOf(b); for (let i = 0; i <= idx; i++) d.redo(); }
  });

  // ---------------------------------------------------------------- abas, status e início
  function renderTabs() {
    $("#tabs").innerHTML = S.docs.map((d) => `<div class="tab ${d === doc() ? "active" : ""}" data-doc="${d.id}" title="${esc(d.path || d.projectPath || d.name)}">
      ${d.dirty ? `<i class="dirty"></i>` : ""}<span class="nm">${esc(d.name)}</span><button class="x" data-close="${d.id}" title="Fechar"><i class="i i-x"></i></button></div>`).join("");
  }
  $("#tabs").addEventListener("click", (e) => {
    const x = e.target.closest("[data-close]");
    if (x) { const d = S.docs.find((q) => q.id === Number(x.dataset.close)); io.close(d); return; }
    const t = e.target.closest("[data-doc]");
    if (t) { const d = S.docs.find((q) => q.id === Number(t.dataset.doc)); if (d && d !== doc()) io.show(d); }
  });
  $("#tabs").addEventListener("auxclick", (e) => { const t = e.target.closest("[data-doc]"); if (t && e.button === 1) io.close(S.docs.find((q) => q.id === Number(t.dataset.doc))); });
  function renderStatus() {
    const d = doc();
    $("#stZoom").textContent = d ? `${fmt(d.view.zoom * 100, d.view.zoom < 0.1 ? 1 : 0)}%` : "";
    $("#stSize").textContent = d ? `${d.w} × ${d.h} px` : "";
    if (!d) { $("#stPos").textContent = ""; $("#stInfo").textContent = ""; }
  }
  PF.on("pointer", (p) => {
    const d = doc(); if (!d) return;
    const x = Math.floor(p.x), y = Math.floor(p.y);
    $("#stPos").textContent = x >= 0 && y >= 0 && x < d.w && y < d.h ? `x ${x} · y ${y}` : "";
  });
  async function renderHome() {
    const recent = await PF.call("recent").catch(() => []);
    $("#home").innerHTML = `<div class="home-in">
      <div><h1><span>Piphin Foto</span></h1><p class="lead">Editor de imagens com camadas, seleções, pincéis, texto, ajustes e filtros.</p></div>
      <div class="home-actions">
        <button class="big-act" data-cmd="new"><i class="i i-file-plus"></i><b>Nova imagem</b><span>Tela em branco ou transparente</span></button>
        <button class="big-act" data-cmd="open"><i class="i i-folder-open"></i><b>Abrir imagem</b><span>PNG, JPG, WebP, GIF, BMP ou projeto</span></button>
        <button class="big-act" data-cmd="paste-new"><i class="i i-clipboard-paste"></i><b>Colar</b><span>Imagem copiada ou print (Win+Shift+S)</span></button>
        ${hubLib ? `<button class="big-act" data-cmd="library"><i class="i i-library"></i><b>Da Mídia</b><span>Prints do Piphin Captura e imagens dos outros módulos</span></button>` : ""}
      </div>
      <div class="home-cols">
        <div class="home-card"><h3>Tamanhos prontos</h3>${PRESETS.slice(0, 7).map(([n, w, h]) => `<button class="preset" data-new="${w}x${h}"><span class="shape"><i style="width:${(w >= h ? 20 : (20 * w) / h).toFixed(1)}px;height:${(h >= w ? 20 : (20 * h) / w).toFixed(1)}px"></i></span>${esc(n)}<span class="dim">${w} × ${h}</span></button>`).join("")}</div>
        <div class="home-card"><h3>Abertos recentemente</h3>${recent.length ? recent.slice(0, 7).map((r) => `<button class="recent" data-recent="${esc(r.path)}"><i class="i i-${/\.pfoto$/i.test(r.name) ? "layers" : "file-image"}"></i><span class="nm"><span>${esc(r.name)}</span><span class="dir">${esc(r.dir)}</span></span></button>`).join("") : `<p class="opt-hint" style="margin:6px 10px">Nada por aqui ainda.</p>`}</div>
      </div>
      <p class="tip">Dica: arraste imagens para cá para abrir. Com uma imagem aberta, arrastar outra cria uma camada nova. A IA do Piphin LLM também consegue editar aqui.</p>
    </div>`;
  }
  $("#home").addEventListener("click", (e) => {
    const n = e.target.closest("[data-new]"), r = e.target.closest("[data-recent]");
    if (n) { const [w, h] = n.dataset.new.split("x").map(Number); io.newDoc({ w, h, background: "#ffffff" }); }
    if (r) io.openPath(r.dataset.recent);
  });

  PF.on("doc", (d) => { renderTabs(); renderLayers(); renderHistory(); renderStatus(); renderOptions(); if (!d) renderHome(); });
  PF.on("layers", () => { renderLayers(); renderTabs(); if (S.tool === "move") renderOptions(); });
  PF.on("active", () => renderOptions());
  PF.on("history", () => { renderHistory(); renderTabs(); refreshThumbsSoon(); if (S.tool === "move") renderOptions(); });
  PF.on("zoom", renderStatus);
  PF.on("selection", (d) => { if (d === doc() && S.tool === "move") renderOptions(); if (d === doc()) PF.status(d.selection ? (() => { const b = d.selectionBounds(); return `Seleção: ${b.w} × ${b.h} px`; })() : ""); });

  // ---------------------------------------------------------------- teclado
  const TOOL_KEYS = { v: ["move"], m: ["rect", "ellipse"], l: ["lasso"], w: ["wand"], c: ["crop"], b: ["brush"], e: ["eraser"], s: ["clone"], g: ["fill", "gradient"],
    t: ["text"], u: ["shape"], i: ["picker"], h: ["hand"], z: ["zoom"] };
  window.addEventListener("keydown", (e) => {
    const tag = document.activeElement.tagName, typing = /INPUT|TEXTAREA|SELECT/.test(tag);
    if (!modal.hidden) { if (e.key === "Escape") closeModal(false); if (e.key === "Enter" && !typing && box.querySelector("[data-ok]")) box.querySelector("[data-ok]").click(); return; }
    if (typing) return;
    if (openMenu !== null && e.key === "Escape") return hideMenu();
    const k = e.key.toLowerCase(), ctrl = e.ctrlKey || e.metaKey;
    const run = (c) => { e.preventDefault(); PF.cmd(c); };
    if (ctrl) {
      if (k === "z") return run(e.shiftKey ? "redo" : "undo");
      if (k === "y") return run("redo");
      if (k === "n") return run(e.shiftKey ? "layer-new" : "new");
      if (k === "o") return run("open");
      if (k === "s") return run(e.shiftKey ? "save-as" : "save");
      if (k === "e") return run(e.shiftKey ? "export" : "layer-merge");
      if (k === "w") return run("close");
      if (k === "a") return run("select-all");
      if (k === "d") return run("deselect");
      if (k === "i" && e.shiftKey) return run("select-invert");
      if (k === "i" && e.altKey) return run("image-size");
      if (k === "c" && e.altKey) return run("canvas-size");
      if (k === "c") return run(e.shiftKey ? "copy-merged" : "copy");
      if (k === "x") return run("cut");
      if (k === "v") return run("paste");
      if (k === "j") return run("layer-dup");
      if (k === "t") return run("transform");
      if (k === "0") return run("zoom-fit");
      if (k === "1") return run("zoom-100");
      if (k === "2") return run("zoom-200");
      if (k === "=" || k === "+") return run("zoom-in");
      if (k === "-") return run("zoom-out");
      if (k === "]") return run("layer-up");
      if (k === "[") return run("layer-down");
      if (k === "backspace") return run("fill-bg");
      return;
    }
    const t = PF.tools[S.tool];
    if (t && t.onKey && doc() && t.onKey(e)) { e.preventDefault(); return; }
    if (e.altKey && k === "backspace") return run("fill-fg");
    if (k === "delete" || k === "backspace") return run("clear");
    if (k === "escape") { if (doc() && doc().selection) run("deselect"); return; }
    if (k === "x") return run("swap-colors");
    if (k === "d") return run("reset-colors");
    if (k === "[" || k === "]") {
      const grp = ["brush", "eraser", "clone"].includes(S.tool) ? S.tool : null;
      if (grp) { const s = S[grp].size, step = s < 10 ? 1 : s < 50 ? 5 : s < 200 ? 10 : 25; S[grp].size = clamp(s + (k === "]" ? step : -step), 1, 2000); renderOptions(); PF.requestRender(); }
      return;
    }
    const list = TOOL_KEYS[k];
    if (list && !e.altKey) { e.preventDefault(); const i = list.indexOf(S.tool); selectTool(list[i >= 0 ? (i + 1) % list.length : 0]); }
  });
  // colar com Ctrl+V também funciona quando a imagem vem de um arquivo copiado no Explorer
  document.addEventListener("paste", (e) => {
    if (/INPUT|TEXTAREA/.test(document.activeElement.tagName)) return;
    const f = [...(e.clipboardData && e.clipboardData.files || [])].find((x) => /^image\//.test(x.type));
    if (f) { e.preventDefault(); io.openFile(f).catch((err) => PF.toast(err.message, "err")); }
  });

  // ---------------------------------------------------------------- início
  (async () => {
    const prefs = await PF.call("prefs").catch(() => ({}));
    for (const k of PREF_KEYS) if (prefs[k] != null) S[k] = typeof S[k] === "object" && !Array.isArray(S[k]) ? { ...S[k], ...prefs[k] } : prefs[k];
    if (prefs.exportPrefs) S.exportPrefs = prefs.exportPrefs;
    if (prefs.tool && PF.tools[prefs.tool]) S.tool = prefs.tool;
    renderToolbar(); renderOptions(); renderColor(); colorsChanged();
    const feats = await PF.call("hub-features").catch(() => ({}));
    hubLib = !!(feats && feats.library);
    // chegou de outro módulo ("Abrir no Piphin Foto")
    piphin.on("open-file", async (r) => { try { await io.openLoaded(r); PF.toast(`"${r.name}" chegou do ${r.from || "Hub"}`, "ok"); } catch (e) { PF.toast(e.message, "err"); } });
    PF.emit("doc", null);
    piphin.invoke("ui-ready");
  })();
})();
