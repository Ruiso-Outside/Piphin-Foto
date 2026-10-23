// Gera dist/piphin-module-foto-<versão>.zip: o Piphin Foto como módulo do Piphin Hub.
const fs = require("fs");
const path = require("path");
const { execFileSync } = require("child_process");

const root = path.join(__dirname, "..");
const pkg = require(path.join(root, "package.json"));
const stage = path.join(root, "dist", "module-stage");
const out = path.join(root, "dist", `piphin-module-foto-${pkg.version}.zip`);

fs.rmSync(stage, { recursive: true, force: true });
fs.mkdirSync(path.join(stage, "icons"), { recursive: true });
const manifest = JSON.parse(fs.readFileSync(path.join(root, "module", "module.json"), "utf8"));
manifest.version = pkg.version;
fs.writeFileSync(path.join(stage, "module.json"), JSON.stringify(manifest, null, 2));
fs.copyFileSync(path.join(root, "module", "backend.js"), path.join(stage, "backend.js"));
fs.cpSync(path.join(root, "web"), path.join(stage, "web"), { recursive: true });
// traduções (o Hub aplica na tela e nos avisos); source.jsonl e config.json ficam de fora
fs.cpSync(path.join(root, "i18n"), path.join(stage, "i18n"), { recursive: true, filter: (src) => !/\.jsonl$|config\.json$/.test(src) });
fs.copyFileSync(path.join(root, "icons", "foto.png"), path.join(stage, "icons", "foto.png"));

fs.rmSync(out, { force: true });
const tar = path.join(process.env.SystemRoot || "C:\Windows", "System32", "tar.exe");
execFileSync(tar, ["-a", "-c", "-f", out, "-C", stage, "."], { stdio: "inherit" });
fs.rmSync(stage, { recursive: true, force: true });
console.log("módulo:", out, `(${(fs.statSync(out).size / 1024).toFixed(0)} KB)`);
