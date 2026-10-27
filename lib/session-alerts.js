import { existsSync, readFileSync, mkdirSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { execFileSync } from "node:child_process";

export function accessIssue(text) {
  if (/현재\s*손님이세요|로그인이\s*필요|로그인\s*후\s*(이용|읽기)|로그인해\s*주세요/.test(text)) return "login_required";
  if (/정회원이상\s*읽기 가능|권한이 없습니다|멤버등급|카페 가입 후/.test(text)) return "membership_required";
  return null;
}

export function reportAccess(path, key, issue) {
  const states = existsSync(path) ? JSON.parse(readFileSync(path, "utf8")) : {};
  const previous = states[key];
  if (issue && previous?.issue !== issue) {
    const message = issue === "login_required"
      ? "카페 로그인 세션이 만료되었습니다. 관리자 재로그인이 필요합니다."
      : "카페 글 읽기 권한이 부족합니다. 가입 및 회원 등급을 확인하세요.";
    console.error(`[관리자 알림] ${message}`);
    if (process.platform === "darwin") {
      try {
        execFileSync("osascript", ["-e", `display notification ${JSON.stringify(message)} with title "농구 일정 수집"`], { timeout: 5000 });
      } catch {
        console.error("Mac 알림 전송 실패: 알림 권한을 확인하세요.");
        return;
      }
    }
  }
  states[key] = { issue, checkedAt: new Date().toISOString() };
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, JSON.stringify(states, null, 2), { mode: 0o600 });
}
