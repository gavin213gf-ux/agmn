// A股看盘模拟交易台账 · 轻量共享后端
// 零依赖（仅 Node 内置模块）。运行： node server.js   然后浏览器打开 http://localhost:3000
// 多人访问同一地址即可共用同一份账本。数据持久化在同级 data.json。
// 安全提示：本服务无任何鉴权，仅建议在可信局域网/内网使用；若暴露公网请自行加认证。

const http = require("http");
const fs = require("fs");
const path = require("path");

const PORT = process.env.PORT || 3000;
const HTML_FILE = path.join(__dirname, "A股看盘模拟交易台账.html");
const DATA_FILE = path.join(__dirname, "data.json");

const DEFAULT_SETTINGS = { capital: 1000000, maxPct: 0.30 };
let state = { trades: [], settings: DEFAULT_SETTINGS };
try {
  const raw = fs.readFileSync(DATA_FILE, "utf8");
  const parsed = JSON.parse(raw);
  if (Array.isArray(parsed.trades)) state.trades = parsed.trades;
  if (parsed.settings) state.settings = parsed.settings;
} catch (e) { /* 首次运行，使用默认 */ }

function persist() {
  try { fs.writeFileSync(DATA_FILE, JSON.stringify(state, null, 2)); } catch (e) { console.error("写入失败", e); }
}
function sendJson(res, code, obj) {
  res.writeHead(code, { "Content-Type": "application/json; charset=utf-8" });
  res.end(JSON.stringify(obj));
}
function readBody(req) {
  return new Promise((resolve) => {
    let d = "";
    req.on("data", (c) => (d += c));
    req.on("end", () => { try { resolve(d ? JSON.parse(d) : {}); } catch (e) { resolve({}); } });
  });
}
function findIndex(id) { return state.trades.findIndex((x) => x.id === id); }

const server = http.createServer(async (req, res) => {
  const url = req.url.split("?")[0];

  // 页面
  if (req.method === "GET" && (url === "/" || url === "/index.html")) {
    try {
      const html = fs.readFileSync(HTML_FILE, "utf8");
      res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
      return res.end(html);
    } catch (e) { return sendJson(res, 500, { error: "HTML 文件缺失" }); }
  }

  // 全量读取（初始加载 / 轮询 / 导出）
  if (url === "/api/data" && req.method === "GET") return sendJson(res, 200, state);

  // 设置
  if (url === "/api/settings" && req.method === "GET") return sendJson(res, 200, state.settings);
  if (url === "/api/settings" && req.method === "PUT") {
    const b = await readBody(req);
    state.settings = b && b.capital ? b : state.settings;
    persist();
    return sendJson(res, 200, state.settings);
  }

  // 记录列表
  if (url === "/api/trades" && req.method === "GET") return sendJson(res, 200, state.trades);

  // 新增
  if (url === "/api/trades" && req.method === "POST") {
    const t = await readBody(req);
    if (!t.id) t.id = "t_" + Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
    state.trades.push(t);
    persist();
    return sendJson(res, 200, t);
  }

  // 更新 / 删除（按 id）
  const m = url.match(/^\/api\/trades\/(.+)$/);
  if (m) {
    const id = decodeURIComponent(m[1]);
    if (req.method === "PUT") {
      const t = await readBody(req);
      const i = findIndex(id);
      if (i < 0) return sendJson(res, 404, { error: "not found" });
      state.trades[i] = t;
      persist();
      return sendJson(res, 200, t);
    }
    if (req.method === "DELETE") {
      state.trades = state.trades.filter((x) => x.id !== id);
      persist();
      return sendJson(res, 200, { ok: true });
    }
  }

  // 批量替换 / 合并（导入）
  if (url === "/api/bulk" && req.method === "POST") {
    const b = await readBody(req);
    if (b.mode === "merge" && Array.isArray(b.trades)) {
      const map = {};
      state.trades.forEach((t) => (map[t.id] = t));
      b.trades.forEach((t) => (map[t.id] = t));
      state.trades = Object.values(map);
    } else if (Array.isArray(b.trades)) {
      state.trades = b.trades;
    }
    if (b.settings) state.settings = b.settings;
    persist();
    return sendJson(res, 200, state);
  }

  res.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
  res.end("Not found");
});

server.listen(PORT, "0.0.0.0", () => {
  console.log("A股看盘模拟交易台账 已启动： http://localhost:" + PORT);
  console.log("数据文件： " + DATA_FILE);
});
