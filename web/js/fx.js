// Piphin Foto · ajustes e filtros. Cada função recebe o canvas da camada e devolve um canvas novo do mesmo tamanho.
// Os filtros do próprio navegador (ctx.filter: brilho, contraste, saturação, desfoque...) rodam na placa de vídeo;
// os outros mexem pixel a pixel.
"use strict";
PF.fx = {};

// aplica um filtro do navegador (CSS) desenhando a camada por cima
PF.fx.css = (src, filter) => {
  const c = PF.canvas(src.width, src.height), g = PF.g(c);
  g.filter = filter || "none";
  g.drawImage(src, 0, 0);
  return c;
};

// desfoque sem escurecer as bordas: estende as beiradas da imagem antes de desfocar
PF.fx.blurCanvas = (src, radius) => {
  if (radius <= 0) return PF.clone(src);
  const w = src.width, h = src.height, pad = Math.ceil(radius * 3) + 2;
  const big = PF.canvas(w + pad * 2, h + pad * 2), g = PF.g(big);
  g.imageSmoothingEnabled = false;
  g.drawImage(src, pad, pad);
  g.drawImage(src, 0, 0, 1, h, 0, pad, pad, h);                 // esquerda
  g.drawImage(src, w - 1, 0, 1, h, pad + w, pad, pad, h);       // direita
  g.drawImage(src, 0, 0, w, 1, pad, 0, w, pad);                 // topo
  g.drawImage(src, 0, h - 1, w, 1, pad, pad + h, w, pad);       // base
  g.drawImage(src, 0, 0, 1, 1, 0, 0, pad, pad);                 // cantos
  g.drawImage(src, w - 1, 0, 1, 1, pad + w, 0, pad, pad);
  g.drawImage(src, 0, h - 1, 1, 1, 0, pad + h, pad, pad);
  g.drawImage(src, w - 1, h - 1, 1, 1, pad + w, pad + h, pad, pad);
  const out = PF.canvas(w, h), og = PF.g(out);
  og.filter = `blur(${radius}px)`;
  og.drawImage(big, -pad, -pad);
  // a transparência original continua (um PNG recortado não ganha "fundo" borrado)
  og.filter = "none";
  return out;
};

// percorre os pixels: fn(r, g, b, a, i) devolve [r, g, b] (ou nada para manter)
PF.fx.map = (src, fn) => {
  const c = PF.clone(src), g = c.getContext("2d", { willReadFrequently: true });
  const img = g.getImageData(0, 0, c.width, c.height), d = img.data;
  for (let i = 0; i < d.length; i += 4) {
    if (d[i + 3] === 0) continue;
    const o = fn(d[i], d[i + 1], d[i + 2], d[i + 3], i);
    if (o) { d[i] = o[0]; d[i + 1] = o[1]; d[i + 2] = o[2]; }
  }
  g.putImageData(img, 0, 0);
  return c;
};
const lum = (r, g, b) => 0.2126 * r + 0.7152 * g + 0.0722 * b;

// ------------------------------------------------------------------ ajustes
PF.fx.brightnessContrast = (src, { brightness = 0, contrast = 0 }) =>
  PF.fx.css(src, `brightness(${1 + brightness / 100}) contrast(${Math.max(0, 1 + contrast / 100)})`);

PF.fx.hueSaturation = (src, { hue = 0, saturation = 0, lightness = 0 }) => {
  let c = PF.fx.css(src, `hue-rotate(${hue}deg) saturate(${Math.max(0, 1 + saturation / 100)})`);
  if (lightness) {
    const k = lightness / 100;
    c = PF.fx.map(c, (r, g, b) => (k > 0 ? [r + (255 - r) * k, g + (255 - g) * k, b + (255 - b) * k] : [r * (1 + k), g * (1 + k), b * (1 + k)]));
  }
  return c;
};

PF.fx.exposure = (src, { exposure = 0, gamma = 0 }) => {
  const m = Math.pow(2, exposure / 50), gm = 1 / Math.max(0.1, 1 + gamma / 100);
  const lut = new Uint8ClampedArray(256);
  for (let v = 0; v < 256; v++) lut[v] = 255 * Math.pow(Math.min(1, (v / 255) * m), gm);
  return PF.fx.map(src, (r, g, b) => [lut[r], lut[g], lut[b]]);
};

PF.fx.temperature = (src, { temperature = 0, tint = 0 }) => {
  const t = temperature / 100, n = tint / 100;
  return PF.fx.map(src, (r, g, b) => [r + 40 * t, g + 25 * n + 8 * t, b - 40 * t]);
};

PF.fx.vibrance = (src, { vibrance = 0 }) => {
  const k = vibrance / 100;
  // reforça mais as cores apagadas do que as já saturadas (pele não fica laranja)
  return PF.fx.map(src, (r, g, b) => {
    const mx = Math.max(r, g, b), mn = Math.min(r, g, b), sat = mx ? (mx - mn) / mx : 0, l = lum(r, g, b);
    const f = 1 + k * (1 - sat) * 1.5;
    return [l + (r - l) * f, l + (g - l) * f, l + (b - l) * f];
  });
};

PF.fx.levels = (src, { inBlack = 0, inWhite = 255, gamma = 1, outBlack = 0, outWhite = 255 }) => {
  const lut = new Uint8ClampedArray(256), span = Math.max(1, inWhite - inBlack);
  for (let v = 0; v < 256; v++) lut[v] = outBlack + (outWhite - outBlack) * Math.pow(clamp((v - inBlack) / span, 0, 1), 1 / Math.max(0.01, gamma));
  return PF.fx.map(src, (r, g, b) => [lut[r], lut[g], lut[b]]);
};

// níveis automáticos: estica do pixel mais escuro ao mais claro (ignorando 0,5% em cada ponta)
PF.fx.autoLevels = (src) => {
  const d = PF.pixels(src).data, hist = new Uint32Array(256);
  let n = 0;
  for (let i = 0; i < d.length; i += 4) if (d[i + 3]) { hist[Math.round(lum(d[i], d[i + 1], d[i + 2]))]++; n++; }
  const cut = n * 0.005;
  let lo = 0, hi = 255, acc = 0;
  for (; lo < 255 && (acc += hist[lo]) < cut; lo++);
  acc = 0;
  for (; hi > 0 && (acc += hist[hi]) < cut; hi--);
  return hi - lo < 10 ? PF.clone(src) : PF.fx.levels(src, { inBlack: lo, inWhite: hi });
};

PF.fx.grayscale = (src) => PF.fx.map(src, (r, g, b) => { const v = lum(r, g, b); return [v, v, v]; });
PF.fx.sepia = (src, { amount = 100 } = {}) => PF.fx.css(src, `sepia(${amount / 100})`);
PF.fx.invert = (src) => PF.fx.map(src, (r, g, b) => [255 - r, 255 - g, 255 - b]);
PF.fx.threshold = (src, { level = 128 }) => PF.fx.map(src, (r, g, b) => { const v = lum(r, g, b) >= level ? 255 : 0; return [v, v, v]; });
PF.fx.posterize = (src, { levels = 4 }) => {
  const n = clamp(Math.round(levels), 2, 64), step = 255 / (n - 1);
  return PF.fx.map(src, (r, g, b) => [Math.round(r / step) * step, Math.round(g / step) * step, Math.round(b / step) * step]);
};

// ------------------------------------------------------------------ filtros
PF.fx.blur = (src, { radius = 4 }) => PF.fx.blurCanvas(src, radius);

PF.fx.sharpen = (src, { amount = 50, radius = 1.5 }) => {
  const blur = PF.pixels(PF.fx.blurCanvas(src, radius)).data, k = amount / 40;
  const c = PF.clone(src), g = c.getContext("2d", { willReadFrequently: true });
  const img = g.getImageData(0, 0, c.width, c.height), d = img.data;
  for (let i = 0; i < d.length; i += 4) {
    d[i] = d[i] + (d[i] - blur[i]) * k; d[i + 1] = d[i + 1] + (d[i + 1] - blur[i + 1]) * k; d[i + 2] = d[i + 2] + (d[i + 2] - blur[i + 2]) * k;
  }
  g.putImageData(img, 0, 0);
  return c;
};

PF.fx.noise = (src, { amount = 20, mono = true }) => {
  const a = amount * 1.6;
  return PF.fx.map(src, (r, g, b) => {
    if (mono) { const n = (Math.random() - 0.5) * a; return [r + n, g + n, b + n]; }
    return [r + (Math.random() - 0.5) * a, g + (Math.random() - 0.5) * a, b + (Math.random() - 0.5) * a];
  });
};

PF.fx.pixelate = (src, { size = 12 }) => {
  const s = Math.max(2, Math.round(size)), w = src.width, h = src.height;
  const small = PF.canvas(Math.ceil(w / s), Math.ceil(h / s)), sg = PF.g(small);
  sg.imageSmoothingQuality = "high";
  sg.drawImage(src, 0, 0, small.width, small.height);
  const c = PF.canvas(w, h), g = PF.g(c);
  g.imageSmoothingEnabled = false;
  g.drawImage(small, 0, 0, small.width * s, small.height * s);
  return c;
};

PF.fx.vignette = (src, { amount = 50, size = 50 }) => {
  const w = src.width, h = src.height, c = PF.clone(src), g = PF.g(c);
  const r = Math.hypot(w, h) / 2, inner = r * clamp(1 - size / 100, 0.05, 0.95);
  const grad = g.createRadialGradient(w / 2, h / 2, inner, w / 2, h / 2, r);
  grad.addColorStop(0, "rgba(0,0,0,0)");
  grad.addColorStop(1, `rgba(0,0,0,${clamp(amount / 100, 0, 1)})`);
  g.globalCompositeOperation = "source-atop";
  g.fillStyle = grad;
  g.fillRect(0, 0, w, h);
  return c;
};

PF.fx.convolve = (src, kernel, { bias = 0, gray = false } = {}) => {
  const w = src.width, h = src.height, s = PF.pixels(src).data;
  const c = PF.canvas(w, h), g = c.getContext("2d", { willReadFrequently: true }), out = g.createImageData(w, h), d = out.data;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      let r = 0, gg = 0, b = 0, k = 0;
      for (let ky = -1; ky <= 1; ky++) {
        const yy = clamp(y + ky, 0, h - 1);
        for (let kx = -1; kx <= 1; kx++, k++) {
          const p = (yy * w + clamp(x + kx, 0, w - 1)) * 4, m = kernel[k];
          r += s[p] * m; gg += s[p + 1] * m; b += s[p + 2] * m;
        }
      }
      const i = (y * w + x) * 4;
      if (gray) { const v = lum(r, gg, b) + bias; d[i] = d[i + 1] = d[i + 2] = v; }
      else { d[i] = r + bias; d[i + 1] = gg + bias; d[i + 2] = b + bias; }
      d[i + 3] = s[i + 3];
    }
  }
  g.putImageData(out, 0, 0);
  return c;
};
PF.fx.emboss = (src, { amount = 50 }) => {
  const k = amount / 50;
  return PF.fx.convolve(src, [-2 * k, -k, 0, -k, 1, k, 0, k, 2 * k], { gray: true });
};
PF.fx.edges = (src) => PF.fx.convolve(src, [-1, -1, -1, -1, 8, -1, -1, -1, -1], { gray: true });

// ------------------------------------------------------------------ catálogo (menus, IA e prévia)
// fields: controles do diálogo; run(canvas, valores) -> canvas
PF.ADJUST = {
  brightness: { name: "Brilho e contraste", icon: "sun", fields: [["brightness", "Brilho", -100, 100, 0], ["contrast", "Contraste", -100, 100, 0]], run: PF.fx.brightnessContrast },
  hue: { name: "Matiz e saturação", icon: "palette", fields: [["hue", "Matiz", -180, 180, 0], ["saturation", "Saturação", -100, 100, 0], ["lightness", "Luminosidade", -100, 100, 0]], run: PF.fx.hueSaturation },
  exposure: { name: "Exposição", icon: "aperture", fields: [["exposure", "Exposição", -100, 100, 0], ["gamma", "Gama", -80, 100, 0]], run: PF.fx.exposure },
  temperature: { name: "Temperatura e tom", icon: "thermometer-sun", fields: [["temperature", "Temperatura", -100, 100, 0], ["tint", "Tom (verde ↔ magenta)", -100, 100, 0]], run: PF.fx.temperature },
  vibrance: { name: "Vibração", icon: "droplets", fields: [["vibrance", "Vibração", -100, 100, 0]], run: PF.fx.vibrance },
  levels: { name: "Níveis", icon: "sliders-horizontal", fields: [["inBlack", "Preto de entrada", 0, 254, 0], ["inWhite", "Branco de entrada", 1, 255, 255], ["gamma", "Meios-tons", 0.1, 3, 1, 0.01], ["outBlack", "Preto de saída", 0, 255, 0], ["outWhite", "Branco de saída", 0, 255, 255]], run: PF.fx.levels },
  threshold: { name: "Limiar (preto e branco puro)", icon: "contrast", fields: [["level", "Limiar", 1, 255, 128]], run: PF.fx.threshold },
  posterize: { name: "Posterizar", icon: "layout-grid", fields: [["levels", "Níveis por cor", 2, 32, 4]], run: PF.fx.posterize },
};
PF.QUICK = { // sem diálogo
  autoLevels: { name: "Níveis automáticos", icon: "wand-sparkles", run: PF.fx.autoLevels },
  grayscale: { name: "Preto e branco", icon: "contrast", run: PF.fx.grayscale },
  sepia: { name: "Sépia", icon: "image", run: (c) => PF.fx.sepia(c, { amount: 100 }) },
  invert: { name: "Inverter cores", icon: "repeat-2", run: PF.fx.invert },
};
PF.FILTERS = {
  blur: { name: "Desfoque gaussiano", icon: "droplet", fields: [["radius", "Raio (px)", 0.5, 100, 4, 0.5]], run: PF.fx.blur },
  sharpen: { name: "Nitidez", icon: "focus", fields: [["amount", "Intensidade", 1, 200, 60], ["radius", "Raio", 0.5, 5, 1.5, 0.1]], run: PF.fx.sharpen },
  noise: { name: "Ruído", icon: "sparkles", fields: [["amount", "Quantidade", 1, 100, 20], ["mono", "Monocromático", "check", true]], run: PF.fx.noise },
  pixelate: { name: "Pixelizar", icon: "grid-3x3", fields: [["size", "Tamanho do bloco", 2, 200, 12]], run: PF.fx.pixelate },
  vignette: { name: "Vinheta", icon: "circle-dashed", fields: [["amount", "Intensidade", 0, 100, 50], ["size", "Tamanho", 1, 99, 50]], run: PF.fx.vignette },
  emboss: { name: "Relevo", icon: "waves", fields: [["amount", "Intensidade", 1, 100, 50]], run: PF.fx.emboss },
  edges: { name: "Detectar bordas", icon: "scan", fields: [], run: PF.fx.edges },
};
