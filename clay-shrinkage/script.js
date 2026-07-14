// 점토 수축률 계산기(Clay Shrinkage Calculator)의 핵심 로직
// 점토는 초벌구이와 재벌구이를 거치며 계속 줄어들기 때문에, 수축률이 R%라면
// "재벌 크기 = 초벌 크기 × (1 - R/100)" 관계가 성립합니다. 가로·세로·높이 각각을
// "초벌 칸 / 재벌 칸" 두 입력이 서로를 계산해주는 양방향 쌍으로 다루고, 사용자가
// 마지막으로 직접 수정한 쪽을 "기준값"으로 삼아 반대쪽을 그때그때 다시 계산합니다.

const shrinkageInput = document.getElementById("cs-shrinkage");
const shrinkageErrorEl = document.getElementById("cs-shrinkage-error");
const shrinkageWarningEl = document.getElementById("cs-shrinkage-warning");
const presetBtns = document.querySelectorAll(".cs-preset-btn");
const dimensionErrorEl = document.getElementById("cs-dimension-error");

const resultSection = document.querySelector(".cs-result-section");
const UNIT_LABEL = document.querySelector(".cs-unit").textContent;
const BISQUE_LABEL = resultSection.dataset.bisqueLabel;
const FINAL_LABEL = resultSection.dataset.finalLabel;
const DEPTH_TEMPLATE = resultSection.dataset.depthTemplate;

const emptyHintEl = document.getElementById("cs-empty-hint");
const diagramEl = document.getElementById("cs-diagram");
const vaseBisque = document.getElementById("cs-vase-bisque");
const vaseFinal = document.getElementById("cs-vase-final");
const vaseBisqueLabel = document.getElementById("cs-vase-bisque-label");
const vaseFinalLabel = document.getElementById("cs-vase-final-label");
const vaseBisqueSize = document.getElementById("cs-vase-bisque-size");
const vaseFinalSize = document.getElementById("cs-vase-final-size");
const vaseBisqueDepth = document.getElementById("cs-vase-bisque-depth");
const vaseFinalDepth = document.getElementById("cs-vase-final-depth");
const diagramBaseline = document.getElementById("cs-diagram-baseline");

const MIN_TYPICAL_SHRINKAGE = 5;
const MAX_TYPICAL_SHRINKAGE = 20;

function formatNumber(value) {
  return parseFloat(value.toFixed(2)).toString();
}

function readShrinkageRate() {
  const raw = shrinkageInput.value.trim();
  if (!raw) return { empty: true };
  const value = Number(raw);
  if (!Number.isFinite(value) || value <= 0 || value >= 100) return { empty: false, valid: false };
  return { empty: false, valid: true, value };
}

// 가로/세로/높이 각각에 대해 "초벌 입력칸 ↔ 재벌 입력칸" 한 쌍을 관리합니다.
// 사용자가 어느 한쪽에 타이핑하면 그 칸을 lastEdited로 기억해두고, 그 값을 기준으로
// 반대쪽 칸을 수축률에 맞춰 다시 계산합니다. 두 칸 다 비어있으면 아무 계산도 하지
// 않고, 한쪽만 지워지면 반대쪽도 함께 비워서 잘못된 값이 남지 않게 합니다.
function createDimensionPair(bisqueInput, finalInput) {
  let lastEdited = null; // "bisque" | "final"

  function recompute(shrinkage) {
    if (!shrinkage.valid) return;

    if (lastEdited === "bisque") {
      const raw = bisqueInput.value.trim();
      if (!raw) {
        finalInput.value = "";
        return;
      }
      const bisqueSize = Number(raw);
      if (!Number.isFinite(bisqueSize) || bisqueSize <= 0) return;
      finalInput.value = formatNumber(bisqueSize * (1 - shrinkage.value / 100));
    } else if (lastEdited === "final") {
      const raw = finalInput.value.trim();
      if (!raw) {
        bisqueInput.value = "";
        return;
      }
      const finalSize = Number(raw);
      if (!Number.isFinite(finalSize) || finalSize <= 0) return;
      bisqueInput.value = formatNumber(finalSize / (1 - shrinkage.value / 100));
    }
  }

  function hasInvalidValue() {
    const bisqueRaw = bisqueInput.value.trim();
    const finalRaw = finalInput.value.trim();
    if (bisqueRaw && (!Number.isFinite(Number(bisqueRaw)) || Number(bisqueRaw) <= 0)) return true;
    if (finalRaw && (!Number.isFinite(Number(finalRaw)) || Number(finalRaw) <= 0)) return true;
    return false;
  }

  function resolvedValues() {
    const bisqueRaw = Number(bisqueInput.value);
    const finalRaw = Number(finalInput.value);
    return {
      bisque: Number.isFinite(bisqueRaw) && bisqueRaw > 0 ? bisqueRaw : null,
      final: Number.isFinite(finalRaw) && finalRaw > 0 ? finalRaw : null,
    };
  }

  bisqueInput.addEventListener("input", () => {
    lastEdited = "bisque";
    update();
  });
  finalInput.addEventListener("input", () => {
    lastEdited = "final";
    update();
  });

  return { recompute, hasInvalidValue, resolvedValues };
}

const widthPair = createDimensionPair(document.getElementById("cs-bisque-width"), document.getElementById("cs-final-width"));
const depthPair = createDimensionPair(document.getElementById("cs-bisque-depth"), document.getElementById("cs-final-depth"));
const heightPair = createDimensionPair(document.getElementById("cs-bisque-height"), document.getElementById("cs-final-height"));

// 대칭 곡선(2차 베지어) 조합으로 목이 좁고 몸통이 둥근 항아리 실루엣을 그립니다.
// 모든 좌표를 width·height의 비율로 정의해서, 실제 입력값에 맞춰 늘어나거나
// 줄어들어도 "항아리답게" 보이는 비례가 그대로 유지됩니다.
function buildVasePath(centerX, baseY, width, height) {
  const halfW = width / 2;
  const baseX = halfW * 0.3;
  const bellyX = halfW * 0.5;
  const bellyY = baseY - height * 0.35;
  const neckX = halfW * 0.18;
  const neckY = baseY - height * 0.85;
  const rimX = halfW * 0.24;
  const rimY = baseY - height;

  const c1x = halfW * 0.52;
  const c1y = baseY - height * 0.15;
  const c2x = halfW * 0.46;
  const c2y = baseY - height * 0.65;
  const c3x = halfW * 0.16;
  const c3y = baseY - height * 0.95;

  return [
    `M ${centerX - baseX} ${baseY}`,
    `L ${centerX + baseX} ${baseY}`,
    `Q ${centerX + c1x} ${c1y} ${centerX + bellyX} ${bellyY}`,
    `Q ${centerX + c2x} ${c2y} ${centerX + neckX} ${neckY}`,
    `Q ${centerX + c3x} ${c3y} ${centerX + rimX} ${rimY}`,
    `L ${centerX - rimX} ${rimY}`,
    `Q ${centerX - c3x} ${c3y} ${centerX - neckX} ${neckY}`,
    `Q ${centerX - c2x} ${c2y} ${centerX - bellyX} ${bellyY}`,
    `Q ${centerX - c1x} ${c1y} ${centerX - baseX} ${baseY}`,
    "Z",
  ].join(" ");
}

function updateDiagram() {
  const width = widthPair.resolvedValues();
  const height = heightPair.resolvedValues();
  const depth = depthPair.resolvedValues();

  const bisqueW = width.bisque;
  const bisqueH = height.bisque;
  const finalW = width.final;
  const finalH = height.final;

  if (!bisqueW || !bisqueH || !finalW || !finalH) {
    diagramEl.hidden = true;
    emptyHintEl.hidden = false;
    return;
  }

  emptyHintEl.hidden = true;
  diagramEl.hidden = false;

  const viewHeight = 220;
  const marginBottom = 44;
  const marginTop = 16;
  const availableHeight = viewHeight - marginTop - marginBottom;
  const baseY = viewHeight - marginBottom;

  // 초벌이 재벌보다 항상 크므로(수축 전), 더 큰 초벌 높이를 기준으로 축척을 정해서
  // 두 실루엣의 상대적인 크기 차이가 실제 비율 그대로 보이게 합니다.
  const scale = availableHeight / Math.max(bisqueH, finalH);

  const slotWidth = 320 / 2;
  const bisqueCenterX = slotWidth / 2;
  const finalCenterX = slotWidth + slotWidth / 2;

  // 초벌·재벌 도자기가 놓인 바닥을 나타내는 얇은 수평선입니다.
  diagramBaseline.setAttribute("x1", 12);
  diagramBaseline.setAttribute("y1", baseY);
  diagramBaseline.setAttribute("x2", 308);
  diagramBaseline.setAttribute("y2", baseY);

  vaseBisque.setAttribute("d", buildVasePath(bisqueCenterX, baseY, bisqueW * scale, bisqueH * scale));
  vaseFinal.setAttribute("d", buildVasePath(finalCenterX, baseY, finalW * scale, finalH * scale));

  vaseBisqueLabel.setAttribute("x", bisqueCenterX);
  vaseBisqueLabel.setAttribute("y", 16);
  vaseBisqueLabel.textContent = BISQUE_LABEL;

  vaseFinalLabel.setAttribute("x", finalCenterX);
  vaseFinalLabel.setAttribute("y", 16);
  vaseFinalLabel.textContent = FINAL_LABEL;

  vaseBisqueSize.setAttribute("x", bisqueCenterX);
  vaseBisqueSize.setAttribute("y", baseY + 18);
  vaseBisqueSize.textContent = `${formatNumber(bisqueW)} × ${formatNumber(bisqueH)} ${UNIT_LABEL}`;

  vaseFinalSize.setAttribute("x", finalCenterX);
  vaseFinalSize.setAttribute("y", baseY + 18);
  vaseFinalSize.textContent = `${formatNumber(finalW)} × ${formatNumber(finalH)} ${UNIT_LABEL}`;

  vaseBisqueDepth.setAttribute("x", bisqueCenterX);
  vaseBisqueDepth.setAttribute("y", baseY + 34);
  vaseBisqueDepth.textContent = depth.bisque ? DEPTH_TEMPLATE.replace("{value}", `${formatNumber(depth.bisque)} ${UNIT_LABEL}`) : "";

  vaseFinalDepth.setAttribute("x", finalCenterX);
  vaseFinalDepth.setAttribute("y", baseY + 34);
  vaseFinalDepth.textContent = depth.final ? DEPTH_TEMPLATE.replace("{value}", `${formatNumber(depth.final)} ${UNIT_LABEL}`) : "";
}

function update() {
  const shrinkage = readShrinkageRate();

  if (shrinkage.empty) {
    shrinkageErrorEl.hidden = true;
    shrinkageWarningEl.hidden = true;
  } else if (!shrinkage.valid) {
    shrinkageErrorEl.hidden = false;
    shrinkageWarningEl.hidden = true;
  } else {
    shrinkageErrorEl.hidden = true;
    shrinkageWarningEl.hidden = shrinkage.value >= MIN_TYPICAL_SHRINKAGE && shrinkage.value <= MAX_TYPICAL_SHRINKAGE;
    widthPair.recompute(shrinkage);
    depthPair.recompute(shrinkage);
    heightPair.recompute(shrinkage);
  }

  const hasInvalidDimension = widthPair.hasInvalidValue() || depthPair.hasInvalidValue() || heightPair.hasInvalidValue();
  dimensionErrorEl.hidden = !hasInvalidDimension;

  updateDiagram();
}

shrinkageInput.addEventListener("input", update);

presetBtns.forEach((btn) => {
  btn.addEventListener("click", () => {
    shrinkageInput.value = btn.dataset.value;
    update();
  });
});

update();
