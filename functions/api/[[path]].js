/**
 * 留言墙 · Cloudflare Pages 动态后台（Pages Functions）
 * 路由：/api/messages、/api/messages/:id/like、/api/messages/:id、/api/admin/*
 * 存储：复用仓库里已有的 KV 绑定 MSG_KV（不用 SQL 数据库）
 */

const NOTE_COLORS = new Set(["yellow", "pink", "blue", "green", "lilac"]);
const MAX_NAME = 12;
const MAX_CONTENT = 200;
const MAX_BODY = 8 * 1024;
const MAX_KEEP = 3000;
const KEY = "wall:messages";

/* 管理员 */
const ADMIN_NAME = "管理员";
const DEFAULT_ADMIN_PASSWORD = "123456";
const ADMIN_PASSWORD_KEY = "wall:admin_password";
const ADMIN_TOKENS_KEY = "wall:admin_tokens";
const ADMIN_TTL = 7 * 24 * 60 * 60 * 1000;

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store",
      "x-content-type-options": "nosniff",
    },
  });
}

function cleanText(value, maxLen) {
  if (typeof value !== "string") return "";
  let v = value.replace(/\r\n?/g, "\n");
  v = v.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, "");
  v = v.replace(/\n{3,}/g, "\n\n").trim();
  return Array.from(v).slice(0, maxLen).join("");
}

async function readJson(request) {
  const len = Number(request.headers.get("content-length") || 0);
  if (len > MAX_BODY) return {};
  try {
    const data = await request.json();
    return data && typeof data === "object" ? data : {};
  } catch (e) {
    return {};
  }
}

function publicMessage(m, cid) {
  return {
    id: m.id,
    name: m.name,
    content: m.content,
    color: m.color,
    created_ms: m.created_ms,
    likes: m.likes || 0,
    liked: cid ? (m.likedBy || []).includes(cid) : false,
  };
}

async function loadAll(env) {
  const raw = await env.MSG_KV.get(KEY, "json");
  return Array.isArray(raw) ? raw : [];
}

async function saveAll(env, list) {
  if (list.length > MAX_KEEP) {
    list.sort((a, b) => a.created_ms - b.created_ms);
    list = list.slice(list.length - MAX_KEEP);
  }
  await env.MSG_KV.put(KEY, JSON.stringify(list));
}

/* ---------------- 管理员 ---------------- */
async function getAdminPassword(env) {
  const saved = await env.MSG_KV.get(ADMIN_PASSWORD_KEY);
  return typeof saved === "string" && saved.trim() ? saved.trim() : DEFAULT_ADMIN_PASSWORD;
}

async function readAdminTokens(env) {
  const raw = await env.MSG_KV.get(ADMIN_TOKENS_KEY, "json");
  return Array.isArray(raw) ? raw : [];
}

async function adminLogin(request, env) {
  const body = await readJson(request);
  const name = cleanText(body.name, 20);
  const password = typeof body.password === "string" ? body.password.trim() : "";

  if (name !== ADMIN_NAME) return json({ ok: false, error: "名字要填「管理员」" }, 401);
  if (!password) return json({ ok: false, error: "请输入密码" }, 400);

  const expected = await getAdminPassword(env);
  if (password !== expected) return json({ ok: false, error: "密码不对" }, 401);

  const now = Date.now();
  const token = crypto.randomUUID().replace(/-/g, "");
  const list = (await readAdminTokens(env)).filter(function (t) { return t && t.exp > now; });
  list.push({ token: token, exp: now + ADMIN_TTL });
  await env.MSG_KV.put(ADMIN_TOKENS_KEY, JSON.stringify(list));

  return json({ ok: true, token: token, exp: now + ADMIN_TTL });
}

async function adminTokenValid(request, env) {
  const token = (request.headers.get("X-Admin-Token") || "").trim();
  if (!token) return false;
  const now = Date.now();
  const list = await readAdminTokens(env);
  return list.some(function (t) { return t && t.token === token && t.exp > now; });
}

async function adminLogout(request, env) {
  const token = (request.headers.get("X-Admin-Token") || "").trim();
  if (token) {
    const list = (await readAdminTokens(env)).filter(function (t) { return t.token !== token; });
    await env.MSG_KV.put(ADMIN_TOKENS_KEY, JSON.stringify(list));
  }
  return json({ ok: true });
}

async function adminCheck(request, env) {
  return json({ ok: true, admin: await adminTokenValid(request, env) });
}

/* ---------------- 读留言 ---------------- */
async function listMessages(url, env) {
  const p = url.searchParams;
  const limit = Math.min(50, Math.max(1, parseInt(p.get("limit") || "9", 10) || 9));
  const offset = Math.max(0, parseInt(p.get("offset") || "0", 10) || 0);
  const order = p.get("order") === "old" ? "asc" : "desc";
  const q = cleanText(p.get("q") || "", 40).toLowerCase();
  const cid = cleanText(p.get("client_id") || "", 64);

  let list = await loadAll(env);
  if (q) {
    list = list.filter(function (m) {
      return (m.name || "").toLowerCase().indexOf(q) >= 0
        || (m.content || "").toLowerCase().indexOf(q) >= 0;
    });
  }
  list.sort(function (a, b) {
    return order === "asc" ? a.created_ms - b.created_ms : b.created_ms - a.created_ms;
  });

  return json({
    ok: true,
    total: list.length,
    now: Date.now(),
    messages: list.slice(offset, offset + limit).map(function (m) { return publicMessage(m, cid); }),
  });
}

/* ---------------- 贴留言 ---------------- */
async function createMessage(request, env) {
  const body = await readJson(request);
  const name = cleanText(body.name, MAX_NAME) || "匿名访客";
  const content = cleanText(body.content, MAX_CONTENT);
  const color = NOTE_COLORS.has(body.color) ? body.color : "yellow";

  if (!content) return json({ ok: false, error: "留言内容不能为空" }, 400);

  const list = await loadAll(env);
  let id = Date.now();
  while (list.some(function (m) { return m.id === id; })) id += 1;

  const msg = {
    id: id,
    name: name,
    content: content,
    color: color,
    created_ms: Date.now(),
    delete_token: crypto.randomUUID().replace(/-/g, ""),
    likes: 0,
    likedBy: [],
  };

  list.push(msg);
  await saveAll(env, list);

  return json({
    ok: true,
    token: msg.delete_token,
    total: list.length,
    now: Date.now(),
    message: publicMessage(msg, ""),
  }, 201);
}

/* ---------------- 点赞 ---------------- */
async function likeMessage(request, env, id) {
  const body = await readJson(request);
  const cid = cleanText(body.client_id, 64);
  if (!cid) return json({ ok: false, error: "缺少访客标识" }, 400);

  const list = await loadAll(env);
  const msg = list.filter(function (m) { return m.id === id; })[0];
  if (!msg) return json({ ok: false, error: "这条留言已经不在了" }, 404);

  msg.likedBy = msg.likedBy || [];
  const already = msg.likedBy.indexOf(cid) >= 0;
  if (!already) {
    msg.likedBy.push(cid);
    msg.likes = (msg.likes || 0) + 1;
    await saveAll(env, list);
  }

  return json({ ok: true, likes: msg.likes || 0, liked: true, already: already });
}

/* ---------------- 撤下 ---------------- */
async function deleteMessage(request, env, id) {
  const admin = await adminTokenValid(request, env);
  const token = (request.headers.get("X-Delete-Token") || "").trim();
  if (!admin && !token) return json({ ok: false, error: "缺少撤下凭证" }, 400);

  const list = await loadAll(env);
  const index = list.findIndex(function (m) { return m.id === id; });
  if (index < 0) return json({ ok: false, error: "这条留言已经不在了" }, 404);
  if (!admin && list[index].delete_token !== token) {
    return json({ ok: false, error: "只有写下它的人才能撤下" }, 403);
  }

  list.splice(index, 1);
  await saveAll(env, list);
  return json({ ok: true, total: list.length });
}

/* ---------------- 路由 ---------------- */
export async function onRequest(context) {
  const request = context.request;
  const env = context.env;
  const url = new URL(request.url);
  const path = url.pathname.replace(/\/+$/, "") || "/";
  const method = request.method.toUpperCase();

  if (!env.MSG_KV) {
    return json({ ok: false, error: "后台还没绑定存储：KV 变量名要叫 MSG_KV" }, 500);
  }

  try {
    if (path === "/api/messages") {
      if (method === "GET") return listMessages(url, env);
      if (method === "POST") return createMessage(request, env);
      return json({ ok: false, error: "不支持这个方法" }, 405);
    }

    if (path === "/api/admin/login") {
      if (method === "POST") return adminLogin(request, env);
      return json({ ok: false, error: "不支持这个方法" }, 405);
    }

    if (path === "/api/admin/logout") {
      if (method === "POST") return adminLogout(request, env);
      return json({ ok: false, error: "不支持这个方法" }, 405);
    }

    if (path === "/api/admin/check") {
      if (method === "GET") return adminCheck(request, env);
      return json({ ok: false, error: "不支持这个方法" }, 405);
    }

    const like = path.match(/^\/api\/messages\/(\d+)\/like$/);
    if (like) {
      if (method === "POST") return likeMessage(request, env, Number(like[1]));
      return json({ ok: false, error: "不支持这个方法" }, 405);
    }

    const del = path.match(/^\/api\/messages\/(\d+)$/);
    if (del) {
      if (method === "DELETE") return deleteMessage(request, env, Number(del[1]));
      return json({ ok: false, error: "不支持这个方法" }, 405);
    }

    return json({ ok: false, error: "没有这个地址" }, 404);
  } catch (err) {
    return json({ ok: false, error: "服务器出了点问题：" + (err && err.message ? err.message : "unknown") }, 500);
  }
}
