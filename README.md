# Piphin Foto

Editor de imagens completo, módulo do [Piphin Hub](https://github.com/Ruiso-Outside/Piphin-Hub). Roda dentro do Hub (cerca de 140 KB).

- **Ferramentas**: mover, seleção retangular/elíptica, laço, varinha mágica, recortar, pincel, borracha, carimbo, balde, degradê, texto editável, formas, conta-gotas, mão e zoom
- **Camadas**: opacidade, 16 modos de mesclagem, mostrar/ocultar, bloquear, duplicar, mesclar, reordenar arrastando
- **Ajustes** (com prévia ao vivo): brilho e contraste, matiz e saturação, exposição, temperatura, vibração, níveis, limiar, posterizar, níveis automáticos, preto e branco, sépia, inverter
- **Filtros**: desfoque gaussiano, nitidez, ruído, pixelizar, vinheta, relevo, detectar bordas
- **Imagem**: tamanho da imagem e da tela, girar, espelhar, recortar para a seleção, aparar bordas, achatar
- **Histórico** com desfazer/refazer, várias imagens em abas, atalhos parecidos com os do Photoshop
- **Arquivos**: abrir PNG, JPG, WebP, GIF, BMP; colar da área de transferência; arrastar e soltar; projeto editável (`.pfoto`); exportar PNG, JPG e WebP
- **IA**: com o Piphin LLM, a IA pode abrir, ajustar, filtrar, recortar, redimensionar, escrever texto e salvar imagens (ferramentas no `module/module.json`)

## Estrutura

- `module/`: `module.json` (manifesto e ferramentas da IA) e `backend.js` (arquivos, área de transferência e ponte da IA)
- `web/`: a tela (`index.html`, `style.css`, `icons.css`) e `js/` (`core` documento e histórico, `fx` ajustes e filtros, `view` área de desenho, `ops` operações, `tools` ferramentas, `io` arquivos e IA, `ui` interface)
- `scripts/`: `make-module.js` (gera `dist/piphin-module-foto-<versão>.zip`), `make-icons.js` (ícones Lucide), `make-icon.js` (ícone do módulo)

```
npm run module
```
