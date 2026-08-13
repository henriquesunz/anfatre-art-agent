import assert from "node:assert/strict";
import test from "node:test";
import { exactPlan } from "../lib/plan-copy.mjs";

const brief = {
  title: "Glossário do Caravanista:",
  subtitle: "entenda os termos técnicos de forma simples",
  cta: "Salve este post!",
  jobTitle: "Glossário do Caravanista: entenda os termos técnicos de forma simples",
  mainMessage: "Glossário do Caravanista:\nentenda os termos técnicos de forma simples",
  slides: [],
};

test("preserva título e subtítulo exatamente como chegaram", () => {
  const green = exactPlan(brief, "photo-green");
  assert.equal(green.intro, brief.title);
  assert.equal(green.highlight, brief.subtitle);
  assert.equal(green.closing, brief.cta);
  assert.equal(green.caption, brief.mainMessage);

  const blue = exactPlan(brief, "photo-blue");
  assert.equal(blue.highlight, brief.title);
  assert.equal(blue.intro, brief.subtitle);

  const question = exactPlan(brief, "question");
  assert.equal(question.highlight, brief.title);
  assert.equal(question.closing, brief.subtitle);
});
