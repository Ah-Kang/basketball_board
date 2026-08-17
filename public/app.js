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
  month: new Date(2026, 7, 1),
  selectedDate: "2026-08-13",
  dayMode: "selected",
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
  typeFilter: document.getElementById("typeFilter"),
  openOnly: document.getElementById("openOnly"),
  prevMonth: document.getElementById("prevMonth"),
  nextMonth: document.getElementById("nextMonth"),
  syncStatus: document.getElementById("syncStatus"),
  totalCount: document.getElementById("totalCount"),
  todayCount: document.getElementById("todayCount"),
  openCount: document.getElementById("openCount"),
  mobileTabs: document.querySelectorAll("[data-mobile-tab]"),
  dayModeButtons: document.querySelectorAll("[data-day-mode]"),
  eventDialog: document.getElementById("eventDialog"),
  dialogContent: document.getElementById("dialogContent"),
  dialogClose: document.getElementById("dialogClose")
};

document.body.dataset.mobileTab = "home";

async function loadEvents() {
  const response = await fetch("/api/events");
  if (!response.ok) throw new Error("events.json을 불러오지 못했습니다.");
  state.events = await response.json();
  fillRegionOptions(true);
  els.syncStatus.textContent = `마지막 갱신 ${new Date().toLocaleTimeString("ko-KR", { hour: "2-digit", minute: "2-digit" })}`;
  renderStats();
  render();
}

function renderStats() {
  const today = isoDate(new Date());
  els.totalCount.textContent = state.events.length;
  els.todayCount.textContent = state.events.filter((event) => event.date === today).length;
  els.openCount.textContent = state.events.filter((event) => event.status === "open").length;
}

function fillRegionOptions(reset = false) {
  if (reset) {
    els.provinceFilter.replaceChildren(new Option("전체", "all"));
    els.cityFilter.replaceChildren(new Option("전체", "all"));
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
  els.cityFilter.replaceChildren(new Option("전체", "all"));

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

  for (const date of monthCells(state.month)) {
    const key = isoDate(date);
    const dayEvents = grouped.get(key) || [];
    const button = document.createElement("button");
    button.type = "button";
    button.className = "day";
    button.classList.toggle("is-muted", date.getMonth() !== state.month.getMonth());
    button.classList.toggle("is-selected", key === state.selectedDate);
    button.setAttribute("aria-label", `${dateLabelFormatter.format(date)}, 일정 ${dayEvents.length}개`);

    const head = document.createElement("div");
    head.className = "day-number";
    head.innerHTML = `<span>${date.getDate()}</span><span class="count">${dayEvents.length ? `${dayEvents.length}개` : ""}</span>`;
    button.append(head);

    const chips = document.createElement("div");
    chips.className = "chips";
    for (const event of dayEvents.slice(0, 3)) {
      const chip = document.createElement("div");
      chip.className = `chip ${event.type} ${event.status === "closed" ? "closed" : ""}`;
      chip.innerHTML = `<time>${escapeHtml(event.startTime)}</time><span>${escapeHtml(event.area)} · ${escapeHtml(typeLabels[event.type] || event.type)}</span>`;
      chips.append(chip);
    }
    if (dayEvents.length > 3) {
      const more = document.createElement("div");
      more.className = "more";
      more.textContent = `+${dayEvents.length - 3} 더보기`;
      chips.append(more);
    }
    button.append(chips);
    button.addEventListener("click", () => {
      state.selectedDate = key;
      if (date.getMonth() !== state.month.getMonth()) {
        state.month = new Date(date.getFullYear(), date.getMonth(), 1);
      }
      state.dayMode = "selected";
      setMobileTab("events");
      render();
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
  const isTodayMode = state.dayMode === "today";
  const targetDate = isTodayMode ? new Date() : new Date(`${state.selectedDate}T00:00:00`);
  const targetKey = isoDate(targetDate);
  const dayEvents = events
    .filter((event) => event.date === targetKey)
    .sort((a, b) => a.startTime.localeCompare(b.startTime));

  els.selectedDate.textContent = dateLabelFormatter.format(targetDate);
  for (const button of els.dayModeButtons) {
    button.classList.toggle("is-active", button.dataset.dayMode === state.dayMode);
  }
  renderEventCards(els.eventList, dayEvents, isTodayMode ? "오늘 조건에 맞는 일정이 없습니다." : "조건에 맞는 일정이 없습니다.");
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
      <header>
        <h3>${escapeHtml(event.title)}</h3>
        <span class="badge ${event.status === "closed" ? "closed" : ""}">${event.status === "open" ? "모집중" : "마감"}</span>
      </header>
      <div class="meta">
        <span>${escapeHtml(typeLabels[event.type] || event.type)}</span>
        <span>${escapeHtml(event.startTime)}-${escapeHtml(event.endTime)}</span>
        <span>${escapeHtml(event.area)}</span>
        <span>${escapeHtml(event.venue)}</span>
        <span>${escapeHtml(event.level)}</span>
        <span>${formatFee(event.fee)}</span>
        <span>남은 자리 ${event.spots}</span>
      </div>
      <p class="summary">${escapeHtml(event.summary)}</p>
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

els.prevMonth.addEventListener("click", () => {
  state.month = new Date(state.month.getFullYear(), state.month.getMonth() - 1, 1);
  render();
});

els.nextMonth.addEventListener("click", () => {
  state.month = new Date(state.month.getFullYear(), state.month.getMonth() + 1, 1);
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

els.typeFilter.addEventListener("change", (event) => {
  state.filters.type = event.target.value;
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

for (const button of els.dayModeButtons) {
  button.addEventListener("click", () => {
    state.dayMode = button.dataset.dayMode;
    render();
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
  document.body.dataset.mobileTab = tabName;
  for (const tab of els.mobileTabs) {
    tab.classList.toggle("is-active", tab.dataset.mobileTab === tabName);
  }
}

loadEvents().catch((error) => {
  els.calendar.textContent = error.message;
  els.syncStatus.textContent = "일정 데이터를 불러오지 못했습니다.";
});

setInterval(() => {
  loadEvents().catch(() => {
    els.syncStatus.textContent = "자동 새로고침 실패";
  });
}, 60_000);
