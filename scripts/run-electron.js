// Roda um script com o Electron do Piphin Hub (..\Hub\node_modules\electron), sem instalar outro aqui.
const path = require("path");
const fs = require("fs");
const { spawnSync } = require("child_process");
const exe = [path.join(__dirname, "..", "node_modules", "electron", "dist", "electron.exe"), path.join(__dirname, "..", "..", "Hub", "node_modules", "electron", "dist", "electron.exe")].find((f) => fs.existsSync(f));
if (!exe) throw new Error("Electron não encontrado (rode npm install no Piphin Hub)");
const r = spawnSync(exe, [path.resolve(process.argv[2])], { stdio: "inherit" });
process.exit(r.status || 0);
