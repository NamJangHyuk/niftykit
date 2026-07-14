// 직각삼각형 변 계산기(Square Check)의 핵심 로직
// 피타고라스 정리(변A²+변B²=빗변²)에 따라, 세 변 중 아무 두 값만 알면 나머지
// 한 변을 항상 계산해낼 수 있습니다. 이 도구는 "가장 최근에 사용자가 직접 입력한
// 두 필드"를 근거값(기지값)으로 보고, 나머지 한 필드를 자동으로 계산해 채웁니다.
// 세 칸이 모두 채워진 상태에서 사용자가 또 다른 값을 입력하면, 그 값은 새로운
// "가장 최근 입력"이 되고, 원래 두 근거값 중 더 오래된 쪽이 새로 계산되는 대상으로
// 바뀝니다 — 그래서 입력하는 값에 따라 삼각형 비율이 자연스럽게 계속 바뀝니다.

const sideAInput = document.getElementById("sqc-side-a");
const sideBInput = document.getElementById("sqc-side-b");
const hypotenuseInput = document.getElementById("sqc-hypotenuse");
const errorEl = document.getElementById("sqc-error");
const resetBtn = document.getElementById("sqc-reset-btn");

const diagramLineA = document.getElementById("sqc-diagram-line-a");
const diagramLineB = document.getElementById("sqc-diagram-line-b");
const diagramLineC = document.getElementById("sqc-diagram-line-c");
const diagramMarker = document.getElementById("sqc-diagram-marker");
const diagramLabelA = document.getElementById("sqc-diagram-a");
const diagramLabelB = document.getElementById("sqc-diagram-b");
const diagramLabelC = document.getElementById("sqc-diagram-c");

const actualDiagonalInput = document.getElementById("sqc-actual-diagonal");
const verifyError = document.getElementById("sqc-verify-error");
const verifyResultEl = document.getElementById("sqc-verify-result");

// 줄자로 재는 현장 실측에는 항상 약간의 오차가 있기 마련이라, 이상적인 빗변의
// 0.5% 이내 차이는 "거의 정확한 직각"으로 판정합니다.
const TOLERANCE_RATIO = 0.005;

const FIELDS = { a: sideAInput, b: sideBInput, c: hypotenuseInput };
let editedOrder = []; // 사용자가 직접 입력한(계산으로 채워진 게 아닌) 필드 순서, 최신순

function formatNumber(value) {
  return parseFloat(value.toFixed(2)).toString();
}

function readValidValue(key) {
  const raw = FIELDS[key].value;
  if (raw.trim() === "") return { empty: true, valid: false, value: null };
  const num = Number(raw);
  if (!Number.isFinite(num) || num <= 0) return { empty: false, valid: false, value: null };
  return { empty: false, valid: true, value: num };
}

function showError(kind) {
  errorEl.textContent = kind === "triangle" ? errorEl.dataset.invalidTriangleError : errorEl.dataset.invalidNumberError;
  errorEl.hidden = false;
}

function clearDiagramLabels() {
  diagramLabelA.textContent = "";
  diagramLabelB.textContent = "";
  diagramLabelC.textContent = "";
}

// 실제 비율을 그대로 반영하되, 극단적인 비율(예: 한 변이 다른 변의 20배)에서도
// 다이어그램이 알아볼 수 없게 찌그러지지 않도록 시각적 종횡비만 제한된 범위로
// 눌러줍니다. 라벨에 적히는 숫자는 이 클램프와 무관하게 항상 정확한 실제 값입니다.
function drawDiagram(a, b, c) {
  const rawRatio = a / b;
  const clampedRatio = Math.min(Math.max(rawRatio, 0.3), 3.3);

  const maxWidth = 220;
  const maxHeight = 140;
  let width;
  let height;
  if (clampedRatio >= maxWidth / maxHeight) {
    width = maxWidth;
    height = maxWidth / clampedRatio;
  } else {
    height = maxHeight;
    width = maxHeight * clampedRatio;
  }

  const originX = 40;
  const originY = 170;
  const rightX = originX + width;
  const topY = originY - height;
  const markerSize = Math.min(16, width * 0.25, height * 0.25);

  diagramLineA.setAttribute("x1", originX);
  diagramLineA.setAttribute("y1", originY);
  diagramLineA.setAttribute("x2", rightX);
  diagramLineA.setAttribute("y2", originY);

  diagramLineB.setAttribute("x1", originX);
  diagramLineB.setAttribute("y1", originY);
  diagramLineB.setAttribute("x2", originX);
  diagramLineB.setAttribute("y2", topY);

  diagramLineC.setAttribute("x1", originX);
  diagramLineC.setAttribute("y1", topY);
  diagramLineC.setAttribute("x2", rightX);
  diagramLineC.setAttribute("y2", originY);

  diagramMarker.setAttribute("x", originX);
  diagramMarker.setAttribute("y", originY - markerSize);
  diagramMarker.setAttribute("width", markerSize);
  diagramMarker.setAttribute("height", markerSize);

  // 라벨 앞에 A/B/C를 붙여서 입력 필드("변 A", "변 B", "빗변")와 다이어그램의
  // 어느 선이 대응하는지 헷갈리지 않도록 명확히 표시합니다.
  diagramLabelA.setAttribute("x", (originX + rightX) / 2);
  diagramLabelA.setAttribute("y", originY + 22);
  diagramLabelA.textContent = `A: ${formatNumber(a)}`;

  diagramLabelB.setAttribute("x", originX - 24);
  diagramLabelB.setAttribute("y", (originY + topY) / 2 + 4);
  diagramLabelB.textContent = `B: ${formatNumber(b)}`;

  diagramLabelC.setAttribute("x", (originX + rightX) / 2 + 14);
  diagramLabelC.setAttribute("y", (topY + originY) / 2 - 8);
  diagramLabelC.textContent = `C: ${formatNumber(c)}`;
}

function updateVerification() {
  const rawValue = actualDiagonalInput.value.trim();

  if (!rawValue) {
    verifyError.hidden = true;
    verifyResultEl.hidden = true;
    return;
  }

  const actual = Number(rawValue);
  if (!Number.isFinite(actual) || actual <= 0) {
    verifyError.hidden = false;
    verifyResultEl.hidden = true;
    return;
  }
  verifyError.hidden = true;

  const hyp = Number(hypotenuseInput.value);
  const hypValid = Number.isFinite(hyp) && hyp > 0;

  if (!hypValid) {
    verifyResultEl.hidden = false;
    verifyResultEl.classList.remove("is-pass", "is-fail");
    verifyResultEl.textContent = verifyResultEl.dataset.needsHypotenuseMessage;
    return;
  }

  const diff = actual - hyp;
  const tolerance = hyp * TOLERANCE_RATIO;
  const diffText = diff === 0 ? "0" : (diff > 0 ? "+" : "") + formatNumber(diff);
  const isPass = Math.abs(diff) <= tolerance;

  verifyResultEl.hidden = false;
  verifyResultEl.classList.toggle("is-pass", isPass);
  verifyResultEl.classList.toggle("is-fail", !isPass);
  const template = isPass ? verifyResultEl.dataset.passTemplate : verifyResultEl.dataset.failTemplate;
  verifyResultEl.textContent = template.replace("{diff}", diffText);
}

function recompute() {
  if (editedOrder.length < 2) {
    // 근거값이 하나 이하라 아직 계산할 수 없습니다. 계산으로 채워졌을 수 있는
    // 나머지 필드는 값이 오래돼 잘못된 정보가 되므로 비워둡니다.
    const known = new Set(editedOrder);
    for (const key of Object.keys(FIELDS)) {
      if (!known.has(key)) FIELDS[key].value = "";
    }
    clearDiagramLabels();
    updateVerification();
    return;
  }

  const [known1, known2] = editedOrder;
  const target = Object.keys(FIELDS).find((key) => key !== known1 && key !== known2);

  const v1 = Number(FIELDS[known1].value);
  const v2 = Number(FIELDS[known2].value);

  let result;
  if (target === "c") {
    result = Math.sqrt(v1 * v1 + v2 * v2);
  } else {
    const hypKey = known1 === "c" ? known1 : known2;
    const legKey = known1 === "c" ? known2 : known1;
    const hypVal = Number(FIELDS[hypKey].value);
    const legVal = Number(FIELDS[legKey].value);
    if (hypVal <= legVal) {
      showError("triangle");
      FIELDS[target].value = "";
      clearDiagramLabels();
      updateVerification();
      return;
    }
    result = Math.sqrt(hypVal * hypVal - legVal * legVal);
  }

  errorEl.hidden = true;
  FIELDS[target].value = formatNumber(result);

  const a = Number(sideAInput.value);
  const b = Number(sideBInput.value);
  const c = Number(hypotenuseInput.value);
  drawDiagram(a, b, c);
  updateVerification();
}

function handleFieldInput(key) {
  const status = readValidValue(key);
  editedOrder = editedOrder.filter((k) => k !== key);

  if (status.empty) {
    errorEl.hidden = true;
  } else if (!status.valid) {
    showError("number");
  } else {
    errorEl.hidden = true;
    editedOrder.unshift(key);
  }

  recompute();
}

sideAInput.addEventListener("input", () => handleFieldInput("a"));
sideBInput.addEventListener("input", () => handleFieldInput("b"));
hypotenuseInput.addEventListener("input", () => handleFieldInput("c"));
actualDiagonalInput.addEventListener("input", updateVerification);

resetBtn.addEventListener("click", () => {
  sideAInput.value = "";
  sideBInput.value = "";
  hypotenuseInput.value = "";
  actualDiagonalInput.value = "";
  editedOrder = [];
  errorEl.hidden = true;
  verifyError.hidden = true;
  verifyResultEl.hidden = true;
  drawDiagram(3, 4, 5);
  clearDiagramLabels();
});

// 처음 열었을 때 빈 다이어그램만 덩그러니 보이지 않도록, 3:4:5 예시 모양을
// 한 번 그려둡니다(라벨은 비워서 "이건 실제 계산값이 아니라 예시 모양"임을 암시).
drawDiagram(3, 4, 5);
clearDiagramLabels();
