// 템포 카운터 도구의 핵심 로직
// setInterval로 "지금이 몇 번째 박자인지" 판단해서 그때그때 비프음을 재생하면,
// 브라우저 렌더링/GC 등으로 setInterval 자체가 몇 ms씩 밀리는 순간 소리도 함께
// 밀려버립니다(드리프트). 그래서 오디오 재생만큼은 setInterval에 맡기지 않고,
// Web Audio의 시간축(AudioContext.currentTime, 샘플 단위로 정확한 시계)을 기준으로
// "몇 초 뒤에 이 소리를 재생하라"를 미리 예약해둡니다. setTimeout은 그저 "예약해야
// 할 다음 소리가 있는지 자주 확인하는 역할(lookahead)"만 하고, 실제 재생 타이밍은
// 예약된 시각이 담당하므로 setTimeout이 다소 밀리더라도 소리 자체는 밀리지 않습니다.
// (Chris Wilson의 "A Tale of Two Clocks" 패턴)

const displaySection = document.getElementById("tcounter-display");
const phaseLabelEl = document.getElementById("tcounter-phase-label");
const repCountEl = document.getElementById("tcounter-rep-count");
const categorySelect = document.getElementById("tcounter-category");
const bpmInput = document.getElementById("tcounter-bpm");
const errorEl = document.getElementById("tcounter-error");
const startBtn = document.getElementById("tcounter-start-btn");
const stopBtn = document.getElementById("tcounter-stop-btn");

const DOWN_LABEL = displaySection.dataset.downLabel;
const UP_LABEL = displaySection.dataset.upLabel;
const READY_LABEL = displaySection.dataset.readyLabel;

const LOOKAHEAD_MS = 25; // 다음에 예약할 소리가 있는지 확인하는 주기
const SCHEDULE_AHEAD_SEC = 0.1; // 이 시간만큼 미리 예약해둠
const BEEP_DURATION_SEC = 0.12;
const DOWN_FREQ = 440; // 하강 구간: 낮은 음
const UP_FREQ = 880; // 상승 구간: 높은 음

let audioCtx = null;
let isRunning = false;
let secondsPerBeat = 1;
let nextNoteTime = 0;
let beatNumber = 0;
let notesInQueue = []; // 재생 예약된(아직 화면에 반영 안 한) 박자들: { beatNumber, time }
let schedulerTimerId = null;
let rafId = null;
let repCount = 0;

function scheduleBeat(beatNum, time) {
  notesInQueue.push({ beatNumber: beatNum, time });

  const isDown = beatNum % 2 === 0;
  const osc = audioCtx.createOscillator();
  const gain = audioCtx.createGain();
  osc.frequency.value = isDown ? DOWN_FREQ : UP_FREQ;
  osc.type = "sine";
  osc.connect(gain);
  gain.connect(audioCtx.destination);
  gain.gain.setValueAtTime(0.0001, time);
  gain.gain.exponentialRampToValueAtTime(0.3, time + 0.008);
  gain.gain.exponentialRampToValueAtTime(0.0001, time + BEEP_DURATION_SEC);
  osc.start(time);
  osc.stop(time + BEEP_DURATION_SEC + 0.02);
}

// 오디오 재생 시각 기준으로 "지금 재생되어야 할 다음 박자들"을 계속 미리 예약합니다.
function scheduler() {
  while (nextNoteTime < audioCtx.currentTime + SCHEDULE_AHEAD_SEC) {
    scheduleBeat(beatNumber, nextNoteTime);
    nextNoteTime += secondsPerBeat;
    beatNumber++;
  }
  schedulerTimerId = setTimeout(scheduler, LOOKAHEAD_MS);
}

// 화면(구간 라벨, 렙 수)은 실제로 그 박자의 예약 시각이 지난 뒤에만 갱신합니다.
// requestAnimationFrame으로 매 프레임 확인하면서, audioCtx.currentTime이 큐 맨
// 앞 박자의 예약 시각을 지나면 그 박자를 화면에 반영하고 큐에서 뺍니다.
function updateDisplay() {
  if (!isRunning) return;

  const currentTime = audioCtx.currentTime;
  let lastPassed = null;
  while (notesInQueue.length && notesInQueue[0].time < currentTime) {
    lastPassed = notesInQueue.shift();
  }

  if (lastPassed) {
    const isDown = lastPassed.beatNumber % 2 === 0;
    phaseLabelEl.textContent = isDown ? DOWN_LABEL : UP_LABEL;
    displaySection.classList.toggle("is-down", isDown);
    displaySection.classList.toggle("is-up", !isDown);

    // 하강+상승 두 박자가 한 세트(=1렙)입니다. 상승이 끝나고 다시 하강(=다음 렙의
    // 시작)이 재생되는 순간, "방금 렙 하나가 완성됐다"는 뜻이므로 그때 카운트를 올립니다.
    if (isDown && lastPassed.beatNumber > 0) {
      repCount++;
      repCountEl.textContent = String(repCount);
    }
  }

  rafId = requestAnimationFrame(updateDisplay);
}

// 운동마다 어울리는 템포가 다르므로(예: 카프레이즈는 빠르게, 딥스는 느리게),
// 종류를 고르면 그 운동에 무리 없는 기본 BPM을 채워줍니다. "직접 설정"처럼 BPM이
// 정해지지 않은 항목(data-bpm 없음)을 고르면 사용자가 마지막으로 입력해둔 값을
// 그대로 두어, 목록에 없는 운동도 자유롭게 속도를 맞출 수 있게 합니다.
categorySelect.addEventListener("change", () => {
  const selectedOption = categorySelect.selectedOptions[0];
  const presetBpm = selectedOption ? selectedOption.dataset.bpm : null;
  if (presetBpm) {
    bpmInput.value = presetBpm;
  }
});

function validateBpm() {
  const value = Number(bpmInput.value);
  if (!Number.isFinite(value) || value < 20 || value > 240) {
    return null;
  }
  return value;
}

function startCounter() {
  const bpm = validateBpm();
  if (!bpm) {
    errorEl.hidden = false;
    return;
  }
  errorEl.hidden = true;

  const AudioCtx = window.AudioContext || window.webkitAudioContext;
  audioCtx = new AudioCtx();
  secondsPerBeat = 60 / bpm;
  beatNumber = 0;
  repCount = 0;
  repCountEl.textContent = "0";
  notesInQueue = [];
  nextNoteTime = audioCtx.currentTime + 0.05;
  isRunning = true;

  displaySection.classList.remove("is-ready");
  categorySelect.disabled = true;
  bpmInput.disabled = true;
  startBtn.hidden = true;
  stopBtn.hidden = false;

  scheduler();
  rafId = requestAnimationFrame(updateDisplay);
}

function stopCounter() {
  isRunning = false;
  clearTimeout(schedulerTimerId);
  cancelAnimationFrame(rafId);
  notesInQueue = [];

  if (audioCtx) {
    audioCtx.close();
    audioCtx = null;
  }

  displaySection.classList.remove("is-down", "is-up");
  displaySection.classList.add("is-ready");
  phaseLabelEl.textContent = READY_LABEL;

  categorySelect.disabled = false;
  bpmInput.disabled = false;
  startBtn.hidden = false;
  stopBtn.hidden = true;
}

startBtn.addEventListener("click", startCounter);
stopBtn.addEventListener("click", stopCounter);
