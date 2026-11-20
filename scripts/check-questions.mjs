#!/usr/bin/env node
// Vérifie la banque de questions Q de www/index.html.
//
//   node scripts/check-questions.mjs [chemin/vers/index.html]
//
// Contrôles (erreur = code de sortie 1) :
//   - chaque entrée a 5 champs : [thème, niveau, question, options, référence]
//   - thème connu (liste THEMES de server/src/worker.js, qui doit correspondre à CATS)
//   - niveau 1, 2 ou 3
//   - 2 à 4 options, non vides, sans doublon
//   - question et référence non vides
//   - texte de question unique
//   - aucune apostrophe ' dans les textes
// Avertissement seulement : deux questions identiques une fois les voyelles (tashkîl) retirées.
// Affiche ensuite le nombre de questions par thème et par niveau.

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join, relative } from "node:path";
import vm from "node:vm";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const file = process.argv[2] || join(ROOT, "www/index.html");
const html = readFileSync(file, "utf8");
const lines = html.split("\n");

const errors = [];
const warnings = [];
const err = (line, msg) => errors.push({ line, msg });
const warn = (line, msg) => warnings.push({ line, msg });

// ---------- thèmes ----------
const workerSrc = readFileSync(join(ROOT, "server/src/worker.js"), "utf8");
const themesMatch = workerSrc.match(/const THEMES\s*=\s*(\[[^\]]*\])/);
if (!themesMatch) {
  console.error("THEMES introuvable dans server/src/worker.js");
  process.exit(2);
}
const THEMES = vm.runInNewContext(themesMatch[1]);

const catsStart = html.indexOf("const CATS={");
const catsEnd = html.indexOf("\n};", catsStart);
const CATS = catsStart >= 0 && catsEnd > 0
  ? vm.runInNewContext("(" + html.slice(catsStart + "const CATS=".length, catsEnd + 2) + ")")
  : null;
if (!CATS) err(0, "objet CATS introuvable dans index.html");
else {
  const catKeys = Object.keys(CATS);
  const missingClient = THEMES.filter((t) => !catKeys.includes(t));
  const missingServer = catKeys.filter((t) => !THEMES.includes(t));
  if (missingClient.length || missingServer.length)
    err(0, `thèmes désalignés : absents de CATS [${missingClient}], absents de THEMES [${missingServer}]`);
}

// ---------- délimiter le tableau Q ----------
const startIdx = lines.findIndex((l) => /^\s*const Q\s*=\s*\[\s*$/.test(l));
if (startIdx < 0) {
  console.error("Début du tableau « const Q=[ » introuvable.");
  process.exit(2);
}
let endIdx = -1;
for (let i = startIdx + 1; i < lines.length; i++) if (/^\s*\];?\s*$/.test(lines[i])) { endIdx = i; break; }
if (endIdx < 0) {
  console.error("Fin du tableau Q (ligne « ]; ») introuvable.");
  process.exit(2);
}

// Le tableau entier doit être du JavaScript valide (sinon l'application ne démarre pas).
const block = lines.slice(startIdx + 1, endIdx).join("\n");
let whole = null;
try { whole = vm.runInNewContext("[" + block + "\n]"); }
catch (e) { err(0, `le tableau Q n'est pas du JavaScript valide : ${e.message}`); }

// ---------- contrôle ligne par ligne ----------
const norm = (s) => String(s).normalize("NFC").replace(/\s+/g, " ").trim();
const bare = (s) => norm(s).replace(/[ً-ٰٟۖ-ۭـ]/g, ""); // sans tashkîl ni tatwîl
const seen = new Map();      // texte exact -> ligne
const seenBare = new Map();  // texte sans voyelles -> ligne
const counts = {};
let n = 0;

for (let i = startIdx + 1; i < endIdx; i++) {
  const ln = i + 1;
  const raw = lines[i].trim();
  if (!raw || raw.startsWith("//") || (raw.startsWith("/*") && raw.endsWith("*/"))) continue;
  if (!raw.startsWith("[")) { err(ln, `ligne inattendue dans Q : ${raw.slice(0, 60)}`); continue; }

  let q;
  try { q = vm.runInNewContext(raw.replace(/,\s*$/, "")); }
  catch (e) {
    const apos = (raw.match(/'/g) || []).length;
    err(ln, `ligne illisible (${e.message})${apos % 2 ? " — nombre impair d'apostrophes : une apostrophe dans un texte ?" : ""}`);
    continue;
  }
  n++;

  if (!Array.isArray(q) || q.length !== 5) { err(ln, `${Array.isArray(q) ? q.length : 0} champs au lieu de 5`); continue; }
  const [theme, level, text, options, ref] = q;

  if (!THEMES.includes(theme)) err(ln, `thème inconnu « ${theme} » (attendu : ${THEMES.join(", ")})`);
  if (![1, 2, 3].includes(level)) err(ln, `niveau invalide « ${level} » (attendu : 1, 2 ou 3)`);
  if (typeof text !== "string" || !norm(text)) err(ln, "question vide");
  if (typeof ref !== "string" || !norm(ref)) err(ln, "référence vide");

  if (!Array.isArray(options)) err(ln, "les options ne sont pas une liste");
  else {
    if (options.length < 2 || options.length > 4) err(ln, `${options.length} options (attendu : 2 à 4)`);
    if (options.some((o) => typeof o !== "string" || !norm(o))) err(ln, "option vide ou non textuelle");
    const opts = options.map(norm);
    const dup = opts.filter((o, k) => opts.indexOf(o) !== k);
    if (dup.length) err(ln, `options en double : ${[...new Set(dup)].join(" | ")}`);
  }

  for (const s of [text, ref, ...(Array.isArray(options) ? options : [])])
    if (typeof s === "string" && s.includes("'")) err(ln, `apostrophe dans le texte : ${s.slice(0, 50)}`);

  if (typeof text === "string" && norm(text)) {
    const t = norm(text), b = bare(text);
    if (seen.has(t)) err(ln, `question en double (déjà ligne ${seen.get(t)}) : ${t.slice(0, 60)}`);
    else {
      seen.set(t, ln);
      if (seenBare.has(b)) warn(ln, `question presque identique à la ligne ${seenBare.get(b)} (seules les voyelles diffèrent)`);
      else seenBare.set(b, ln);
    }
  }

  if (THEMES.includes(theme) && [1, 2, 3].includes(level)) {
    counts[theme] ??= { 1: 0, 2: 0, 3: 0 };
    counts[theme][level]++;
  }
}

if (whole && whole.length !== n)
  err(0, `le tableau contient ${whole.length} entrées mais ${n} lignes de questions ont été lues (question sur plusieurs lignes ?)`);

// ---------- rapport ----------
const where = relative(process.cwd(), file) || file;
const at = (l) => (l ? `${where}:${l}` : where);

const names = { q: "Coran", h: "Hadith", s: "Sîra", p: "Compagnons", f: "Fiqh", n: "Prophètes", t: "Histoire", a: "Croyance" };
const pad = (s, w) => String(s).padEnd(w);
const lpad = (s, w) => String(s).padStart(w);
console.log(`\nBanque de questions : ${n} questions (${where})\n`);
console.log(`${pad("Thème", 16)}${lpad("Facile", 8)}${lpad("Moyen", 8)}${lpad("Difficile", 11)}${lpad("Total", 8)}`);
const tot = { 1: 0, 2: 0, 3: 0 };
for (const t of THEMES) {
  const c = counts[t] || { 1: 0, 2: 0, 3: 0 };
  [1, 2, 3].forEach((k) => (tot[k] += c[k]));
  console.log(`${pad(`${t}  ${names[t] || ""}`, 16)}${lpad(c[1], 8)}${lpad(c[2], 8)}${lpad(c[3], 11)}${lpad(c[1] + c[2] + c[3], 8)}`);
}
console.log(`${pad("Total", 16)}${lpad(tot[1], 8)}${lpad(tot[2], 8)}${lpad(tot[3], 11)}${lpad(tot[1] + tot[2] + tot[3], 8)}\n`);

if (warnings.length) {
  console.log(`${warnings.length} avertissement(s) :`);
  for (const w of warnings) console.log(`  ⚠ ${at(w.line)}  ${w.msg}`);
  console.log();
}
if (errors.length) {
  console.log(`${errors.length} erreur(s) :`);
  for (const e of errors) console.log(`  ✘ ${at(e.line)}  ${e.msg}`);
  console.log();
  process.exit(1);
}
console.log("✔ Aucune erreur.");
