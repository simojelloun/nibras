#!/usr/bin/env node
// Intègre « آية اليوم » dans www/index.html à partir de data/ayat.json.
//
//   node scripts/build-ayat.mjs          écrit le tableau AYAT dans index.html
//   node scripts/build-ayat.mjs --check  vérifie seulement qu'il est à jour (code 1 sinon)
//
// data/ayat.json : [[sourate, verset, "explication"], ...]
// Le texte du verset n'est JAMAIS tapé à la main : il est copié tel quel (sans normalisation
// Unicode) depuis le paquet npm quran-json (dist/quran.json, texte othmani de quranenc.com).
// Résultat dans index.html, entre les marqueurs AYAT:début et AYAT:fin :
//   const AYAT=[[sourate, verset, "nom de la sourate", "texte du verset", "explication"], ...];

import { readFileSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const HTML = join(ROOT, "www/index.html");
const require = createRequire(import.meta.url);
const QURAN = require("quran-json/dist/quran.json");
const ayat = JSON.parse(readFileSync(join(ROOT, "data/ayat.json"), "utf8"));

const problems = [];
const seen = new Set();
const rows = ayat.map((row, i) => {
  const [s, v, expl] = row;
  const where = `data/ayat.json, entrée ${i + 1} (${s}:${v})`;
  if (!Array.isArray(row) || row.length !== 3) problems.push(`${where} : 3 champs attendus`);
  const sura = QURAN[s - 1];
  const verse = sura && sura.verses.find((x) => x.id === v);
  if (!Number.isInteger(s) || !sura) problems.push(`${where} : sourate inconnue`);
  else if (!verse) problems.push(`${where} : la sourate ${sura.name} n'a que ${sura.total_verses} versets`);
  if (typeof expl !== "string" || !expl.trim()) problems.push(`${where} : explication vide`);
  if (seen.has(`${s}:${v}`)) problems.push(`${where} : verset en double`);
  seen.add(`${s}:${v}`);
  return [s, v, sura ? sura.name : "", verse ? verse.text : "", String(expl ?? "").trim()];
});
if (problems.length) {
  console.error(problems.map((p) => "✘ " + p).join("\n"));
  process.exit(1);
}

const START = "/* AYAT:début — généré par scripts/build-ayat.mjs, ne pas modifier à la main */";
const END = "/* AYAT:fin */";
const block = `${START}\nconst AYAT=[\n${rows.map((r) => JSON.stringify(r)).join(",\n")}\n];\n${END}`;

const html = readFileSync(HTML, "utf8");
const a = html.indexOf(START), b = html.indexOf(END);
let next;
if (a >= 0 && b > a) next = html.slice(0, a) + block + html.slice(b + END.length);
else {
  // Première intégration : juste après la fin du tableau Q.
  const qStart = html.indexOf("\nconst Q=[\n");
  const qEnd = qStart >= 0 ? html.indexOf("\n];\n", qStart) : -1;
  if (qEnd < 0) { console.error("Fin du tableau Q introuvable dans index.html"); process.exit(2); }
  next = html.slice(0, qEnd + 4) + block + "\n" + html.slice(qEnd + 4);
}

if (process.argv.includes("--check")) {
  if (next !== html) { console.error("✘ AYAT n'est pas à jour : lancez node scripts/build-ayat.mjs"); process.exit(1); }
  console.log(`✔ AYAT à jour (${rows.length} versets, texte identique à quran-json).`);
} else {
  writeFileSync(HTML, next);
  console.log(`✔ ${rows.length} versets écrits dans www/index.html.`);
}
