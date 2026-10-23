// Gera web/icons.css: os ícones do editor (Lucide, licença ISC) no mesmo formato do Piphin UI (<i class="i i-brush">).
// O kit do Hub só traz os ícones do próprio Hub; o editor precisa de vários outros (pincel, laço, balde...).
// Usa o lucide-static do Piphin Hub (..\Hub\node_modules) ou deste projeto, se instalado.
const fs = require("fs");
const path = require("path");

const roots = [path.join(__dirname, "..", "node_modules", "lucide-static"), path.join(__dirname, "..", "..", "Hub", "node_modules", "lucide-static")];
const LUCIDE = roots.find((r) => fs.existsSync(path.join(r, "icons")));
if (!LUCIDE) throw new Error("lucide-static não encontrado (rode npm install no Piphin Hub ou aqui)");
const OUT = path.join(__dirname, "..", "web", "icons.css");

const NAMES = `
mouse-pointer-2 move square-dashed circle-dashed lasso wand-sparkles crop brush pencil eraser paint-bucket blend pipette type shapes
square circle triangle minus slash stamp hand zoom-in zoom-out maximize scan undo-2 redo-2 history layers plus copy trash-2 eye eye-off lock
lock-open merge arrow-up arrow-down chevron-down chevron-right chevron-up image image-plus folder-open save download upload file-plus
file-image sliders-horizontal sun contrast palette droplet droplets thermometer-sun aperture sparkles wand flip-horizontal-2
flip-vertical-2 rotate-cw rotate-ccw scaling expand shrink grid-3x3 sun-moon swords waves ruler x check settings
repeat-2 arrow-left-right ellipsis-vertical keyboard info clipboard-paste scissors square-dashed-mouse-pointer bold italic
align-left align-center align-right text-cursor-input spline highlighter focus frame pipette bot layout-grid star clock library
link unlink crosshair folder folder-plus folder-input images pencil-line panel-bottom-close panel-bottom-open archive package-open
`.split(/\s+/).filter(Boolean);

const css = [`/* Piphin Foto · ícones (Lucide ${require(path.join(LUCIDE, "package.json")).version}, ISC) · gerado por scripts/make-icons.js */`,
  `.i { display: inline-block; width: 1.15em; height: 1.15em; flex: none; vertical-align: -0.2em; background: currentColor;`,
  `  -webkit-mask: var(--i) center / contain no-repeat; mask: var(--i) center / contain no-repeat; }`];
const missing = [];
for (const name of [...new Set(NAMES)]) {
  const file = path.join(LUCIDE, "icons", name + ".svg");
  if (!fs.existsSync(file)) { missing.push(name); continue; }
  const svg = fs.readFileSync(file, "utf8").replace(/<!--[\s\S]*?-->/g, "").replace(/\s*class="[^"]*"/, "")
    .replace(/stroke="currentColor"/, 'stroke="#000"').replace(/\s+/g, " ").trim();
  css.push(`.i-${name} { --i: url("data:image/svg+xml,${encodeURIComponent(svg).replace(/'/g, "%27")}"); }`);
}
fs.writeFileSync(OUT, css.join("\n") + "\n");
console.log(`ícones: ${new Set(NAMES).size - missing.length} em ${path.relative(process.cwd(), OUT)}` + (missing.length ? ` · faltam no Lucide: ${missing.join(", ")}` : ""));
