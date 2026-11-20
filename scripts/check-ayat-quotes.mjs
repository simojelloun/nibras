#!/usr/bin/env node
// Vérifie que chaque citation coranique entre ﴿ ﴾ est une copie EXACTE (sous-chaîne, sans
// normalisation) d'un verset de quran-json, et si possible du verset indiqué en référence.
//
//   node scripts/check-ayat-quotes.mjs [fichier.csv ...]   (sans argument : les questions de www/index.html)

import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { HEADER, HTML, parseCSV, readBank } from "./lib/questions.mjs";
import vm from "node:vm";

const QURAN = createRequire(import.meta.url)("quran-json/dist/quran.json");
const names = new Map(QURAN.map((s, i) => [s.name, i + 1]));
const all = QURAN.flatMap((s, i) => s.verses.map((v) => ({ s: i + 1, v: v.id, text: v.text })));

// « سورة البقرة، الآية 255 » / « الآيات 1-5 » / « الآيتان 1 و2 » → liste de [sourate, verset]
function refs(ref) {
  const out = [];
  for (const m of ref.matchAll(/سورة\s+([^،,؛;\d]+?)\s*[،,]?\s*(?:الآية|الآيات|الآيتان|آية)\s*([\d\s\-–و،,]+)/g)) {
    const s = names.get(m[1].trim().replace(/^ال(?=ال)/, ""));
    if (!s) continue;
    const nums = m[2].match(/\d+/g).map(Number);
    const [a, b] = m[2].match(/\d+\s*[-–]\s*\d+/) ? [nums[0], nums[1]] : [Math.min(...nums), Math.max(...nums)];
    for (let v = a; v <= b; v++) out.push([s, v]);
  }
  return out;
}

const items = [];
const files = process.argv.slice(2);
if (files.length) {
  for (const f of files) {
    const [head, ...rows] = parseCSV(readFileSync(f, "utf8"));
    const c = (h) => head.indexOf(h);
    rows.forEach((r, k) => items.push({
      where: `${f}:${k + 2}`,
      texts: [r[c("question")], r[c("bonne réponse")], r[c("autre réponse 1")], r[c("autre réponse 2")], r[c("autre réponse 3")]],
      ref: r[c("référence")] || "",
    }));
  }
} else {
  const html = readFileSync(HTML, "utf8");
  const lines = html.split("\n");
  for (let i = 0; i < lines.length; i++) {
    if (!/^\['[a-z]',[123],/.test(lines[i])) continue;
    const q = vm.runInNewContext(lines[i].trim().replace(/,\s*$/, ""));
    items.push({ where: `www/index.html:${i + 1}`, texts: [q[2], ...q[3]], ref: q[4] });
  }
}

let bad = 0, n = 0, other = 0;
for (const it of items) {
  for (const t of it.texts) {
    for (const m of String(t || "").matchAll(/﴿([^﴾]*)﴾/g)) {
      n++;
      const quote = m[1].trim();
      const cited = refs(it.ref);
      const inRef = cited.some(([s, v]) => {
        const verse = QURAN[s - 1]?.verses.find((x) => x.id === v);
        return verse && verse.text.includes(quote);
      });
      if (inRef) continue;
      const found = all.find((x) => x.text.includes(quote));
      if (found) { other++; console.log(`⚠ ${it.where} : citation exacte, mais trouvée en ${found.s}:${found.v}, pas dans la référence « ${it.ref} »`); }
      else { bad++; console.log(`✘ ${it.where} : citation introuvable telle quelle dans quran-json : ﴿${quote.slice(0, 60)}﴾`); }
    }
  }
}
console.log(`\n${n} citation(s) contrôlée(s) : ${n - bad - other} conforme(s) à la référence, ${other} avertissement(s), ${bad} erreur(s).`);
process.exit(bad ? 1 : 0);
