// Piphin Foto · inventário: barra embaixo da imagem com as imagens já usadas (abertas, coladas, exportadas ou guardadas),
// organizadas em pastas. Clique põe a imagem como camada nova (ou abre, sem imagem aberta); arrastar solta no ponto
// escolhido ou move para uma pasta. As teclas 1 a 9 usam os primeiros espaços, como numa barra de jogo.
"use strict";
(() => {
  const S = PF.state, io = PF.io, call = PF.call;
  const bar = $("#hotbar");
  const MIME = "application/x-piphin-inv";
  let data = { folders: [], items: [] }, tab = "recent", order = [], collapsed = false, auto = true;
  let fromInv = false; // a imagem veio do inventário: não guarda de novo
  const cache = new Map(); // id -> canvas (as últimas usadas)
  const item = (id) => data.items.find((x) => x.id === id);
  const folder = (id) => data.folders.find((f) => f.id === id);

  // ---------------------------------------------------------------- guardar
  const toBytes = (c, type, q) => new Promise((resolve, reject) => c.toBlob(async (b) => (b ? resolve(new Uint8Array(await b.arrayBuffer())) : reject(new Error("Não foi possível guardar a imagem"))), type, q));
  async function pack(c) {
    const MAX = 8192;
    if (Math.max(c.width, c.height) > MAX) {
      const k = MAX / Math.max(c.width, c.height), s = PF.canvas(c.width * k, c.height * k), g = PF.g(s);
      g.imageSmoothingQuality = "high"; g.drawImage(c, 0, 0, s.width, s.height); c = s;
    }
    const k = Math.min(1, 144 / Math.max(c.width, c.height)), t = PF.canvas(c.width * k, c.height * k), tg = PF.g(t);
    tg.imageSmoothingQuality = "high"; tg.drawImage(c, 0, 0, t.width, t.height);
    return { bytes: await toBytes(c, "image/png"), thumb: await toBytes(t, "image/webp", 0.85), w: c.width, h: c.height };
  }
  // só a parte visível de um canvas (camadas são do tamanho da imagem inteira)
  function trimmed(c) {
    const b = PF.maskBounds(c, 0);
    if (b.w <= 0) return null;
    if (b.w === c.width && b.h === c.height) return c;
    const out = PF.canvas(b.w, b.h);
    PF.g(out).drawImage(c, -b.x, -b.y);
    return out;
  }
  async function store(c, name, { into = null, isAuto = false } = {}) {
    const it = await call("inv-add", { ...(await pack(c)), name, folder: into, auto: isAuto });
    const old = item(it.id);
    if (old) Object.assign(old, it); else { data.items.unshift(it); order.unshift(it.id); }
    render();
    return it;
  }
  // as automáticas entram uma por vez, sem travar a edição
  let queue = Promise.resolve();
  function autoStore(c, name) {
    if (!auto || fromInv || !c || c.width < 2 || c.height < 2) return;
    const copy = PF.clone(c); // a original pode mudar depois
    queue = queue.then(() => store(copy, name, { isAuto: true })).catch((e) => console.warn("inventário:", e.message));
  }
  const currentFolder = () => (tab !== "recent" && folder(tab) ? tab : null);
  async function saveLayer() {
    const d = S.doc; if (!d) throw new Error("Abra uma imagem primeiro");
    const l = d.active, p = PF.ops.placedOf(l);
    const c = p ? p.img : trimmed(l.canvas);
    if (!c) throw new Error("A camada ativa está vazia");
    const it = await store(c, l.name.replace(/^T · /, ""), { into: currentFolder() });
    PF.toast(`"${it.name}" guardada no inventário`, "ok");
  }
  async function saveImage() {
    const d = S.doc; if (!d) throw new Error("Abra uma imagem primeiro");
    const it = await store(d.composite({ fresh: true }), d.name, { into: currentFolder() });
    PF.toast(`"${it.name}" guardada no inventário`, "ok");
  }
  async function importFiles(files) {
    let n = 0;
    for (const f of files) {
      try {
        const c = f instanceof File ? await fileCanvas(f) : io.imgToCanvas(await io.loadImg(`data:${f.mime};base64,${f.data}`));
        await store(c, (f.name || "Imagem").replace(/\.[^.]+$/, ""), { into: currentFolder() }); n++;
      } catch (e) { PF.toast(e.message, "err"); }
    }
    if (n) PF.toast(n === 1 ? "1 imagem adicionada ao inventário" : `${n} imagens adicionadas ao inventário`, "ok");
  }
  async function fileCanvas(f) {
    if (!/^image\//.test(f.type)) throw new Error("Isso não parece uma imagem: " + f.name);
    const url = URL.createObjectURL(f);
    try { return io.imgToCanvas(await io.loadImg(url)); } finally { URL.revokeObjectURL(url); }
  }

  // ---------------------------------------------------------------- usar
  async function canvasOf(id) {
    if (cache.has(id)) { const c = cache.get(id); cache.delete(id); cache.set(id, c); call("inv-touch", id).catch(() => {}); return c; }
    const r = await call("inv-get", id);
    const c = io.imgToCanvas(await io.loadImg(`data:${r.mime};base64,${r.data}`));
    cache.set(id, c);
    if (cache.size > 12) cache.delete(cache.keys().next().value);
    return c;
  }
  // at = { cx, cy }: centro da imagem nesse ponto (arrastada para a tela)
  async function use(id, at = null) {
    const it = item(id); if (!it) return;
    try {
      const c = await canvasOf(id);
      fromInv = true;
      if (S.doc) io.place(c, it.name, at); else await io.fromImageCanvas(PF.clone(c), it.name, null);
      it.usedAt = Date.now();
    } catch (e) { PF.toast(e.message, "err"); } finally { fromInv = false; }
  }
  async function openNew(id) {
    const it = item(id); if (!it) return;
    try { fromInv = true; await io.fromImageCanvas(PF.clone(await canvasOf(id)), it.name, null); } catch (e) { PF.toast(e.message, "err"); } finally { fromInv = false; }
  }

  // ---------------------------------------------------------------- organizar
  async function moveTo(id, into) {
    const it = item(id); if (!it || (it.folder || null) === (into || null)) return;
    Object.assign(it, await call("inv-update", { id, folder: into || null }));
    if (tab !== "recent") order = order.filter((x) => x !== id || into === tab);
    render();
    PF.toast(into ? `Movida para "${folder(into).name}"` : "Tirada da pasta", "ok");
  }
  async function rename(id) {
    const it = item(id); if (!it) return;
    const n = await PF.prompt("Renomear imagem", "Nome", it.name);
    if (n) { Object.assign(it, await call("inv-update", { id, name: n })); render(); }
  }
  async function remove(id) {
    const it = item(id); if (!it) return;
    if (await PF.confirm(`Remover "${it.name}" do inventário?`, "A imagem sai só do inventário. Os arquivos no seu PC e as imagens abertas não mudam.", ["Remover", "Cancelar"], true) !== 0) return;
    await call("inv-remove", id);
    data.items = data.items.filter((x) => x !== it); order = order.filter((x) => x !== id); cache.delete(id);
    render();
  }
  async function newFolder(thenMove = null) {
    const n = await PF.prompt("Nova pasta", "Nome da pasta", "");
    if (!n) return;
    const f = await call("folder-add", n);
    data.folders.push(f);
    if (thenMove) await moveTo(thenMove, f.id);
    setTab(f.id);
  }
  async function renameFolder(id) {
    const f = folder(id); if (!f) return;
    const n = await PF.prompt("Renomear pasta", "Nome da pasta", f.name);
    if (n) { Object.assign(f, await call("folder-rename", { id, name: n })); render(); }
  }
  async function removeFolder(id) {
    const f = folder(id); if (!f) return;
    if (await PF.confirm(`Apagar a pasta "${f.name}"?`, "As imagens dela não são apagadas: continuam em Recentes.", ["Apagar pasta", "Cancelar"], true) !== 0) return;
    await call("folder-remove", id);
    data.folders = data.folders.filter((x) => x !== f);
    for (const it of data.items) if (it.folder === id) it.folder = null;
    if (tab === id) tab = "recent";
    setTab(tab);
  }

  // ---------------------------------------------------------------- barra
  // a ordem só muda ao trocar de aba (clicar numa imagem não faz ela pular para o começo)
  function setTab(t) {
    tab = t === "recent" || folder(t) ? t : "recent";
    order = data.items.filter((x) => tab === "recent" || x.folder === tab).sort((a, b) => b.usedAt - a.usedAt).map((x) => x.id);
    render();
    PF.call("prefs", { invTab: tab }).catch(() => {});
  }
  const visible = () => order.map(item).filter((x) => x && (tab === "recent" || x.folder === tab));
  function render() {
    const list = visible(), count = (fid) => data.items.filter((x) => x.folder === fid).length;
    bar.classList.toggle("collapsed", collapsed);
    const tabs = `<button class="hb-tab ${tab === "recent" ? "on" : ""}" data-tab="recent" title="Todas as imagens, das usadas há menos tempo para as mais antigas"><i class="i i-clock"></i>Recentes<span class="n">${data.items.length}</span></button>`
      + data.folders.map((f) => `<button class="hb-tab ${tab === f.id ? "on" : ""}" data-tab="${f.id}" title="${esc(f.name)}"><i class="i i-folder"></i><span class="fn">${esc(f.name)}</span><span class="n">${count(f.id)}</span></button>`).join("")
      + `<button class="hb-tab add" data-hb="folder-add" title="Nova pasta"><i class="i i-folder-plus"></i></button>`;
    const slots = list.map((it, i) => `<button class="slot" draggable="true" data-id="${it.id}" title="${esc(it.name)} · ${it.w} × ${it.h} px">
        ${it.thumb ? `<img src="${it.thumb}" alt="">` : `<i class="i i-image"></i>`}${i < 9 ? `<b class="k">${i + 1}</b>` : ""}<span class="nm">${esc(it.name)}</span></button>`).join("");
    const empty = !list.length ? `<div class="hb-empty">${tab === "recent"
      ? "As imagens que você abrir, colar ou exportar aparecem aqui. Clique numa para pôr na imagem aberta ou arraste até o ponto onde quer."
      : "Pasta vazia. Arraste imagens de Recentes para cá, ou use “Guardar camada” com esta pasta aberta."}</div>` : "";
    const pad = Array.from({ length: Math.max(0, (list.length ? 12 : 6) - list.length) }, () => `<div class="slot empty"></div>`).join("");
    bar.innerHTML = `<div class="hb-head">
        <button class="hb-title" data-hb="toggle" title="${collapsed ? "Mostrar o inventário" : "Esconder o inventário"}"><i class="i i-archive"></i>Inventário<i class="i i-chevron-${collapsed ? "up" : "down"}"></i></button>
        <div class="hb-tabs">${tabs}</div>
        <div class="grow"></div>
        <button class="btn sm ghost" data-hb="save" title="${currentFolder() ? "Guardar a camada ativa nesta pasta" : "Guardar a camada ativa no inventário"}" ${S.doc ? "" : "disabled"}><i class="i i-archive"></i>Guardar camada</button>
        <button class="btn sm ghost icon" data-hb="import" title="Adicionar imagens do PC"><i class="i i-image-plus"></i></button>
        <button class="btn sm ghost icon" data-hb="more" title="Mais opções"><i class="i i-ellipsis-vertical"></i></button>
      </div>
      <div class="hb-slots">${empty}${slots}${pad}</div>`;
  }

  // ---------------------------------------------------------------- menu de contexto
  const pop = document.createElement("div");
  pop.className = "menu-pop"; pop.hidden = true;
  document.body.appendChild(pop);
  const hidePop = () => { pop.hidden = true; };
  // items: [label, icon, fn, { on, disabled }] ou "-" ou ["#", título]
  // above: abre para cima de y (botões da barra), com a borda direita em x
  function menu(x, y, items, above = false) {
    const fns = [];
    pop.innerHTML = items.map((it) => {
      if (it === "-") return `<div class="sep"></div>`;
      if (it[0] === "#") return `<div class="mh">${esc(it[1])}</div>`;
      fns.push(it[2]);
      const o = it[3] || {};
      return `<button class="mi" data-f="${fns.length - 1}" ${o.disabled ? "disabled" : ""}><i class="i i-${o.on ? "check" : it[1]}"></i>${esc(it[0])}</button>`;
    }).join("");
    pop.hidden = false;
    const r = pop.getBoundingClientRect();
    pop.style.left = Math.max(8, Math.min(above ? x - r.width : x, innerWidth - r.width - 8)) + "px";
    pop.style.top = Math.max(8, Math.min(above ? y - r.height - 6 : y, innerHeight - r.height - 8)) + "px";
    pop.onclick = (e) => { const b = e.target.closest("[data-f]"); if (!b || b.disabled) return; hidePop(); Promise.resolve(fns[b.dataset.f]()).catch((err) => PF.toast(err.message, "err")); };
  }
  document.addEventListener("mousedown", (e) => { if (!pop.hidden && !pop.contains(e.target)) hidePop(); });
  window.addEventListener("keydown", (e) => { if (e.key === "Escape" && !pop.hidden) { hidePop(); e.stopPropagation(); } }, true);
  window.addEventListener("blur", hidePop);

  function slotMenu(id, x, y) {
    const it = item(id); if (!it) return;
    menu(x, y, [
      [S.doc ? "Pôr na imagem (camada nova)" : "Abrir", S.doc ? "image-plus" : "folder-open", () => use(id)],
      ...(S.doc ? [["Abrir como imagem nova", "file-image", () => openNew(id)]] : []),
      "-", ["#", "Mover para a pasta"],
      ...data.folders.map((f) => [f.name, "folder", () => moveTo(id, f.id), { on: it.folder === f.id }]),
      ...(it.folder ? [["Tirar da pasta", "folder-input", () => moveTo(id, null)]] : []),
      ["Nova pasta...", "folder-plus", () => newFolder(id)],
      "-", ["Renomear...", "pencil", () => rename(id)], ["Remover do inventário", "trash-2", () => remove(id)],
    ]);
  }
  function moreMenu(x, y) { // abre para cima do botão
    menu(x, y, [
      ["Guardar sozinho o que eu abrir, colar ou exportar", "clock", () => { auto = !auto; render(); PF.call("prefs", { invAuto: auto }).catch(() => {}); }, { on: auto }],
      "-", ["Guardar camada ativa", "archive", saveLayer, { disabled: !S.doc }], ["Guardar imagem inteira", "images", saveImage, { disabled: !S.doc }],
      ["Adicionar imagens do PC...", "image-plus", async () => importFiles(await call("inv-pick-files"))],
      "-", ["Nova pasta...", "folder-plus", () => newFolder()],
    ], true);
  }

  // ---------------------------------------------------------------- eventos
  bar.addEventListener("click", (e) => {
    const s = e.target.closest(".slot[data-id]"), t = e.target.closest("[data-tab]"), b = e.target.closest("[data-hb]");
    if (s) return use(s.dataset.id);
    if (t) { if (collapsed) { collapsed = false; PF.call("prefs", { invCollapsed: false }).catch(() => {}); } return setTab(t.dataset.tab); }
    if (!b || b.disabled) return;
    const act = b.dataset.hb, r = b.getBoundingClientRect();
    if (act === "toggle") { collapsed = !collapsed; render(); PF.call("prefs", { invCollapsed: collapsed }).catch(() => {}); }
    else if (act === "folder-add") newFolder().catch((err) => PF.toast(err.message, "err"));
    else if (act === "save") saveLayer().catch((err) => PF.toast(err.message, "err"));
    else if (act === "import") call("inv-pick-files").then(importFiles).catch((err) => PF.toast(err.message, "err"));
    else if (act === "more") moreMenu(r.right, r.top);
  });
  bar.addEventListener("contextmenu", (e) => {
    e.preventDefault();
    const s = e.target.closest(".slot[data-id]"), t = e.target.closest("[data-tab]");
    if (s) slotMenu(s.dataset.id, e.clientX, e.clientY);
    else if (t && t.dataset.tab !== "recent") menu(e.clientX, e.clientY, [["Renomear pasta...", "pencil", () => renameFolder(t.dataset.tab)], ["Apagar pasta", "trash-2", () => removeFolder(t.dataset.tab)]]);
  });
  // a rodinha do mouse anda pela fila de imagens
  bar.addEventListener("wheel", (e) => { const row = e.target.closest(".hb-slots, .hb-tabs"); if (row && !e.shiftKey && Math.abs(e.deltaY) > Math.abs(e.deltaX)) { row.scrollLeft += e.deltaY; e.preventDefault(); } }, { passive: false });

  // arrastar: imagem -> tela (camada no ponto), imagem -> aba (mover para a pasta), arquivos do PC -> barra (guardar)
  bar.addEventListener("dragstart", (e) => {
    const s = e.target.closest(".slot[data-id]"); if (!s) return;
    e.dataTransfer.setData(MIME, s.dataset.id);
    e.dataTransfer.effectAllowed = "copyMove";
    const img = s.querySelector("img"); if (img) e.dataTransfer.setDragImage(img, img.width / 2, img.height / 2);
  });
  const has = (e, type) => [...(e.dataTransfer.types || [])].includes(type);
  bar.addEventListener("dragover", (e) => {
    const t = e.target.closest("[data-tab]");
    $$(".hb-tab.drop", bar).forEach((x) => x !== t && x.classList.remove("drop"));
    if (has(e, MIME) && t) { e.preventDefault(); e.dataTransfer.dropEffect = "move"; t.classList.add("drop"); }
    else if (has(e, "Files")) { e.preventDefault(); e.dataTransfer.dropEffect = "copy"; bar.classList.add("drop-files"); }
  });
  bar.addEventListener("dragleave", (e) => { if (!bar.contains(e.relatedTarget)) { bar.classList.remove("drop-files"); $$(".hb-tab.drop", bar).forEach((x) => x.classList.remove("drop")); } });
  bar.addEventListener("drop", (e) => {
    bar.classList.remove("drop-files");
    const t = e.target.closest("[data-tab]");
    $$(".hb-tab.drop", bar).forEach((x) => x.classList.remove("drop"));
    if (has(e, MIME)) { e.preventDefault(); e.piphinHandled = true; if (t) moveTo(e.dataTransfer.getData(MIME), t.dataset.tab === "recent" ? null : t.dataset.tab).catch((err) => PF.toast(err.message, "err")); return; }
    if (e.dataTransfer.files.length) { e.preventDefault(); e.piphinHandled = true; importFiles([...e.dataTransfer.files]); }
  });
  const stage = $("#stage");
  stage.addEventListener("dragover", (e) => { if (has(e, MIME)) { e.preventDefault(); e.dataTransfer.dropEffect = "copy"; } });
  stage.addEventListener("drop", (e) => {
    if (!has(e, MIME)) return;
    e.preventDefault(); e.piphinHandled = true;
    const id = e.dataTransfer.getData(MIME);
    let at = null;
    if (S.doc) { const r = PF.view.el.getBoundingClientRect(), p = PF.view.toDoc(e.clientX - r.left, e.clientY - r.top); at = { cx: p.x, cy: p.y }; }
    use(id, at);
  });

  // teclas 1 a 9: põe a imagem daquele espaço
  window.addEventListener("keydown", (e) => {
    if (!/^[1-9]$/.test(e.key) || e.ctrlKey || e.altKey || e.metaKey || !$("#modal").hidden) return;
    if (/INPUT|TEXTAREA|SELECT/.test(document.activeElement.tagName) || document.activeElement.isContentEditable) return;
    const it = visible()[Number(e.key) - 1];
    if (it) { e.preventDefault(); use(it.id); }
  });

  // o que entra sozinho
  PF.on("placed", ({ canvas, name }) => autoStore(canvas, name));
  PF.on("opened", ({ canvas, name }) => autoStore(canvas, name));
  PF.on("exported", (d) => autoStore(d.composite({ fresh: true }), d.name));
  PF.on("doc", () => render());

  PF.addCmd("inv-save-layer", saveLayer, { doc: true });
  PF.addCmd("inv-save-image", saveImage, { doc: true });

  (async () => {
    const prefs = await call("prefs").catch(() => ({}));
    auto = prefs.invAuto !== false; collapsed = !!prefs.invCollapsed;
    data = await call("inv-list").catch(() => ({ folders: [], items: [] }));
    tab = prefs.invTab || "recent";
    setTab(tab);
  })();
  render();
})();
