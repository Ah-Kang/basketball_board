import { spawn } from "node:child_process";

const minIntervalMinutes = Number(process.env.SCRAPE_MIN_INTERVAL_MINUTES || 5);
const maxIntervalMinutes = Number(process.env.SCRAPE_MAX_INTERVAL_MINUTES || 10);

let running = false;

async function runOnce() {
  if (running) return;
  running = true;
  const startedAt = new Date();
  console.log(`[${startedAt.toLocaleString("ko-KR")}] 카페 수집 시작`);

  await new Promise((resolve) => {
    const child = spawn("node", ["scripts/naver-cafe-scraper.js"], {
      cwd: process.cwd(),
      stdio: "inherit"
    });
    child.on("exit", (code) => {
      console.log(`카페 수집 종료: ${code === 0 ? "성공" : `실패 ${code}`}`);
      resolve();
    });
  });

  running = false;
}

function nextDelayMs() {
  const min = Math.max(Math.min(minIntervalMinutes, maxIntervalMinutes), 1);
  const max = Math.max(Math.max(minIntervalMinutes, maxIntervalMinutes), min);
  const minutes = min + Math.random() * (max - min);
  return Math.round(minutes * 60 * 1000);
}

function scheduleNextRun() {
  const delay = nextDelayMs();
  const nextRunAt = new Date(Date.now() + delay);
  console.log(`다음 수집 예정: ${nextRunAt.toLocaleString("ko-KR")}`);
  setTimeout(async () => {
    await runOnce();
    scheduleNextRun();
  }, delay);
}

console.log(`${minIntervalMinutes}~${maxIntervalMinutes}분 사이 랜덤 주기로 자동 수집합니다.`);
await runOnce();
scheduleNextRun();
