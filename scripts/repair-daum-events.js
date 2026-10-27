import { mkdirSync, writeFileSync, existsSync, readFileSync } from "node:fs";
import { fetchEventsFromSupabase, upsertEventsToSupabase, deletePastEvents } from "../lib/supabase-events.js";
import { parseCafePost } from "./naver-cafe-scraper.js";
import { koreaToday } from "../lib/event-cleanup.js";

const events = await fetchEventsFromSupabase();
const repaired = events.filter(event => event.sourceUrl?.includes("daum.net") && event.bodyText?.trim()).map(event => ({
  ...parseCafePost({ title: event.title, body: event.bodyText, url: event.sourceUrl, provider: "daum" },
    { name: event.sourceCafe, url: "https://m.cafe.daum.net/dongarry/Dilr", provider: "daum", defaultArea: "미정" },
    { userId: event.collectedByUserId, accessMode: event.accessMode }),
  id: event.id,
  sourceBoardKey: event.sourceBoardKey,
  collectedAt: event.collectedAt
}));
const byId = new Map(repaired.map(event => [event.id, event]));
const merged = events.map(event => byId.get(event.id) || event);
console.log(JSON.stringify({ repairCount: repaired.length, pastCount: merged.filter(event => event.date < koreaToday()).length,
  yongin: repaired.filter(event => event.title.includes("RUN&HOME")).map(event => ({ area: event.area, venue: event.venue, bodyLength: event.bodyText.length })) }));
if (process.argv.includes("--apply")) {
  mkdirSync("data/backups", { recursive: true });
  const backup = `data/backups/events-${Date.now()}.json`;
  writeFileSync(backup, JSON.stringify(events), { mode: 0o600 });
  await upsertEventsToSupabase(repaired);
  console.log(`지난 일정 삭제: ${await deletePastEvents()}개 (한국 날짜 ${koreaToday()} 이전)`);
  if (existsSync("data/events.json")) {
    const local = JSON.parse(readFileSync("data/events.json", "utf8"));
    writeFileSync("data/events.json", JSON.stringify(local.map(event => byId.get(event.id) || event).filter(event => event.date >= koreaToday()), null, 2));
  }
  console.log(`수정 완료. 삭제 전 백업: ${backup}`);
}
