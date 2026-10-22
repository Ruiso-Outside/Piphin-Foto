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
  function load(file) {
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
    remember(file);
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

  for (const name of ["image_info", "adjust_image", "apply_filter", "transform_image", "crop_image", "add_text", "undo"])
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
