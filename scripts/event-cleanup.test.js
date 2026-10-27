import { test } from "node:test";
import assert from "node:assert/strict";
import { cleanDaumBody, koreaToday } from "../lib/event-cleanup.js";
import { parseCafePost } from "./naver-cafe-scraper.js";

test("다음 본문에서 다른 글 목록을 제외하고 장소는 해당 글에서 추출", () => {
  const body = "작성자\n글자크기 크게\n가\n1. HOME 팀명 : RUN&HOME\n3. 장소 : JJ클랜 3층\n(경기 용인시 기흥구 언동로 87)\n6. 게스트비용 : 10,000원\n현재 게시글 추가 기능 열기\n댓글\n게스트 구인 다른글\n[강남] 22시 서해구국민체육센터";
  const event = parseCafePost({ title: "[경기][용인] 10월 31일 오전6시40분~9시 게스트", body, provider: "daum", url: "https://m.cafe.daum.net/dongarry/Dilr/1" }, { name: "동아리", url: "https://m.cafe.daum.net/dongarry/Dilr", defaultArea: "미정" });
  assert.equal(event.area, "용인");
  assert.equal(event.venue, "JJ클랜 3층");
  assert.equal(event.fee, 10000);
  assert.ok(!event.bodyText.includes("서해구"));
  assert.equal(cleanDaumBody(event.bodyText), event.bodyText);
});

test("삭제 기준은 한국 날짜", () => {
  assert.equal(koreaToday(new Date("2026-10-26T14:59:59Z")), "2026-10-26");
  assert.equal(koreaToday(new Date("2026-10-26T15:00:00Z")), "2026-10-27");
});
