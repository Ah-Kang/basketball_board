import { existsSync, lstatSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { createInterface } from "node:readline/promises";
import { stdin as input, stdout as output } from "node:process";
import { isSupabaseConfigured, upsertEventsToSupabase } from "../lib/supabase-events.js";

const configPath = join(process.cwd(), "config", "cafes.json");
const dataDir = join(process.cwd(), "data");
const outputPath = join(dataDir, "events.json");
const debugDir = join(dataDir, "debug");
const sessionRoot = join(process.cwd(), ".browser-sessions");
const legacyUserDataDir = join(process.cwd(), ".browser-session");
const userId = getUserId();
const authCookiesPath = join(dataDir, `auth-${userId}-cookies.json`);
const userDataDir = userId === "default" && existsSync(legacyUserDataDir)
  ? legacyUserDataDir
  : join(sessionRoot, userId);
const accessMode = process.env.SCRAPER_ACCESS_MODE || (process.argv.includes("--public") ? "public" : "authenticated");
const needsLogin = process.argv.includes("--login");
const loginOnly = process.argv.includes("--login-only");
const headless = process.env.SCRAPER_HEADLESS === "true" || process.argv.includes("--headless");
const nonInteractive = process.env.SCRAPER_NONINTERACTIVE === "true" || process.argv.includes("--non-interactive");

async function main() {
  const { chromium } = await import("playwright").catch(() => {
    throw new Error("Playwright가 설치되어 있지 않습니다. 먼저 `npm install`을 실행하세요.");
  });

  if (!existsSync(configPath)) {
    throw new Error("config/cafes.json 파일을 먼저 설정하세요.");
  }

  const config = JSON.parse(readFileSync(configPath, "utf8"));
  const publicOnly = accessMode === "public";
  const firstRun = !publicOnly && !existsSync(userDataDir);
  if (!publicOnly && (needsLogin || firstRun) && nonInteractive) {
    throw new Error("로그인 세션이 없어 자동 수집을 건너뜁니다. 먼저 `npm run scrape:login`으로 로그인하세요.");
  }
  if (!publicOnly && headless && nonInteractive && isBrowserProfileLocked()) {
    throw new Error([
      "로그인 세션 브라우저가 이미 열려 있어 자동 수집을 건너뜁니다.",
      "자동 수집은 기존 창을 건드리지 않고 다음 주기에 다시 시도합니다.",
      `잠금 정보: ${readSessionLockInfo()}`
    ].join("\n"));
  }
  const browser = await chromium.launchPersistentContext(userDataDir, {
    headless,
    viewport: { width: 1440, height: 1000 }
  }).catch((error) => {
    if (String(error.message).includes("Opening in existing browser session")) {
      throw new Error([
        ".browser-session을 이미 다른 Chromium 창이 사용 중입니다.",
        "열려 있는 'Google Chrome for Testing' 창을 모두 닫고 다시 실행하세요.",
        "이전에 `npm run scrape:login`이나 `npm run scrape:watch`를 켜뒀다면 터미널에서 Ctrl+C로 먼저 종료하세요.",
        `잠금 정보: ${readSessionLockInfo()}`
      ].join("\n"));
    }
    throw error;
  });
  const firstBoard = config.boards[0];
  if (!firstBoard) throw new Error("config/cafes.json에 boards를 하나 이상 설정하세요.");
  if (!publicOnly) await loadSavedAuthCookies(browser);
  const page = await browser.newPage();
  page.setDefaultTimeout(8000);
  page.setDefaultNavigationTimeout(15000);

  if (!publicOnly && (needsLogin || firstRun)) {
    await openLoginTabs(browser, page, config.boards);
    const rl = createInterface({ input, output });
    await rl.question("열린 탭에서 필요한 카페 로그인을 모두 완료한 뒤 Enter를 누르세요.");
    rl.close();
    if (loginOnly) {
      await saveAuthCookies(browser);
      await browser.close();
      console.log(`로그인 세션을 저장했습니다. 사용자: ${userId}`);
      return;
    }
  }

  const collected = [];
  const scrapedBoardKeys = new Set();
  for (const board of config.boards) {
    console.log(`수집 시작: ${board.name}`);
    const result = await collectBoard(page, board);
    const rows = result.rows;
    if (result.listOk) scrapedBoardKeys.add(boardKey(board));
    console.log(`- 키워드 매칭 글 ${rows.length}개`);
    const parsedRows = rows.map((row) => parseCafePost(row, board, { userId, accessMode }));
    collected.push(...parsedRows);
    for (const event of parsedRows) {
      console.log(`  저장 후보: ${event.date} ${event.startTime} ${event.title}`);
    }
    await page.waitForTimeout(config.delayMs ?? 3000);
  }

  const existing = existsSync(outputPath) ? JSON.parse(readFileSync(outputPath, "utf8")) : [];
  const merged = mergeEvents(existing, collected, config.boards, scrapedBoardKeys);
  mkdirSync(dirname(outputPath), { recursive: true });
  writeFileSync(outputPath, `${JSON.stringify(merged, null, 2)}\n`);
  if (isSupabaseConfigured()) {
    await upsertEventsToSupabase(merged);
    console.log(`Supabase events 테이블에 ${merged.length}개 일정을 저장했습니다.`);
  }
  if (!publicOnly) await saveAuthCookies(browser);
  await browser.close();
  if (!collected.length) {
    console.log("실제 카페 글을 찾지 못했습니다. data/debug 폴더의 HTML 스냅샷을 확인해 선택자를 조정해야 합니다.");
  }
  console.log(`${collected.length}개 글을 읽고 ${merged.length}개 일정으로 저장했습니다.`);
}

async function loadSavedAuthCookies(browser) {
  if (!existsSync(authCookiesPath)) return;
  const cookies = JSON.parse(readFileSync(authCookiesPath, "utf8"));
  if (!Array.isArray(cookies) || !cookies.length) return;
  await browser.addCookies(cookies.map(normalizeCookieForPlaywright));
  console.log(`저장된 로그인 쿠키 ${cookies.length}개를 불러왔습니다.`);
}

async function saveAuthCookies(browser) {
  const cookies = await browser.cookies(
    "https://naver.com",
    "https://cafe.naver.com",
    "https://nid.naver.com",
    "https://article.cafe.naver.com",
    "https://daum.net",
    "https://cafe.daum.net"
  );
  const authCookies = cookies.filter((cookie) => (
    /(^NID_|^nid_|^NNB$|^DAUM|^HM_CU|^TS=|^HTS$|^PROF$|^LSID$)/.test(cookie.name)
    || /naver\.com|daum\.net/.test(cookie.domain)
  ));
  mkdirSync(dataDir, { recursive: true });
  writeFileSync(authCookiesPath, `${JSON.stringify(authCookies, null, 2)}\n`);
  console.log(`로그인 쿠키 ${authCookies.length}개를 저장했습니다: ${authCookiesPath}`);
}

function normalizeCookieForPlaywright(cookie) {
  const normalized = { ...cookie };
  if (normalized.expires === -1) delete normalized.expires;
  return normalized;
}

function getUserId() {
  const userArgIndex = process.argv.indexOf("--user");
  const rawUserId = process.env.SCRAPER_USER_ID || (
    userArgIndex >= 0 ? process.argv[userArgIndex + 1] : ""
  ) || "default";
  return sanitizeUserId(rawUserId);
}

function sanitizeUserId(value) {
  return String(value)
    .trim()
    .replace(/[^\w.-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48) || "default";
}

async function openLoginTabs(browser, firstPage, boards) {
  for (const [index, board] of boards.entries()) {
    const page = index === 0 ? firstPage : await browser.newPage();
    const targetUrl = board.loginUrl || board.url;
    console.log(`로그인 확인 탭 열기: ${board.name} - ${targetUrl}`);
    await page.goto(targetUrl, { waitUntil: "domcontentloaded" });
  }
}

async function collectBoard(page, board) {
  const provider = board.provider || inferProvider(board.url);
  console.log(`- 목록 열기: ${board.url}`);
  await page.goto(board.url, { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(1800);
  await loadMoreListContent(page, provider);

  const frame = findReadableFrame(page, provider);
  let posts = await collectPostLinks(frame, board, provider);
  if (!posts.length && provider === "naver") {
    posts = extractNaverPostLinksFromHtml(await page.content(), board);
    console.log(`  HTML fallback 링크 ${posts.length}개`);
  }
  if (!posts.length && provider === "daum") {
    posts = extractDaumPostLinksFromHtml(await page.content(), board);
    console.log(`  Daum HTML fallback 링크 ${posts.length}개`);
  }
  console.log(`- 글 링크 후보 ${posts.length}개`);
  if (!posts.length) {
    await saveDebugSnapshot(page, board, "no-post-links");
  }

  const rows = [];
  for (const post of posts) {
    if (!post.title || shouldSkipPost(post, board)) {
      console.log(`  건너뜀: ${post.title || post.href}`);
      continue;
    }
    if (board.requireTitleKeyword && !matchesKeywords(post.title, board.keywords)) {
      console.log(`  제목 키워드 불일치로 제외: ${post.title}`);
      continue;
    }
    console.log(`  본문 열기: ${post.title}`);
    const loaded = await page.goto(post.href, { waitUntil: "domcontentloaded", timeout: 10000 }).then(() => true).catch((error) => {
      console.log(`  본문 페이지 로딩 실패: ${error.message.split("\n")[0]}`);
      return false;
    });
    if (!loaded) {
      rows.push({
        title: post.title,
        body: "",
        url: post.href,
        provider
      });
      continue;
    }
    await page.waitForTimeout(1800);
    const body = await readArticleBodyWithFallback(page, provider, post.href);
    if (!body?.trim()) {
      console.log("  본문을 찾지 못했습니다.");
      await saveDebugSnapshot(page, board, "no-body");
    }
    const fullBody = cleanFullBodyText(body || "");
    const compactBody = fullBody.replace(/\s+/g, " ").trim();
    if (isUnreadableBody(compactBody)) {
      console.log(provider === "daum" ? "  다음카페 목록 정보만 저장" : "  권한 부족/비공개 본문으로 제외");
      if (provider !== "daum") continue;
      rows.push({
        title: post.title,
        body: "",
        compactBody: post.title,
        url: post.href,
        provider
      });
      continue;
    }
    if (!matchesKeywords(`${post.title} ${compactBody}`, board.keywords)) {
      console.log("  본문 키워드 불일치로 제외");
      continue;
    }
    rows.push({
      title: post.title,
      body: fullBody,
      compactBody,
      url: post.href,
      provider
    });
  }

  return {
    rows,
    listOk: posts.length > 0
  };
}

function cleanFullBodyText(value) {
  return String(value || "")
    .replace(/\r/g, "")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n[ \t]+/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

async function loadMoreListContent(page, provider) {
  const scrollCount = provider === "naver" ? 3 : 4;
  for (let i = 0; i < scrollCount; i += 1) {
    await page.mouse.wheel(0, 1800);
    await page.waitForTimeout(700);
  }
}

async function collectPostLinks(frame, board, provider) {
  const selectors = provider === "naver"
    ? ["a.article", ".ArticleList a[href*='/ArticleRead.nhn']", "a[href*='articleid=']", "a[href*='/articles/']"]
    : ["a[href*='/dongarry/']", "a[href*='/_rec/']", "a.link_cafe", "a[href]"];

  for (const selector of selectors) {
    const links = await frame.locator(selector).evaluateAll((items) => (
      items.map((link) => ({
        title: link.textContent?.replace(/\s+/g, " ").trim() || "",
        href: normalizeCafeUrl(link.href)
      }))
    )).catch(() => []);
    console.log(`  선택자 "${selector}" 링크 ${links.length}개`);

    const posts = links
      .filter((link) => link.title && link.href)
      .filter((link) => isLikelyPostUrl(link.href, board, provider))
      .slice(0, board.limit ?? 30);

    if (links.length) saveLinkDebug(board, selector, links);
    if (posts.length) return dedupePosts(posts);
  }

  return [];
}

function saveLinkDebug(board, selector, links) {
  mkdirSync(debugDir, { recursive: true });
  const safeName = `${board.name}-links`.replace(/[^\w가-힣-]+/g, "-").slice(0, 80);
  const path = join(debugDir, `${safeName}.json`);
  const payload = {
    selector,
    capturedAt: new Date().toISOString(),
    links: links.slice(0, 80)
  };
  writeFileSync(path, `${JSON.stringify(payload, null, 2)}\n`);
}

function extractNaverPostLinksFromHtml(html, board) {
  const links = [];
  const cafeId = board.url.match(/cafes\/(\d+)/)?.[1] || board.url.match(/clubid=(\d+)/)?.[1] || "10586238";
  const anchorPattern = /<a\b[^>]*href=(["'])([^"']*(?:\/articles\/\d+|ArticleRead\.nhn[^"']*articleid=\d+)[^"']*)\1[^>]*>([\s\S]*?)<\/a>/g;
  for (const match of html.matchAll(anchorPattern)) {
    const href = normalizeCafeUrl(decodeHtml(match[2]));
    const title = stripTags(decodeHtml(match[3])).replace(/\s+/g, " ").trim();
    if (!title || !isLikelyPostUrl(href, board, "naver")) continue;
    links.push({ title, href: absoluteCafeUrl(href, board.url) });
  }

  if (!links.length) {
    const ids = [...new Set([...html.matchAll(/(?:\/articles\/|articleid=)(\d{5,})/g)].map((match) => match[1]))];
    for (const id of ids.slice(0, board.limit ?? 30)) {
      links.push({
        title: `네이버 카페 글 ${id}`,
        href: `https://cafe.naver.com/f-e/cafes/${cafeId}/articles/${id}`
      });
    }
  }

  return dedupePosts(links).slice(0, board.limit ?? 30);
}

function extractDaumPostLinksFromHtml(html, board) {
  const links = [];
  const groupCode = board.url.match(/cafe\.daum\.net\/([^/?#]+)/)?.[1] || "dongarry";
  const articlePattern = /articles\.push\(\s*\{([\s\S]*?)\}\s*\);/g;
  for (const match of html.matchAll(articlePattern)) {
    const block = match[1];
    const dataId = block.match(/\bdataid:\s*(\d+)/)?.[1];
    const fieldId = block.match(/\bfldid:\s*"([^"]+)"/)?.[1];
    const rawTitle = block.match(/\btitle:\s*"((?:\\"|[^"])*)"/)?.[1];
    if (!dataId || !fieldId || !rawTitle) continue;
    const headCont = block.match(/\bheadCont:\s*"((?:\\"|[^"])*)"/)?.[1] || "";
    const title = [decodeJsString(headCont), decodeJsString(rawTitle)]
      .filter(Boolean)
      .map((part, index) => index === 0 && !part.startsWith("[") ? `[${part}]` : part)
      .join(" ")
      .replace(/\s+/g, " ")
      .trim();
    links.push({
      title,
      href: `https://m.cafe.daum.net/${groupCode}/${fieldId}/${dataId}?`
    });
  }

  if (!links.length) {
    const anchorPattern = /<a\b[^>]*href=(["'])([^"']*\/dongarry\/[^"']+\/\d+\??[^"']*)\1[^>]*>([\s\S]*?)<\/a>/g;
    for (const match of html.matchAll(anchorPattern)) {
      const href = absoluteCafeUrl(decodeHtml(match[2]), board.url);
      const title = stripTags(decodeHtml(match[3])).replace(/\s+/g, " ").trim();
      if (!title || !isLikelyPostUrl(href, board, "daum")) continue;
      links.push({ title, href });
    }
  }

  return dedupePosts(links).slice(0, board.limit ?? 30);
}

function decodeJsString(value) {
  return decodeHtml(String(value || "")
    .replace(/\\"/g, "\"")
    .replace(/\\'/g, "'")
    .replace(/\\n/g, "\n")
    .replace(/\\t/g, "\t")
    .replace(/\\\\/g, "\\"));
}

function absoluteCafeUrl(href, baseUrl) {
  if (!href) return "";
  if (href.startsWith("http")) return href;
  return new URL(href, baseUrl).toString();
}

function stripTags(value) {
  return value.replace(/<script[\s\S]*?<\/script>/g, " ").replace(/<style[\s\S]*?<\/style>/g, " ").replace(/<[^>]+>/g, " ");
}

function decodeHtml(value) {
  return value
    .replaceAll("&amp;", "&")
    .replaceAll("&quot;", "\"")
    .replaceAll("&#39;", "'")
    .replaceAll("&lt;", "<")
    .replaceAll("&gt;", ">");
}

async function saveDebugSnapshot(page, board, reason) {
  mkdirSync(debugDir, { recursive: true });
  const safeName = `${board.name}-${reason}`.replace(/[^\w가-힣-]+/g, "-").slice(0, 80);
  const htmlPath = join(debugDir, `${safeName}.html`);
  const urlPath = join(debugDir, `${safeName}.url.txt`);
  writeFileSync(htmlPath, await page.content());
  writeFileSync(urlPath, page.url());
  console.log(`  디버그 저장: ${htmlPath}`);
}

async function readArticleBody(page, provider) {
  const selectors = provider === "naver"
    ? [".se-main-container", ".ContentRenderer", "#tbody", ".article_viewer", ".ArticleContentBox", ".article_container", "#app"]
    : [".article_view", ".view_content", ".post-view", ".txt_detail", "article", "#mArticle"];
  const candidates = [];

  for (const frame of readableFrames(page, provider)) {
    for (const selector of selectors) {
      const texts = await frame.locator(selector).evaluateAll((items) => (
        items.map((item) => item.innerText || item.textContent || "")
      )).catch(() => []);
      for (const text of texts) {
        const cleaned = cleanFullBodyText(text);
        if (cleaned) candidates.push(cleaned);
      }
    }
  }
  return candidates.sort((a, b) => b.length - a.length)[0] || "";
}

async function readArticleBodyWithFallback(page, provider, sourceUrl) {
  const body = await readArticleBody(page, provider);
  if (body?.trim() || provider !== "naver") return body;

  const apiBody = await readNaverArticleApiBody(page, sourceUrl);
  if (apiBody?.trim()) return apiBody;

  const embeddedUrl = extractNaverEmbeddedArticleUrl(await page.content(), sourceUrl);
  if (!embeddedUrl || embeddedUrl === page.url()) return body;
  console.log(`  네이버 본문 프레임 열기: ${embeddedUrl}`);
  const loaded = await page.goto(embeddedUrl, { waitUntil: "domcontentloaded", timeout: 10000 })
    .then(() => true)
    .catch((error) => {
      console.log(`  본문 프레임 로딩 실패: ${error.message.split("\n")[0]}`);
      return false;
    });
  if (!loaded) return body;
  await page.waitForTimeout(1800);
  return readArticleBody(page, provider);
}

async function readNaverArticleApiBody(page, sourceUrl) {
  const ids = parseNaverArticleIds(sourceUrl);
  if (!ids) return "";
  const apiUrl = `https://article.cafe.naver.com/gw/v4/cafes/${ids.cafeId}/articles/${ids.articleId}?useCafeId=true&requestFrom=A`;
  const response = await page.request.get(apiUrl, {
    headers: {
      referer: sourceUrl,
      accept: "application/json"
    },
    timeout: 10000
  }).catch((error) => {
    console.log(`  네이버 본문 API 실패: ${error.message.split("\n")[0]}`);
    return null;
  });
  if (!response?.ok()) {
    const status = response ? response.status() : "no-response";
    console.log(`  네이버 본문 API 응답 실패: ${status}`);
    return "";
  }
  const payload = await response.json().catch(() => null);
  return extractNaverArticleText(payload);
}

function parseNaverArticleIds(sourceUrl) {
  try {
    const url = new URL(sourceUrl);
    const cafeId = url.pathname.match(/cafes\/(\d+)/)?.[1] || url.searchParams.get("clubid");
    const articleId = url.pathname.match(/articles\/(\d+)/)?.[1] || url.searchParams.get("articleid");
    if (!cafeId || !articleId) return null;
    return { cafeId, articleId };
  } catch {
    return null;
  }
}

function extractNaverArticleText(payload) {
  const result = payload?.result;
  if (!result || result.errorCode) return "";
  const article = result.article || result;
  const htmlContent = article.contentHtml || article.articleContentHtml || article.content?.html || article.content?.contentHtml;
  if (htmlContent) return cleanNaverArticleText(htmlToReadableText(htmlContent));

  const content = article.articleContent || article.content || article;
  return cleanNaverArticleText(collectReadableStrings(content).join("\n"));
}

function htmlToReadableText(html) {
  return cleanFullBodyText(
    decodeHtml(String(html || "")
      .replace(/<\s*br\s*\/?>/gi, "\n")
      .replace(/<\/\s*(p|div|li|tr|h[1-6])\s*>/gi, "\n")
      .replace(/<script[\s\S]*?<\/script>/gi, " ")
      .replace(/<style[\s\S]*?<\/style>/gi, " ")
      .replace(/<[^>]+>/g, " "))
  );
}

function cleanNaverArticleText(text) {
  let cleaned = cleanFullBodyText(String(text || "")
    .replace(/\u200b/g, "")
    .replace(/^\s*SE_DOC_HEADER_START[\s\S]*?SE_DOC_HEADER_END\s*/i, "")
    .replace(/\n\s*(좋아요\d*|댓글\s*\d+|공유|신고|글쓰기|목록\s*TOP)\s*$/g, ""));

  const contentStartPatterns = [
    /말머리\s*설정\s*후/,
    /\n\s*1\.?\s*게시글\s*제목/,
    /\n\s*1\.?\s*제목\s*[:：]/,
    /\n\s*1\.\s*제목\s*[:：]/
  ];
  const startIndexes = contentStartPatterns
    .map((pattern) => cleaned.search(pattern))
    .filter((index) => index >= 0);
  if (startIndexes.length) {
    cleaned = cleaned.slice(Math.min(...startIndexes)).trim();
  }

  const endPatterns = [
    /\n[^\n]{1,40}\s+님의\s+게시글\s+더보기/,
    /\n좋아요\d*/,
    /\n댓글\s*\d*\n공유/,
    /\n댓글\n클린봇/,
    /\n글쓰기\n목록\s*TOP/,
    /\n'\s*[^']+\s*'\n게시판\s*글/,
    /\n이\s*카페\s*인기글/,
    /\n페이징\s*이동/
  ];
  const endIndexes = endPatterns
    .map((pattern) => cleaned.search(pattern))
    .filter((index) => index >= 0);
  if (endIndexes.length) {
    cleaned = cleaned.slice(0, Math.min(...endIndexes)).trim();
  }

  return cleanFullBodyText(cleaned);
}

function collectReadableStrings(value, key = "") {
  if (value == null) return [];
  if (typeof value === "string") {
    const text = stripTags(decodeHtml(value)).replace(/\s+/g, " ").trim();
    if (text.length < 2) return [];
    if (/^(https?:|data:image|image\/|video\/|application\/|#)/.test(text)) return [];
    if (/^(id|url|href|src|type|class|style|gdid|memberKey|articleId|cafeId)$/i.test(key)) return [];
    return [text];
  }
  if (Array.isArray(value)) return value.flatMap((item) => collectReadableStrings(item, key));
  if (typeof value === "object") {
    return Object.entries(value)
      .filter(([entryKey]) => !/^(id|url|href|src|image|thumbnail|profile|gdid|memberKey|writer|attach|file)/i.test(entryKey))
      .flatMap(([entryKey, entryValue]) => collectReadableStrings(entryValue, entryKey));
  }
  return [];
}

function extractNaverEmbeddedArticleUrl(html, sourceUrl) {
  const normalized = String(html || "")
    .replaceAll("\\u0026", "&")
    .replaceAll('\\"', '"');
  const match = normalized.match(/"iframeUrl":"([^"]+)"/);
  if (match?.[1]) return match[1];

  try {
    const url = new URL(sourceUrl);
    if (url.pathname.startsWith("/f-e/cafes/")) {
      url.pathname = url.pathname.replace("/f-e/cafes/", "/ca-fe/cafes/");
      url.searchParams.set("fromNext", "true");
      return url.toString();
    }
  } catch {
    return "";
  }
  return "";
}

function findReadableFrame(page, provider) {
  return readableFrames(page, provider)[0] || page.mainFrame();
}

function readableFrames(page, provider) {
  const frames = page.frames();
  if (provider === "naver") {
    return [
      ...frames.filter((frame) => frame.name() === "cafe_main"),
      ...frames.filter((frame) => /ArticleRead|\/articles\/|\/menus\//.test(frame.url())),
      page.mainFrame()
    ];
  }
  return [page.mainFrame(), ...frames.filter((frame) => frame !== page.mainFrame())];
}

function inferProvider(url) {
  if (url.includes("cafe.naver.com")) return "naver";
  if (url.includes("cafe.daum.net")) return "daum";
  return "generic";
}

function isLikelyPostUrl(url, board, provider) {
  if (provider === "naver") {
    return url.includes("articleid=") || url.includes("ArticleRead") || /\/f-e\/cafes\/\d+\/articles\/\d+/.test(url) || /\/ca-fe\/cafes\/\d+\/articles\/\d+/.test(url);
  }
  if (provider === "daum") {
    const parsed = new URL(url);
    const path = parsed.pathname;
    const boardPath = new URL(board.url).pathname;
    if (!path.includes("/dongarry/") || path === boardPath) return false;
    if (path.includes("/comments")) return false;
    if (path.includes("/profile") || path.includes("/_image") || path.includes("/_untitled")) return false;
    if (!/\/dongarry\/[^/]+\/[^/?#]+/.test(path)) return false;
    if (parsed.hostname === "cafe.daum.net" && path.includes("/_c21_")) return false;
    return url !== board.url;
  }
  return url !== board.url;
}

function dedupePosts(posts) {
  const seen = new Set();
  return posts.filter((post) => {
    const key = canonicalPostKey(post.href);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function normalizeCafeUrl(url) {
  if (!url) return "";
  if (url.startsWith("//")) return `https:${url}`;
  return url;
}

function canonicalPostKey(url) {
  const articleId = url.match(/(?:articleid=|\/articles\/)(\d+)/)?.[1];
  return articleId || url;
}

function matchesKeywords(text, keywords = []) {
  if (!keywords.length) return true;
  return keywords.some((keyword) => text.includes(keyword));
}

function shouldSkipPost(post, board) {
  const title = post.title.replace(/\s+/g, " ").trim();
  if (/^(내가 쓴 글|글쓰기|게시판|최신글|이미지)$/.test(title)) return true;
  if (/^(댓글수\s*\d+|PC화면)$/.test(title)) return true;
  if (/^공지\s/.test(title) && board.includeNotices !== true) return true;
  if (board.excludeKeywords?.some((keyword) => title.includes(keyword))) return true;
  return false;
}

function parseCafePost(row, board, collection = {}) {
  const provider = row.provider || board.provider || inferProvider(row.url || board.url);
  const title = normalizeDigits(row.title);
  const body = normalizeDigits(row.body);
  const displayBody = provider === "naver" ? cleanNaverArticleText(body) : body;
  const compactBody = normalizeDigits(row.compactBody || row.body).replace(/\s+/g, " ").trim();
  const displayCompactBody = (displayBody || compactBody).replace(/\s+/g, " ").trim();
  const text = `${title} ${compactBody}`;
  const date = inferDate(title) || inferDate(body) || new Date().toISOString().slice(0, 10);
  const time = inferTime(title) || inferTime(body) || { startTime: "00:00", endTime: "00:00" };
  const area = inferArea(text, board.defaultArea);
  const type = inferType(text);

  return {
    id: stableId(row.url, row.provider),
    title: row.title,
    type,
    date,
    startTime: time.startTime,
    endTime: time.endTime,
    area,
    venue: inferVenue(text, area),
    fee: inferFee(text),
    spots: inferSpots(text),
    status: text.includes("마감") ? "closed" : "open",
    level: inferLevel(text),
    contact: inferContact(text),
    sourceCafe: cleanCafeName(board.name),
    sourceBoardKey: boardKey(board),
    sourceUrl: row.url,
    summary: displayCompactBody.slice(0, 140),
    bodyText: displayBody,
    collectedByUserId: collection.userId || "default",
    accessMode: collection.accessMode || "authenticated",
    collectedAt: new Date().toISOString()
  };
}

function boardKey(board) {
  const provider = board.provider || inferProvider(board.url);
  try {
    const url = new URL(board.url);
    if (provider === "naver") {
      const cafeId = url.pathname.match(/cafes\/(\d+)/)?.[1] || url.searchParams.get("clubid") || "unknown";
      const menuId = url.pathname.match(/menus\/(\d+)/)?.[1] || url.searchParams.get("menuid") || "all";
      return `naver:${cafeId}:${menuId}`;
    }
    if (provider === "daum") {
      return `daum:${url.hostname}:${url.pathname.replace(/\/$/, "")}`;
    }
  } catch {
    return `${provider}:${board.url}`;
  }
  return `${provider}:${board.url}`;
}

function cleanCafeName(name) {
  return String(name || "카페")
    .replace(/\s*메뉴\s*\d+\s*/g, "")
    .replace(/\s+/g, " ")
    .trim() || "카페";
}

function inferDate(text) {
  text = normalizeDigits(text);
  const full = text.match(/(20\d{2})[.\-/년\s]+(\d{1,2})[.\-/월\s]+(\d{1,2})/);
  if (full) return formatDate(full[1], full[2], full[3]);

  const short = text.match(/(?:^|[^\d])(\d{1,2})\s*(?:[.\-/]|월)\s*(\d{1,2})\s*(?:일)?/);
  if (!short) return null;
  const now = new Date();
  return formatDate(now.getFullYear(), short[1], short[2]);
}

function inferTime(text) {
  text = normalizeDigits(text);
  const numeric = text.match(/(?:^|[^\d])(\d{2})(\d{2})\s*[~-]\s*(\d{2})(\d{2})(?:[^\d]|$)/);
  if (numeric) {
    const startHour = normalizeHour(numeric[1]);
    const endHour = normalizeHour(numeric[3]);
    if (startHour !== null && endHour !== null) {
      return {
        startTime: `${String(startHour).padStart(2, "0")}:${numeric[2]}`,
        endTime: `${String(endHour).padStart(2, "0")}:${numeric[4]}`
      };
    }
  }

  const range = text.match(/(오전|오후|저녁|밤|새벽)?\s*(\d{1,2})(?::|\.|시\s*)?(\d{2})?\s*(?:분)?\s*시?\s*[~-]\s*(오전|오후|저녁|밤|새벽)?\s*(\d{1,2})(?::|\.|시\s*)?(\d{2})?\s*(?:분)?\s*시?/);
  if (range) {
    const startHour = normalizeHour(range[2], range[1]);
    const inheritedMarker = range[1] && /오후|저녁|밤|새벽/.test(range[1]) ? range[1] : undefined;
    let endHour = normalizeHour(range[5], range[4] || inheritedMarker);
    if (startHour === null || endHour === null) return null;
    if (startHour >= 18 && endHour === 12 && !range[4]) endHour = 0;
    return {
      startTime: `${String(startHour).padStart(2, "0")}:${range[3] || "00"}`,
      endTime: `${String(endHour).padStart(2, "0")}:${range[6] || "00"}`
    };
  }

  const compact = text.match(/(오전|오후|저녁|밤|새벽)?\s*(\d{1,2})\s*시\s*(오전|오후|저녁|밤|새벽)?\s*(\d{1,2})\s*시/);
  if (!compact) return null;
  const startHour = normalizeHour(compact[2], compact[1]);
  const inheritedMarker = compact[1] && /오후|저녁|밤|새벽/.test(compact[1]) ? compact[1] : undefined;
  let endHour = normalizeHour(compact[4], compact[3] || inheritedMarker);
  if (startHour === null || endHour === null) return null;
  if (startHour >= 18 && endHour === 12 && !compact[3]) endHour = 0;
  return {
    startTime: `${String(startHour).padStart(2, "0")}:00`,
    endTime: `${String(endHour).padStart(2, "0")}:00`
  };
}

function formatDate(year, month, day) {
  const yyyy = Number(year);
  const mm = Number(month);
  const dd = Number(day);
  if (!Number.isInteger(yyyy) || !Number.isInteger(mm) || !Number.isInteger(dd)) return null;
  if (mm < 1 || mm > 12 || dd < 1 || dd > 31) return null;
  return `${yyyy}-${String(mm).padStart(2, "0")}-${String(dd).padStart(2, "0")}`;
}

function normalizeHour(hourText, marker) {
  let hour = Number(hourText);
  if (!Number.isInteger(hour) || hour < 0 || hour > 24) return null;
  if (marker && /오후|저녁|밤/.test(marker) && hour < 12) hour += 12;
  if (marker === "오전" && hour === 12) hour = 0;
  if (hour === 24) hour = 0;
  return hour;
}

function normalizeDigits(value) {
  return String(value || "").replace(/[０-９]/g, (digit) => String.fromCharCode(digit.charCodeAt(0) - 0xfee0));
}

function isUnreadableBody(body) {
  return /읽기가 가능한 게시판|정회원이상\s*읽기 가능|현재 손님이세요|카페 가입 후|후보 등급|등업에 관련된|권한이 없습니다|멤버등급/.test(body);
}

function inferType(text) {
  if (/연습\s*게임|상대팀|팀게임|교류전|친선전|초청|팀\s*구합니다|팀구합니다/.test(text)) return "practice";
  if (/대관|쉐어|공유|체육관\s*양도|코트\s*양도/.test(text)) return "rental";
  return "pickup";
}

function inferArea(text, fallback = "미정") {
  const areas = ["강남", "잠실", "성수", "마포", "홍대", "신촌", "건대", "노원", "수원", "분당", "일산", "인천"];
  return areas.find((area) => text.includes(area)) || fallback;
}

function inferVenue(text, area) {
  const match = text.match(/([가-힣A-Za-z0-9\s]+(?:체육관|센터|코트|학교|아레나))/);
  return match?.[1]?.trim() || `${area} 장소 미정`;
}

function inferFee(text) {
  const won = text.match(/(\d{1,3}(?:,\d{3})*|\d+)\s*원/);
  if (won) return Number(won[1].replaceAll(",", ""));
  const manwon = text.match(/(\d+)\s*만\s*원/);
  if (manwon) return Number(manwon[1]) * 10000;
  return 0;
}

function inferSpots(text) {
  const match = text.match(/(?:남은\s*)?(?:자리|인원|모집)\s*(\d+)\s*명?/);
  return match ? Number(match[1]) : 0;
}

function inferLevel(text) {
  const levels = ["입문", "초급", "초중급", "중급", "상급", "동호회", "무관"];
  return levels.find((level) => text.includes(level)) || "무관";
}

function inferContact(text) {
  const normalized = normalizeDigits(text).replace(/\s+/g, " ").trim();
  const phoneText = normalized.replace(/[Oo]/g, "0").replace(/[Il|]/g, "1");
  const phones = [...new Set([...phoneText.matchAll(/01[016789][-\s.]*\d{3,4}[-\s.]*\d{4}/g)]
    .map((match) => formatPhone(match[0])))];
  const openChatUrls = [...new Set([...normalized.matchAll(/https?:\/\/open\.kakao\.com\/[^\s)]+/g)]
    .map((match) => match[0]))];
  const kakaoIds = [...new Set([...normalized.matchAll(/(?:카톡|카카오톡|카톡ID|카카오톡ID|kakao|Kakao)\s*(?:ID|아이디)?\s*[:：]?\s*([A-Za-z0-9_.-]{3,30})/g)]
    .map((match) => match[1])
    .filter((value) => !/^\d+$/.test(value)))];
  const snippets = contactSnippets(normalized);

  if (!phones.length && !openChatUrls.length && !kakaoIds.length && !snippets.length) return null;
  return {
    phones,
    openChatUrls,
    kakaoIds,
    snippets
  };
}

function formatPhone(value) {
  const digits = value.replace(/\D/g, "");
  if (digits.length === 10) return `${digits.slice(0, 3)}-${digits.slice(3, 6)}-${digits.slice(6)}`;
  if (digits.length === 11) return `${digits.slice(0, 3)}-${digits.slice(3, 7)}-${digits.slice(7)}`;
  return value;
}

function contactSnippets(text) {
  const keywords = ["연락처", "문의", "신청", "카톡", "카카오톡", "오픈채팅", "오픈 채팅"];
  const snippets = [];
  for (const keyword of keywords) {
    const index = text.indexOf(keyword);
    if (index < 0) continue;
    snippets.push(text.slice(Math.max(0, index - 18), Math.min(text.length, index + 90)).trim());
  }
  return [...new Set(snippets)].slice(0, 3);
}

function stableId(value, provider = "cafe") {
  let hash = 0;
  for (const char of value) hash = ((hash << 5) - hash + char.charCodeAt(0)) | 0;
  return `${provider}-${Math.abs(hash)}`;
}

function mergeEvents(existing, collected, boards, scrapedBoardKeys = new Set()) {
  const collectedIds = new Set(collected.map((event) => event.id));
  const base = existing
    .filter((event) => !String(event.id).startsWith("sample-"))
    .filter((event) => {
      if (!belongsToScrapedBoard(event, boards, scrapedBoardKeys)) return true;
      return collectedIds.has(event.id);
    });
  const map = new Map(base.map((event) => [event.id, event]));
  for (const event of collected) {
    const previous = map.get(event.id);
    map.set(event.id, preferRicherEvent(previous, event));
  }
  return [...map.values()].sort((a, b) => `${a.date}${a.startTime}`.localeCompare(`${b.date}${b.startTime}`));
}

function preferRicherEvent(previous, next) {
  if (!previous) return next;
  const previousBody = String(previous.bodyText || "");
  const nextBody = String(next.bodyText || "");
  if (bodyQualityScore(previousBody) > bodyQualityScore(nextBody)) {
    return {
      ...next,
      summary: previous.summary || next.summary,
      bodyText: previous.bodyText,
      contact: hasContact(next.contact) ? next.contact : previous.contact
    };
  }
  return next;
}

function bodyQualityScore(body) {
  const text = String(body || "").trim();
  if (!text) return 0;
  if (isUnreadableBody(text)) return -10000;
  let score = Math.min(text.length, 4000);
  if (/이\s*카페\s*인기글|게시판\s*글|글쓰기\s*목록\s*TOP|페이징\s*이동|댓글을\s*입력하세요|이\s*글을\s*'좋아요'/.test(text)) {
    score -= 5000;
  }
  if (/담당자\s*연락처|날짜\s*\/\s*시간\s*\/\s*장소|게스트비|팀명|준비물|경기\s*진행방법|모집\s*포지션/.test(text)) {
    score += 1200;
  }
  return score;
}

function hasContact(contact) {
  if (!contact) return false;
  return ["phones", "openChatUrls", "kakaoIds", "snippets"]
    .some((key) => Array.isArray(contact[key]) && contact[key].length);
}

function belongsToScrapedBoard(event, boards, scrapedBoardKeys) {
  if (!scrapedBoardKeys.size) return false;
  if (event.sourceBoardKey && scrapedBoardKeys.has(event.sourceBoardKey)) return true;
  return boards
    .filter((board) => scrapedBoardKeys.has(boardKey(board)))
    .some((board) => eventBelongsToBoard(event, board));
}

function eventBelongsToBoard(event, board) {
  const provider = board.provider || inferProvider(board.url);
  const sourceUrl = String(event.sourceUrl || "");
  if (!sourceUrl) return false;
  try {
    const eventUrl = new URL(sourceUrl);
    const boardUrl = new URL(board.url);
    if (provider === "naver") {
      const boardCafeId = boardUrl.pathname.match(/cafes\/(\d+)/)?.[1] || boardUrl.searchParams.get("clubid");
      const boardMenuId = boardUrl.pathname.match(/menus\/(\d+)/)?.[1] || boardUrl.searchParams.get("menuid");
      const eventCafeId = eventUrl.pathname.match(/cafes\/(\d+)/)?.[1] || eventUrl.searchParams.get("clubid");
      const eventMenuId = eventUrl.searchParams.get("menuid");
      return Boolean(boardCafeId && boardMenuId && eventCafeId === boardCafeId && eventMenuId === boardMenuId);
    }
    if (provider === "daum") {
      return eventUrl.hostname.includes("cafe.daum.net") && eventUrl.pathname.startsWith(boardUrl.pathname.replace(/\/$/, ""));
    }
  } catch {
    return false;
  }
  return false;
}

function readSessionLockInfo() {
  const lockPath = join(userDataDir, "SingletonLock");
  if (!pathExistsEvenIfBrokenSymlink(lockPath)) return "SingletonLock 없음";
  try {
    return readFileSync(lockPath, "utf8").trim() || "SingletonLock 있음";
  } catch {
    return "SingletonLock 있음";
  }
}

function isBrowserProfileLocked() {
  return ["SingletonLock", "SingletonSocket", "SingletonCookie"]
    .some((name) => pathExistsEvenIfBrokenSymlink(join(userDataDir, name)));
}

function pathExistsEvenIfBrokenSymlink(path) {
  try {
    lstatSync(path);
    return true;
  } catch {
    return false;
  }
}

main().catch((error) => {
  console.error(error.message);
  if (String(error.message).includes("자동 수집을 건너뜁니다")) {
    process.exitCode = 0;
    return;
  }
  process.exitCode = 1;
});
