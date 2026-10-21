const typeLabels = {
  pickup: "픽업",
  practice: "연습게임",
  rental: "대관"
};

const provinceCityMap = {
  서울: ["강남", "강동", "강북", "강서", "관악", "광진", "구로", "금천", "노원", "도봉", "동대문", "동작", "마포", "서대문", "서초", "성동", "성북", "송파", "양천", "영등포", "용산", "은평", "종로", "중구", "중랑"],
  경기: ["가평", "고양", "과천", "광명", "광주", "구리", "군포", "김포", "남양주", "동두천", "부천", "성남", "수원", "시흥", "안산", "안성", "안양", "양주", "양평", "여주", "연천", "오산", "용인", "의왕", "의정부", "이천", "파주", "평택", "포천", "하남", "화성", "분당", "일산", "판교"],
  인천: ["강화", "계양", "남동", "동구", "미추홀", "부평", "서구", "연수", "중구"],
  부산: ["강서", "금정", "기장", "남구", "동구", "동래", "부산진", "북구", "사상", "사하", "서구", "수영", "연제", "영도", "중구", "해운대"],
  대구: ["남구", "달서", "달성", "동구", "북구", "서구", "수성", "중구", "군위"],
  대전: ["대덕", "동구", "서구", "유성", "중구"],
  광주: ["광산", "남구", "동구", "북구", "서구"],
  울산: ["남구", "동구", "북구", "울주", "중구"],
  세종: ["세종"],
  강원: ["강릉", "고성", "동해", "삼척", "속초", "양구", "양양", "영월", "원주", "인제", "정선", "철원", "춘천", "태백", "평창", "홍천", "화천", "횡성"],
  충북: ["괴산", "단양", "보은", "영동", "옥천", "음성", "제천", "증평", "진천", "청주", "충주"],
  충남: ["계룡", "공주", "금산", "논산", "당진", "보령", "부여", "서산", "서천", "아산", "예산", "천안", "청양", "태안", "홍성"],
  전북: ["고창", "군산", "김제", "남원", "무주", "부안", "순창", "완주", "익산", "임실", "장수", "전주", "정읍", "진안"],
  전남: ["강진", "고흥", "곡성", "광양", "구례", "나주", "담양", "목포", "무안", "보성", "순천", "신안", "여수", "영광", "영암", "완도", "장성", "장흥", "진도", "함평", "해남", "화순"],
  경북: ["경산", "경주", "고령", "구미", "김천", "문경", "봉화", "상주", "성주", "안동", "영덕", "영양", "영주", "영천", "예천", "울릉", "울진", "의성", "청도", "청송", "칠곡", "포항"],
  경남: ["거제", "거창", "고성", "김해", "남해", "밀양", "사천", "산청", "양산", "의령", "진주", "창녕", "창원", "통영", "하동", "함안", "함양", "합천"],
  제주: ["서귀포", "제주"]
};

const provinceOrder = Object.keys(provinceCityMap);

const formatter = new Intl.DateTimeFormat("ko-KR", {
  year: "numeric",
  month: "long"
});

const dateLabelFormatter = new Intl.DateTimeFormat("ko-KR", {
  year: "numeric",
  month: "long",
  day: "numeric",
  weekday: "long"
});

const state = {
  events: [],
  month: new Date(new Date().getFullYear(), new Date().getMonth(), 1),
  selectedDate: isoDate(new Date()),
  calendarExpanded: false,
  tab: "home",
  filters: {
    province: "all",
    city: "all",
    type: "all",
    openOnly: true
  }
};

const els = {
  monthLabel: document.getElementById("monthLabel"),
  calendar: document.getElementById("calendar"),
  eventList: document.getElementById("eventList"),
  selectedDate: document.getElementById("selectedDate"),
  provinceFilter: document.getElementById("provinceFilter"),
  cityFilter: document.getElementById("cityFilter"),
  openOnly: document.getElementById("openOnly"),
  prevMonth: document.getElementById("prevMonth"),
  nextMonth: document.getElementById("nextMonth"),
  syncStatus: document.getElementById("syncStatus"),
  calendarToggle: document.getElementById("calendarToggle"),
  calendarPanel: document.querySelector(".calendar-panel"),
  selectedTitle: document.getElementById("selectedTitle"),
  resultCount: document.getElementById("resultCount"),
  mobileTabs: document.querySelectorAll("[data-mobile-tab]"),
  typeButtons: document.querySelectorAll("[data-type]"),
  eventDialog: document.getElementById("eventDialog"),
  dialogContent: document.getElementById("dialogContent"),
  dialogClose: document.getElementById("dialogClose")
};

document.body.dataset.mobileTab = "home";
let sessionReady = false;
const loginScreen = document.getElementById("loginScreen");
const loginMessage = document.getElementById("loginMessage");
const loginForm = document.getElementById("loginForm");
const logoutButton = document.getElementById("logoutButton");

function requireLogin(message = "") {
  sessionReady = false;
  state.events = [];
  els.eventList.replaceChildren();
  els.calendar.replaceChildren();
  els.dialogContent.replaceChildren();
  closeEventDialog();
  document.getElementById("app").hidden = true;
  loginScreen.hidden = false;
  loginMessage.textContent = message;
}

async function initializeSession() {
  const response = await fetch("/api/session");
  if (!response.ok) throw new Error("로그인 상태를 확인할 수 없습니다.");
  const session = await response.json();
  if (session.required && !session.user) {
    requireLogin(session.configured ? "" : "로그인 설정을 준비 중입니다.");
    return;
  }
  sessionReady = true;
  loginScreen.hidden = true;
  document.getElementById("app").hidden = false;
  logoutButton.hidden = !session.required;
  await loadEvents();
}

loginForm.addEventListener("submit", async event => {
  event.preventDefault();
  const submit = document.getElementById("loginSubmit");
  submit.disabled = true;
  loginMessage.textContent = "로그인하고 있어요.";
  try {
    const response = await fetch("/api/login", {
      method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({ email: loginForm.elements.email.value, password: loginForm.elements.password.value })
    });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error || "로그인하지 못했습니다.");
    loginForm.reset();
    await initializeSession();
  } catch (error) { loginMessage.textContent = error.message; }
  finally { submit.disabled = false; }
});
logoutButton.addEventListener("click", async () => {
  try {
    const response = await fetch("/api/logout", { method: "POST", headers: { "content-type": "application/json" }, body: "{}" });
    if (!response.ok) throw new Error();
    requireLogin("로그아웃했습니다.");
  } catch { els.syncStatus.textContent = "로그아웃하지 못했습니다. 다시 시도해 주세요."; }
});

async function loadEvents() {
  const response = await fetch("/api/events");
  if (response.status === 401) { requireLogin("다시 로그인해 주세요."); return; }
  if (!response.ok) throw new Error("events.json을 불러오지 못했습니다.");
  state.events = await response.json();
  fillRegionOptions(true);
  els.syncStatus.textContent = `화면 갱신 ${new Date().toLocaleTimeString("ko-KR", { hour: "2-digit", minute: "2-digit" })}`;
  document.getElementById("todayLabel").textContent = dateLabelFormatter.format(new Date());
  render();
}

function fillRegionOptions(reset = false) {
  if (reset) {
    els.provinceFilter.replaceChildren(new Option("지역 전체", "all"));
    els.cityFilter.replaceChildren(new Option("시·구 전체", "all"));
  }

  const regions = state.events.map(getEventRegion);
  const provinces = [...new Set(regions.map((region) => region.province).filter(Boolean))]
    .sort((a, b) => provinceOrder.indexOf(a) - provinceOrder.indexOf(b));

  for (const province of provinces) {
    if ([...els.provinceFilter.options].some((option) => option.value === province)) continue;
    const option = document.createElement("option");
    option.value = province;
    option.textContent = province;
    els.provinceFilter.append(option);
  }

  if (![...els.provinceFilter.options].some((option) => option.value === state.filters.province)) {
    state.filters.province = "all";
    state.filters.city = "all";
  }
  els.provinceFilter.value = state.filters.province;
  fillCityOptions();
}

function fillCityOptions() {
  const selectedProvince = state.filters.province;
  const currentCity = state.filters.city;
  els.cityFilter.replaceChildren(new Option("시·구 전체", "all"));

  const cities = [...new Set(state.events
    .map(getEventRegion)
    .filter((region) => selectedProvince === "all" || region.province === selectedProvince)
    .map((region) => region.city)
    .filter(Boolean))]
    .sort((a, b) => a.localeCompare(b, "ko-KR"));

  for (const city of cities) {
    const option = document.createElement("option");
    option.value = city;
    option.textContent = city;
    els.cityFilter.append(option);
  }

  if (![...els.cityFilter.options].some((option) => option.value === currentCity)) {
    state.filters.city = "all";
  }
  els.cityFilter.value = state.filters.city;
}

function filteredEvents() {
  return state.events.filter((event) => {
    const region = getEventRegion(event);
    if (state.filters.province !== "all" && region.province !== state.filters.province) return false;
    if (state.filters.city !== "all" && region.city !== state.filters.city) return false;
    if (state.filters.type !== "all" && event.type !== state.filters.type) return false;
    if (state.filters.openOnly && event.status !== "open") return false;
    return true;
  });
}

function getEventRegion(event) {
  const haystack = [event.area, event.venue, event.title, event.summary, event.bodyText].filter(Boolean).join(" ");
  const area = normalizePlaceToken(event.area);

  for (const [province, cities] of Object.entries(provinceCityMap)) {
    if (area && cities.includes(area)) return { province, city: area };
  }

  for (const province of provinceOrder) {
    const provinceMatch = haystack.includes(province);
    const city = provinceCityMap[province].find((name) => haystack.includes(name));
    if (city) return { province, city };
    if (provinceMatch) return { province, city: "" };
  }

  return { province: "", city: area || event.area || "" };
}

function normalizePlaceToken(value) {
  return String(value || "")
    .replace(/특별시|광역시|특별자치시|특별자치도|자치도|도|시|군|구/g, "")
    .trim();
}

function monthCells(date) {
  const year = date.getFullYear();
  const month = date.getMonth();
  const firstDay = new Date(year, month, 1);
  const start = new Date(year, month, 1 - firstDay.getDay());
  return Array.from({ length: 42 }, (_, index) => {
    const cellDate = new Date(start);
    cellDate.setDate(start.getDate() + index);
    return cellDate;
  });
}

function isoDate(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function render() {
  const events = filteredEvents();
  const grouped = groupByDate(events);

  els.monthLabel.textContent = formatter.format(state.month);
  els.calendar.replaceChildren();

  const selected = new Date(`${state.selectedDate}T00:00:00`);
  const weekStart = new Date(selected);
  weekStart.setDate(selected.getDate() - selected.getDay());
  const cells = state.calendarExpanded ? monthCells(state.month) : Array.from({ length: 7 }, (_, i) => {
    const date = new Date(weekStart);
    date.setDate(weekStart.getDate() + i);
    return date;
  });
  els.calendarPanel.classList.toggle("is-expanded", state.calendarExpanded);
  els.calendarToggle.setAttribute("aria-expanded", String(state.calendarExpanded));
  els.calendarToggle.innerHTML = state.calendarExpanded ? '주간 날짜로 접기 <span aria-hidden="true">⌃</span>' : '월간 달력 펼치기 <span aria-hidden="true">⌄</span>';
  els.prevMonth.setAttribute("aria-label", state.calendarExpanded ? "이전 달" : "이전 주");
  els.nextMonth.setAttribute("aria-label", state.calendarExpanded ? "다음 달" : "다음 주");
  els.provinceFilter.dataset.active = String(state.filters.province !== "all");
  els.cityFilter.dataset.active = String(state.filters.city !== "all");
  for (const button of els.typeButtons) button.setAttribute("aria-pressed", String(button.dataset.type === state.filters.type));

  for (const date of cells) {
    const key = isoDate(date);
    const dayEvents = grouped.get(key) || [];
    const button = document.createElement("button");
    button.type = "button";
    button.className = "day";
    button.classList.toggle("is-muted", date.getMonth() !== state.month.getMonth());
    button.classList.toggle("is-selected", key === state.selectedDate);
    button.classList.toggle("is-today", key === isoDate(new Date()));
    button.setAttribute("aria-pressed", String(key === state.selectedDate));
    if (key === isoDate(new Date())) button.setAttribute("aria-current", "date");
    button.setAttribute("aria-label", `${dateLabelFormatter.format(date)}, 일정 ${dayEvents.length}개`);

    const head = document.createElement("div");
    head.className = "day-number";
    head.textContent = date.getDate();
    button.append(head);

    const count = document.createElement("span");
    count.className = "count";
    count.textContent = dayEvents.length ? `${dayEvents.length}개` : "";
    button.append(count);
    button.addEventListener("click", () => {
      state.selectedDate = key;
      if (date.getMonth() !== state.month.getMonth()) {
        state.month = new Date(date.getFullYear(), date.getMonth(), 1);
      }
      render();
      [...els.calendar.children].find((day) => day.getAttribute("aria-pressed") === "true")?.focus({ preventScroll: true });
    });
    els.calendar.append(button);
  }

  renderSelectedDay(events);
}

function groupByDate(events) {
  const grouped = new Map();
  for (const event of events) {
    const list = grouped.get(event.date) || [];
    list.push(event);
    grouped.set(event.date, list);
  }
  return grouped;
}

function renderSelectedDay(events) {
  const isHome = state.tab === "home";
  const targetDate = new Date(`${state.selectedDate}T00:00:00`);
  const targetKey = isoDate(targetDate);
  const dayEvents = events
    .filter((event) => isHome ? event.date >= isoDate(new Date()) : event.date === targetKey)
    .sort((a, b) => `${a.date}${a.startTime}`.localeCompare(`${b.date}${b.startTime}`));

  els.selectedTitle.textContent = isHome ? "참여할 수 있는 경기" : "선택한 날의 경기";
  els.selectedDate.textContent = isHome ? "오늘부터 · 가까운 날짜순" : dateLabelFormatter.format(targetDate);
  els.resultCount.textContent = `${dayEvents.length}개`;
  renderEventCards(els.eventList, dayEvents, "조건에 맞는 경기가 없어요. 날짜나 지역 필터를 바꿔보세요.");
}

function renderEventCards(container, events, emptyMessage) {
  container.replaceChildren();

  if (!events.length) {
    const empty = document.createElement("div");
    empty.className = "empty-state";
    empty.textContent = emptyMessage;
    container.append(empty);
    return;
  }

  for (const event of events) {
    const card = document.createElement("button");
    card.type = "button";
    card.className = "event-card";
    card.setAttribute("aria-label", `${event.title} 상세 보기`);
    card.innerHTML = `
      <div class="card-topline"><span class="type-badge">${escapeHtml(typeLabels[event.type] || event.type)}</span><span class="badge ${event.status === "closed" ? "closed" : ""}">${event.status === "open" ? "모집 중" : "마감"}</span></div>
      <h3>${escapeHtml(event.title)}</h3>
      <p class="event-time">${escapeHtml(event.date)} · ${escapeHtml(event.startTime)}–${escapeHtml(event.endTime)}</p>
      <p class="event-place">${escapeHtml([event.area, event.venue].filter(Boolean).join(" · "))}</p>
      <div class="card-footer"><span>${formatFee(event.fee)}</span><span>상세 보기 ›</span></div>
    `;
    card.addEventListener("click", () => {
      openEventDialog(event);
    });
    container.append(card);
  }
}

function openEventDialog(event) {
  const bodyText = event.bodyText || event.summary || "수집된 본문 내용이 없습니다.";
  els.dialogContent.innerHTML = `
    <header class="dialog-header">
      <span class="badge ${event.status === "closed" ? "closed" : ""}">${event.status === "open" ? "모집중" : "마감"}</span>
      <h2>${escapeHtml(event.title)}</h2>
      <p>수집한 일정 상세</p>
    </header>
    <dl class="dialog-meta">
      <div><dt>종류</dt><dd>${escapeHtml(typeLabels[event.type] || event.type)}</dd></div>
      <div><dt>날짜</dt><dd>${escapeHtml(event.date)}</dd></div>
      <div><dt>시간</dt><dd>${escapeHtml(event.startTime)}-${escapeHtml(event.endTime)}</dd></div>
      <div><dt>지역</dt><dd>${escapeHtml(event.area)}</dd></div>
      <div><dt>장소</dt><dd>${escapeHtml(event.venue)}</dd></div>
      <div><dt>레벨</dt><dd>${escapeHtml(event.level)}</dd></div>
      <div><dt>참가비</dt><dd>${formatFee(event.fee)}</dd></div>
      <div><dt>남은 자리</dt><dd>${Number(event.spots || 0)}</dd></div>
    </dl>
    ${contactSectionHtml(event.contact)}
    <section class="dialog-section">
      <h3>원문</h3>
      <pre class="article-body">${escapeHtml(bodyText)}</pre>
    </section>
    <div class="dialog-actions">
      <a class="source-link" href="${escapeAttribute(event.sourceUrl)}" target="_blank" rel="noreferrer">원문보기</a>
    </div>
  `;
  if (typeof els.eventDialog.showModal === "function") {
    els.eventDialog.showModal();
  } else {
    els.eventDialog.setAttribute("open", "");
  }
}

function contactSectionHtml(contact) {
  if (!contact) return "";
  const phones = Array.isArray(contact.phones) ? contact.phones : [];
  const openChatUrls = Array.isArray(contact.openChatUrls) ? contact.openChatUrls : [];
  const kakaoIds = Array.isArray(contact.kakaoIds) ? contact.kakaoIds : [];
  const snippets = Array.isArray(contact.snippets) ? contact.snippets : [];
  if (!phones.length && !openChatUrls.length && !kakaoIds.length && !snippets.length) return "";

  const items = [
    ...phones.map((phone) => `<a href="tel:${escapeAttribute(phone.replaceAll("-", ""))}">${escapeHtml(phone)}</a>`),
    ...openChatUrls.map((url) => `<a href="${escapeAttribute(url)}" target="_blank" rel="noreferrer">오픈채팅</a>`),
    ...kakaoIds.map((id) => `<span>카톡 ${escapeHtml(id)}</span>`)
  ].join("");
  const snippetHtml = snippets.map((snippet) => `<p>${escapeHtml(snippet)}</p>`).join("");

  return `
    <section class="dialog-section contact-section">
      <h3>신청 연락처</h3>
      ${items ? `<div class="contact-items">${items}</div>` : ""}
      ${snippetHtml ? `<div class="contact-snippets">${snippetHtml}</div>` : ""}
    </section>
  `;
}

function formatFee(fee) {
  if (!fee) return "비용 미정";
  return `${fee.toLocaleString("ko-KR")}원`;
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function escapeAttribute(value) {
  return escapeHtml(value).replaceAll("`", "&#96;");
}

function moveDate(direction) {
  const date = new Date(`${state.selectedDate}T00:00:00`);
  if (state.calendarExpanded) {
    const nextMonth = new Date(date.getFullYear(), date.getMonth() + direction, 1);
    const lastDay = new Date(nextMonth.getFullYear(), nextMonth.getMonth() + 1, 0).getDate();
    date.setDate(1);
    date.setFullYear(nextMonth.getFullYear(), nextMonth.getMonth(), Math.min(Number(state.selectedDate.slice(-2)), lastDay));
  } else date.setDate(date.getDate() + direction * 7);
  state.selectedDate = isoDate(date);
  state.month = new Date(date.getFullYear(), date.getMonth(), 1);
  render();
}
els.prevMonth.addEventListener("click", () => moveDate(-1));
els.nextMonth.addEventListener("click", () => moveDate(1));
els.calendarToggle.addEventListener("click", () => {
  state.calendarExpanded = !state.calendarExpanded;
  render();
});
document.getElementById("goToday").addEventListener("click", () => {
  const today = new Date();
  state.selectedDate = isoDate(today);
  state.month = new Date(today.getFullYear(), today.getMonth(), 1);
  render();
});
document.getElementById("browseSchedule").addEventListener("click", () => setMobileTab("events"));
document.getElementById("resetFilters").addEventListener("click", () => {
  state.filters = {province: "all", city: "all", type: "all", openOnly: true};
  els.openOnly.checked = true;
  fillRegionOptions(true);
  render();
});

els.provinceFilter.addEventListener("change", (event) => {
  state.filters.province = event.target.value;
  state.filters.city = "all";
  fillCityOptions();
  render();
});

els.cityFilter.addEventListener("change", (event) => {
  state.filters.city = event.target.value;
  render();
});

for (const button of els.typeButtons) button.addEventListener("click", () => {
  state.filters.type = button.dataset.type;
  render();
});

els.openOnly.addEventListener("change", (event) => {
  state.filters.openOnly = event.target.checked;
  render();
});

for (const tab of els.mobileTabs) {
  tab.addEventListener("click", () => {
    setMobileTab(tab.dataset.mobileTab);
  });
}

els.dialogClose.addEventListener("click", () => {
  closeEventDialog();
});

els.eventDialog.addEventListener("click", (event) => {
  if (event.target === els.eventDialog) closeEventDialog();
});

document.addEventListener("keydown", (event) => {
  if (event.key === "Escape" && els.eventDialog.open) closeEventDialog();
});

function closeEventDialog() {
  if (typeof els.eventDialog.close === "function") {
    els.eventDialog.close();
  } else {
    els.eventDialog.removeAttribute("open");
  }
}

function setMobileTab(tabName = "home") {
  state.tab = tabName;
  document.body.dataset.mobileTab = tabName;
  for (const tab of els.mobileTabs) {
    tab.classList.toggle("is-active", tab.dataset.mobileTab === tabName);
    tab.setAttribute("aria-pressed", String(tab.dataset.mobileTab === tabName));
  }
  render();
  window.scrollTo({ top: 0 });
}

initializeSession().catch(() => {
  requireLogin("서버에 연결할 수 없습니다. 잠시 후 새로고침해 주세요.");
});

setInterval(() => {
  if (!sessionReady) return;
  loadEvents().catch(() => {
    els.syncStatus.textContent = "자동 새로고침 실패";
  });
}, 60_000);
