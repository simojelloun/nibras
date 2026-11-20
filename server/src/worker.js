// IslamQuizz — API (Cloudflare Workers + D1).
//
//   POST /api/register              crée un compte            { pseudo, password, profile? }
//   POST /api/login                 ouvre une session         { pseudo, password }
//   GET  /api/players               classement public
//   GET  /api/players/:id           profil du joueur connecté
//   PUT  /api/players/:id           met à jour son profil
//   GET  /api/me/groups             ses groupes
//   POST /api/groups                crée un groupe            { name }
//   GET  /api/groups/:code          classement du groupe (membres seulement)
//   POST /api/groups/:code/join     rejoint un groupe
//   POST /api/groups/:code/leave    quitte un groupe
//   GET  /api/me/duels              ses 20 derniers duels
//   POST /api/duels                 crée un duel, renvoie son code
//   GET  /api/duels/:code           état du duel
//   POST /api/duels/:code/result    enregistre son résultat   { score, ms }
//
// Tout le reste est servi depuis ../www (la version web de l'application).

const MAX_BODY = 6000;        // octets
const MAX_XP_STEP = 3000;     // gain maximal accepté par envoi
const PBKDF2_ROUNDS = 100000;
const THEMES = ["q", "h", "s", "p", "f", "n", "t", "a"];
const CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
const RATE_MAX = 10;                // tentatives acceptées par adresse IP…
const RATE_WINDOW = 10 * 60 * 1000; // …sur 10 minutes glissantes (séparément pour login et register)

const CORS = {
  "access-control-allow-origin": "*",
  "access-control-allow-methods": "GET,POST,PUT,OPTIONS",
  "access-control-allow-headers": "authorization,content-type",
  "access-control-max-age": "86400",
};
const json = (data, status = 200) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store", ...CORS },
  });

class ApiError extends Error {
  constructor(status, code, headers) { super(code); this.status = status; this.code = code; this.headers = headers; }
}
const fail = (status, code) => { throw new ApiError(status, code); };

// ---------- outils ----------
const int = (v, max) => Math.max(0, Math.min(max, Math.floor(Number(v) || 0)));
const str = (v, n) => String(v ?? "").replace(/[\u0000-\u001f\u007f<>]/g, "").trim().slice(0, n);
const hex = (buf) => [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
const unhex = (s) => new Uint8Array(s.match(/../g).map((h) => parseInt(h, 16)));
const randomHex = (n) => hex(crypto.getRandomValues(new Uint8Array(n)));
const randomCode = () =>
  [...crypto.getRandomValues(new Uint8Array(6))].map((b) => CODE_ALPHABET[b % CODE_ALPHABET.length]).join("");

async function sha256(text) {
  return hex(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text)));
}
async function hashPassword(password, saltHex) {
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(password), "PBKDF2", false, ["deriveBits"]);
  const bits = await crypto.subtle.deriveBits(
    { name: "PBKDF2", hash: "SHA-256", salt: unhex(saltHex), iterations: PBKDF2_ROUNDS }, key, 256);
  return hex(bits);
}
async function readBody(req) {
  const text = await req.text();
  if (text.length > MAX_BODY) fail(413, "too_large");
  if (!text) return {};
  let body;
  try { body = JSON.parse(text); } catch { fail(400, "bad_json"); }
  if (!body || typeof body !== "object" || Array.isArray(body)) fail(400, "bad_json");
  return body;
}
function checkPseudo(raw) {
  const pseudo = String(raw ?? "").normalize("NFKC").replace(/\s+/g, " ").trim();
  if (!/^[\p{L}\p{M}\p{N} _-]{3,16}$/u.test(pseudo)) fail(400, "bad_pseudo");
  return { pseudo, key: pseudo.toLowerCase() };
}

// Ne garde du profil que les champs connus, bornés.
function clean(o) {
  o = o && typeof o === "object" ? o : {};
  const claimed = {};
  for (const k of ["a", "b", "c"]) if (o.claimed && o.claimed[k]) claimed[k] = 1;
  const st = {};
  for (const k of THEMES) {
    const v = o.st && o.st[k];
    if (Array.isArray(v)) { const total = int(v[1], 1e6); st[k] = [Math.min(int(v[0], 1e6), total), total]; }
  }
  return {
    xp: int(o.xp, 1e7), games: int(o.games, 1e6),
    weekId: str(o.weekId, 12), weekXp: int(o.weekXp, 1e6), weekOk: int(o.weekOk, 1e5),
    weekSurv: int(o.weekSurv, 1e4), weekDaily: int(o.weekDaily, 7), claimed,
    dayId: str(o.dayId, 10), dayScore: int(o.dayScore, 10), dayMs: int(o.dayMs, 36e5), dayDone: !!o.dayDone,
    streak: int(o.streak, 1e4), lastDay: str(o.lastDay, 10),
    bestSurvival: int(o.bestSurvival, 1e4), bestSprint: int(o.bestSprint, 1e4), st,
  };
}
const publicRow = (r) => ({
  id: r.id, nick: r.pseudo, xp: r.xp, games: r.games,
  weekId: r.week_id, weekXp: r.week_xp,
  dayId: r.day_id, dayScore: r.day_score, dayMs: r.day_ms, dayDone: !!r.day_done,
});
const PUBLIC_COLS = "p.id, p.pseudo, p.xp, p.games, p.week_id, p.week_xp, p.day_id, p.day_score, p.day_ms, p.day_done";

async function saveProfile(env, id, p) {
  await env.DB.prepare(
    `UPDATE players SET xp = ?2, games = ?3, week_id = ?4, week_xp = ?5, day_id = ?6, day_score = ?7,
            day_ms = ?8, day_done = ?9, data = ?10, updated_at = ?11 WHERE id = ?1`
  ).bind(id, p.xp, p.games, p.weekId, p.weekXp, p.dayId, p.dayScore, p.dayMs, p.dayDone ? 1 : 0,
         JSON.stringify(p), Date.now()).run();
}
async function openSession(env, playerId) {
  const token = randomHex(32);
  await env.DB.prepare("INSERT INTO sessions (token_hash, player_id, created_at) VALUES (?, ?, ?)")
    .bind(await sha256(token), playerId, Date.now()).run();
  return token;
}
// Renvoie la ligne du joueur connecté, ou échoue en 401.
async function auth(req, env) {
  const token = (req.headers.get("authorization") || "").replace(/^Bearer\s+/i, "");
  if (token.length < 32 || token.length > 128) fail(401, "no_session");
  const row = await env.DB.prepare(
    "SELECT p.id, p.pseudo, p.xp, p.data FROM sessions s JOIN players p ON p.id = s.player_id WHERE s.token_hash = ?"
  ).bind(await sha256(token)).first();
  if (!row) fail(401, "no_session");
  return row;
}

// ---------- limitation des tentatives ----------
// Compte chaque tentative (réussie ou non) par adresse IP dans D1, sur une fenêtre glissante.
// En production, Cloudflare fournit l'adresse dans CF-Connecting-IP (le client ne peut pas la forger).
async function rateLimit(req, env, action) {
  const ip = req.headers.get("cf-connecting-ip") || "inconnue";
  const key = `${action}:${ip}`;
  const now = Date.now(), since = now - RATE_WINDOW;
  await env.DB.prepare("DELETE FROM attempts WHERE key = ? AND ts <= ?").bind(key, since).run();
  const row = await env.DB.prepare("SELECT COUNT(*) AS n, MIN(ts) AS first FROM attempts WHERE key = ?").bind(key).first();
  if (row.n >= RATE_MAX) {
    const retry = Math.max(1, Math.ceil((row.first + RATE_WINDOW - now) / 1000));
    throw new ApiError(429, "rate_limited", { "retry-after": String(retry) });
  }
  await env.DB.prepare("INSERT INTO attempts (key, ts) VALUES (?, ?)").bind(key, now).run();
}

// ---------- comptes ----------
async function register(req, env) {
  await rateLimit(req, env, "register");
  const body = await readBody(req);
  const { pseudo, key } = checkPseudo(body.pseudo);
  const password = String(body.password ?? "");
  if (password.length < 8 || password.length > 64) fail(400, "bad_password");
  if (await env.DB.prepare("SELECT 1 FROM players WHERE pseudo_key = ?").bind(key).first()) fail(409, "taken");
  const id = crypto.randomUUID(), salt = randomHex(16), now = Date.now();
  const p = clean(body.profile);
  p.xp = Math.min(p.xp, MAX_XP_STEP);
  try {
    await env.DB.prepare(
      "INSERT INTO players (id, pseudo, pseudo_key, pass_hash, pass_salt, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)"
    ).bind(id, pseudo, key, await hashPassword(password, salt), salt, now, now).run();
  } catch { fail(409, "taken"); }
  await saveProfile(env, id, p);
  return json({ id, pseudo, token: await openSession(env, id) }, 201);
}
async function login(req, env) {
  await rateLimit(req, env, "login");
  const body = await readBody(req);
  const key = String(body.pseudo ?? "").normalize("NFKC").replace(/\s+/g, " ").trim().toLowerCase();
  const password = String(body.password ?? "");
  const row = await env.DB.prepare("SELECT id, pseudo, pass_hash, pass_salt, data FROM players WHERE pseudo_key = ?").bind(key).first();
  if (!row || password.length > 64 || (await hashPassword(password, row.pass_salt)) !== row.pass_hash) fail(401, "bad_login");
  return json({ id: row.id, pseudo: row.pseudo, token: await openSession(env, row.id), profile: JSON.parse(row.data) });
}

// ---------- classement et profil ----------
async function listPlayers(env) {
  const { results } = await env.DB.prepare(
    `SELECT ${PUBLIC_COLS} FROM players p WHERE p.games > 0 OR p.xp > 0 ORDER BY p.xp DESC LIMIT 1000`
  ).all();
  return json({ players: results.map(publicRow) });
}
async function profile(req, env, id) {
  const me = await auth(req, env);
  if (me.id !== id) fail(403, "forbidden");
  if (req.method === "GET") return json({ pseudo: me.pseudo, profile: JSON.parse(me.data) });
  const p = clean(await readBody(req));
  p.xp = Math.min(p.xp, me.xp + MAX_XP_STEP);
  await saveProfile(env, id, p);
  return json({ ok: true, xp: p.xp });
}

// ---------- groupes ----------
async function myGroups(req, env) {
  const me = await auth(req, env);
  const { results } = await env.DB.prepare(
    `SELECT g.code, g.name, (SELECT COUNT(*) FROM group_members x WHERE x.code = g.code) AS n
       FROM groups g JOIN group_members m ON m.code = g.code
      WHERE m.player_id = ? ORDER BY m.joined_at DESC`
  ).bind(me.id).all();
  return json({ groups: results });
}
async function createGroup(req, env) {
  const me = await auth(req, env);
  const name = str((await readBody(req)).name, 24);
  if (name.length < 2) fail(400, "bad_name");
  const mine = await env.DB.prepare("SELECT COUNT(*) AS n FROM group_members WHERE player_id = ?").bind(me.id).first();
  if (mine.n >= 20) fail(409, "limit");
  for (let i = 0; i < 5; i++) {
    const code = randomCode();
    try {
      await env.DB.prepare("INSERT INTO groups (code, name, owner_id, created_at) VALUES (?, ?, ?, ?)")
        .bind(code, name, me.id, Date.now()).run();
      await env.DB.prepare("INSERT INTO group_members (code, player_id, joined_at) VALUES (?, ?, ?)")
        .bind(code, me.id, Date.now()).run();
      return json({ code, name }, 201);
    } catch { /* code déjà pris : on réessaie */ }
  }
  fail(500, "server");
}
async function group(req, env, code, action) {
  const me = await auth(req, env);
  const g = await env.DB.prepare("SELECT code, name FROM groups WHERE code = ?").bind(code).first();
  if (!g) fail(404, "not_found");
  const member = await env.DB.prepare("SELECT 1 FROM group_members WHERE code = ? AND player_id = ?").bind(code, me.id).first();

  if (action === "join") {
    if (!member) {
      const count = await env.DB.prepare("SELECT COUNT(*) AS n FROM group_members WHERE code = ?").bind(code).first();
      const mine = await env.DB.prepare("SELECT COUNT(*) AS n FROM group_members WHERE player_id = ?").bind(me.id).first();
      if (count.n >= 200 || mine.n >= 20) fail(409, "limit");
      await env.DB.prepare("INSERT OR IGNORE INTO group_members (code, player_id, joined_at) VALUES (?, ?, ?)")
        .bind(code, me.id, Date.now()).run();
    }
    return json({ ok: true, code, name: g.name });
  }
  if (action === "leave") {
    await env.DB.prepare("DELETE FROM group_members WHERE code = ? AND player_id = ?").bind(code, me.id).run();
    const left = await env.DB.prepare("SELECT COUNT(*) AS n FROM group_members WHERE code = ?").bind(code).first();
    if (left.n === 0) await env.DB.prepare("DELETE FROM groups WHERE code = ?").bind(code).run();
    return json({ ok: true });
  }
  if (!member) fail(403, "forbidden");
  const { results } = await env.DB.prepare(
    `SELECT ${PUBLIC_COLS} FROM group_members m JOIN players p ON p.id = m.player_id WHERE m.code = ? ORDER BY p.xp DESC`
  ).bind(code).all();
  return json({ code, name: g.name, members: results.map(publicRow) });
}

// ---------- duels par code ----------
const DUEL_SELECT =
  `SELECT d.*, pa.pseudo AS a_nick, pb.pseudo AS b_nick
     FROM duels d JOIN players pa ON pa.id = d.a_id LEFT JOIN players pb ON pb.id = d.b_id`;
// Un joueur ne voit le score de l'autre qu'après avoir joué lui-même.
function duelView(d, meId) {
  const you = d.a_id === meId ? "a" : d.b_id === meId ? "b" : null;
  const played = you && d[you + "_done"];
  const side = (s) => {
    if (!d[s + "_id"]) return null;
    const done = !!d[s + "_done"];
    return done && (played || s === you)
      ? { nick: d[s + "_nick"], done, score: d[s + "_score"], ms: d[s + "_ms"] }
      : { nick: d[s + "_nick"], done };
  };
  return { code: d.code, seed: d.seed, you, a: side("a"), b: side("b") };
}
async function myDuels(req, env) {
  const me = await auth(req, env);
  const { results } = await env.DB.prepare(
    `${DUEL_SELECT} WHERE d.a_id = ?1 OR d.b_id = ?1 ORDER BY d.created_at DESC LIMIT 20`
  ).bind(me.id).all();
  return json({ duels: results.map((d) => duelView(d, me.id)) });
}
async function createDuel(req, env) {
  const me = await auth(req, env);
  for (let i = 0; i < 5; i++) {
    const code = randomCode(), seed = randomHex(8);
    try {
      await env.DB.prepare("INSERT INTO duels (code, seed, a_id, created_at) VALUES (?, ?, ?, ?)")
        .bind(code, seed, me.id, Date.now()).run();
      return json({ code, seed }, 201);
    } catch { /* code déjà pris : on réessaie */ }
  }
  fail(500, "server");
}
async function duel(req, env, code, action) {
  const me = await auth(req, env);
  const d = await env.DB.prepare(`${DUEL_SELECT} WHERE d.code = ?`).bind(code).first();
  if (!d) fail(404, "not_found");
  if (action !== "result") return json(duelView(d, me.id));

  const body = await readBody(req);
  const score = int(body.score, 10), ms = int(body.ms, 36e5);
  let side;
  if (d.a_id === me.id) side = "a";
  else if (!d.b_id || d.b_id === me.id) side = "b";
  else fail(409, "full");
  if (d[side + "_done"]) fail(409, "done");
  const res = await env.DB.prepare(
    side === "a"
      ? "UPDATE duels SET a_score = ?2, a_ms = ?3, a_done = 1 WHERE code = ?1 AND a_done = 0"
      : "UPDATE duels SET b_id = ?4, b_score = ?2, b_ms = ?3, b_done = 1 WHERE code = ?1 AND b_done = 0 AND (b_id IS NULL OR b_id = ?4)"
  ).bind(...(side === "a" ? [code, score, ms] : [code, score, ms, me.id])).run();
  if (!res.meta.changes) fail(409, "full");
  return json({ ok: true });
}

// ---------- routage ----------
async function route(req, env, path) {
  const m = req.method;
  let x;
  if (path === "/api/register" && m === "POST") return register(req, env);
  if (path === "/api/login" && m === "POST") return login(req, env);
  if (path === "/api/players" && m === "GET") return listPlayers(env);
  if ((x = path.match(/^\/api\/players\/([a-z0-9-]{16,64})$/)) && (m === "GET" || m === "PUT")) return profile(req, env, x[1]);
  if (path === "/api/me/groups" && m === "GET") return myGroups(req, env);
  if (path === "/api/groups" && m === "POST") return createGroup(req, env);
  if ((x = path.match(/^\/api\/groups\/([A-Z0-9]{6})$/)) && m === "GET") return group(req, env, x[1], "view");
  if ((x = path.match(/^\/api\/groups\/([A-Z0-9]{6})\/(join|leave)$/)) && m === "POST") return group(req, env, x[1], x[2]);
  if (path === "/api/me/duels" && m === "GET") return myDuels(req, env);
  if (path === "/api/duels" && m === "POST") return createDuel(req, env);
  if ((x = path.match(/^\/api\/duels\/([A-Z0-9]{6})$/)) && m === "GET") return duel(req, env, x[1], "view");
  if ((x = path.match(/^\/api\/duels\/([A-Z0-9]{6})\/result$/)) && m === "POST") return duel(req, env, x[1], "result");
  fail(404, "not_found");
}

export default {
  async fetch(req, env) {
    const { pathname } = new URL(req.url);
    if (!pathname.startsWith("/api/")) return env.ASSETS.fetch(req);
    if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: CORS });
    try {
      return await route(req, env, pathname);
    } catch (e) {
      if (e instanceof ApiError) {
        const res = json({ error: e.code }, e.status);
        for (const [k, v] of Object.entries(e.headers || {})) res.headers.set(k, v);
        return res;
      }
      return json({ error: "server" }, 500);
    }
  },
};
