const typeLabels = {
  pickup: "픽업",
  practice: "연습게임",
  rental: "대관"
};

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
    area: "all",
    type: "all",
    openOnly: true
  }
};

const els = {
  monthLabel: document.getElementById("monthLabel"),
  calendar: document.getElementById("calendar"),
  eventList: document.getElementById("eventList"),
  selectedDate: document.getElementById("selectedDate"),
  areaFilter: document.getElementById("areaFilter"),
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
  fillAreaOptions(true);
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

function fillAreaOptions(reset = false) {
  if (reset) {
    els.areaFilter.replaceChildren(new Option("전체", "all"));
  }
  const areas = [...new Set(state.events.map((event) => event.area).filter(Boolean))].sort();
  for (const area of areas) {
    if ([...els.areaFilter.options].some((option) => option.value === area)) continue;
    const option = document.createElement("option");
    option.value = area;
    option.textContent = area;
    els.areaFilter.append(option);
  }
}

function filteredEvents() {
  return state.events.filter((event) => {
    if (state.filters.area !== "all" && event.area !== state.filters.area) return false;
    if (state.filters.type !== "all" && event.type !== state.filters.type) return false;
    if (state.filters.openOnly && event.status !== "open") return false;
    return true;
  });
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

els.areaFilter.addEventListener("change", (event) => {
  state.filters.area = event.target.value;
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
