// 계단 계산기(Stair Calc)의 핵심 로직
// 1) 층고를 "오르내리기 편한 단높이(15~20cm, 이상적으로는 17~18cm)" 범위 안에서
//    가장 가까운 정수 단수로 나눠, 모든 단의 높이가 균등해지도록 합니다.
// 2) 오래전부터 쓰여온 "2R+T 공식"(단높이×2 + 디딤판 깊이 ≈ 60~65cm)으로
//    걷기 편한 디딤판 깊이를 역산합니다. 이 공식은 사람이 계단을 오르내릴 때의
//    평균적인 보폭과 잘 맞아떨어진다고 알려진 경험적 설계 공식입니다.
// 이 도구는 참고용 계산기이며, 실제 법적 기준(건축 법규)을 보장하지 않습니다.

const heightInput = document.getElementById("stc-height");
const errorEl = document.getElementById("stc-error");
const unitLabelEl = document.querySelector(".stc-unit");
const resultSection = document.querySelector(".stc-result-section");
const stepsEl = document.getElementById("stc-result-steps");
const riserEl = document.getElementById("stc-result-riser");
const treadEl = document.getElementById("stc-result-tread");
const runEl = document.getElementById("stc-result-run");
const riserWarningEl = document.getElementById("stc-riser-warning");
const treadWarningEl = document.getElementById("stc-tread-warning");
const diagramPath = document.getElementById("stc-diagram-path");

const dimRiseLine = document.getElementById("stc-dim-rise-line");
const dimRiseTick1 = document.getElementById("stc-dim-rise-tick1");
const dimRiseTick2 = document.getElementById("stc-dim-rise-tick2");
const dimRiseLabel = document.getElementById("stc-dim-rise-label");
const dimRunLine = document.getElementById("stc-dim-run-line");
const dimRunTick1 = document.getElementById("stc-dim-run-tick1");
const dimRunTick2 = document.getElementById("stc-dim-run-tick2");
const dimRunLabel = document.getElementById("stc-dim-run-label");
const dimLeader = document.getElementById("stc-dim-leader");
const detailPath = document.getElementById("stc-detail-path");
const dimRiserLine = document.getElementById("stc-dim-riser-line");
const dimRiserLabel = document.getElementById("stc-dim-riser-label");
const dimTreadLine = document.getElementById("stc-dim-tread-line");
const dimTreadLabel = document.getElementById("stc-dim-tread-label");
const angleArc = document.getElementById("stc-angle-arc");
const angleLabel = document.getElementById("stc-angle-label");

const STEPS_UNIT = resultSection.dataset.stepsUnit;
const UNIT_LABEL = unitLabelEl.textContent;

const IDEAL_RISER_CM = 17.5; // 오르내리기 가장 편안하다고 알려진 단높이(15~20cm 범위의 중간값)
const MIN_RISER_CM = 15;
const MAX_RISER_CM = 20;
const MIN_TREAD_CM = 26; // 성인 발이 안정적으로 디딜 수 있는 최소 깊이로 널리 인용되는 값
const TWO_R_PLUS_T_TARGET = 63; // 2R+T 공식의 목표값(cm), 60~65cm 범위의 중간

function formatNumber(value) {
  return parseFloat(value.toFixed(2)).toString();
}

function calculateStairs(heightCm) {
  let steps = Math.round(heightCm / IDEAL_RISER_CM);
  if (steps < 1) steps = 1;
  const riser = heightCm / steps;
  const tread = TWO_R_PLUS_T_TARGET - 2 * riser;
  const treads = Math.max(steps - 1, 0); // 맨 위 단은 상층 바닥이 디딤판 역할을 대신함
  const run = tread * treads;
  return { steps, riser, tread, run };
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

// 각도 표시용 호를 정확한 SVG arc 명령(sweep-flag 등)으로 그리는 대신, 각도를
// 여러 개의 짧은 직선으로 잘게 쪼개 잇는 방식(폴리라인 근사)으로 그립니다.
// 계산이 훨씬 단순하고 방향 실수(시계/반시계 방향 헷갈림) 위험이 없습니다.
function describeArcPath(cx, cy, radius, startAngleRad, endAngleRad) {
  const steps = 10;
  const points = [];
  for (let i = 0; i <= steps; i++) {
    const t = startAngleRad + ((endAngleRad - startAngleRad) * i) / steps;
    const px = cx + radius * Math.cos(t);
    const py = cy - radius * Math.sin(t); // SVG는 y가 아래로 증가하므로 "위쪽"은 빼줍니다.
    points.push(`${px} ${py}`);
  }
  return `M ${points.join(" L ")}`;
}

// 실제 층고·전체 길이·경사각을 있는 그대로(축척만 맞춰) 보여주는 계단 옆면
// 다이어그램입니다. 단수를 임의로 줄이지 않고 실제 개수만큼 전부 그리되, 가로/세로에
// 같은 배율(scale)을 적용해서 각도가 왜곡되지 않게 합니다(가로세로를 따로
// 늘리면 실제와 다른 기울기로 보이는 착시가 생기기 때문). 첫 번째 단에는 단높이·
// 디딤판 치수선을, 전체 윤곽에는 총 높이·총 길이 치수선을, 밑변에는 경사각을
// 표시해서 "이 계단이 실제로 어떤 모양·비율·각도인지"를 한눈에 보여줍니다.
function drawStaircase(riserCm, treadCm, totalSteps, totalRiseCm, totalRunCm) {
  const viewWidth = 320;
  const viewHeight = 240;
  const marginLeft = 56;
  const marginBottom = 50;
  const marginRight = 24;
  const marginTop = 24;

  const availableWidth = viewWidth - marginLeft - marginRight;
  const availableHeight = viewHeight - marginTop - marginBottom;

  // 단이 1개뿐이라 총 수평 길이가 0인 경우(가로 배율이 무한대가 되는 것)를
  // 막기 위해, 그럴 때는 세로 배율만 기준으로 축척을 정합니다.
  const scaleX = totalRunCm > 0 ? availableWidth / totalRunCm : Infinity;
  const scaleY = availableHeight / totalRiseCm;
  const scale = Math.min(scaleX, scaleY);

  const drawWidth = totalRunCm * scale;
  const drawHeight = totalRiseCm * scale;

  const originX = marginLeft;
  const originY = viewHeight - marginBottom;
  const topY = originY - drawHeight;
  const rightX = originX + drawWidth;

  const stepRiserPx = riserCm * scale;
  const stepTreadPx = treadCm * scale;
  const cappedSteps = Math.min(totalSteps, 60); // 비현실적으로 큰 입력값에 대한 안전장치

  let x = originX;
  let y = originY;
  let d = `M ${x} ${y}`;
  for (let i = 0; i < cappedSteps; i++) {
    y -= stepRiserPx;
    d += ` L ${x} ${y}`;
    if (i < cappedSteps - 1) {
      x += stepTreadPx;
      d += ` L ${x} ${y}`;
    }
  }
  diagramPath.setAttribute("d", d);

  // 총 높이 치수선(왼쪽, 세로)
  const riseDimX = originX - 18;
  setLine(dimRiseLine, riseDimX, originY, riseDimX, topY);
  setLine(dimRiseTick1, riseDimX - 4, originY, riseDimX + 4, originY);
  setLine(dimRiseTick2, riseDimX - 4, topY, riseDimX + 4, topY);
  dimRiseLabel.setAttribute("transform", `rotate(-90 ${riseDimX - 10} ${(originY + topY) / 2})`);
  setText(dimRiseLabel, riseDimX - 10, (originY + topY) / 2, `${formatNumber(totalRiseCm)} ${UNIT_LABEL}`);

  // 총 길이 치수선(아래, 가로)
  const runDimY = originY + 18;
  setLine(dimRunLine, originX, runDimY, rightX, runDimY);
  setLine(dimRunTick1, originX, runDimY - 4, originX, runDimY + 4);
  setLine(dimRunTick2, rightX, runDimY - 4, rightX, runDimY + 4);
  dimRunLabel.removeAttribute("transform");
  setText(dimRunLabel, (originX + rightX) / 2, runDimY + 16, `${formatNumber(totalRunCm)} ${UNIT_LABEL}`);

  // 단수가 많으면(예: 16단) 한 칸의 실제 크기가 몇 px밖에 안 돼서 그 옆에 치수를
  // 적으면 서로 겹치거나 다음 단과 충돌합니다. 그래서 실제 축척과 무관하게 항상
  // 일정한 크기로 첫 단을 확대해 보여주는 "상세 박스"를 오른쪽 위 빈 공간에 따로
  // 그리고, 점선 리더 라인으로 실제 첫 단 모서리와 연결해 어떤 단을 확대한 것인지
  // 알 수 있게 합니다. 이렇게 하면 단이 아무리 작아져도 치수는 항상 또렷합니다.
  const insetSize = 34;
  const insetOriginX = viewWidth - marginRight - insetSize - 30;
  const insetOriginY = marginTop + insetSize + 14;

  setLine(dimLeader, originX, originY - stepRiserPx, insetOriginX, insetOriginY);

  const detailD = `M ${insetOriginX} ${insetOriginY} L ${insetOriginX} ${insetOriginY - insetSize} L ${insetOriginX + insetSize} ${insetOriginY - insetSize}`;
  detailPath.setAttribute("d", detailD);

  setLine(dimRiserLine, insetOriginX - 8, insetOriginY, insetOriginX - 8, insetOriginY - insetSize);
  setText(dimRiserLabel, insetOriginX - 12, insetOriginY - insetSize / 2, `${formatNumber(riserCm)} ${UNIT_LABEL}`);

  setLine(dimTreadLine, insetOriginX, insetOriginY - insetSize - 8, insetOriginX + insetSize, insetOriginY - insetSize - 8);
  setText(dimTreadLabel, insetOriginX + insetSize / 2, insetOriginY - insetSize - 12, `${formatNumber(treadCm)} ${UNIT_LABEL}`);

  // 경사각(계단 전체가 수평면과 이루는 각도). 작은 호는 첫 단 모서리에 그대로 두되,
  // 숫자 라벨은 상세 박스·리더 라인과 겹치지 않도록 총 길이 치수선 오른쪽 끝으로 옮깁니다.
  const angleRad = totalRunCm > 0 ? Math.atan2(totalRiseCm, totalRunCm) : Math.PI / 2;
  const angleDeg = (angleRad * 180) / Math.PI;
  const arcRadius = 16;
  angleArc.setAttribute("d", describeArcPath(originX, originY, arcRadius, 0, angleRad));
  setText(angleLabel, rightX, runDimY + 16, `∠ ${formatNumber(angleDeg)}°`);
}

function clearResults() {
  stepsEl.textContent = "–";
  riserEl.textContent = "–";
  treadEl.textContent = "–";
  runEl.textContent = "–";
  riserWarningEl.hidden = true;
  treadWarningEl.hidden = true;
  diagramPath.setAttribute("d", "");
  detailPath.setAttribute("d", "");
  [
    dimRiseLine,
    dimRiseTick1,
    dimRiseTick2,
    dimRunLine,
    dimRunTick1,
    dimRunTick2,
    dimRiserLine,
    dimTreadLine,
    dimLeader,
  ].forEach((line) => setLine(line, 0, 0, 0, 0));
  [dimRiseLabel, dimRunLabel, dimRiserLabel, dimTreadLabel, angleLabel].forEach((label) => {
    label.textContent = "";
  });
  angleArc.setAttribute("d", "");
}

function update() {
  const raw = heightInput.value.trim();
  if (!raw) {
    errorEl.hidden = true;
    clearResults();
    return;
  }

  const height = Number(raw);
  if (!Number.isFinite(height) || height <= 0) {
    errorEl.hidden = false;
    clearResults();
    return;
  }
  errorEl.hidden = true;

  const { steps, riser, tread, run } = calculateStairs(height);

  stepsEl.textContent = `${steps} ${STEPS_UNIT}`;
  riserEl.textContent = `${formatNumber(riser)} ${UNIT_LABEL}`;
  treadEl.textContent = `${formatNumber(tread)} ${UNIT_LABEL}`;
  runEl.textContent = `${formatNumber(run)} ${UNIT_LABEL}`;

  riserWarningEl.hidden = riser >= MIN_RISER_CM && riser <= MAX_RISER_CM;
  treadWarningEl.hidden = tread >= MIN_TREAD_CM;

  drawStaircase(riser, tread, steps, height, run);
}

heightInput.addEventListener("input", update);
update();
