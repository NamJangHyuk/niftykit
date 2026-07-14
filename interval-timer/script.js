// 인터벌 타이머 도구의 핵심 로직
// setInterval의 tick 횟수를 세서 시간을 계산하면, 브라우저가 탭을 백그라운드로
// 보낼 때 tick 주기를 크게 늦추기 때문에(절전 최적화) 실제 경과 시간과 어긋납니다.
// 그래서 매 tick마다 "지금이 세션 시작으로부터 몇 초 지났는가"를 Date.now() 차이로
// 새로 계산하고, 그 값으로 현재 구간(운동/휴식)을 다시 찾아냅니다. 이렇게 하면 tick이
// 얼마나 늦게 오든, 다시 활성화된 순간 항상 정확한 지점으로 스스로 맞춰집니다.

const displaySection = document.getElementById("itimer-display");
const phaseLabelEl = document.getElementById("itimer-phase-label");
const timeEl = document.getElementById("itimer-time");
const setProgressEl = document.getElementById("itimer-set-progress");
const setsInput = document.getElementById("itimer-sets");
const workInput = document.getElementById("itimer-work");
const restInput = document.getElementById("itimer-rest");
const errorEl = document.getElementById("itimer-error");
const startBtn = document.getElementById("itimer-start-btn");
const pauseBtn = document.getElementById("itimer-pause-btn");
const resetBtn = document.getElementById("itimer-reset-btn");

const WORK_LABEL = displaySection.dataset.workLabel;
const REST_LABEL = displaySection.dataset.restLabel;
const READY_LABEL = displaySection.dataset.readyLabel;
const DONE_LABEL = displaySection.dataset.doneLabel;
const SET_TEMPLATE = displaySection.dataset.setTemplate;

let phases = []; // [{ type: "work"|"rest", set: n, start: sec, end: sec }]
let totalDuration = 0;
let sessionStartTime = 0;
let pausedAccumMs = 0;
let pauseStartTime = 0;
let isRunning = false;
let isPaused = false;
let tickTimer = null;
let lastPhaseKey = null;

function buildPhases(sets, work, rest) {
  const list = [];
  let cursor = 0;
  for (let i = 1; i <= sets; i++) {
    list.push({ type: "work", set: i, start: cursor, end: cursor + work });
    cursor += work;
    if (i < sets) {
      list.push({ type: "rest", set: i, start: cursor, end: cursor + rest });
      cursor += rest;
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

// 짧은 알림음을 그때그때 합성해서 재생합니다. 별도 음원 파일이 필요 없어 저작권
// 문제가 없고, 용량도 가볍습니다.
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
  if (type === "work") {
    beep(880, 0.18);
  } else if (type === "rest") {
    beep(523, 0.18);
  } else if (type === "done") {
    beep(660, 0.14);
    setTimeout(() => beep(880, 0.22), 180);
  }
}

function findPhaseAt(elapsedSec) {
  return phases.find((p) => elapsedSec >= p.start && elapsedSec < p.end) || null;
}

function elapsedSeconds() {
  const pausedMs = pausedAccumMs + (isPaused ? Date.now() - pauseStartTime : 0);
  return (Date.now() - sessionStartTime - pausedMs) / 1000;
}

function render() {
  const elapsed = elapsedSeconds();

  if (elapsed >= totalDuration) {
    finish();
    return;
  }

  const phase = findPhaseAt(elapsed);
  if (!phase) return;

  const phaseKey = `${phase.type}-${phase.set}`;
  if (phaseKey !== lastPhaseKey) {
    lastPhaseKey = phaseKey;
    playPhaseSound(phase.type);
  }

  const remaining = phase.end - elapsed;
  displaySection.classList.toggle("is-work", phase.type === "work");
  displaySection.classList.toggle("is-rest", phase.type === "rest");
  phaseLabelEl.textContent = phase.type === "work" ? WORK_LABEL : REST_LABEL;
  timeEl.textContent = formatTime(remaining);
  setProgressEl.textContent = SET_TEMPLATE.replace("{current}", phase.set).replace("{total}", String(setsInput.value));
}

function tick() {
  if (!isRunning || isPaused) return;
  render();
}

function finish() {
  isRunning = false;
  isPaused = false;
  clearInterval(tickTimer);
  displaySection.classList.remove("is-work", "is-rest");
  displaySection.classList.add("is-done");
  phaseLabelEl.textContent = DONE_LABEL;
  timeEl.textContent = "00:00";
  setProgressEl.textContent = "";
  playPhaseSound("done");
  startBtn.hidden = false;
  startBtn.disabled = false;
  pauseBtn.hidden = true;
  resetBtn.hidden = false;
}

function validateInputs() {
  const sets = Number(setsInput.value);
  const work = Number(workInput.value);
  const rest = Number(restInput.value);
  if (!Number.isFinite(sets) || sets < 1 || !Number.isFinite(work) || work < 1 || !Number.isFinite(rest) || rest < 1) {
    return null;
  }
  return { sets, work, rest };
}

startBtn.addEventListener("click", () => {
  const values = validateInputs();
  if (!values) {
    errorEl.hidden = false;
    return;
  }
  errorEl.hidden = true;

  const built = buildPhases(values.sets, values.work, values.rest);
  phases = built.phases;
  totalDuration = built.total;
  sessionStartTime = Date.now();
  pausedAccumMs = 0;
  isPaused = false;
  isRunning = true;
  lastPhaseKey = null;
  displaySection.classList.remove("is-done");

  setsInput.disabled = true;
  workInput.disabled = true;
  restInput.disabled = true;
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
  displaySection.classList.remove("is-work", "is-rest", "is-done");
  phaseLabelEl.textContent = READY_LABEL;
  timeEl.textContent = "00:00";
  setProgressEl.textContent = "";
  setsInput.disabled = false;
  workInput.disabled = false;
  restInput.disabled = false;
  startBtn.hidden = false;
  startBtn.disabled = false;
  pauseBtn.hidden = true;
  resetBtn.hidden = true;
}

resetBtn.addEventListener("click", resetTimer);

resetTimer();
