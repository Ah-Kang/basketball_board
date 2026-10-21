# 무료 배포

Render Free에서 웹/API, Supabase Free에서 데이터와 로그인, 공개 GitHub 저장소의 표준 Ubuntu Actions 실행기에서 수집을 실행한다. 유료 서버나 디스크는 생성하지 않는다.

## 활성화 순서

1. Supabase에 `supabase/schema.sql` 및 기존 DB의 경우 `supabase/private-access.sql`을 적용한다. DB 직접 조회는 서버 전용으로 유지한다. 앱의 `SELF_SIGNUP_ENABLED=true` 설정으로 누구나 가입 후 자동 승인·로그인할 수 있다. 서버가 새 계정만 생성하며 기존 계정을 덮어쓰지 않는다. Supabase의 직접 회원가입 설정은 비활성화 상태여도 된다.
2. Render의 기존 서비스는 Free를 유지한다. `render.yaml`에 따라 `AUTH_REQUIRED=true`, `SELF_SIGNUP_ENABLED=true`, `AUTO_SCRAPE_ENABLED=false`, `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`를 설정한다. 초대 전용으로 되돌리려면 `SELF_SIGNUP_ENABLED=false`와 `ALLOWED_EMAILS`를 설정한다. 계정의 초과 과금 및 사용량 설정을 확인하기 전 무료 운영이 보장됐다고 판단하지 않는다.
3. 소유자가 승인한 뒤 GitHub Actions Secrets에 `CAFE_COOKIES_JSON`(로컬 로그인 쿠키 JSON), `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`를 등록한다. 쿠키와 키를 소스/로그/아티팩트에 넣지 않는다.
4. 변경사항을 검토하여 push한 뒤 Actions의 Collect basketball events를 수동 실행한다. 미로그인 API 차단, 허용된 사용자 로그인, Supabase 저장 및 웹 표시를 확인한다.
5. 수집은 매시 17분 예약 실행한다. GitHub 사정에 따라 지연/누락될 수 있으며, 공개 저장소가 60일간 비활성이면 예약이 중지될 수 있다.

## 무료 운영의 한계

프로필 배포 시 `supabase/members.sql`도 적용한다. `profiles.user_id`는 Supabase Auth UUID이며 커뮤니티의 작성자·멤버 관계를 연결할 기준이다. 프로필과 `member_activities`는 현재 서버의 본인 전용 API로만 조회한다. 이메일은 프로필이나 경기 기록에 복제하지 않는다. 경기 기록은 외부 카페 신청을 전송하지 않는 개인 메모이며, 마지막 상태와 원본 일정의 요약을 보존한다. 내 활동 화면에는 최근 200개를 표시한다. 추후 커뮤니티 공개 프로필, 실제 신청/승인, 상태 변경 이력은 별도 기능으로 추가한다.

- Render는 미사용 15분 후 중지되어 다음 접속이 느릴 수 있다. 무료 실행 시간과 트래픽은 워크스페이스 전체가 공유한다.
- Supabase Free의 용량/사용량 제한 및 비활성 프로젝트 일시정지 조건을 따른다.
- 카페 로그인이 만료되거나 클라우드 접속을 차단하면 재로그인 후 GitHub Secret을 갱신해야 한다. 실행 중 갱신된 쿠키는 다음 실행에 보존하지 않는다.
- 수집 작업은 공개 저장소 원본에서만 동작하며 캐시/아티팩트를 업로드하지 않는다. 공개 로그에는 성공 건수나 일반 오류만 남긴다.
- 기존 수집기의 날짜/지역 추출 정확도와 본문 접근 가능 여부는 별도로 검증해야 한다. 수집 건수만으로 본문 접근 성공을 보장하지 않는다.
- 과거 Git 기록에 있던 인증 파일은 현재 파일 삭제만으로 제거되지 않는다. 배포 전 기존 세션을 폐기하고 새 로그인 세션을 사용한다.

현재 설정 파일 준비와 실제 클라우드 활성화는 별개다. 원격 DB 정책, Secrets 등록, 배포 및 클라우드 수집 검증을 마쳐야 운영 완료다.
