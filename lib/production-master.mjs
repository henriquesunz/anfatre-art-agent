import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import JSZip from "jszip";

const moduleDir = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(moduleDir, "..");

export const PRODUCTION_MASTER_PATH = path.join(rootDir, "fixtures", "anfatre-production-master.pptx");

const SLIDES = {
  green: {
    introFirst: { 1: 1, 2: 2, 3: 3 },
    highlightFirst: { 1: 4, 2: 5, 3: 6 },
  },
  blue: {
    introFirst: { 1: 9, 2: 10, 3: 11 },
    highlightFirst: { 1: 12, 2: 13, 3: 14 },
    longCopy: 16,
  },
  signature: 15,
  question: 20,
  institutional: 21,
  carousel: 22,
};

function normalizedText(value) {
  return String(value || "").replace(/\s+/g, " ").trim();
}

function estimatedLines(value, preferredChars, maxLines = 3) {
  const text = normalizedText(value);
  if (!text) return 1;
  if (!text.includes(" ")) return 1;
  return Math.min(maxLines, Math.max(1, Math.ceil(text.length / preferredChars)));
}

export function selectProductionSlide(plan) {
  if (plan.templateId === "photo-signature") return SLIDES.signature;
  if (plan.templateId === "question") return SLIDES.question;
  if (plan.templateId === "institutional") return SLIDES.institutional;
  if (plan.templateId === "carousel") return SLIDES.carousel;

  if (plan.templateId === "photo-green" || plan.templateId === "photo-blue") {
    const tone = plan.templateId === "photo-blue" ? "blue" : "green";
    const intro = normalizedText(plan.intro);
    const highlight = normalizedText(plan.highlight);
    const highlightFirst = plan.copyOrder === "highlight-intro";

    if (tone === "blue" && Math.ceil(highlight.length / 17) > 3) {
      return SLIDES.blue.longCopy;
    }

    const variant = Math.max(
      estimatedLines(intro, 35),
      estimatedLines(highlight, 17),
    );
    const order = highlightFirst ? "highlightFirst" : "introFirst";
    return SLIDES[tone][order][variant];
  }

  return SLIDES.carousel;
}

function escapeXmlText(value) {
  return String(value || "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
}

function markerValues(plan, slideNumber) {
  const intro = normalizedText(plan.intro).toUpperCase();
  const highlight = normalizedText(plan.highlight).toUpperCase();
  const closing = normalizedText(plan.closing);

  if (slideNumber === SLIDES.signature) {
    return { "{{TITLE}}": [intro, highlight].filter(Boolean).join(" ") };
  }
  if (slideNumber === SLIDES.question) {
    return {
      "{{Q}}": highlight || intro,
      "{{CTA_1}}": "",
      "{{CTA_2}}": "",
      "{{CTA_3}}": "",
      "{{CTA_4}}": closing || intro,
    };
  }
  if (slideNumber === SLIDES.institutional || slideNumber === SLIDES.carousel) {
    return { "{{INTRO}}": intro, "{{HIGHLIGHT}}": highlight };
  }
  if (slideNumber === SLIDES.blue.longCopy) {
    return { "{{INTRO}}": intro, "{{HIGHLIGHT_LONG}}": highlight };
  }
  return { "{{INTRO}}": intro, "{{HIGHLIGHT}}": highlight };
}

function replaceMarkers(xml, replacements) {
  let result = xml;
  for (const [marker, value] of Object.entries(replacements)) {
    result = result.replaceAll(marker, escapeXmlText(value));
  }
  const unresolved = [...result.matchAll(/\{\{[A-Z0-9_]+\}\}/g)].map((match) => match[0]);
  if (unresolved.length) {
    throw new Error(`O layout selecionado ainda contém marcadores não preenchidos: ${[...new Set(unresolved)].join(", ")}`);
  }
  return result;
}

function parseAttributes(tag) {
  const attributes = {};
  for (const match of tag.matchAll(/([:\w-]+)="([^"]*)"/g)) attributes[match[1]] = match[2];
  return attributes;
}

function selectOnlySlide(presentationXml, slideNumber) {
  const listMatch = presentationXml.match(/<p:sldIdLst>[\s\S]*?<\/p:sldIdLst>/);
  if (!listMatch) throw new Error("O PPT mestre não contém uma lista de slides válida.");
  const slideTags = [...listMatch[0].matchAll(/<p:sldId\b[^>]*\/>/g)].map((match) => match[0]);
  const selected = slideTags[slideNumber - 1];
  if (!selected) throw new Error(`O slide ${slideNumber} não existe no PPT mestre.`);
  const relationshipId = parseAttributes(selected)["r:id"];
  return {
    relationshipId,
    xml: presentationXml.replace(listMatch[0], `<p:sldIdLst>${selected}</p:sldIdLst>`),
  };
}

function slidePathForRelationship(relationshipsXml, relationshipId) {
  const tags = [...relationshipsXml.matchAll(/<Relationship\b[^>]*\/>/g)].map((match) => match[0]);
  const relationship = tags.map(parseAttributes).find((item) => item.Id === relationshipId);
  if (!relationship?.Target || !relationship.Type?.endsWith("/slide")) {
    throw new Error("O relacionamento do slide selecionado não foi encontrado.");
  }
  return relationship.Target.replace(/^\//, "");
}

function keepSelectedSlideRelationship(relationshipsXml, relationshipId) {
  let result = relationshipsXml;
  const tags = [...relationshipsXml.matchAll(/<Relationship\b[^>]*\/>/g)].map((match) => match[0]);
  for (const tag of tags) {
    const attributes = parseAttributes(tag);
    if (!attributes.Type?.endsWith("/slide")) continue;
    if (attributes.Id === relationshipId) {
      result = result.replace(tag, tag.replace(/Target="[^"]*"/, 'Target="/ppt/slides/slide1.xml"'));
    } else {
      result = result.replace(tag, "");
    }
  }
  return result;
}

function keepSingleSlideContentType(contentTypesXml) {
  const withoutSlides = contentTypesXml.replace(
    /<Override\b(?=[^>]*PartName="\/ppt\/slides\/slide\d+\.xml")[^>]*\/>/g,
    "",
  );
  const override = '<Override PartName="/ppt/slides/slide1.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.slide+xml" />';
  return withoutSlides.replace("</Types>", `${override}</Types>`);
}

function notesRelationshipPath(slideRelationshipsXml) {
  const tags = [...slideRelationshipsXml.matchAll(/<Relationship\b[^>]*\/>/g)].map((match) => match[0]);
  const notes = tags.map(parseAttributes).find((item) => item.Type?.endsWith("/notesSlide"));
  if (!notes?.Target) return null;
  const notesPath = notes.Target.replace(/^\//, "");
  return `${path.posix.dirname(notesPath)}/_rels/${path.posix.basename(notesPath)}.rels`;
}

function imageDimensions(buffer) {
  if (buffer.length >= 24 && buffer.readUInt32BE(0) === 0x89504e47) {
    return { width: buffer.readUInt32BE(16), height: buffer.readUInt32BE(20) };
  }
  if (buffer[0] !== 0xff || buffer[1] !== 0xd8) return null;
  let offset = 2;
  while (offset + 9 < buffer.length) {
    if (buffer[offset] !== 0xff) { offset += 1; continue; }
    const marker = buffer[offset + 1];
    if (marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc) {
      return { height: buffer.readUInt16BE(offset + 5), width: buffer.readUInt16BE(offset + 7) };
    }
    const segmentLength = buffer.readUInt16BE(offset + 2);
    if (segmentLength < 2) break;
    offset += 2 + segmentLength;
  }
  return null;
}

function coverCropAttributes(dimensions, targetAspect = 4 / 5) {
  if (!dimensions?.width || !dimensions?.height) return "";
  const sourceAspect = dimensions.width / dimensions.height;
  if (Math.abs(sourceAspect - targetAspect) < 0.001) return "";
  if (sourceAspect > targetAspect) {
    const crop = Math.round(((1 - targetAspect / sourceAspect) / 2) * 100000);
    return ` l="${crop}" r="${crop}"`;
  }
  const crop = Math.round(((1 - sourceAspect / targetAspect) / 2) * 100000);
  return ` t="${crop}" b="${crop}"`;
}

function replaceBackgroundRelationship(slideXml, relationshipsXml, mediaPath, dimensions) {
  const pictureMatch = slideXml.match(/<p:pic>[\s\S]*?<\/p:pic>/);
  if (!pictureMatch) throw new Error("O layout fotográfico não contém uma imagem de fundo.");
  const relationshipId = pictureMatch[0].match(/<a:blip\b[^>]*r:embed="([^"]+)"/)?.[1];
  if (!relationshipId) throw new Error("A imagem de fundo do layout não tem relacionamento válido.");

  const crop = coverCropAttributes(dimensions);
  let picture = pictureMatch[0].replace(/<a:srcRect\b[^>]*\/>/g, "");
  if (crop) {
    picture = picture.replace(
      /(<a:blip\b[^>]*\/>)/,
      `$1<a:srcRect${crop} xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" />`,
    );
  }

  const updatedRelationships = relationshipsXml.replace(
    new RegExp(`(<Relationship\\b(?=[^>]*\\bId="${relationshipId}")(?=[^>]*\\bType="[^"]*/image")[^>]*\\bTarget=")[^"]*(")`),
    `$1/${mediaPath}$2`,
  );
  if (updatedRelationships === relationshipsXml) {
    throw new Error("Não foi possível apontar o layout para a nova fotografia.");
  }

  return {
    slideXml: slideXml.replace(pictureMatch[0], picture),
    relationshipsXml: updatedRelationships,
  };
}

function updateCoreTitle(coreXml, title) {
  if (!coreXml) return coreXml;
  const escaped = escapeXmlText(title);
  if (/<dc:title>[\s\S]*?<\/dc:title>/.test(coreXml)) {
    return coreXml.replace(/<dc:title>[\s\S]*?<\/dc:title>/, `<dc:title>${escaped}</dc:title>`);
  }
  return coreXml.replace(/<cp:coreProperties\b[^>]*>/, (opening) => `${opening}<dc:title>${escaped}</dc:title>`);
}

export async function generateFromProductionMaster(plan, image = null) {
  const source = await fs.readFile(PRODUCTION_MASTER_PATH);
  const zip = await JSZip.loadAsync(source);
  const slideNumber = selectProductionSlide(plan);

  const presentationPath = "ppt/presentation.xml";
  const presentationRelsPath = "ppt/_rels/presentation.xml.rels";
  const presentationXml = await zip.file(presentationPath).async("string");
  const presentationRelsXml = await zip.file(presentationRelsPath).async("string");
  const selected = selectOnlySlide(presentationXml, slideNumber);
  const slidePath = slidePathForRelationship(presentationRelsXml, selected.relationshipId);
  const slideRelsPath = `${path.posix.dirname(slidePath)}/_rels/${path.posix.basename(slidePath)}.rels`;

  let slideXml = await zip.file(slidePath).async("string");
  let slideRelsXml = await zip.file(slideRelsPath).async("string");
  slideXml = replaceMarkers(slideXml, markerValues(plan, slideNumber));
  zip.file(presentationPath, selected.xml);

  if (image?.base64 && slideNumber <= SLIDES.signature) {
    const buffer = Buffer.from(image.base64, "base64");
    const extension = image.mimeType === "image/png" ? "png" : "jpeg";
    const mediaPath = `ppt/media/generated-photo.${extension}`;
    const replaced = replaceBackgroundRelationship(
      slideXml,
      slideRelsXml,
      mediaPath,
      imageDimensions(buffer),
    );
    slideXml = replaced.slideXml;
    slideRelsXml = replaced.relationshipsXml;
    zip.file(mediaPath, buffer, { binary: true });
  }

  const notesRelsPath = notesRelationshipPath(slideRelsXml);
  if (notesRelsPath && zip.file(notesRelsPath)) {
    const notesRelsXml = await zip.file(notesRelsPath).async("string");
    zip.file(
      notesRelsPath,
      notesRelsXml.replace(
        /(<Relationship\b(?=[^>]*Type="[^"]*\/slide")[^>]*Target=")[^"]*(")/g,
        "$1/ppt/slides/slide1.xml$2",
      ),
    );
  }

  for (const entry of Object.keys(zip.files)) {
    if (/^ppt\/slides\/slide\d+\.xml$/.test(entry) || /^ppt\/slides\/_rels\/slide\d+\.xml\.rels$/.test(entry)) {
      zip.remove(entry);
    }
  }
  zip.file("ppt/slides/slide1.xml", slideXml);
  zip.file("ppt/slides/_rels/slide1.xml.rels", slideRelsXml);
  zip.file(presentationRelsPath, keepSelectedSlideRelationship(presentationRelsXml, selected.relationshipId));

  const contentTypesPath = "[Content_Types].xml";
  const contentTypesXml = await zip.file(contentTypesPath).async("string");
  zip.file(contentTypesPath, keepSingleSlideContentType(contentTypesXml));

  const appPath = "docProps/app.xml";
  const appXml = await zip.file(appPath)?.async("string");
  if (appXml) zip.file(appPath, appXml.replace(/<Slides>\d+<\/Slides>/, "<Slides>1</Slides>"));

  const corePath = "docProps/core.xml";
  const coreXml = await zip.file(corePath)?.async("string");
  if (coreXml) zip.file(corePath, updateCoreTitle(coreXml, `ANFATRE — ${plan.jobTitle || plan.highlight || "Post"}`));

  return zip.generateAsync({
    type: "nodebuffer",
    compression: "DEFLATE",
    compressionOptions: { level: 6 },
    platform: "UNIX",
  });
}
