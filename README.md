# Piphin Foto

Editor de imagens completo, módulo do [Piphin Hub](https://github.com/Ruiso-Outside/Piphin-Hub). Roda dentro do Hub (cerca de 140 KB).

- **Ferramentas**: mover, seleção retangular/elíptica, laço, varinha mágica, recortar, pincel, borracha, carimbo, balde, degradê, texto editável, formas, conta-gotas, mão e zoom
- **Camadas**: opacidade, 16 modos de mesclagem, mostrar/ocultar, bloquear, duplicar, mesclar, reordenar arrastando
- **Ajustes** (com prévia ao vivo): brilho e contraste, matiz e saturação, exposição, temperatura, vibração, níveis, limiar, posterizar, níveis automáticos, preto e branco, sépia, inverter
- **Filtros**: desfoque gaussiano, nitidez, ruído, pixelizar, vinheta, relevo, detectar bordas
- **Imagem**: tamanho da imagem e da tela, girar, espelhar, recortar para a seleção, aparar bordas, achatar
- **Mudar tamanho e girar**: com a ferramenta Mover (V ou Ctrl+T), a camada ganha uma caixa com alças: os cantos aumentam ou diminuem, as laterais esticam, a bolinha de cima gira, e Largura, Altura, Ângulo, Caber, Cobrir, Original e Centralizar ficam na barra de opções. Imagens coladas ou soltas guardam o original, então dá para diminuir e aumentar de novo sem perder qualidade; as maiores que a imagem aberta entram já reduzidas para caber
- **Inventário**: barra embaixo da imagem com as imagens que você abriu, colou ou exportou. Clique para pôr como camada (ou teclas 1 a 9), arraste até o ponto exato, organize em pastas, guarde a camada ativa ou a imagem inteira e adicione arquivos do PC
- **QR code**: Camada → Adicionar QR code (ou o botão no painel de camadas) gera QR de link ou texto, Wi-Fi e WhatsApp, com cores, fundo transparente, resistência a danos e prévia; entra como camada que dá para mover e mudar o tamanho. Sem imagem aberta, cria uma imagem só com o QR
- **Histórico** com desfazer/refazer, várias imagens em abas, atalhos parecidos com os do Photoshop
- **Arquivos**: abrir PNG, JPG, WebP, GIF, BMP; colar da área de transferência; arrastar e soltar; projeto editável (`.pfoto`); exportar PNG, JPG e WebP
- **IA**: com o Piphin LLM, a IA pode abrir, ajustar, filtrar, recortar, redimensionar, escrever texto colocar QR code e salvar imagens (ferramentas no `module/module.json`)

## Mídia do Hub
Com o Piphin Hub 1.7.0 ou mais novo: **Da Mídia** no início (e Arquivo → Abrir da Mídia do Hub) abre prints do Piphin Captura e imagens dos outros módulos, **Abrir no Piphin Foto** de outro módulo abre a imagem aqui, e as imagens exportadas aparecem na Mídia.

## Estrutura

- `module/`: `module.json` (manifesto e ferramentas da IA) e `backend.js` (arquivos, área de transferência, inventário e ponte da IA)
- `web/`: a tela (`index.html`, `style.css`, `icons.css`) e `js/` (`core` documento e histórico, `fx` ajustes e filtros, `view` área de desenho, `ops` operações, `tools` ferramentas, `io` arquivos e IA, `ui` interface, `inventory` barra do inventário, `vendor/qrcode.js` codificador de QR code de Kazuhiko Arase, licença MIT). O inventário fica em `inventory/` na pasta de dados do módulo
- `scripts/`: `make-module.js` (gera `dist/piphin-module-foto-<versão>.zip`), `make-icons.js` (ícones Lucide), `make-icon.js` (ícone do módulo)

```
npm run module
```
