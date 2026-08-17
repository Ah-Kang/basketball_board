import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { isSupabaseConfigured, upsertEventsToSupabase } from "../lib/supabase-events.js";

const eventsPath = join(process.cwd(), "data", "events.json");

if (!isSupabaseConfigured()) {
  throw new Error("SUPABASE_URL과 SUPABASE_SERVICE_ROLE_KEY 환경변수를 먼저 설정하세요.");
}

if (!existsSync(eventsPath)) {
  throw new Error("data/events.json 파일이 없습니다. 먼저 수집을 실행하세요.");
}

const events = JSON.parse(readFileSync(eventsPath, "utf8"));
await upsertEventsToSupabase(events);
console.log(`Supabase events 테이블에 ${events.length}개 일정을 업로드했습니다.`);
