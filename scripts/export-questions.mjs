#!/usr/bin/env node
// Exporte les questions rédigées à la main (pas celles générées depuis le Mushaf) en CSV,
// pour les faire relire.
//
//   node scripts/export-questions.mjs [fichier.csv]     (par défaut : relecture/questions-redigees.csv)
//
// Format : UTF-8 avec BOM, séparateur « ; » (s'ouvre directement dans Excel en français,
// LibreOffice et Google Sheets). Une ligne par question. Les colonnes « vérifié » et
// « remarque » sont reprises de data/verifications.json si une relecture a déjà été réimportée.
// Réimport : node scripts/import-questions.mjs

import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import { HEADER, HTML, ROOT, loadVerif, readBank, toCSV } from "./lib/questions.mjs";

const out = process.argv[2] || join(ROOT, "relecture/questions-redigees.csv");
const { written } = readBank(readFileSync(HTML, "utf8"));
const verif = loadVerif();

const rows = [HEADER];
written.forEach(({ q, fp }, k) => {
  const [theme, level, text, options, ref] = q;
  const v = verif[text] || {};
  rows.push([fp, k + 1, theme, level, text, options[0], options[1] ?? "", options[2] ?? "", options[3] ?? "", ref,
             v.verifie ?? "", v.remarque ?? ""]);
});

mkdirSync(dirname(out), { recursive: true });
writeFileSync(out, toCSV(rows));
const done = written.filter(({ q }) => verif[q[2]]?.verifie).length;
console.log(`✔ ${written.length} questions rédigées exportées dans ${relative(process.cwd(), out)}` +
            (done ? ` (${done} déjà marquées vérifiées)` : ""));
