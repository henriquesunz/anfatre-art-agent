function inline(value) {
  return String(value || "").replace(/\s+/g, " ").trim();
}

function multiline(value) {
  return String(value || "")
    .replace(/\r/g, "")
    .replace(/[ \t]+/g, " ")
    .replace(/ *\n */g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

export function exactCopyFields(brief, templateId) {
  const title = inline(brief.title || brief.slides?.[0]?.title || brief.jobTitle);
  const subtitle = inline(brief.subtitle);
  const cta = inline(brief.cta);
  const copyOrder = brief.copyOrder || (subtitle ? "intro-highlight" : "highlight-only");

  // Os campos mudam de posição conforme o template, mas o conteúdo nunca é reescrito.
  if (["photo-green", "photo-blue", "photo-signature"].includes(templateId) && copyOrder === "highlight-intro") {
    return { intro: subtitle, highlight: title, closing: cta };
  }
  if (["photo-green", "photo-blue", "photo-signature"].includes(templateId) && copyOrder === "highlight-only") {
    return { intro: "", highlight: title, closing: cta };
  }
  if (templateId === "question") {
    return { intro: "", highlight: title, closing: subtitle || cta };
  }
  return { intro: title, highlight: subtitle, closing: cta };
}

export function exactPlan(brief, templateId, extra = {}) {
  return {
    ...extra,
    templateId,
    jobTitle: inline(brief.jobTitle),
    sourceTitle: inline(brief.title),
    sourceSubtitle: inline(brief.subtitle),
    copyOrder: brief.copyOrder || (brief.subtitle ? "intro-highlight" : "highlight-only"),
    ...exactCopyFields(brief, templateId),
    caption: multiline(brief.mainMessage),
    slides: brief.slides || [],
  };
}
