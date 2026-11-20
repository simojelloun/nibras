#!/usr/bin/env node
// Réimporte dans www/index.html le CSV produit par export-questions.mjs, une fois relu et corrigé.
//
//   node scripts/import-questions.mjs [fichier.csv] [--essai]
//     (par défaut : relecture/questions-redigees.csv ; --essai : affiche les changements sans rien écrire)
//
// Règles :
//   - Une ligne avec une « réf. interne » remplace la question correspondante (retrouvée par cette
//     référence, même si des questions ont été ajoutées ou déplacées depuis l'export).
//   - Une ligne sans « réf. interne » est une NOUVELLE question, ajoutée à la fin des questions rédigées.
//   - Une ligne dont la cellule « question » est vidée SUPPRIME la question.
//   - Une question absente du CSV (ligne effacée du tableur) n'est PAS touchée.
//   - Les colonnes « vérifié » et « remarque » sont enregistrées dans data/verifications.json
//     (le format de Q n'a pas de place pour elles) et reviennent au prochain export.
//   - Au moindre problème, rien n'est écrit : le script liste les lignes à corriger.
//   - Les questions générées depuis le Mushaf ne sont jamais modifiées.

import { execFileSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import { join, relative } from "node:path";
import vm from "node:vm";
import {
  GENERATED_MARK, HEADER, HTML, ROOT, VERIF, formatQ, loadVerif, parseCSV, readBank, validate,
} from "./lib/questions.mjs";

const args = process.argv.slice(2);
const dry = args.includes("--essai");
const file = args.find((a) => !a.startsWith("--")) || join(ROOT, "relecture/questions-redigees.csv");

const raw = readFileSync(file, "utf8");
if (raw.includes("�") || !/[؀-ۿ]/.test(raw)) {
  console.error("✘ Le CSV ne semble pas être en UTF-8 (texte arabe illisible).\n" +
                "  Dans Excel : Fichier > Enregistrer sous > « CSV UTF-8 (délimité par des virgules) ».");
  process.exit(1);
}
const [head, ...rows] = parseCSV(raw);
const norm = (s) => String(s ?? "").trim().toLowerCase();
const col = Object.fromEntries(HEADER.map((h) => [h, head.findIndex((x) => norm(x) === norm(h))]));
const missing = HEADER.filter((h) => col[h] < 0 && h !== "remarque");
if (missing.length) {
  console.error(`✘ Colonnes introuvables dans l'en-tête du CSV : ${missing.join(", ")}`);
  process.exit(1);
}
// Retours à la ligne et espaces multiples (fréquents après un passage dans un tableur) → une espace.
const get = (r, h) => (col[h] < 0 ? "" : String(r[col[h]] ?? "").replace(/\s+/g, " ").trim());

const html = readFileSync(HTML, "utf8");
const bank = readBank(html);
const byFp = new Map(bank.written.map((w) => [w.fp, w]));

const errors = [];
const changes = [];  // { kind: "modif" | "ajout" | "suppr", w?, q? }
const verifRows = []; // { text, verifie, remarque }
const seenFp = new Set();

rows.forEach((r, k) => {
  const where = `ligne ${k + 2} du CSV${get(r, "n°") ? ` (n° ${get(r, "n°")})` : ""}`;
  const fp = get(r, "réf. interne (ne pas modifier)");
  const text = get(r, "question");
  let w = null;
  if (fp) {
    if (seenFp.has(fp)) { errors.push(`${where} : réf. interne en double (ligne copiée ?)`); return; }
    seenFp.add(fp);
    w = byFp.get(fp);
    if (!w) {
      errors.push(`${where} : question introuvable dans index.html (réf. ${fp}) — elle a été modifiée ` +
                  "depuis l'export. Refaites un export, puis reportez-y vos corrections.");
      return;
    }
  }
  if (!text) {
    if (w) changes.push({ kind: "suppr", w });
    return;
  }
  const options = [get(r, "bonne réponse"), get(r, "autre réponse 1"), get(r, "autre réponse 2"), get(r, "autre réponse 3")]
    .filter((x, i) => i === 0 || x);
  const levelTxt = get(r, "niveau");
  const level = /^[123]$/.test(levelTxt) ? Number(levelTxt) : levelTxt;
  const q = [get(r, "thème").toLowerCase(), level, text, options, get(r, "référence")];
  const p = validate(q);
  if (p.length) { errors.push(`${where} : ${p.join(" ; ")}`); return; }
  if (!w) changes.push({ kind: "ajout", q });
  else if (JSON.stringify(q) !== JSON.stringify(w.q)) changes.push({ kind: "modif", w, q });
  verifRows.push({ text, verifie: get(r, "vérifié"), remarque: get(r, "remarque") });
});

// Texte de question unique sur toute la banque après import.
const removed = new Set(changes.filter((c) => c.kind !== "ajout").map((c) => c.w.line));
const finalTexts = new Map();
const lines = bank.lines;
for (let i = bank.start + 1; i < bank.end; i++) {
  if (removed.has(i) || !lines[i].trim().startsWith("[")) continue;
  const t = lines[i].match(/^\s*\['[a-z]',\d,'([^']*)'/);
  if (t) finalTexts.set(t[1].replace(/\s+/g, " ").trim(), `index.html ligne ${i + 1}`);
}
for (const c of changes.filter((c) => c.kind !== "suppr")) {
  const t = c.q[2].replace(/\s+/g, " ").trim();
  if (finalTexts.has(t)) errors.push(`question en double avec ${finalTexts.get(t)} : ${t.slice(0, 60)}`);
  else finalTexts.set(t, "une autre ligne du CSV");
}

if (errors.length) {
  console.error(`✘ ${errors.length} problème(s), rien n'a été modifié :`);
  for (const e of errors) console.error("  - " + e);
  process.exit(1);
}

const n = (k) => changes.filter((c) => c.kind === k).length;
const untouched = bank.written.length - seenFp.size;
console.log(`${relative(process.cwd(), file)} : ${rows.length} lignes lues.`);
console.log(`  ${n("modif")} modifiée(s), ${n("ajout")} ajoutée(s), ${n("suppr")} supprimée(s).`);
if (untouched) console.log(`  ${untouched} question(s) rédigée(s) absente(s) du CSV : laissées telles quelles.`);
for (const c of changes) {
  const t = (c.q || c.w.q)[2].slice(0, 70);
  console.log(`  ${{ modif: "~", ajout: "+", suppr: "-" }[c.kind]} ${t}`);
}

if (dry) { console.log("\n(--essai : rien n'a été écrit)"); process.exit(0); }

// ---------- écriture ----------
const out = lines.slice();
for (const c of changes) {
  if (c.kind === "modif") out[c.w.line] = formatQ(c.q);
  if (c.kind === "suppr") out[c.w.line] = null;
}
const added = changes.filter((c) => c.kind === "ajout").map((c) => formatQ(c.q));
if (added.length) {
  let at = bank.mark;                            // juste avant le repère des questions générées
  while (at > bank.start + 1 && !out[at - 1]?.trim()) at--; // en sautant les lignes vides
  out[at - 1] = out[at - 1] + "\n" + added.join("\n");
}
const next = out.filter((l) => l !== null).join("\n");
// Garde-fou : le nouveau tableau Q doit se relire entièrement avant d'écrire quoi que ce soit.
try {
  const b = readBank(next);
  vm.runInNewContext("[" + b.lines.slice(b.start + 1, b.end).join("\n") + "\n]");
  const expected = bank.written.length + n("ajout") - n("suppr");
  if (b.written.length !== expected) throw new Error(`${b.written.length} questions rédigées au lieu de ${expected}`);
} catch (e) {
  console.error(`✘ Erreur interne, rien n'a été écrit : ${e.message}`);
  process.exit(1);
}
if (next !== html) writeFileSync(HTML, next);

// Suivi de la relecture.
const verif = loadVerif();
for (const c of changes) if (c.kind !== "ajout") delete verif[c.w.q[2]];
for (const v of verifRows) {
  if (v.verifie || v.remarque) verif[v.text] = { verifie: v.verifie, remarque: v.remarque };
  else delete verif[v.text];
}
const sorted = Object.fromEntries(Object.entries(verif).sort(([a], [b]) => a.localeCompare(b, "ar")));
writeFileSync(VERIF, JSON.stringify(sorted, null, 1) + "\n");
const nv = Object.values(sorted).filter((v) => v.verifie).length;
console.log(`\n✔ index.html mis à jour. Suivi : ${nv} question(s) marquée(s) dans « vérifié » (data/verifications.json).`);

// Contrôle final de toute la banque.
try {
  execFileSync(process.execPath, [join(ROOT, "scripts/check-questions.mjs")], { stdio: "inherit" });
} catch {
  console.error("✘ check-questions a trouvé des erreurs : corrigez-les (ou annulez avec git checkout www/index.html).");
  process.exit(1);
}
console.log("Pensez ensuite à : npx cap sync, puis redéployer le serveur.");
