// 디데이 계산기 도구의 핵심 로직
// 목표 날짜 목록을 localStorage에 저장해서 다시 방문해도 유지되게 하고, 오늘 날짜와의
// 차이를 "자정 기준 날짜 단위"로 계산해 D-Day를 큰 숫자로 보여줍니다. 서버 통신은
// 전혀 없으며 모든 데이터는 이 브라우저에만 저장됩니다.

const nameInput = document.getElementById("dday-name");
const dateTrigger = document.getElementById("dday-date-trigger");
const calendarEl = document.getElementById("dday-calendar");
const calTitleEl = document.getElementById("dday-cal-title");
const calWeekdaysEl = document.getElementById("dday-cal-weekdays");
const calGridEl = document.getElementById("dday-cal-grid");
const calPrevBtn = document.getElementById("dday-cal-prev");
const calNextBtn = document.getElementById("dday-cal-next");
const addBtn = document.getElementById("dday-add-btn");
const errorEl = document.getElementById("dday-error");
const emptyEl = document.getElementById("dday-empty");
const listEl = document.getElementById("dday-list");

const STORAGE_KEY = "niftykit-dday-goals";
const todayLabel = listEl.dataset.todayLabel;
const deleteLabel = listEl.dataset.deleteLabel;

// 네이티브 <input type="date">의 달력 팝업은 브라우저/OS가 그리는 부분이라 CSS로
// 크기를 키울 수 없습니다(입력창 자체만 커질 뿐). 그래서 날짜 칸을 크고 누르기 쉽게
// 만들기 위해 달력 UI를 직접 구현했습니다: 트리거 버튼을 누르면 아래에 월 달력이
// 펼쳐지고, 각 날짜는 터치하기 넉넉한 크기의 버튼입니다. 요일·월 이름은 직접
// 번역 문자열을 관리하는 대신 Intl.DateTimeFormat으로 현재 페이지 언어에 맞게
// 자동으로 표시합니다(언어 순수성 원칙 — ko 페이지엔 ko 요일, en 페이지엔 en 요일).
const pageLang = document.documentElement.lang || "ko";
const locale = pageLang === "ko" ? "ko-KR" : "en-US";
const monthFormatter = new Intl.DateTimeFormat(locale, { year: "numeric", month: "long" });
const weekdayFormatter = new Intl.DateTimeFormat(locale, { weekday: "short" });
const fullDateFormatter = new Intl.DateTimeFormat(locale, { year: "numeric", month: "long", day: "numeric" });

let selectedDate = null; // "YYYY-MM-DD" 형식, 아직 선택 안 했으면 null
let calendarViewYear = 0;
let calendarViewMonth = 0; // 0-indexed

function toIsoDate(year, month, day) {
  const mm = String(month + 1).padStart(2, "0");
  const dd = String(day).padStart(2, "0");
  return `${year}-${mm}-${dd}`;
}

function renderWeekdays() {
  calWeekdaysEl.innerHTML = "";
  // 2021-08-01은 일요일이라, 이 날짜부터 7일을 뽑으면 일~토 순서의 요일 이름을
  // 안정적으로 얻을 수 있습니다(실제 캘린더 데이터가 필요 없는 계산용 기준일).
  for (let i = 0; i < 7; i++) {
    const d = new Date(2021, 7, 1 + i);
    const el = document.createElement("span");
    el.textContent = weekdayFormatter.format(d);
    calWeekdaysEl.appendChild(el);
  }
}

function renderCalendarGrid() {
  calTitleEl.textContent = monthFormatter.format(new Date(calendarViewYear, calendarViewMonth, 1));
  calGridEl.innerHTML = "";

  const startWeekday = new Date(calendarViewYear, calendarViewMonth, 1).getDay();
  const daysInMonth = new Date(calendarViewYear, calendarViewMonth + 1, 0).getDate();
  const now = new Date();
  const todayIso = toIsoDate(now.getFullYear(), now.getMonth(), now.getDate());

  for (let i = 0; i < startWeekday; i++) {
    calGridEl.appendChild(document.createElement("span"));
  }

  for (let day = 1; day <= daysInMonth; day++) {
    const iso = toIsoDate(calendarViewYear, calendarViewMonth, day);
    const dayBtn = document.createElement("button");
    dayBtn.type = "button";
    dayBtn.className = "dday-cal-day";
    dayBtn.textContent = String(day);
    if (iso === todayIso) dayBtn.classList.add("is-today");
    if (iso === selectedDate) dayBtn.classList.add("is-selected");
    dayBtn.addEventListener("click", () => {
      selectedDate = iso;
      dateTrigger.textContent = fullDateFormatter.format(new Date(calendarViewYear, calendarViewMonth, day));
      dateTrigger.classList.add("has-value");
      closeCalendar();
    });
    calGridEl.appendChild(dayBtn);
  }
}

function openCalendar() {
  const base = selectedDate ? new Date(selectedDate + "T00:00:00") : new Date();
  calendarViewYear = base.getFullYear();
  calendarViewMonth = base.getMonth();
  renderCalendarGrid();
  calendarEl.hidden = false;
  dateTrigger.setAttribute("aria-expanded", "true");
}

function closeCalendar() {
  calendarEl.hidden = true;
  dateTrigger.setAttribute("aria-expanded", "false");
}

dateTrigger.addEventListener("click", (e) => {
  e.stopPropagation();
  if (calendarEl.hidden) openCalendar();
  else closeCalendar();
});

calPrevBtn.addEventListener("click", () => {
  calendarViewMonth -= 1;
  if (calendarViewMonth < 0) {
    calendarViewMonth = 11;
    calendarViewYear -= 1;
  }
  renderCalendarGrid();
});

calNextBtn.addEventListener("click", () => {
  calendarViewMonth += 1;
  if (calendarViewMonth > 11) {
    calendarViewMonth = 0;
    calendarViewYear += 1;
  }
  renderCalendarGrid();
});

document.addEventListener("click", (e) => {
  if (!calendarEl.hidden && !calendarEl.contains(e.target) && e.target !== dateTrigger) {
    closeCalendar();
  }
});

document.addEventListener("keydown", (e) => {
  if (e.key === "Escape" && !calendarEl.hidden) {
    closeCalendar();
    dateTrigger.focus();
  }
});

renderWeekdays();

function loadGoals() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function saveGoals(goals) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(goals));
}

let goals = loadGoals();

// 목표 날짜까지 남은 날짜 수를 "자정 기준"으로 계산합니다. 시각(시/분/초)을 0으로
// 맞춘 뒤 밀리초 차이를 24시간으로 나누므로, 확인하는 시각과 무관하게 항상 같은
// 결과가 나옵니다(예: 내일이 목표면 오전에 봐도 밤에 봐도 항상 D-1).
function daysUntil(dateStr) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const target = new Date(dateStr + "T00:00:00");
  const diffMs = target.getTime() - today.getTime();
  return Math.round(diffMs / (1000 * 60 * 60 * 24));
}

function formatDDay(days) {
  if (days === 0) return todayLabel;
  return days > 0 ? `D-${days}` : `D+${Math.abs(days)}`;
}

function render() {
  listEl.innerHTML = "";
  emptyEl.hidden = goals.length > 0;

  const sorted = [...goals].sort((a, b) => daysUntil(a.date) - daysUntil(b.date));

  sorted.forEach((goal) => {
    const days = daysUntil(goal.date);
    const card = document.createElement("div");
    card.className = "dday-card";
    if (days === 0) card.classList.add("is-today");
    if (days < 0) card.classList.add("is-past");

    const numberEl = document.createElement("div");
    numberEl.className = "dday-number";
    numberEl.textContent = formatDDay(days);

    const infoEl = document.createElement("div");
    infoEl.className = "dday-info";

    const nameEl = document.createElement("div");
    nameEl.className = "dday-name";
    nameEl.textContent = goal.name;

    const dateEl = document.createElement("div");
    dateEl.className = "dday-date";
    dateEl.textContent = goal.date;

    infoEl.appendChild(nameEl);
    infoEl.appendChild(dateEl);

    const deleteBtn = document.createElement("button");
    deleteBtn.type = "button";
    deleteBtn.className = "dday-delete-btn";
    deleteBtn.textContent = deleteLabel;
    deleteBtn.addEventListener("click", () => {
      goals = goals.filter((g) => g.id !== goal.id);
      saveGoals(goals);
      render();
    });

    card.appendChild(numberEl);
    card.appendChild(infoEl);
    card.appendChild(deleteBtn);
    listEl.appendChild(card);
  });
}

function showError(kind) {
  errorEl.textContent = kind === "name" ? errorEl.dataset.nameError : errorEl.dataset.dateError;
  errorEl.hidden = false;
}

addBtn.addEventListener("click", () => {
  const name = nameInput.value.trim();
  const date = selectedDate;

  if (!name) {
    showError("name");
    nameInput.focus();
    return;
  }
  if (!date) {
    showError("date");
    dateTrigger.focus();
    return;
  }

  errorEl.hidden = true;
  goals.push({ id: Date.now(), name, date });
  saveGoals(goals);
  nameInput.value = "";
  selectedDate = null;
  dateTrigger.textContent = dateTrigger.dataset.placeholder;
  dateTrigger.classList.remove("has-value");
  render();
});

nameInput.addEventListener("keydown", (e) => {
  if (e.key === "Enter") addBtn.click();
});

render();
