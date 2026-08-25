// Métricas reais da Montserrat, extraídas das tabelas `hmtx`/`hhea` dos arquivos
// Montserrat-Regular.ttf, Montserrat-Bold.ttf e Montserrat-ExtraBold.ttf
// (unitsPerEm = 1000).
//
// Elas existem porque as artes são montadas no servidor, onde a fonte não está
// instalada. Sem medir de verdade, o gerador precisa chutar "caracteres por linha"
// e erra a quebra — foi o que fazia o texto estourar o painel colorido.

const REGULAR = {
  " ":262, "!":260, "\"":373, "#":696, "$":615, "%":829, "&":669, "'":202,
  "(":329, ")":329, "*":386, "+":575, ",":212, "-":382, ".":212, "/":335,
  "0":662, "1":361, "2":568, "3":564, "4":661, "5":566, "6":609, "7":589,
  "8":638, "9":609, ":":212, ";":212, "<":575, "=":575, ">":575, "?":567,
  "@":1033, "A":717, "B":754, "C":719, "D":826, "E":669, "F":633, "G":773,
  "H":813, "I":302, "J":501, "K":711, "L":589, "M":955, "N":813, "O":839,
  "P":718, "Q":839, "R":723, "S":615, "T":574, "U":792, "V":698, "W":1111,
  "X":656, "Y":635, "Z":651, "[":318, "\\":335, "]":318, "^":576, "_":500,
  "`":600, "a":590, "b":678, "c":563, "d":678, "e":604, "f":339, "g":686,
  "h":677, "i":269, "j":274, "k":601, "l":269, "m":1061, "n":677, "o":627,
  "p":678, "q":678, "r":401, "s":489, "t":406, "u":673, "v":542, "w":879,
  "x":534, "y":542, "z":511, "{":334, "|":295, "}":334, "~":575, "£":637,
  "¥":695, "§":490, "©":809, "ª":401, "«":477, "®":809, "°":419, "±":575,
  "º":414, "»":477, "À":717, "Á":717, "Â":717, "Ã":717, "Ä":717, "Ç":719,
  "È":669, "É":669, "Ê":669, "Ë":669, "Ì":302, "Í":302, "Î":302, "Ï":302,
  "Ñ":813, "Ò":839, "Ó":839, "Ô":839, "Õ":839, "Ö":839, "×":575, "Ù":792,
  "Ú":792, "Û":792, "Ü":792, "à":590, "á":590, "â":590, "ã":590, "ä":590,
  "ç":563, "è":604, "é":604, "ê":604, "ë":604, "ì":269, "í":269, "î":269,
  "ï":269, "ñ":677, "ò":627, "ó":627, "ô":627, "õ":627, "ö":627, "÷":575,
  "ù":673, "ú":673, "û":673, "ü":673, "–":500, "—":1000, "“":382, "”":382,
  "…":647, "€":802
};

const BOLD = {
  " ":283, "!":289, "\"":437, "#":720, "$":638, "%":877, "&":728, "'":230,
  "(":357, ")":358, "*":434, "+":599, ",":262, "-":386, ".":262, "/":392,
  "0":679, "1":392, "2":590, "3":592, "4":689, "5":595, "6":637, "7":620,
  "8":660, "9":637, ":":262, ";":262, "<":599, "=":599, ">":599, "?":589,
  "@":1035, "A":766, "B":765, "C":733, "D":826, "E":671, "F":639, "G":771,
  "H":808, "I":328, "J":541, "K":740, "L":604, "M":955, "N":808, "O":844,
  "P":732, "Q":844, "R":735, "S":638, "T":618, "U":788, "V":746, "W":1163,
  "X":714, "Y":676, "Z":671, "[":368, "\\":392, "]":368, "^":600, "_":500,
  "`":600, "a":617, "b":690, "c":591, "d":692, "e":631, "f":387, "g":700,
  "h":691, "i":301, "j":307, "k":660, "l":301, "m":1049, "n":691, "o":655,
  "p":690, "q":690, "r":431, "s":531, "t":435, "u":687, "v":598, "w":937,
  "x":595, "y":598, "z":543, "{":391, "|":309, "}":391, "~":599, "£":668,
  "¥":736, "§":522, "©":785, "ª":412, "«":568, "®":785, "°":418, "±":599,
  "º":427, "»":568, "À":766, "Á":766, "Â":766, "Ã":766, "Ä":766, "Ç":733,
  "È":671, "É":671, "Ê":671, "Ë":671, "Ì":328, "Í":328, "Î":328, "Ï":328,
  "Ñ":808, "Ò":844, "Ó":844, "Ô":844, "Õ":844, "Ö":844, "×":599, "Ù":788,
  "Ú":788, "Û":788, "Ü":788, "à":617, "á":617, "â":617, "ã":617, "ä":617,
  "ç":591, "è":631, "é":631, "ê":631, "ë":631, "ì":301, "í":301, "î":301,
  "ï":301, "ñ":691, "ò":655, "ó":655, "ô":655, "õ":655, "ö":655, "÷":599,
  "ù":687, "ú":687, "û":687, "ü":687, "–":500, "—":1000, "“":498, "”":498,
  "…":798, "€":820
};

const EXTRA_BOLD = {
  " ":291, "!":301, "\"":462, "#":730, "$":647, "%":897, "&":752, "'":242,
  "(":369, ")":369, "*":453, "+":609, ",":283, "-":388, ".":283, "/":415,
  "0":685, "1":405, "2":599, "3":603, "4":700, "5":607, "6":649, "7":632,
  "8":669, "9":649, ":":283, ";":283, "<":609, "=":609, ">":609, "?":597,
  "@":1036, "A":786, "B":769, "C":738, "D":826, "E":672, "F":642, "G":770,
  "H":806, "I":339, "J":557, "K":752, "L":610, "M":954, "N":806, "O":846,
  "P":737, "Q":846, "R":740, "S":647, "T":635, "U":786, "V":766, "W":1184,
  "X":737, "Y":693, "Z":679, "[":389, "\\":415, "]":389, "^":610, "_":500,
  "`":600, "a":628, "b":695, "c":603, "d":698, "e":642, "f":406, "g":705,
  "h":696, "i":313, "j":320, "k":686, "l":313, "m":1045, "n":696, "o":666,
  "p":695, "q":695, "r":443, "s":547, "t":447, "u":692, "v":620, "w":956,
  "x":619, "y":620, "z":556, "{":414, "|":314, "}":414, "~":609, "£":681,
  "¥":753, "§":535, "©":775, "ª":417, "«":605, "®":775, "°":417, "±":609,
  "º":432, "»":605, "À":786, "Á":786, "Â":786, "Ã":786, "Ä":786, "Ç":738,
  "È":672, "É":672, "Ê":672, "Ë":672, "Ì":339, "Í":339, "Î":339, "Ï":339,
  "Ñ":806, "Ò":846, "Ó":846, "Ô":846, "Õ":846, "Ö":846, "×":609, "Ù":786,
  "Ú":786, "Û":786, "Ü":786, "à":628, "á":628, "â":628, "ã":628, "ä":628,
  "ç":603, "è":642, "é":642, "ê":642, "ë":642, "ì":313, "í":313, "î":313,
  "ï":313, "ñ":696, "ò":666, "ó":666, "ô":666, "õ":666, "ö":666, "÷":609,
  "ù":692, "ú":692, "û":692, "ü":692, "–":500, "—":1000, "“":545, "”":545,
  "…":858, "€":827
};

// hhea: (ascender 968 - descender -251 + lineGap 0) / 1000.
export const LINE_HEIGHT_EM = 1.219;

const TABLES = { regular: REGULAR, bold: BOLD, extrabold: EXTRA_BOLD };
// Larguras médias de caixa alta, usadas para caracteres fora da tabela.
const FALLBACK = { regular: 716, bold: 736, extrabold: 743 };

const EMU_PER_POINT = 12700;

export function toPoints(emu) {
  return emu / EMU_PER_POINT;
}

export function toEmu(points) {
  return Math.round(points * EMU_PER_POINT);
}

/** Aceita `true`/`false` (compatibilidade) ou o nome do peso. */
function weightKey(weight) {
  if (weight === true) return "bold";
  if (!weight) return "regular";
  const key = String(weight).toLowerCase().replace(/[\s-]/g, "");
  return TABLES[key] ? key : "regular";
}

/** Largura de `text` em "em" (1 em = 1 corpo de fonte). */
export function measureEm(text, weight = "regular") {
  const key = weightKey(weight);
  const table = TABLES[key];
  const fallback = FALLBACK[key];
  let total = 0;
  for (const char of String(text || "")) {
    total += (table[char] ?? fallback) / 1000;
  }
  return total;
}

/** Largura de `text` em pontos quando composto no corpo `sizePt`. */
export function measurePoints(text, sizePt, weight = "regular") {
  return measureEm(text, weight) * sizePt;
}

/** Altura de um bloco de `lineCount` linhas, em pontos. */
export function blockHeightPoints(lineCount, sizePt, lineSpacing = 1) {
  return Math.max(0, lineCount) * sizePt * LINE_HEIGHT_EM * lineSpacing;
}

/**
 * Quebra `text` em no máximo `maxLines`, sem nunca ultrapassar `widthPt`.
 * Retorna `null` quando nem assim cabe — o chamador reduz o corpo e tenta de novo.
 */
export function wrapToWidth(text, sizePt, widthPt, weight, maxLines) {
  const words = String(text || "").split(" ").filter(Boolean);
  if (!words.length) return [];

  const lines = [];
  let current = "";
  for (const word of words) {
    const candidate = current ? `${current} ${word}` : word;
    if (current && measurePoints(candidate, sizePt, weight) > widthPt) {
      lines.push(current);
      current = word;
    } else {
      current = candidate;
    }
  }
  if (current) lines.push(current);

  if (lines.length > maxLines) return null;
  // Uma palavra sozinha maior que a caixa não tem quebra possível.
  if (lines.some((line) => measurePoints(line, sizePt, weight) > widthPt)) return null;
  return lines;
}

/**
 * Distribui as palavras no mesmo número de linhas da quebra natural, mas com
 * comprimentos parecidos — evita a "escadinha" de uma linha cheia e uma órfã.
 */
export function balanceToWidth(text, sizePt, widthPt, weight, maxLines) {
  const natural = wrapToWidth(text, sizePt, widthPt, weight, maxLines);
  if (!natural || natural.length <= 1) return natural;

  const words = String(text || "").split(" ").filter(Boolean);
  const lineCount = natural.length;
  // A busca é exaustiva; acima de ~14 palavras o custo explode e a quebra natural basta.
  if (words.length < lineCount || words.length > 14) return natural;

  const target = measureEm(text, weight) * sizePt / lineCount;
  let best = null;

  const visit = (start, linesLeft, chosen) => {
    if (linesLeft === 1) {
      const candidate = [...chosen, words.slice(start).join(" ")];
      let score = 0;
      for (const line of candidate) {
        const width = measurePoints(line, sizePt, weight);
        if (width > widthPt) return;
        score += (width - target) ** 2;
      }
      if (!best || score < best.score) best = { score, lines: candidate };
      return;
    }
    const lastStart = words.length - linesLeft + 1;
    for (let end = start + 1; end <= lastStart; end += 1) {
      const line = words.slice(start, end).join(" ");
      if (measurePoints(line, sizePt, weight) > widthPt) break;
      visit(end, linesLeft - 1, [...chosen, line]);
    }
  };

  visit(0, lineCount, []);
  return best ? best.lines : natural;
}

/**
 * Maior corpo entre `baseSize` e `minSize` em que `text` cabe numa caixa medida
 * em polegadas, já com os recuos internos padrão do mestre (0,1" nas laterais e
 * 0,05" em cima e embaixo). Devolve o texto com as quebras resolvidas.
 */
export function fitTextToBox(text, box, {
  baseSize,
  minSize,
  lineSpacing = 1,
  weight = "regular",
  maxLines = 8,
  insetX = 0.2,
  insetY = 0.1,
  // Em modo estrito devolve `null` em vez de forçar um encaixe que não existe —
  // é assim que a escolha de layout descarta uma variação pequena demais.
  strict = false,
}) {
  const content = String(text || "").replace(/\s+/g, " ").trim();
  if (!content) return { text: "", fontSize: baseSize, lines: 0 };

  const widthPoints = Math.max(1, (box.w - insetX) * 72);
  const heightPoints = Math.max(1, (box.h - insetY) * 72);

  for (let size = baseSize; size >= minSize - 0.001; size -= 0.5) {
    const lineHeight = size * LINE_HEIGHT_EM * lineSpacing;
    // Uma caixa desenhada para uma linha guarda a altura da capitular, não a da
    // entrelinha inteira: sem esse piso, uma linha legítima seria recusada.
    const allowed = Math.min(maxLines, Math.max(1, Math.floor(heightPoints / lineHeight + 0.05)));
    const lines = balanceToWidth(content, size, widthPoints, weight, allowed);
    if (lines) {
      return { text: lines.join("\n"), fontSize: Math.round(size * 100) / 100, lines: lines.length };
    }
  }

  if (strict) return null;
  const lines = wrapToWidth(content, minSize, widthPoints, weight, Number.MAX_SAFE_INTEGER) || [content];
  return { text: lines.join("\n"), fontSize: minSize, lines: lines.length };
}
