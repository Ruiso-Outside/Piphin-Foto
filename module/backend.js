// Piphin Foto como módulo do Piphin Hub. A edição toda acontece na tela (web/); aqui ficam os arquivos
// (abrir, salvar, recentes), a área de transferência e a ponte das ferramentas da IA (Piphin LLM).
// Com o Hub 1.7.0+: abre prints e imagens da Mídia do Hub, e as imagens exportadas aparecem lá.
const fs = require("fs");
const os = require("os");
const path = require("path");

const IMAGE_EXT = ["png", "jpg", "jpeg", "webp", "gif", "bmp", "ico", "avif"];
const MIME = { png: "image/png", jpg: "image/jpeg", jpeg: "image/jpeg", webp: "image/webp", gif: "image/gif", bmp: "image/bmp", ico: "image/x-icon", avif: "image/avif" };
const MAX_BYTES = 300 * 1024 * 1024;

exports.activate = (ctx) => {
  const RECENT_FILE = path.join(ctx.dataDir, "recent.json");
  const PREFS_FILE = path.join(ctx.dataDir, "prefs.json");
  const readJson = (f, d) => { try { return JSON.parse(fs.readFileSync(f, "utf8")); } catch { return d; } };
  let recent = readJson(RECENT_FILE, []);
  const exportDir = () => path.join(os.homedir(), "Pictures", "Piphin Foto");

  function remember(file) {
    recent = [file, ...recent.filter((f) => f.toLowerCase() !== file.toLowerCase())].slice(0, 12);
    try { fs.writeFileSync(RECENT_FILE, JSON.stringify(recent, null, 1)); } catch { /* sem disco */ }
  }

  // lê uma imagem ou projeto para a tela: { name, path, kind: "image" | "project", mime, data (base64) | project }
  function load(file, keep = true) {
    const ext = path.extname(file).slice(1).toLowerCase();
    const st = fs.statSync(file);
    if (st.size > MAX_BYTES) throw new Error("Arquivo grande demais (mais de 300 MB)");
    if (ext === "pfoto") {
      const project = JSON.parse(fs.readFileSync(file, "utf8"));
      if (!project || project.schema !== 1) throw new Error("Projeto do Piphin Foto inválido");
      remember(file);
      return { kind: "project", name: path.basename(file), path: file, project };
    }
    if (!IMAGE_EXT.includes(ext)) throw new Error("Formato não suportado: ." + ext);
    if (keep) remember(file);
    return { kind: "image", name: path.basename(file), path: file, mime: MIME[ext], data: fs.readFileSync(file).toString("base64") };
  }

  ctx.handle("open-dialog", async () => {
    const files = await ctx.host.openDialog({ title: "Abrir imagem", properties: ["openFile"],
      filters: [{ name: "Imagens e projetos", extensions: [...IMAGE_EXT, "pfoto"] }, { name: "Todos os arquivos", extensions: ["*"] }] });
    return files && files[0] ? load(files[0]) : null;
  });
  ctx.handle("open-path", (file) => load(String(file)));
  ctx.handle("recent", () => recent.filter((f) => fs.existsSync(f)).map((f) => ({ path: f, name: path.basename(f), dir: path.dirname(f) })));
  ctx.handle("forget-recent", (file) => { recent = recent.filter((f) => f !== file); fs.writeFileSync(RECENT_FILE, JSON.stringify(recent, null, 1)); return true; });

  // salvar: bytes vêm da tela (Uint8Array). Sem caminho, pergunta onde salvar.
  ctx.handle("save", async ({ bytes, text, path: file, suggested, format }) => {
    if (!file) {
      const filters = format === "pfoto" ? [{ name: "Projeto do Piphin Foto", extensions: ["pfoto"] }]
        : [{ name: format.toUpperCase(), extensions: format === "jpg" ? ["jpg", "jpeg"] : [format] }];
      fs.mkdirSync(exportDir(), { recursive: true });
      file = await ctx.host.saveDialog({ title: format === "pfoto" ? "Salvar projeto" : "Exportar imagem", defaultPath: path.join(exportDir(), suggested || "imagem." + format), filters });
      if (!file) return null;
    }
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, text != null ? text : Buffer.from(bytes));
    remember(file);
    if (format !== "pfoto") toLibrary(file);
    return { path: file, name: path.basename(file) };
  });
  ctx.handle("show-item", (file) => ctx.host.showItem(file));
  ctx.handle("clipboard", () => ctx.host.readClipboard());
  ctx.handle("prefs", (patch) => {
    let prefs = readJson(PREFS_FILE, {});
    if (patch) { prefs = { ...prefs, ...patch }; fs.writeFileSync(PREFS_FILE, JSON.stringify(prefs, null, 1)); }
    return prefs;
  });
  ctx.handle("export-dir", () => exportDir());

  // ---------------------------------------------------------------- inventário (imagens já usadas, com pastas)
  // dataDir/inventory: index.json + <id>.png (a imagem) + <id>.webp (miniatura). As que entram sozinhas (abrir, colar,
  // exportar) ficam até INV_AUTO_MAX; as que estão numa pasta só saem quando a pessoa remove.
  const INV_DIR = path.join(ctx.dataDir, "inventory");
  const INV_FILE = path.join(INV_DIR, "index.json");
  const INV_AUTO_MAX = 200;
  const crypto = require("crypto");
  let inv = readJson(INV_FILE, null);
  if (!inv || !Array.isArray(inv.items)) inv = { folders: [], items: [] };
  const newId = () => Date.now().toString(36) + crypto.randomBytes(3).toString("hex");
  const invPath = (id, ext) => path.join(INV_DIR, id + "." + ext);
  function invSave() {
    fs.mkdirSync(INV_DIR, { recursive: true });
    fs.writeFileSync(INV_FILE + ".tmp", JSON.stringify(inv, null, 1));
    fs.renameSync(INV_FILE + ".tmp", INV_FILE);
  }
  function invDrop(it) {
    inv.items = inv.items.filter((x) => x !== it);
    for (const ext of ["png", "webp"]) fs.rmSync(invPath(it.id, ext), { force: true });
  }
  const thumbOf = (it) => { try { return "data:image/webp;base64," + fs.readFileSync(invPath(it.id, "webp")).toString("base64"); } catch { return null; } };
  const pub = (it) => ({ id: it.id, name: it.name, w: it.w, h: it.h, folder: it.folder, addedAt: it.addedAt, usedAt: it.usedAt, thumb: thumbOf(it) });
  const findItem = (id) => { const it = inv.items.find((x) => x.id === id); if (!it) throw new Error("Imagem não encontrada no inventário"); return it; };
  const cleanName = (n, d) => String(n || "").replace(/[\r\n\t]/g, " ").trim().slice(0, 80) || d;

  ctx.handle("inv-list", () => ({ folders: inv.folders, items: [...inv.items].sort((a, b) => b.usedAt - a.usedAt).map(pub) }));
  // { bytes (png), thumb (webp), name, w, h, folder?, auto? } -> item. A mesma imagem não entra duas vezes: só volta para o começo.
  ctx.handle("inv-add", ({ bytes, thumb, name, w, h, folder = null, auto = false }) => {
    const buf = Buffer.from(bytes);
    if (!buf.length || buf.length > MAX_BYTES) throw new Error("Imagem grande demais para o inventário");
    const hash = crypto.createHash("sha1").update(buf).digest("hex");
    const now = Date.now();
    if (folder && !inv.folders.some((f) => f.id === folder)) folder = null;
    let it = inv.items.find((x) => x.hash === hash);
    if (it) {
      it.usedAt = now;
      if (folder) it.folder = folder;
      if (!auto && name) it.name = cleanName(name, it.name);
    } else {
      it = { id: newId(), name: cleanName(name, "Imagem"), w: Number(w) || 0, h: Number(h) || 0, folder, hash, addedAt: now, usedAt: now };
      fs.mkdirSync(INV_DIR, { recursive: true });
      fs.writeFileSync(invPath(it.id, "png"), buf);
      if (thumb) fs.writeFileSync(invPath(it.id, "webp"), Buffer.from(thumb));
      inv.items.push(it);
      // as automáticas mais antigas saem quando passam do limite
      const loose = inv.items.filter((x) => !x.folder).sort((a, b) => b.usedAt - a.usedAt);
      for (const old of loose.slice(INV_AUTO_MAX)) invDrop(old);
    }
    invSave();
    return pub(it);
  });
  ctx.handle("inv-get", (id) => {
    const it = findItem(id);
    it.usedAt = Date.now(); invSave();
    return { id: it.id, name: it.name, mime: "image/png", data: fs.readFileSync(invPath(it.id, "png")).toString("base64") };
  });
  ctx.handle("inv-touch", (id) => { findItem(id).usedAt = Date.now(); invSave(); return true; });
  ctx.handle("inv-update", ({ id, name, folder }) => {
    const it = findItem(id);
    if (name !== undefined) it.name = cleanName(name, it.name);
    if (folder !== undefined) it.folder = folder && inv.folders.some((f) => f.id === folder) ? folder : null;
    invSave();
    return pub(it);
  });
  ctx.handle("inv-remove", (id) => { invDrop(findItem(id)); invSave(); return true; });
  ctx.handle("folder-add", (name) => {
    const f = { id: newId(), name: cleanName(name, "Pasta") };
    inv.folders.push(f); invSave();
    return f;
  });
  ctx.handle("folder-rename", ({ id, name }) => {
    const f = inv.folders.find((x) => x.id === id);
    if (!f) throw new Error("Pasta não encontrada");
    f.name = cleanName(name, f.name); invSave();
    return f;
  });
  // apagar a pasta não apaga as imagens: elas voltam para "Recentes"
  ctx.handle("folder-remove", (id) => {
    inv.folders = inv.folders.filter((f) => f.id !== id);
    for (const it of inv.items) if (it.folder === id) it.folder = null;
    invSave();
    return true;
  });
  // escolher arquivos do PC para guardar (vários de uma vez)
  ctx.handle("inv-pick-files", async () => {
    const files = await ctx.host.openDialog({ title: "Adicionar ao inventário", properties: ["openFile", "multiSelections"],
      filters: [{ name: "Imagens", extensions: IMAGE_EXT }] });
    return (files || []).slice(0, 50).map((f) => { try { return load(f, false); } catch { return null; } }).filter(Boolean);
  });

  // ---------------------------------------------------------------- Mídia do Hub (no Hub antigo, ctx.host.library não existe)
  const lib = ctx.host.library || null;
  // imagem exportada (pela tela ou pela IA) aparece na Mídia
  const toLibrary = (file) => {
    if (lib) lib.add({ path: file, kind: "image", title: path.basename(file).replace(/\.[^.]+$/, ""), sub: "Imagem editada" }).catch((e) => ctx.log("mídia", e));
  };
  ctx.handle("hub-features", () => ({ library: !!lib }));
  ctx.handle("library-pick", async () => {
    if (!lib) throw new Error("Atualize o Piphin Hub para usar a Mídia");
    const [it] = await lib.pick({ kinds: ["image"], multi: false, title: "Abrir da Mídia" });
    return it ? load(it.path) : null;
  });
  // "Abrir no Piphin Foto" de outro módulo (ex.: um print do Piphin Captura)
  ctx.host.on("open-file", async (f) => {
    try {
      const r = load(f.path);
      if (!uiReady) {
        await ctx.host.focus().catch(() => {});
        await new Promise((resolve) => { readyWaiters.push(resolve); setTimeout(resolve, 20000); });
      }
      ctx.emit("open-file", { ...r, from: f.fromName });
    } catch (e) { ctx.log("abrir arquivo", e); }
  });

  // ---------------------------------------------------------------- ferramentas para a IA (module.json "tools")
  // A edição vive na tela: o pedido vai para ela (abre o módulo no Hub se preciso) e a resposta volta por "ai-reply".
  let uiReady = false, readyWaiters = [];
  const pending = new Map();
  let seq = 0;
  ctx.handle("ui-ready", () => { uiReady = true; readyWaiters.splice(0).forEach((f) => f()); return true; });
  ctx.handle("ai-reply", (id, ok, data) => {
    const p = pending.get(id);
    if (p) { pending.delete(id); ok ? p.resolve(data) : p.reject(new Error(data)); }
    return true;
  });
  async function ensureUi() {
    if (uiReady) return;
    await ctx.host.focus().catch(() => {}); // mostra o Piphin Foto no Hub (carrega a tela)
    await new Promise((resolve, reject) => {
      const t = setTimeout(() => reject(new Error("A tela do Piphin Foto não abriu")), 20000);
      readyWaiters.push(() => { clearTimeout(t); resolve(); });
    });
  }
  async function toUi(name, args) {
    await ensureUi();
    const id = ++seq;
    return new Promise((resolve, reject) => {
      const t = setTimeout(() => { pending.delete(id); reject(new Error("O Piphin Foto não respondeu")); }, 120000);
      pending.set(id, { resolve: (v) => { clearTimeout(t); resolve(v); }, reject: (e) => { clearTimeout(t); reject(e); } });
      ctx.emit("ai-call", { id, name, args: args || {} });
    });
  }
  // a tela foi recarregada ou fechada: pedidos em andamento falham e a próxima chamada espera ela de novo
  ctx.handle("ui-unload", () => { uiReady = false; for (const p of pending.values()) p.reject(new Error("A tela do Piphin Foto foi fechada")); pending.clear(); return true; });

  for (const name of ["image_info", "adjust_image", "apply_filter", "transform_image", "crop_image", "add_text", "add_qr_code", "undo"])
    ctx.handle("tool:" + name, (args) => toUi(name, args));
  ctx.handle("tool:open_image", async (args) => {
    const file = String((args && args.path) || "");
    if (!file || !fs.existsSync(file)) throw new Error("Arquivo não encontrado: " + file);
    return toUi("open_image", { file: load(file) });
  });
  ctx.handle("tool:export_image", async (args = {}) => {
    const format = ["png", "jpg", "webp"].includes(args.format) ? args.format : "png";
    const res = await toUi("export_image", { format, quality: args.quality });
    let file = args.path ? String(args.path) : path.join(exportDir(), res.suggested.replace(/\.[^.]+$/, "") + "." + format);
    if (path.extname(file).toLowerCase() !== "." + format && !(format === "jpg" && /\.jpe?g$/i.test(file))) file += "." + format;
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, Buffer.from(res.bytes));
    remember(file);
    toLibrary(file);
    ctx.host.notify("Piphin Foto", "A IA salvou a imagem em " + file).catch(() => {});
    return { saved: file, width: res.width, height: res.height };
  });
};
