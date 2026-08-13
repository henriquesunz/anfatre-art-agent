import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { parsePastedBriefing } from "../lib/parse-briefing.mjs";

const testDir = path.dirname(fileURLToPath(import.meta.url));

const sample = `
PRIMEIRA QUINZENA DE AGOSTO:

11/08 -
1. Título: "Glossário do Caravanista: entenda os termos técnicos de forma simples"
2. Tamanho da Arte:
- Timeline Instagram
___________________________________________________________

21/08 -
1. Título: "
TELA1: Roteiros pelo Brasil: 5 Destinos RV Friendly para Viajar de Motorhome

TELA2:
Serra Gaúcha (RS)
Destino: Gramado e Canela
Por que ir: Clima europeu e gastronomia.

TELA3:
Qual desses destinos vai ser a sua próxima parada?
💬 Comente: qual o seu favorito?
🔖 Salve este post!
"
2. Tamanho da Arte:
- Timeline Instagram
`;

test("separa posts únicos e carrosséis do briefing colado", () => {
  const items = parsePastedBriefing(sample);
  assert.equal(items.length, 2);
  assert.equal(items[0].date, "11/08");
  assert.equal(items[0].kind, "single");
  assert.match(items[0].title, /Glossário do Caravanista/);
  assert.equal(items[1].kind, "carousel");
  assert.equal(items[1].slideCount, 3);
  assert.equal(items[1].slides[1].title, "Serra Gaúcha (RS)");
  assert.match(items[1].brief.cta, /Comente/);
  assert.equal(items[1].format, "Timeline Instagram");
});

test("explica quando não encontra datas", () => {
  assert.throws(() => parsePastedBriefing("um título sem data"), /Não encontrei datas/);
});

test("interpreta a pauta quinzenal de agosto em seis artes", () => {
  const raw = fs.readFileSync(path.join(testDir, "fixtures", "briefing-agosto.txt"), "utf8");
  const items = parsePastedBriefing(raw);
  assert.equal(items.length, 6);
  assert.deepEqual(items.map((item) => item.date), ["11/08", "12/08", "17/08", "21/08", "24/08", "28/08"]);
  assert.deepEqual(items.map((item) => item.slideCount), [1, 1, 1, 6, 1, 1]);
  assert.equal(items[3].brief.templateId, "carousel");
  assert.match(items[3].slides[5].body, /Salve este post/);
  assert.match(items[3].warnings[0], /promete 5 itens.*detalha 4/);
});
