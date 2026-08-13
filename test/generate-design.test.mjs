import assert from "node:assert/strict";
import test from "node:test";
import { generateDesignPptx } from "../lib/generate-design.mjs";

const plans = [
  {
    templateId: "photo-blue",
    jobTitle: "11/08 — Glossário do Caravanista: entenda os termos técnicos de forma simples",
    sourceTitle: "Glossário do Caravanista: entenda os termos técnicos de forma simples",
    intro: "Glossário do Caravanista:",
    highlight: "entenda os termos técnicos de forma simples",
    copyOrder: "intro-highlight",
    closing: "",
  },
  {
    templateId: "institutional",
    jobTitle: "28/08 — Selo Anfatre: O que significa para um fabricante ser associado?",
    sourceTitle: "Selo Anfatre: O que significa para um fabricante ser associado?",
    intro: "Selo Anfatre: o que significa ser fabricante associado?",
    highlight: "SELO ANFATRE: O QUE SIGNIFICA SER ASSOCIADO",
    closing: "",
  },
  {
    templateId: "question",
    jobTitle: "24/08 — Alugar x Comprar",
    sourceTitle: "Alugar x Comprar: Qual é o momento ideal para cada escolha?",
    intro: "ALUGAR X COMPRAR",
    highlight: "ECONOMIA, ORÇAMENTO E ESTILO DE VIDA",
    closing: "Comente se você costuma alugar ou pretende comprar e por quê. Queremos saber!",
  },
  {
    templateId: "photo-blue",
    jobTitle: "Viaje com mais conforto",
    sourceTitle: "Viaje com mais conforto",
    intro: "A vida em poucos metros quadrados: dicas de organização",
    highlight: "Viaje com mais conforto",
    copyOrder: "highlight-intro",
    closing: "",
  },
  {
    templateId: "photo-signature",
    jobTitle: "Qual a importância da ANFATRE no seu dia a dia?",
    sourceTitle: "Qual a importância da ANFATRE no seu dia a dia?",
    intro: "",
    highlight: "Qual a importância da ANFATRE no seu dia a dia?",
    copyOrder: "highlight-only",
    closing: "",
  },
];

test("gera PPTX válidos com títulos longos dos casos relatados", async () => {
  for (const plan of plans) {
    const bytes = await generateDesignPptx(plan);
    assert.equal(bytes.subarray(0, 2).toString(), "PK");
    assert.ok(bytes.length > 100_000);
  }
});
