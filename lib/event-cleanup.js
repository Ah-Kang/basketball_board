export function koreaToday(now = new Date()) {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Seoul", year: "numeric", month: "2-digit", day: "2-digit" }).format(now);
}

export function cleanDaumBody(value) {
  let text = String(value || "").replace(/\r/g, "");
  // These are standalone controls below the article, not post content.
  const end = text.search(/(?:^|\n)\s*(?:현재 게시글 추가 기능 열기|댓글 리스트|게스트 구인 다른글)\s*(?:\n|$)/);
  if (end >= 0) text = text.slice(0, end);
  const sizeControls = text.match(/글자크기 크게\s*\n\s*가\s*\n/);
  if (sizeControls) text = text.slice(sizeControls.index + sizeControls[0].length);
  return text.trim();
}

export function explicitVenue(body) {
  return body.match(/(?:^|\n)\s*(?:\d+[.)]?\s*)?(?:경기\s*)?장소\s*[:：]\s*([^\n]+)/)?.[1]?.trim();
}
