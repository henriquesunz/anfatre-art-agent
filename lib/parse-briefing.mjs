import crypto from "node:crypto";

function compact(value) {
  return String(value || "")
    .replace(/\r/g, "")
    .replace(/[ \t]+/g, " ")
    .replace(/ *\n */g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function oneLine(value) {
  return compact(value).replace(/\s+/g, " ").trim();
}

function stripQuotes(value) {
  return compact(value)
    .replace(/^\s*["“”']+\s*/, "")
    .replace(/\s*["“”']+\s*$/, "")
    .trim();
}

function stripPlanningHeaders(value) {
  return compact(value)
    .split("\n")
    .filter((line) => !/^\s*(?:primeira|segunda)?\s*quinzena\b.*:?\s*$/i.test(line))
    .join("\n")
    .trim();
}

function trimAtNextPostBoundary(value) {
  const lines = compact(value).split("\n");
  const boundary = lines.findIndex((line) => (
    /^_{3,}$/.test(line)
    || /^-{3,}$/.test(line)
    || /^\d{1,2}\/\d{1,2}(?:\/\d{2,4})?\s*[-–—]?\s*$/.test(line)
    || /^(?:primeira|segunda)?\s*quinzena\b/i.test(line)
  ));
  const kept = boundary >= 0 ? lines.slice(0, boundary) : lines;
  return stripQuotes(kept.join("\n")).replace(/\s+\d{1,2}\/\d{1,2}(?:\/\d{2,4})?\s*[-–—]?\s*(?:\d+\.)?\s*$/, "").trim();
}

function extractFormat(block) {
  const size = block.match(/(?:2\.?\s*)?Tamanho\s+da\s+Arte\s*:\s*([^\n]*)/i)?.[1] || "";
  const inline = oneLine(size).replace(/^[-–—•]\s*/, "");
  if (inline) return inline;

  const marker = block.search(/(?:2\.?\s*)?Tamanho\s+da\s+Arte\s*:/i);
  if (marker >= 0) {
    const after = block.slice(marker).split("\n").slice(1);
    const line = after.find((item) => item.replace(/^[-–—•]\s*/, "").trim());
    const value = oneLine(line || "").replace(/^[-–—•]\s*/, "");
    if (value && !/^_{3,}$|^-{3,}$/.test(value)) return value;
  }
  return "Timeline Instagram";
}

function labelMatch(block, label) {
  return new RegExp(`\\b${label}\\s*:`, "iu").exec(block);
}

function labeledCopy(block) {
  const titleMarker = labelMatch(block, "T[ií]tulo");
  const subtitleMarker = labelMatch(block, "Subt[ií]tulo");
  const sizeMarker = /\b(?:2\.?\s*)?Tamanho\s+da\s+Arte\s*:/iu.exec(block);

  if (!titleMarker) return null;

  const titleStart = titleMarker.index + titleMarker[0].length;
  const titleEnd = [subtitleMarker?.index, sizeMarker?.index, block.length]
    .filter((index) => Number.isInteger(index) && index >= titleStart)
    .sort((left, right) => left - right)[0];
  const title = trimAtNextPostBoundary(block.slice(titleStart, titleEnd));

  let subtitle = "";
  if (subtitleMarker && subtitleMarker.index > titleMarker.index) {
    const subtitleStart = subtitleMarker.index + subtitleMarker[0].length;
    const subtitleEnd = [sizeMarker?.index, block.length]
      .filter((index) => Number.isInteger(index) && index >= subtitleStart)
      .sort((left, right) => left - right)[0];
    subtitle = trimAtNextPostBoundary(block.slice(subtitleStart, subtitleEnd));
  }

  return { title, subtitle, subtitleExplicit: Boolean(subtitleMarker) };
}

function unlabeledCopy(block) {
  const withoutSize = block.replace(/(?:2\.?\s*)?Tamanho\s+da\s+Arte\s*:[\s\S]*$/i, "");
  const withoutDate = withoutSize.replace(/^\s*\d{1,2}\/\d{1,2}(?:\/\d{2,4})?\s*[-–—]?\s*/, "");
  const content = trimAtNextPostBoundary(stripPlanningHeaders(withoutDate));
  const lines = content.split("\n").map((line) => line.trim()).filter(Boolean);
  if (lines.length <= 1) return { title: oneLine(content), subtitle: "", subtitleExplicit: false };
  return { title: oneLine(lines[0]), subtitle: compact(lines.slice(1).join("\n")), subtitleExplicit: true };
}

function splitTitleAndSubtitle(title, explicitSubtitle = "", subtitleExplicit = false) {
  const exactTitle = oneLine(title);
  const exactSubtitle = oneLine(explicitSubtitle);
  if (exactSubtitle || !exactTitle) {
    return {
      title: exactTitle,
      subtitle: exactSubtitle,
      copyOrder: subtitleExplicit ? "highlight-intro" : "intro-highlight",
    };
  }

  const colon = exactTitle.indexOf(":");
  if (colon >= 2 && colon < exactTitle.length - 2) {
    return {
      title: exactTitle.slice(0, colon + 1).trim(),
      subtitle: exactTitle.slice(colon + 1).trim(),
      copyOrder: "intro-highlight",
    };
  }
  return { title: exactTitle, subtitle: "", copyOrder: "highlight-only" };
}

function splitCarousel(content) {
  const marker = /(?:^|\n)\s*TELA\s*(\d+)\s*:\s*/gi;
  const matches = [...content.matchAll(marker)];
  if (!matches.length) return [];

  return matches.map((match, index) => {
    const start = match.index + match[0].length;
    const end = matches[index + 1]?.index ?? content.length;
    const body = trimAtNextPostBoundary(content.slice(start, end));
    const lines = body.split("\n").map((line) => line.trim()).filter(Boolean);
    return {
      number: Number(match[1]),
      title: oneLine(lines[0] || `Tela ${match[1]}`),
      body: compact(lines.slice(1).join("\n")),
    };
  });
}

function inferObjective(title, subtitle, slides) {
  const text = `${title} ${subtitle} ${slides.map((slide) => `${slide.title} ${slide.body}`).join(" ")}`.toLowerCase();
  if (slides.length > 1) return "carrossel";
  if (text.includes("anfatre") || text.includes("associad") || text.includes("selo")) return "institucional";
  if (text.includes("?") || text.includes("qual ")) return "engajamento";
  if (text.includes("seguran") || text.includes("importância")) return "segurança";
  return "educar";
}

function extractCta(slides) {
  const last = slides.at(-1);
  const text = `${last?.title || ""}\n${last?.body || ""}`;
  const calls = text.split("\n").filter((line) => /comente|salve|acesse|consulte|compartilhe|saiba mais|próxima parada/i.test(line));
  return compact(calls.join("\n"));
}

function isCallToActionSlide(slide) {
  return /comente|salve|compartilhe|próxima parada|acesse|saiba mais/i.test(`${slide.title} ${slide.body}`);
}

function findWarnings(fullTitle, slides) {
  const warnings = [];
  const promised = fullTitle.match(/\b(\d+)\s+(?:destinos|dicas|passos|motivos|razões|lugares|itens)\b/i);
  if (promised && slides.length > 1) {
    const expected = Number(promised[1]);
    const listed = slides.slice(1).filter((slide) => !isCallToActionSlide(slide)).length;
    if (expected !== listed) warnings.push(`O título promete ${expected} itens, mas o briefing detalha ${listed}.`);
  }
  return warnings;
}

function itemFromBlock(date, rawBlock, index) {
  const block = stripPlanningHeaders(rawBlock);
  const labeled = labeledCopy(block);
  const copy = labeled || unlabeledCopy(block);
  const sourceContent = copy.title;
  const carouselSlides = splitCarousel(sourceContent);
  const slides = carouselSlides.length
    ? carouselSlides
    : [{ number: 1, title: oneLine(copy.title), body: oneLine(copy.subtitle) }];

  const coverCopy = carouselSlides.length
    ? splitTitleAndSubtitle(slides[0]?.title || "", copy.subtitle, copy.subtitleExplicit)
    : splitTitleAndSubtitle(copy.title, copy.subtitle, copy.subtitleExplicit);
  const fullTitle = [coverCopy.title, coverCopy.subtitle].filter(Boolean).join(" ");
  if (!fullTitle) return null;

  const kind = slides.length > 1 ? "carousel" : "single";
  const objective = inferObjective(coverCopy.title, coverCopy.subtitle, slides);
  const warnings = findWarnings(fullTitle, slides);
  const id = crypto.createHash("sha1").update(`${date}:${index}:${fullTitle}`).digest("hex").slice(0, 12);
  const format = extractFormat(block);
  const mainMessage = slides.length > 1
    ? slides.map((slide) => `TELA ${slide.number}: ${slide.title}${slide.body ? `\n${slide.body}` : ""}`).join("\n\n")
    : [coverCopy.title, coverCopy.subtitle].filter(Boolean).join("\n");

  return {
    id,
    date,
    title: coverCopy.title,
    subtitle: coverCopy.subtitle,
    format,
    kind,
    slideCount: slides.length,
    slides,
    warnings,
    brief: {
      date,
      title: coverCopy.title,
      subtitle: coverCopy.subtitle,
      copyOrder: coverCopy.copyOrder,
      jobTitle: date ? `${date} — ${fullTitle}` : fullTitle,
      objective,
      audience: "Público da ANFATRE RV",
      mainMessage,
      cta: extractCta(slides),
      visualDirection: "",
      templateId: kind === "carousel" ? "carousel" : "auto",
      generateImage: true,
      format,
      slides,
    },
  };
}

function datesIn(value) {
  return [...value.matchAll(/\b(\d{1,2}\/\d{1,2}(?:\/\d{2,4})?)\b/g)];
}

function dateImmediatelyBeforeTitle(prefix) {
  const match = datesIn(prefix).at(-1);
  if (!match) return "";
  const tail = prefix.slice(match.index + match[0].length);
  return /^[\s_\-–—]*(?:\d+\.?\s*)?$/.test(tail) ? match[1] : "";
}

function blocksFromTitleLabels(text) {
  const titlePattern = /\b(?:\d+\.?\s*)?T[ií]tulo\s*:/giu;
  const matches = [...text.matchAll(titlePattern)];
  if (!matches.length) return [];

  return matches.map((match, index) => {
    const previousTitleEnd = index ? matches[index - 1].index + matches[index - 1][0].length : 0;
    const prefix = text.slice(previousTitleEnd, match.index);
    const date = dateImmediatelyBeforeTitle(prefix);
    const end = matches[index + 1]?.index ?? text.length;
    return { date, block: text.slice(match.index, end) };
  });
}

function blocksFromDateLines(text) {
  const datePattern = /^\s*(\d{1,2}\/\d{1,2}(?:\/\d{2,4})?)\s*[-–—]?\s*(.*)$/gm;
  const matches = [...text.matchAll(datePattern)];
  if (!matches.length) return [];

  return matches.map((match, index) => {
    const start = match.index + match[0].length;
    const end = matches[index + 1]?.index ?? text.length;
    return { date: match[1], block: `${match[2] || ""}\n${text.slice(start, end)}` };
  });
}

function blocksFromSeparators(text) {
  return text
    .split(/\n\s*(?:_{3,}|-{3,})\s*\n/g)
    .map((block) => stripPlanningHeaders(block))
    .filter(Boolean)
    .map((block) => ({ date: datesIn(block).at(0)?.[1] || "", block }));
}

export function parsePastedBriefing(rawText) {
  const text = compact(rawText);
  if (!text) throw new Error("Cole o briefing antes de interpretar");

  let blocks = blocksFromTitleLabels(text);
  if (!blocks.length) blocks = blocksFromDateLines(text);
  if (!blocks.length) blocks = blocksFromSeparators(text);
  if (!blocks.length) blocks = [{ date: "", block: text }];

  const items = blocks.map(({ date, block }, index) => itemFromBlock(date, block, index)).filter(Boolean);
  if (!items.length) throw new Error("Não consegui localizar nenhum título. Cole o texto do post ou use o campo Título:.");
  return items;
}
