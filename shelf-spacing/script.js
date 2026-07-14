// 선반 간격 계산기(Shelf Spacing)의 핵심 로직
// 선반 자체도 두께만큼 공간을 차지하므로, "선반 두께 × 선반 개수"를 전체 길이에서
// 뺀 나머지 공간만 실제로 나눌 수 있는 여유 공간입니다. 이 여유 공간을 칸 수
// (선반 개수 + 1, 맨 위·아래 칸까지 포함)로 균등하게 나누면 모든 칸의 간격이
// 정확히 같아지는 선반 위치를 구할 수 있습니다.

const lengthInput = document.getElementById("shsp-length");
const countInput = document.getElementById("shsp-count");
const thicknessInput = document.getElementById("shsp-thickness");
const errorEl = document.getElementById("shsp-error");
const unitLabelEl = document.querySelector(".shsp-unit");

const gapEl = document.getElementById("shsp-result-gap");
const compartmentsEl = document.getElementById("shsp-result-compartments");
const gapWarningEl = document.getElementById("shsp-gap-warning");
const positionsListEl = document.getElementById("shsp-positions-list");

const resultSection = document.querySelector(".shsp-result-section");
const COMPARTMENTS_UNIT = resultSection.dataset.compartmentsUnit;
const UNIT_LABEL = unitLabelEl.textContent;
const POSITION_TEMPLATE = positionsListEl.dataset.positionTemplate;

const caseOutline = document.getElementById("shsp-case-outline");
const shelvesGroup = document.getElementById("shsp-shelves-group");
const dimTotalLine = document.getElementById("shsp-dim-total-line");
const dimTotalTick1 = document.getElementById("shsp-dim-total-tick1");
const dimTotalTick2 = document.getElementById("shsp-dim-total-tick2");
const dimTotalLabel = document.getElementById("shsp-dim-total-label");
const dimGapLine = document.getElementById("shsp-dim-gap-line");
const dimGapLabel = document.getElementById("shsp-dim-gap-label");
const dimLeader = document.getElementById("shsp-dim-leader");
const detailShelf = document.getElementById("shsp-detail-shelf");
const dimThicknessLabel = document.getElementById("shsp-dim-thickness-label");

const MIN_COMFORTABLE_GAP_CM = 10;

function formatNumber(value) {
  return parseFloat(value.toFixed(2)).toString();
}

function calculateSpacing(totalLength, count, thickness) {
  const availableSpace = totalLength - count * thickness;
  if (availableSpace <= 0) return null;

  const compartments = count + 1;
  const gap = availableSpace / compartments;
  const positions = [];
  for (let i = 1; i <= count; i++) {
    positions.push(i * gap + (i - 1) * thickness);
  }
  return { gap, compartments, positions };
}

function setLine(el, x1, y1, x2, y2) {
  el.setAttribute("x1", x1);
  el.setAttribute("y1", y1);
  el.setAttribute("x2", x2);
  el.setAttribute("y2", y2);
}

function setText(el, x, y, text) {
  el.setAttribute("x", x);
  el.setAttribute("y", y);
  el.textContent = text;
}

// 책장·수납장 옆면을 세로 방향으로 실제 비율 그대로 그립니다. 선반 두께는
// 보통 칸 간격보다 훨씬 얇아서(예: 1.8cm 선반, 40cm 칸) 실제 축척으로 그리면
// 선이 안 보일 정도로 얇아지므로, 계단 계산기와 같은 방식으로 첫 선반을
// 일정한 크기로 확대한 "상세 박스"를 따로 그리고 점선으로 연결합니다.
function drawDiagram(totalLength, gap, thickness, positions) {
  const viewWidth = 260;
  const viewHeight = 280;
  const marginTop = 20;
  const marginBottom = 20;
  const caseLeft = 30;
  const caseWidth = 90;
  const caseRight = caseLeft + caseWidth;

  const availableHeight = viewHeight - marginTop - marginBottom;
  const scale = availableHeight / totalLength;
  const caseBottom = viewHeight - marginBottom;
  const caseTop = marginTop;

  caseOutline.setAttribute("x", caseLeft);
  caseOutline.setAttribute("y", caseTop);
  caseOutline.setAttribute("width", caseWidth);
  caseOutline.setAttribute("height", availableHeight);

  shelvesGroup.innerHTML = "";
  positions.forEach((posCm) => {
    const shelfTopPx = caseBottom - (posCm + thickness) * scale;
    const shelfHeightPx = Math.max(thickness * scale, 1.5);
    const rect = document.createElementNS("http://www.w3.org/2000/svg", "rect");
    rect.setAttribute("x", caseLeft);
    rect.setAttribute("y", shelfTopPx);
    rect.setAttribute("width", caseWidth);
    rect.setAttribute("height", shelfHeightPx);
    rect.setAttribute("fill", "var(--shsp-accent)");
    shelvesGroup.appendChild(rect);
  });

  // 전체 길이 치수선(오른쪽, 세로)
  const totalDimX = caseRight + 16;
  setLine(dimTotalLine, totalDimX, caseBottom, totalDimX, caseTop);
  setLine(dimTotalTick1, totalDimX - 4, caseBottom, totalDimX + 4, caseBottom);
  setLine(dimTotalTick2, totalDimX - 4, caseTop, totalDimX + 4, caseTop);
  dimTotalLabel.setAttribute("transform", `rotate(-90 ${totalDimX + 12} ${(caseBottom + caseTop) / 2})`);
  setText(dimTotalLabel, totalDimX + 12, (caseBottom + caseTop) / 2, `${formatNumber(totalLength)} ${UNIT_LABEL}`);

  // 맨 아래 칸(첫 번째 칸) 간격 치수선(왼쪽)
  const firstGapTopPx = caseBottom - gap * scale;
  const gapDimX = caseLeft - 10;
  setLine(dimGapLine, gapDimX, caseBottom, gapDimX, firstGapTopPx);
  dimGapLabel.setAttribute("transform", `rotate(-90 ${gapDimX - 6} ${(caseBottom + firstGapTopPx) / 2})`);
  setText(dimGapLabel, gapDimX - 6, (caseBottom + firstGapTopPx) / 2, `${formatNumber(gap)} ${UNIT_LABEL}`);

  // 첫 선반 두께 상세 박스(오른쪽 아래, 실제 축척과 무관한 고정 크기)
  const detailWidth = 46;
  const detailHeight = 14;
  const detailX = totalDimX + 4;
  const detailY = caseBottom - detailHeight;
  const firstShelfTopPx = caseBottom - (positions[0] + thickness) * scale;
  const firstShelfCenterY = firstShelfTopPx + (thickness * scale) / 2;

  setLine(dimLeader, caseRight, firstShelfCenterY, detailX, detailY + detailHeight / 2);
  detailShelf.setAttribute("x", detailX);
  detailShelf.setAttribute("y", detailY);
  detailShelf.setAttribute("width", detailWidth);
  detailShelf.setAttribute("height", detailHeight);
  setText(dimThicknessLabel, detailX + detailWidth + 4, detailY + detailHeight / 2 + 4, `${formatNumber(thickness)} ${UNIT_LABEL}`);
}

function clearDiagram() {
  caseOutline.removeAttribute("x");
  caseOutline.removeAttribute("width");
  shelvesGroup.innerHTML = "";
  [dimTotalLine, dimTotalTick1, dimTotalTick2, dimGapLine, dimLeader].forEach((line) => setLine(line, 0, 0, 0, 0));
  [dimTotalLabel, dimGapLabel, dimThicknessLabel].forEach((label) => {
    label.textContent = "";
    label.removeAttribute("transform");
  });
  detailShelf.removeAttribute("width");
}

function clearResults() {
  gapEl.textContent = "–";
  compartmentsEl.textContent = "–";
  gapWarningEl.hidden = true;
  positionsListEl.innerHTML = "";
  clearDiagram();
}

function showError(kind) {
  errorEl.textContent = kind === "fit" ? errorEl.dataset.invalidFitError : errorEl.dataset.invalidInputError;
  errorEl.hidden = false;
}

function update() {
  const lengthRaw = lengthInput.value.trim();
  const countRaw = countInput.value.trim();
  const thicknessRaw = thicknessInput.value.trim();

  if (!lengthRaw && !countRaw && !thicknessRaw) {
    errorEl.hidden = true;
    clearResults();
    return;
  }

  const totalLength = Number(lengthRaw);
  const count = Number(countRaw);
  const thickness = Number(thicknessRaw);

  if (
    !Number.isFinite(totalLength) || totalLength <= 0 ||
    !Number.isFinite(count) || count <= 0 || !Number.isInteger(count) ||
    !Number.isFinite(thickness) || thickness <= 0
  ) {
    showError("input");
    clearResults();
    return;
  }

  const result = calculateSpacing(totalLength, count, thickness);
  if (!result) {
    showError("fit");
    clearResults();
    return;
  }

  errorEl.hidden = true;
  const { gap, compartments, positions } = result;

  gapEl.textContent = `${formatNumber(gap)} ${UNIT_LABEL}`;
  compartmentsEl.textContent = `${compartments} ${COMPARTMENTS_UNIT}`;
  gapWarningEl.hidden = gap >= MIN_COMFORTABLE_GAP_CM;

  positionsListEl.innerHTML = "";
  positions.forEach((posCm, idx) => {
    const li = document.createElement("li");
    li.textContent = POSITION_TEMPLATE.replace("{index}", String(idx + 1)).replace(
      "{position}",
      `${formatNumber(posCm)} ${UNIT_LABEL}`
    );
    positionsListEl.appendChild(li);
  });

  drawDiagram(totalLength, gap, thickness, positions);
}

[lengthInput, countInput, thicknessInput].forEach((el) => {
  el.addEventListener("input", update);
});

update();
