import { createReadStream, createWriteStream, existsSync, readFileSync, statSync } from "node:fs";
import { spawn } from "node:child_process";
import { createServer } from "node:http";
import { extname, join, normalize, resolve } from "node:path";
import { fetchEventsFromSupabase, isSupabaseConfigured } from "./lib/supabase-events.js";

const root = resolve(process.cwd());
const publicDir = join(root, "public");
const dataDir = join(root, "data");
const port = Number(process.env.PORT || 4173);
const host = process.env.HOST || "127.0.0.1";
const collectorUserId = sanitizeUserId(process.env.PRIMARY_COLLECTOR_USER_ID || "default");
const autoScrapeIntervalMs = Number(process.env.AUTO_SCRAPE_INTERVAL_MS || 5 * 60 * 1000);
const autoScrapeTimeoutMs = Number(process.env.AUTO_SCRAPE_TIMEOUT_MS || Math.max(60_000, autoScrapeIntervalMs - 15_000));
const autoScrapeEnabled = process.env.AUTO_SCRAPE_ENABLED !== "false";
const collectorState = {
  running: false,
  lastStartedAt: null,
  lastFinishedAt: null,
  lastExitCode: null,
  lastError: null,
  nextRunAt: null
};

const mimeTypes = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml; charset=utf-8"
};

function resolveRequestPath(parsed) {
  const pathname = decodeURIComponent(parsed.pathname);
  const requested = pathname === "/" ? "/index.html" : pathname;
  return join(publicDir, normalize(requested));
}

function isInside(base, target) {
  const relative = target.slice(base.length);
  return target.startsWith(base) && !relative.includes("..");
}

const server = createServer(async (req, res) => {
  const parsed = new URL(req.url || "/", `http://localhost:${port}`);

  if (req.method === "GET" && parsed.pathname === "/health") {
    sendJson(res, { ok: true });
    return;
  }

  if (req.method === "GET" && parsed.pathname === "/api/events") {
    sendJson(res, await readEvents());
    return;
  }

  if (req.method === "GET" && parsed.pathname === "/api/collector") {
    sendJson(res, {
      enabled: autoScrapeEnabled,
      intervalMs: autoScrapeIntervalMs,
      timeoutMs: autoScrapeTimeoutMs,
      userId: collectorUserId,
      ...collectorState
    });
    return;
  }

  const filePath = resolveRequestPath(parsed);
  const base = publicDir;

  if (!isInside(base, filePath) || !existsSync(filePath) || !statSync(filePath).isFile()) {
    res.writeHead(404, { "content-type": "application/json; charset=utf-8" });
    res.end(JSON.stringify({ error: "Not found" }));
    return;
  }

  const type = mimeTypes[extname(filePath)] || "application/octet-stream";
  res.writeHead(200, {
    "content-type": type,
    "cache-control": "no-store"
  });
  createReadStream(filePath).pipe(res);
});

function sendJson(res, payload, status = 200) {
  res.writeHead(status, {
    "content-type": "application/json; charset=utf-8",
    "cache-control": "no-store"
  });
  res.end(JSON.stringify(payload));
}

async function readEvents() {
  if (isSupabaseConfigured()) {
    try {
      return await fetchEventsFromSupabase();
    } catch (error) {
      collectorState.lastError = error.message;
      console.log(error.message);
    }
  }
  const fallbackPath = join(dataDir, "events.json");
  if (!existsSync(fallbackPath)) return [];
  return JSON.parse(readFileSync(fallbackPath, "utf8"));
}

function sanitizeUserId(value) {
  return String(value)
    .trim()
    .replace(/[^\w.-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48) || "default";
}

server.listen(port, host, () => {
  console.log(`Basketball cafe board running at http://${host}:${port}`);
  startAutoScrape();
});

function startAutoScrape() {
  if (!autoScrapeEnabled) {
    console.log("자동 수집이 꺼져 있습니다.");
    return;
  }
  console.log(`${Math.round(autoScrapeIntervalMs / 60_000)}분마다 자동 수집합니다. 수집 계정: ${collectorUserId}`);
  runAutoScrape();
  scheduleNextAutoScrape();
}

function scheduleNextAutoScrape() {
  collectorState.nextRunAt = new Date(Date.now() + autoScrapeIntervalMs).toISOString();
  setTimeout(async () => {
    await runAutoScrape();
    scheduleNextAutoScrape();
  }, autoScrapeIntervalMs);
}

function runAutoScrape() {
  if (collectorState.running) return Promise.resolve();
  collectorState.running = true;
  collectorState.lastStartedAt = new Date().toISOString();
  collectorState.lastError = null;
  console.log(`[${new Date().toLocaleString("ko-KR")}] 자동 카페 수집 시작: ${collectorUserId}`);

  return new Promise((resolveRun) => {
    const logStream = createWriteStream(join(dataDir, "collector.log"), { flags: "a" });
    logStream.write(`\n[${collectorState.lastStartedAt}] 자동 카페 수집 시작: ${collectorUserId}\n`);
    const child = spawn("node", ["scripts/naver-cafe-scraper.js", "--user", collectorUserId, "--headless", "--non-interactive"], {
      cwd: root,
      env: {
        ...process.env,
        SCRAPER_HEADLESS: "true",
        SCRAPER_NONINTERACTIVE: "true"
      },
      stdio: ["ignore", "pipe", "pipe"]
    });
    child.stdout.pipe(logStream, { end: false });
    child.stderr.pipe(logStream, { end: false });
    const timeout = setTimeout(() => {
      collectorState.lastError = `수집 시간이 ${Math.round(autoScrapeTimeoutMs / 1000)}초를 넘어 종료했습니다.`;
      logStream.write(`[${new Date().toISOString()}] ${collectorState.lastError}\n`);
      child.kill("SIGTERM");
    }, autoScrapeTimeoutMs);
    child.on("exit", (code) => {
      clearTimeout(timeout);
      collectorState.running = false;
      collectorState.lastFinishedAt = new Date().toISOString();
      collectorState.lastExitCode = code;
      if (code !== 0 && !collectorState.lastError) collectorState.lastError = `수집기가 ${code} 코드로 종료됐습니다. data/collector.log를 확인하세요.`;
      logStream.write(`[${collectorState.lastFinishedAt}] 자동 카페 수집 종료: ${code === 0 ? "성공" : `실패 ${code}`}\n`);
      logStream.end();
      console.log(`자동 카페 수집 종료: ${code === 0 ? "성공" : `실패 ${code}`}`);
      resolveRun();
    });
    child.on("error", (error) => {
      clearTimeout(timeout);
      collectorState.running = false;
      collectorState.lastFinishedAt = new Date().toISOString();
      collectorState.lastExitCode = -1;
      collectorState.lastError = error.message;
      logStream.write(`[${collectorState.lastFinishedAt}] 자동 카페 수집 시작 실패: ${error.message}\n`);
      logStream.end();
      console.log(`자동 카페 수집 시작 실패: ${error.message}`);
      resolveRun();
    });
  });
}
