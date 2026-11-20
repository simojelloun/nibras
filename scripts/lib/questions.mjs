// Outils partagés par export-questions.mjs et import-questions.mjs.
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import vm from "node:vm";

export const ROOT = join(dirname(fileURLToPath(import.meta.url)), "../..");
export const HTML = join(ROOT, "www/index.html");
export const VERIF = join(ROOT, "data/verifications.json");
// Tout ce qui suit ce commentaire dans Q est généré depuis le texte du Mushaf : jamais exporté.
export const GENERATED_MARK = "أسئلة القرآن المولَّدة من نصّ المصحف";

export const THEMES = vm.runInNewContext(
  readFileSync(join(ROOT, "server/src/worker.js"), "utf8").match(/const THEMES\s*=\s*(\[[^\]]*\])/)[1]);

// Empreinte d'une question : permet de retrouver sa ligne au réimport, même si elle a bougé.
export const fingerprint = (q) => createHash("sha1").update(JSON.stringify(q)).digest("hex").slice(0, 12);

// Découpe index.html : lignes du fichier, et questions rédigées (avant le repère des générées).
export function readBank(html) {
  const lines = html.split("\n");
  const start = lines.findIndex((l) => /^\s*const Q\s*=\s*\[\s*$/.test(l));
  if (start < 0) throw new Error("début du tableau « const Q=[ » introuvable");
  let end = -1, mark = -1;
  for (let i = start + 1; i < lines.length; i++) {
    if (mark < 0 && lines[i].includes(GENERATED_MARK)) mark = i;
    if (/^\s*\];?\s*$/.test(lines[i])) { end = i; break; }
  }
  if (end < 0) throw new Error("fin du tableau Q introuvable");
  if (mark < 0) throw new Error(`repère des questions générées introuvable (« ${GENERATED_MARK} »)`);
  const written = [];
  for (let i = start + 1; i < mark; i++) {
    const raw = lines[i].trim();
    if (!raw.startsWith("[")) continue;
    const q = vm.runInNewContext(raw.replace(/,\s*$/, ""));
    written.push({ line: i, q, fp: fingerprint(q) });
  }
  return { lines, start, end, mark, written };
}

// Écrit une question au format de Q (chaînes entre apostrophes).
export function formatQ([theme, level, text, options, ref]) {
  const s = (x) => `'${x}'`;
  return `[${s(theme)},${level},${s(text)},[${options.map(s).join(",")}],${s(ref)}],`;
}

// Mêmes règles que scripts/check-questions.mjs. Renvoie la liste des problèmes.
export function validate([theme, level, text, options, ref]) {
  const p = [];
  if (!THEMES.includes(theme)) p.push(`thème « ${theme} » inconnu (attendu : ${THEMES.join(", ")})`);
  if (![1, 2, 3].includes(level)) p.push(`niveau « ${level} » invalide (attendu : 1, 2 ou 3)`);
  if (!text) p.push("question vide");
  if (!ref) p.push("référence vide");
  if (!options[0]) p.push("bonne réponse vide");
  if (options.length < 2 || options.length > 4) p.push(`${options.length} réponses (attendu : 2 à 4)`);
  if (new Set(options).size !== options.length) p.push("réponses en double");
  for (const x of [text, ref, ...options]) {
    if (x.includes("'")) p.push(`apostrophe interdite : ${x.slice(0, 40)}`);
    if (x.includes("\\")) p.push(`barre oblique inverse interdite : ${x.slice(0, 40)}`);
  }
  return p;
}

// ---------- CSV (séparateur « ; » pour Excel en français, UTF-8 avec BOM) ----------
export function toCSV(rows, sep = ";") {
  const cell = (v) => {
    const s = String(v ?? "");
    return /[";\n\r,]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  return "﻿" + rows.map((r) => r.map(cell).join(sep)).join("\r\n") + "\r\n";
}

export function parseCSV(text) {
  text = text.replace(/^﻿/, "");
  const firstLine = text.slice(0, text.search(/\r?\n/) >>> 0);
  const sep = [";", ",", "\t"].sort((a, b) => firstLine.split(b).length - firstLine.split(a).length)[0];
  const rows = [];
  let row = [], cur = "", inQ = false, i = 0;
  while (i < text.length) {
    const c = text[i];
    if (inQ) {
      if (c === '"' && text[i + 1] === '"') { cur += '"'; i += 2; continue; }
      if (c === '"') { inQ = false; i++; continue; }
      cur += c; i++; continue;
    }
    if (c === '"' && cur === "") { inQ = true; i++; continue; }
    if (c === sep) { row.push(cur); cur = ""; i++; continue; }
    if (c === "\r" || c === "\n") {
      row.push(cur); cur = "";
      if (row.some((x) => x !== "")) rows.push(row);
      row = [];
      i += c === "\r" && text[i + 1] === "\n" ? 2 : 1;
      continue;
    }
    cur += c; i++;
  }
  if (inQ) throw new Error("guillemet non fermé dans le CSV");
  row.push(cur);
  if (row.some((x) => x !== "")) rows.push(row);
  return rows;
}

export const HEADER = [
  "réf. interne (ne pas modifier)", "n°", "thème", "niveau", "question", "bonne réponse",
  "autre réponse 1", "autre réponse 2", "autre réponse 3", "référence", "vérifié", "remarque",
];

export function loadVerif() {
  try { return JSON.parse(readFileSync(VERIF, "utf8")); } catch { return {}; }
}
