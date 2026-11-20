// Tests de l'API : lance le serveur en local (wrangler dev, base D1 locale jetable) puis vérifie
// l'inscription, la connexion, le refus d'un mauvais mot de passe et la limite de tentatives.
//
//   cd server && npm test
//
// Rien n'est envoyé à Cloudflare : la base est créée dans un dossier temporaire, supprimé à la fin.

import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { spawn, execFileSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const SERVER = join(dirname(fileURLToPath(import.meta.url)), "..");
const WRANGLER = join(SERVER, "node_modules/.bin/wrangler");
const PORT = 8800 + Math.floor(Math.random() * 100);
const BASE = `http://127.0.0.1:${PORT}`;
const persist = mkdtempSync(join(tmpdir(), "iq-test-"));
let dev, logs = "";

const post = (path, body, ip = "203.0.113.1") =>
  fetch(BASE + path, {
    method: "POST",
    headers: { "content-type": "application/json", "cf-connecting-ip": ip },
    body: JSON.stringify(body),
  });

before(async () => {
  execFileSync(WRANGLER, ["d1", "execute", "islamquizz", "--local", "--persist-to", persist, "--file=schema.sql"],
    { cwd: SERVER, stdio: "pipe" });
  dev = spawn(WRANGLER, ["dev", "--port", String(PORT), "--ip", "127.0.0.1", "--persist-to", persist, "--show-interactive-dev-session=false"],
    { cwd: SERVER, stdio: ["ignore", "pipe", "pipe"], env: { ...process.env, WRANGLER_SEND_METRICS: "false" } });
  dev.stdout.on("data", (d) => (logs += d));
  dev.stderr.on("data", (d) => (logs += d));
  for (let i = 0; i < 120; i++) {
    try { if ((await fetch(BASE + "/api/players")).ok) return; } catch {}
    await new Promise((r) => setTimeout(r, 500));
  }
  throw new Error("le serveur local n'a pas démarré :\n" + logs);
}, { timeout: 90_000 });

after(() => {
  dev?.kill();
  rmSync(persist, { recursive: true, force: true });
});

// Adresse IP propre à chaque test, pour que les compteurs ne se mélangent pas.
const user = { pseudo: "testeur", password: "motdepasse-123" };

test("inscription : crée le compte et renvoie un jeton", async () => {
  const r = await post("/api/register", user, "198.51.100.1");
  assert.equal(r.status, 201);
  const j = await r.json();
  assert.equal(j.pseudo, user.pseudo);
  assert.match(j.token, /^[0-9a-f]{64}$/);
});

test("inscription : refuse un pseudo déjà pris", async () => {
  const r = await post("/api/register", { pseudo: "TESTEUR", password: "autre-mdp-456" }, "198.51.100.2");
  assert.equal(r.status, 409);
  assert.equal((await r.json()).error, "taken");
});

test("connexion : accepte le bon mot de passe", async () => {
  const r = await post("/api/login", user, "198.51.100.3");
  assert.equal(r.status, 200);
  const j = await r.json();
  assert.equal(j.pseudo, user.pseudo);
  assert.ok(j.token);
  // Le jeton donne bien accès au profil.
  const me = await fetch(`${BASE}/api/players/${j.id}`, { headers: { authorization: "Bearer " + j.token } });
  assert.equal(me.status, 200);
});

test("connexion : refuse un mauvais mot de passe", async () => {
  const r = await post("/api/login", { ...user, password: "mauvais-mdp" }, "198.51.100.4");
  assert.equal(r.status, 401);
  assert.equal((await r.json()).error, "bad_login");
});

test("limite : 10 tentatives de connexion par IP, la 11e est refusée (429)", async () => {
  const ip = "198.51.100.5";
  for (let i = 1; i <= 10; i++) {
    const r = await post("/api/login", { ...user, password: "essai-" + i }, ip);
    assert.equal(r.status, 401, `tentative ${i}`);
  }
  const r = await post("/api/login", user, ip); // même le bon mot de passe est bloqué
  assert.equal(r.status, 429);
  assert.equal((await r.json()).error, "rate_limited");
  const retry = Number(r.headers.get("retry-after"));
  assert.ok(retry > 0 && retry <= 600, `Retry-After = ${retry}`);
  // Une autre adresse IP n'est pas bloquée.
  assert.equal((await post("/api/login", user, "198.51.100.6")).status, 200);
});

test("limite : 10 inscriptions par IP, la 11e est refusée (429)", async () => {
  const ip = "198.51.100.7";
  for (let i = 1; i <= 10; i++) {
    const r = await post("/api/register", { pseudo: "joueur" + i, password: "motdepasse-" + i }, ip);
    assert.equal(r.status, 201, `inscription ${i}`);
  }
  const r = await post("/api/register", { pseudo: "joueur11", password: "motdepasse-11" }, ip);
  assert.equal(r.status, 429);
  // Les compteurs sont séparés : la connexion reste possible depuis cette adresse.
  assert.equal((await post("/api/login", user, ip)).status, 200);
});
