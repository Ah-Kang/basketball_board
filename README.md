# 농구 픽업 캘린더 MVP

네이버/다음 카페에 흩어진 픽업게임, 연습게임, 대관 글을 모아서 월간 달력으로 보는 로컬 도구입니다.

## 실행

```bash
npm run dev
```

브라우저에서 `http://localhost:4173`을 엽니다.

## 데이터 구조

Supabase 환경변수가 있으면 대시보드는 Supabase `events` 테이블을 읽습니다. 환경변수가 없으면 로컬 개발용으로 `data/events.json`을 읽습니다.

```json
{
  "id": "unique-id",
  "title": "성수 실내체육관 픽업게임",
  "type": "pickup",
  "date": "2026-08-13",
  "startTime": "20:00",
  "endTime": "22:00",
  "area": "성수",
  "venue": "성수 실내체육관",
  "fee": 10000,
  "spots": 4,
  "status": "open",
  "level": "중급",
  "sourceCafe": "카페 이름",
  "sourceUrl": "https://cafe.naver.com/...",
  "summary": "본문 요약"
}
```

## Supabase 설정

1. Supabase 프로젝트를 만듭니다.
2. SQL Editor에서 `supabase/schema.sql` 내용을 실행합니다.
3. Project Settings에서 아래 값을 확인합니다.
   - `SUPABASE_URL`
   - `SUPABASE_SERVICE_ROLE_KEY`
4. 로컬에서 기존 JSON 데이터를 올리려면 아래처럼 실행합니다.

```bash
SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... npm run supabase:push
```

수집기는 Supabase 환경변수가 있으면 `data/events.json` 저장 후 DB에도 같은 일정을 upsert합니다. Supabase REST API는 PostgREST 기반이며, 중복 저장은 `on_conflict=id`와 `Prefer: resolution=merge-duplicates` 방식으로 처리합니다.

## Render 배포

루트의 `render.yaml`을 Render Blueprint로 연결합니다. Render 생성 화면에서 아래 환경변수를 입력합니다.

- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`

Render 웹서비스는 `npm ci`로 설치하고 `npm start`로 실행합니다. `/health`를 health check로 사용합니다. 배포 후에는 Render URL로 접속한 모든 사용자가 Supabase의 최신 데이터를 보게 됩니다.

## 카페 수집 설정

1. `config/cafes.example.json`을 `config/cafes.json`으로 복사합니다.
2. 수집할 카페 게시판 URL, 제공자, 지역, 키워드를 설정합니다.
3. Playwright를 설치합니다.

```bash
npm install
npx playwright install chromium
```

4. 처음 한 번은 로그인 모드로 수집기를 실행합니다.

```bash
npm run scrape:login
```

5. 이후에는 저장된 브라우저 세션으로 자동 수집합니다.

```bash
npm run scrape
```

로그인 없이 보이는 공개 정보만 먼저 모으려면 아래 명령을 사용합니다.

```bash
npm run scrape:public
```

대시보드 서버를 켜두면 기본 수집 계정으로 5분마다 자동 수집합니다. 자동 수집은 백그라운드 브라우저로 실행되어 별도 창을 띄우지 않습니다.

```bash
npm run dev
```

수집 계정을 바꾸려면 `PRIMARY_COLLECTOR_USER_ID=main npm run dev`처럼 실행합니다. 간격을 바꾸려면 밀리초 단위로 `AUTO_SCRAPE_INTERVAL_MS=600000 npm run dev`처럼 설정합니다.

처음 실행하면 브라우저가 열립니다. 직접 네이버/다음에 로그인하면 로컬 브라우저 세션이 저장되고, 이후 같은 컴퓨터에서는 다시 로그인하지 않아도 됩니다.

사용자별 계정을 분리하려면 `SCRAPER_USER_ID`를 붙여 실행합니다. 새 사용자는 `.browser-sessions/<사용자ID>`에 별도 세션이 저장됩니다.

```bash
SCRAPER_USER_ID=minsu npm run scrape:login
SCRAPER_USER_ID=minsu npm run scrape
SCRAPER_USER_ID=minsu npm run scrape:watch
```

기존 기본 세션은 호환을 위해 `.browser-session`을 계속 사용합니다.

공유 운영 흐름은 아래처럼 잡습니다.

```bash
npm run scrape:public
SCRAPER_USER_ID=main npm run scrape:login
PRIMARY_COLLECTOR_USER_ID=main npm run dev
```

대시보드는 `data/events.json`에 저장된 공유 일정을 보여주므로, 다른 사용자는 로그인하지 않아도 최신 수집 데이터를 볼 수 있습니다. 사용자 화면에는 계정/로그인 제어를 노출하지 않습니다.

현재 기본 설정에는 아래 두 카페가 들어 있습니다.

- `https://m.cafe.daum.net/dongarry/_rec`
- `https://cafe.naver.com/cornrow`

## 운영 메모

- 본인이 접근 권한을 가진 카페 글만 정리하는 개인/팀 내부 도구로 쓰는 것을 전제로 합니다.
- 네이버 계정 비밀번호는 앱에 저장하지 않습니다.
- 팀원에게는 네이버/다음 계정 대신 정리된 일정 대시보드만 공유하는 방식이 가장 단순합니다.
- 각 팀원이 자기 카페 가입 권한으로 직접 수집해야 한다면 사용자별 수집기를 따로 실행하고, 결과 데이터만 합치는 구조가 안전합니다.
- 요청 간격을 짧게 잡거나 대량 수집하면 계정 보호/차단이 발생할 수 있습니다.
