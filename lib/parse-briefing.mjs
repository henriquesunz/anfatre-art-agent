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

function extractFormat(block) {
  const size = block.match(/(?:2\.?\s*)?Tamanho\s+da\s+Arte\s*:\s*([\s\S]*?)(?=_{5,}|$)/i)?.[1] || "";
  const line = compact(size).split("\n").find((item) => item.replace(/^[-–—•]\s*/, "").trim());
  return oneLine(line || "Timeline Instagram").replace(/^[-–—•]\s*/, "") || "Timeline Instagram";
}

function extractTitleContent(block) {
  const match = block.match(/(?:1\.?\s*)?T[ií]tulo\s*:\s*([\s\S]*?)(?=\n\s*(?:2\.?\s*)?Tamanho\s+da\s+Arte\s*:|_{5,}|$)/i);
  if (match) return stripQuotes(match[1]);
  return stripQuotes(block.replace(/(?:2\.?\s*)?Tamanho\s+da\s+Arte\s*:[\s\S]*$/i, ""));
}

function splitCarousel(content) {
  const marker = /(?:^|\n)\s*TELA\s*(\d+)\s*:\s*/gi;
  const matches = [...content.matchAll(marker)];
  if (!matches.length) return [];

  return matches.map((match, index) => {
    const start = match.index + match[0].length;
    const end = matches[index + 1]?.index ?? content.length;
    const body = stripQuotes(content.slice(start, end));
    const lines = body.split("\n").map((line) => line.trim()).filter(Boolean);
    return {
      number: Number(match[1]),
      title: oneLine(lines[0] || `Tela ${match[1]}`),
      body: compact(lines.slice(1).join("\n")),
    };
  });
}

function inferObjective(title, slides) {
  const text = `${title} ${slides.map((slide) => `${slide.title} ${slide.body}`).join(" ")}`.toLowerCase();
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

function findWarnings(title, slides) {
  const warnings = [];
  const promised = title.match(/\b(\d+)\s+(?:destinos|dicas|passos|motivos|razões|lugares|itens)\b/i);
  if (promised && slides.length > 1) {
    const expected = Number(promised[1]);
    const listed = slides.slice(1).filter((slide) => !isCallToActionSlide(slide)).length;
    if (expected !== listed) warnings.push(`O título promete ${expected} itens, mas o briefing detalha ${listed}.`);
  }
  return warnings;
}

function itemFromBlock(date, block, index) {
  const content = extractTitleContent(block);
  const carouselSlides = splitCarousel(content);
  const slides = carouselSlides.length
    ? carouselSlides
    : [{ number: 1, title: oneLine(content), body: "" }];
  const title = slides[0]?.title || `Post de ${date}`;
  const kind = slides.length > 1 ? "carousel" : "single";
  const objective = inferObjective(title, slides);
  const warnings = findWarnings(title, slides);
  const id = crypto.createHash("sha1").update(`${date}:${index}:${title}`).digest("hex").slice(0, 12);

  return {
    id,
    date,
    title,
    format: extractFormat(block),
    kind,
    slideCount: slides.length,
    slides,
    warnings,
    brief: {
      date,
      title,
      jobTitle: `${date} — ${title}`,
      objective,
      audience: "Público da ANFATRE RV",
      mainMessage: slides.map((slide) => `TELA ${slide.number}: ${slide.title}${slide.body ? `\n${slide.body}` : ""}`).join("\n\n"),
      cta: extractCta(slides),
      visualDirection: "",
      templateId: kind === "carousel" ? "carousel" : "auto",
      generateImage: true,
      format: extractFormat(block),
      slides,
    },
  };
}

export function parsePastedBriefing(rawText) {
  const text = compact(rawText);
  if (!text) throw new Error("Cole o briefing antes de interpretar");

  const datePattern = /^\s*(\d{1,2}\/\d{1,2}(?:\/\d{2,4})?)\s*[-–—]?\s*$/gm;
  const dates = [...text.matchAll(datePattern)];
  if (!dates.length) {
    throw new Error("Não encontrei datas no briefing. Use uma linha como 11/08 - antes de cada post.");
  }

  const items = dates.map((match, index) => {
    const start = match.index + match[0].length;
    const end = dates[index + 1]?.index ?? text.length;
    return itemFromBlock(match[1], text.slice(start, end), index);
  }).filter((item) => item.title && !/^post de /i.test(item.title));

  if (!items.length) throw new Error("Encontrei as datas, mas não consegui localizar os títulos dos posts");
  return items;
}
