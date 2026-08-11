# Mapa visual dos posts ANFATRE RV

Fonte de verdade: `design-system/standalone/posts-instagram.html`.

## Regras globais

- Canvas: `1080 × 1350 px` (proporção 4:5).
- Fonte no Canva: **Montserrat**, substituta da Gotham.
- Pesos equivalentes: Light `300`, Book `400`, Bold `700`, Black `800`.
- Verde: `#289942`.
- Azul: `#1E78C2`.
- Amarelo: `#FFD036`.
- Grafite: `#2C2E35`.
- Branco: `#FFFFFF`.
- Elementos ortogonais, sem cantos arredondados, transparências, blur ou sombra.
- Fotografias sempre em sangria total, com corte `cover`.
- Headlines de posts em caixa alta.
- Pictogramas sempre na ordem oficial: reboque gaiola, reboque baú, carretinha, reboque para cavalos, trailer de camping, reboque para motos, reboque para barcos, food trailer, quinta-roda e motorhome.
- Barra tricolor: três blocos iguais, na ordem azul, verde e amarelo.

## 1. Capa fotográfica — verde

- Foto: sangria total.
- Grupo do painel: `x 108`, `y 96`, `w 864`.
- Listras sobre o painel: barra amarela de `16 px`; depois 4 sequências de `7 px` verdes + `6 px` amarelos.
- Área interna: verde, `56 px` de margem lateral, `44 px` acima e `56 px` abaixo.
- Texto: centralizado.
- Introdução: Montserrat Light, `44 px`, entrelinha `1.12`, branca.
- Destaque: Montserrat Black, `64 px`, entrelinha `1.02`, amarelo.
- Uso: pergunta educativa, segurança, manutenção e assinatura de campanha.

## 2. Capa fotográfica — azul

- Mesma geometria da capa verde.
- Painel e intervalos das listras em azul.
- Destaque vem primeiro: Montserrat Black, `68 px`, entrelinha `1.02`, amarelo.
- Introdução vem abaixo, com `12 px` de intervalo: Montserrat Light, `42 px`, entrelinha `1.14`, branca.

## 3. Capa fotográfica — assinatura

- Usa exatamente a estrutura da capa fotográfica verde.
- Introdução em duas linhas, Montserrat Light `44 px`, branca.
- Assinatura em duas linhas, Montserrat Black `64 px`, amarela.
- Sem barra tricolor superior, rodapé, logo ou CTA adicional.

## 4. Conteúdo — pergunta

- Faixa superior azul: `y 0`, pictogramas amarelos com largura-base de `70 px`, margens `30 px` e respiro vertical `14 px`.
- Campo principal: `y 92`, `h 640`, verde ou azul.
- Pergunta: `x 88`, `y 188`, `w 470`, Montserrat Black `70 px`, entrelinha `1.06`, branca, alinhada à esquerda.
- Mapa pontilhado: `x 582`, `y 178`, `w 420`.
- Regra inferior em `y 732`: amarelo `10 px`; depois 3 sequências de `9 px` na cor do campo + `8 px` amarelos.
- Fechamento: `x 100`, `y 880`, `w 880`, centralizado, Montserrat Light `50 px`, entrelinha `1.28`, azul.
- Palavra ou expressão destacada: Montserrat Bold, branca sobre retângulo azul, com `10 px` de margem horizontal.
- Logo completo: centralizado, largura `330 px`, base a `92 px` do rodapé.
- Barra tricolor inferior: `14 px`.

## 5. Institucional — final

- Barra tricolor superior: `16 px`.
- Campo azul ou verde: `y 16`, `h 690`.
- Mapa pontilhado: `y 60`, centralizado, `w 470`.
- Pictogramas amarelos: `78 px`, faixa entre `x 40` e `x 1040`, base a `34 px` do fim do campo.
- Regra sobre branco: `y 706`; 3 linhas da cor do campo, todas com `9 px`, separadas por `9 px` brancos.
- Texto: `x 90`, `y 830`, `w 900`, centralizado.
- Introdução: Montserrat Light `52 px`, entrelinha `1.12`, na cor do campo.
- Destaque: Montserrat Black `62 px`, entrelinha `1.08`, mesma cor, com `6 px` de intervalo.
- Logo completo: centralizado, largura `330 px`, base a `96 px` do rodapé.
- Barra tricolor inferior: `16 px`.

## 6. Carrossel — capa

- Barra tricolor superior: `14 px`.
- Mapa decorativo: `x 30`, `y 40`, `w 290`, baixa opacidade e neutralizado. Na importação PPTX ele deve entrar como imagem decorativa não editável.
- Logo completo: centralizado, `y 210`, `w 640`.
- Campo azul: `y 672` até o rodapé.
- Bloco de título: `x 70`, `y 872`, `w 940`, centralizado.
- Introdução: Montserrat Light `50 px`, entrelinha `1.16`, branca, caixa alta.
- Destaque: Montserrat Black `60 px`, entrelinha `1.06`, amarelo, `10 px` abaixo.
- Pictogramas amarelos: `76 px`, entre `x 34` e `x 1046`, base a `46 px` do campo azul.
- Barra tricolor inferior: `14 px`.

## Regras de automação

- O agente escolhe apenas entre modelos aprovados; não inventa uma nova composição automaticamente.
- A fotografia, o texto e a cor permitida podem variar. Geometria, camadas, alinhamento, tipografia e cores de marca permanecem travados pelo modelo.
- Se o texto ultrapassar o limite do modelo, o agente deve resumir ou sugerir carrossel; não deve reduzir a fonte sem controle.
- Todo texto permanece editável no Canva.
- Fotos, mapas, logos e pictogramas entram como imagens/vetores; painéis, barras, listras e textos entram como elementos separados.
