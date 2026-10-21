// Desenha o ícone do Piphin Foto: icons/foto.png (256). Uso: npm run icon (usa o Electron do Piphin Hub).
const { app, BrowserWindow } = require("electron");
const fs = require("fs");
const path = require("path");

app.whenReady().then(async () => {
  const win = new BrowserWindow({ show: false, webPreferences: { offscreen: true } });
  await win.loadURL("about:blank");
  const b64 = await win.webContents.executeJavaScript(`(() => {
    const s = 256, c = document.createElement("canvas"); c.width = c.height = s;
    const g = c.getContext("2d");
    // fundo escuro arredondado com borda neon
    g.beginPath(); g.roundRect(8, 8, 240, 240, 56);
    const bg = g.createLinearGradient(0, 0, s, s); bg.addColorStop(0, "#2a1530"); bg.addColorStop(1, "#0b0a12");
    g.fillStyle = bg; g.fill();
    g.lineWidth = 3; g.strokeStyle = "rgba(251,146,60,.55)"; g.stroke();
    // moldura da foto
    const grad = g.createLinearGradient(52, 60, 204, 196); grad.addColorStop(0, "#fb923c"); grad.addColorStop(.55, "#f472b6"); grad.addColorStop(1, "#a855f7");
    g.save(); g.shadowColor = "#fb7185"; g.shadowBlur = 22;
    g.beginPath(); g.roundRect(50, 62, 156, 132, 22); g.lineWidth = 12; g.strokeStyle = grad; g.stroke();
    g.restore();
    // montanhas e sol dentro da moldura
    g.save(); g.beginPath(); g.roundRect(56, 68, 144, 120, 16); g.clip();
    g.beginPath(); g.moveTo(56, 188); g.lineTo(104, 128); g.lineTo(134, 160); g.lineTo(160, 136); g.lineTo(200, 188); g.closePath();
    const m = g.createLinearGradient(0, 128, 0, 188); m.addColorStop(0, "#f472b6"); m.addColorStop(1, "#7c3aed"); g.fillStyle = m; g.fill();
    g.beginPath(); g.arc(160, 100, 15, 0, Math.PI * 2); g.fillStyle = "#fde68a"; g.shadowColor = "#fbbf24"; g.shadowBlur = 16; g.fill();
    g.restore();
    // pincel cruzando o canto
    g.save(); g.translate(196, 196); g.rotate(-Math.PI / 4);
    g.shadowColor = "#fb923c"; g.shadowBlur = 14;
    g.fillStyle = "#fff7ed"; g.beginPath(); g.roundRect(-7, -58, 14, 46, 6); g.fill();
    g.fillStyle = "#fb923c"; g.beginPath(); g.moveTo(-9, -12); g.lineTo(9, -12); g.lineTo(5, 10); g.quadraticCurveTo(0, 22, -5, 10); g.closePath(); g.fill();
    g.restore();
    return c.toDataURL("image/png").split(",")[1];
  })()`);
  fs.mkdirSync(path.join(__dirname, "..", "icons"), { recursive: true });
  fs.writeFileSync(path.join(__dirname, "..", "icons", "foto.png"), Buffer.from(b64, "base64"));
  console.log("ícone: icons/foto.png");
  app.quit();
});
