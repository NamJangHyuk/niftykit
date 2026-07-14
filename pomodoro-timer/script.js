// 포모도로 타이머 도구의 핵심 로직
// 인터벌 타이머와 같은 원칙을 그대로 씁니다: setInterval의 tick 횟수로 시간을 세면
// 백그라운드 탭에서 브라우저가 tick 주기를 늦추는 순간 실제 시간과 어긋나므로,
// 매 tick마다 "세션 시작 이후 실제로 몇 초가 지났는가"를 Date.now() 차이로 다시
// 계산합니다. 다만 포모도로는 인터벌 타이머와 달리 정해진 세트가 끝나면 멈추는 게
// 아니라 "긴 휴식 전 반복 횟수"만큼을 하나의 큰 주기(메가사이클)로 보고 무한히
// 반복합니다. 그래서 경과 시간을 메가사이클 길이로 나눈 나머지로 "지금이 그 주기
// 안에서 몇 초째인지"를 구하고, 몫으로 "지금까지 몇 번째 메가사이클인지"를 구합니다.
// 이 방식 역시 tick이 아무리 늦게 오더라도 다시 활성화된 순간 정확한 지점과
// 완료한 포모도로 개수를 스스로 다시 계산해냅니다.

const displaySection = document.getElementById("pomo-display");
const phaseLabelEl = document.getElementById("pomo-phase-label");
const timeEl = document.getElementById("pomo-time");
const setProgressEl = document.getElementById("pomo-set-progress");
const completedEl = document.getElementById("pomo-completed");
const workHInput = document.getElementById("pomo-work-h");
const workMInput = document.getElementById("pomo-work-m");
const workSInput = document.getElementById("pomo-work-s");
const shortBreakHInput = document.getElementById("pomo-short-break-h");
const shortBreakMInput = document.getElementById("pomo-short-break-m");
const shortBreakSInput = document.getElementById("pomo-short-break-s");
const longBreakHInput = document.getElementById("pomo-long-break-h");
const longBreakMInput = document.getElementById("pomo-long-break-m");
const longBreakSInput = document.getElementById("pomo-long-break-s");
const cyclesInput = document.getElementById("pomo-cycles");
const allTimeInputs = [
  workHInput, workMInput, workSInput,
  shortBreakHInput, shortBreakMInput, shortBreakSInput,
  longBreakHInput, longBreakMInput, longBreakSInput,
];
const errorEl = document.getElementById("pomo-error");
const startBtn = document.getElementById("pomo-start-btn");
const pauseBtn = document.getElementById("pomo-pause-btn");
const resetBtn = document.getElementById("pomo-reset-btn");
const ringProgress = document.getElementById("pomo-ring-progress");
const tabEls = document.querySelectorAll(".pomo-tab");

// 원형 링의 둘레(스트로크 전체 길이)를 SVG의 실제 반지름(r=108)으로부터 계산합니다.
// CSS의 stroke-dasharray 근사값 대신 여기서 정확히 계산한 값으로 덮어써서 오차를 없앱니다.
const RING_CIRCUMFERENCE = 2 * Math.PI * 108;
ringProgress.style.strokeDasharray = String(RING_CIRCUMFERENCE);

const FOCUS_LABEL = displaySection.dataset.focusLabel;
const SHORT_BREAK_LABEL = displaySection.dataset.shortBreakLabel;
const LONG_BREAK_LABEL = displaySection.dataset.longBreakLabel;
const READY_LABEL = displaySection.dataset.readyLabel;
const SET_TEMPLATE = displaySection.dataset.setTemplate;
const COMPLETED_LABEL = displaySection.dataset.completedLabel;
const NOTIFY = {
  focus: { title: displaySection.dataset.notifyFocusTitle, body: displaySection.dataset.notifyFocusBody },
  shortBreak: { title: displaySection.dataset.notifyShortBreakTitle, body: displaySection.dataset.notifyShortBreakBody },
  longBreak: { title: displaySection.dataset.notifyLongBreakTitle, body: displaySection.dataset.notifyLongBreakBody },
};

let phases = []; // 메가사이클 하나 안의 구간들: [{ type, set, start, end }]
let cycleTotal = 0; // 메가사이클(= 반복 N회 + 긴 휴식) 하나의 길이(초)
let cyclesBeforeLongBreak = 4;
let sessionStartTime = 0;
let pausedAccumMs = 0;
let pauseStartTime = 0;
let isRunning = false;
let isPaused = false;
let tickTimer = null;
let lastPhaseKey = null;

function buildPhases(work, shortBreak, longBreak, cycles) {
  const list = [];
  let cursor = 0;
  for (let i = 1; i <= cycles; i++) {
    list.push({ type: "focus", set: i, start: cursor, end: cursor + work });
    cursor += work;
    if (i < cycles) {
      list.push({ type: "shortBreak", set: i, start: cursor, end: cursor + shortBreak });
      cursor += shortBreak;
    } else {
      list.push({ type: "longBreak", set: i, start: cursor, end: cursor + longBreak });
      cursor += longBreak;
    }
  }
  return { phases: list, total: cursor };
}

function formatTime(totalSeconds) {
  const s = Math.max(0, Math.ceil(totalSeconds));
  const mm = String(Math.floor(s / 60)).padStart(2, "0");
  const ss = String(s % 60).padStart(2, "0");
  return `${mm}:${ss}`;
}

function beep(frequency, durationSec) {
  const AudioCtx = window.AudioContext || window.webkitAudioContext;
  const ctx = new AudioCtx();
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.frequency.value = frequency;
  osc.type = "sine";
  osc.connect(gain);
  gain.connect(ctx.destination);
  gain.gain.setValueAtTime(0.3, ctx.currentTime);
  gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + durationSec);
  osc.start();
  osc.stop(ctx.currentTime + durationSec);
  osc.onended = () => ctx.close();
}

function playPhaseSound(type) {
  if (type === "focus") {
    beep(880, 0.18);
  } else if (type === "shortBreak") {
    beep(523, 0.18);
  } else if (type === "longBreak") {
    beep(392, 0.22);
    setTimeout(() => beep(523, 0.22), 200);
  }
}

// 알림 권한이 허용된 경우에만 구간 전환을 브라우저 알림으로도 보여줍니다. 권한을
// 요청/거부하는 흐름 자체가 필수 기능은 아니라서, 지원하지 않는 브라우저나 거부한
// 경우에도 조용히 넘어가고 소리 안내만으로 충분히 동작하도록 합니다.
function notifyPhase(type) {
  if (typeof Notification === "undefined" || Notification.permission !== "granted") return;
  const info = NOTIFY[type];
  if (!info || !info.title) return;
  new Notification(info.title, { body: info.body });
}

function findPhaseAt(elapsedSec) {
  return phases.find((p) => elapsedSec >= p.start && elapsedSec < p.end) || phases[phases.length - 1];
}

function elapsedSeconds() {
  const pausedMs = pausedAccumMs + (isPaused ? Date.now() - pauseStartTime : 0);
  return (Date.now() - sessionStartTime - pausedMs) / 1000;
}

// 완료한 포모도로 총 개수는 소리/알림 재생 여부와 무관하게, 순수히 "지금까지 지난
// 시간"만으로 매번 처음부터 다시 계산합니다. 그래야 tick이 밀리거나 탭이 오래
// 백그라운드에 있다가 돌아와도 항상 정확한 숫자가 나옵니다.
function countCompletedFocusPhases(cycleIndex, withinCycleElapsed) {
  const finishedInCurrentCycle = phases.filter((p) => p.type === "focus" && p.end <= withinCycleElapsed).length;
  return cycleIndex * cyclesBeforeLongBreak + finishedInCurrentCycle;
}

function render() {
  const elapsed = elapsedSeconds();
  const cycleIndex = Math.floor(elapsed / cycleTotal);
  const withinCycle = elapsed - cycleIndex * cycleTotal;

  const phase = findPhaseAt(withinCycle);
  const phaseKey = `${cycleIndex}-${phase.type}-${phase.set}`;
  if (phaseKey !== lastPhaseKey) {
    const isFirstPhase = lastPhaseKey === null;
    lastPhaseKey = phaseKey;
    if (!isFirstPhase) {
      playPhaseSound(phase.type);
      notifyPhase(phase.type);
    }
  }

  const remaining = phase.end - withinCycle;
  displaySection.classList.toggle("is-focus", phase.type === "focus");
  displaySection.classList.toggle("is-short-break", phase.type === "shortBreak");
  displaySection.classList.toggle("is-long-break", phase.type === "longBreak");

  tabEls.forEach((tab) => tab.classList.toggle("is-active", tab.dataset.phase === phase.type));

  const phaseDuration = phase.end - phase.start;
  const phaseElapsed = withinCycle - phase.start;
  const ringProgressRatio = phaseDuration > 0 ? Math.min(1, Math.max(0, phaseElapsed / phaseDuration)) : 0;
  ringProgress.style.strokeDashoffset = String(RING_CIRCUMFERENCE * ringProgressRatio);

  phaseLabelEl.textContent =
    phase.type === "focus" ? FOCUS_LABEL : phase.type === "shortBreak" ? SHORT_BREAK_LABEL : LONG_BREAK_LABEL;
  timeEl.textContent = formatTime(remaining);
  setProgressEl.textContent = SET_TEMPLATE.replace("{current}", phase.set).replace("{total}", String(cyclesBeforeLongBreak));
  completedEl.textContent = `${COMPLETED_LABEL}: ${countCompletedFocusPhases(cycleIndex, withinCycle)}`;
}

function tick() {
  if (!isRunning || isPaused) return;
  render();
}

// 시/분/초 세 입력칸의 값을 합쳐 총 초로 바꿉니다. 하나라도 숫자가 아니거나
// 음수면 이 시간 필드 전체를 무효로 취급합니다(예: 분 칸을 비워서 NaN이 되면
// 시·초가 정상이어도 전체 합계를 신뢰할 수 없으므로).
function readTimeSeconds(hoursEl, minutesEl, secondsEl) {
  const hours = Number(hoursEl.value);
  const minutes = Number(minutesEl.value);
  const seconds = Number(secondsEl.value);
  if (
    !Number.isFinite(hours) || hours < 0 ||
    !Number.isFinite(minutes) || minutes < 0 ||
    !Number.isFinite(seconds) || seconds < 0
  ) {
    return null;
  }
  return hours * 3600 + minutes * 60 + seconds;
}

function validateInputs() {
  const work = readTimeSeconds(workHInput, workMInput, workSInput);
  const shortBreak = readTimeSeconds(shortBreakHInput, shortBreakMInput, shortBreakSInput);
  const longBreak = readTimeSeconds(longBreakHInput, longBreakMInput, longBreakSInput);
  const cycles = Number(cyclesInput.value);

  if (
    work === null || work < 1 ||
    shortBreak === null || shortBreak < 1 ||
    longBreak === null || longBreak < 1 ||
    !Number.isFinite(cycles) || cycles < 1
  ) {
    return null;
  }
  return { work, shortBreak, longBreak, cycles };
}

startBtn.addEventListener("click", () => {
  const values = validateInputs();
  if (!values) {
    errorEl.hidden = false;
    return;
  }
  errorEl.hidden = true;

  if (typeof Notification !== "undefined" && Notification.permission === "default") {
    Notification.requestPermission();
  }

  const built = buildPhases(values.work, values.shortBreak, values.longBreak, values.cycles);
  phases = built.phases;
  cycleTotal = built.total;
  cyclesBeforeLongBreak = values.cycles;
  sessionStartTime = Date.now();
  pausedAccumMs = 0;
  isPaused = false;
  isRunning = true;
  lastPhaseKey = null;

  allTimeInputs.forEach((el) => (el.disabled = true));
  cyclesInput.disabled = true;
  startBtn.hidden = true;
  pauseBtn.hidden = false;
  pauseBtn.textContent = pauseBtn.dataset.pauseLabel;
  resetBtn.hidden = false;

  render();
  tickTimer = setInterval(tick, 250);
});

pauseBtn.addEventListener("click", () => {
  if (!isRunning) return;
  if (!isPaused) {
    isPaused = true;
    pauseStartTime = Date.now();
    pauseBtn.textContent = pauseBtn.dataset.resumeLabel;
  } else {
    pausedAccumMs += Date.now() - pauseStartTime;
    isPaused = false;
    pauseBtn.textContent = pauseBtn.dataset.pauseLabel;
    render();
  }
});

function resetTimer() {
  isRunning = false;
  isPaused = false;
  clearInterval(tickTimer);
  phases = [];
  lastPhaseKey = null;
  displaySection.classList.remove("is-focus", "is-short-break", "is-long-break");
  tabEls.forEach((tab) => tab.classList.remove("is-active"));
  ringProgress.style.strokeDashoffset = "0";
  phaseLabelEl.textContent = READY_LABEL;
  timeEl.textContent = "00:00";
  setProgressEl.textContent = "";
  completedEl.textContent = "";
  allTimeInputs.forEach((el) => (el.disabled = false));
  cyclesInput.disabled = false;
  startBtn.hidden = false;
  pauseBtn.hidden = true;
  resetBtn.hidden = true;
}

resetBtn.addEventListener("click", resetTimer);

resetTimer();
