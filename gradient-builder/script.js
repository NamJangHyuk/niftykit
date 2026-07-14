// CSS 그라데이션 생성기 도구의 핵심 로직
// 색상 stop 배열과 각도/타입 상태를 바탕으로 실시간 미리보기와 CSS 코드 문자열을
// 만듭니다. 모든 계산은 브라우저 안에서만 이루어지며 서버 통신이 전혀 없습니다.

const gradPreview = document.getElementById("grad-preview");
const gradAngleRow = document.getElementById("grad-angle-row");
const gradAngleInput = document.getElementById("grad-angle");
const gradAngleValue = document.getElementById("grad-angle-value");
const gradStopsList = document.getElementById("grad-stops-list");
const gradAddStopBtn = document.getElementById("grad-add-stop-btn");
const gradStopsError = document.getElementById("grad-stops-error");
const gradCode = document.getElementById("grad-code");
const gradCopyBtn = document.getElementById("grad-copy-btn");
const gradTypeLinearBtn = document.getElementById("grad-type-linear");
const gradTypeRadialBtn = document.getElementById("grad-type-radial");

const MAX_STOPS = 5;
const MIN_STOPS = 2;
const DEFAULT_COLORS = ["#6366f1", "#ec4899", "#f59e0b", "#10b981", "#3b82f6"];

let gradientType = "linear";
let angle = 90;
let stops = [
  { id: 1, color: "#6366f1", position: 0 },
  { id: 2, color: "#ec4899", position: 100 },
];
let nextStopId = 3;

function sortedStops() {
  return [...stops].sort((a, b) => a.position - b.position);
}

function buildGradientCss() {
  const stopsStr = sortedStops()
    .map((s) => `${s.color} ${s.position}%`)
    .join(", ");
  if (gradientType === "linear") {
    return `linear-gradient(${angle}deg, ${stopsStr})`;
  }
  return `radial-gradient(circle, ${stopsStr})`;
}

function renderStopRows() {
  const removeLabel = gradStopsList.dataset.removeLabel;
  gradStopsList.innerHTML = "";
  stops.forEach((stop) => {
    const row = document.createElement("div");
    row.className = "grad-stop-row";

    const colorInput = document.createElement("input");
    colorInput.type = "color";
    colorInput.value = stop.color;
    colorInput.addEventListener("input", () => {
      stop.color = colorInput.value;
      render();
    });

    const positionInput = document.createElement("input");
    positionInput.type = "number";
    positionInput.min = "0";
    positionInput.max = "100";
    positionInput.value = String(stop.position);
    positionInput.className = "grad-stop-position";
    positionInput.addEventListener("input", () => {
      let value = Number(positionInput.value);
      if (Number.isNaN(value)) value = 0;
      value = Math.max(0, Math.min(100, value));
      stop.position = value;
      render();
    });

    const positionSuffix = document.createElement("span");
    positionSuffix.className = "grad-stop-suffix";
    positionSuffix.textContent = "%";

    const removeBtn = document.createElement("button");
    removeBtn.type = "button";
    removeBtn.className = "grad-stop-remove";
    removeBtn.textContent = removeLabel;
    removeBtn.disabled = stops.length <= MIN_STOPS;
    removeBtn.addEventListener("click", () => {
      if (stops.length <= MIN_STOPS) {
        showError("min");
        return;
      }
      stops = stops.filter((s) => s.id !== stop.id);
      render();
    });

    row.appendChild(colorInput);
    row.appendChild(positionInput);
    row.appendChild(positionSuffix);
    row.appendChild(removeBtn);
    gradStopsList.appendChild(row);
  });
}

function showError(kind) {
  gradStopsError.textContent = kind === "max" ? gradStopsError.dataset.maxError : gradStopsError.dataset.minError;
  gradStopsError.hidden = false;
  clearTimeout(showError._timer);
  showError._timer = setTimeout(() => {
    gradStopsError.hidden = true;
  }, 2500);
}

function render() {
  const css = buildGradientCss();
  gradPreview.style.background = css;
  gradCode.textContent = `background: ${css};`;
  gradAngleRow.hidden = gradientType !== "linear";
  gradAngleValue.textContent = `${angle}°`;
  renderStopRows();
}

gradTypeLinearBtn.addEventListener("click", () => {
  gradientType = "linear";
  gradTypeLinearBtn.classList.add("is-active");
  gradTypeRadialBtn.classList.remove("is-active");
  render();
});

gradTypeRadialBtn.addEventListener("click", () => {
  gradientType = "radial";
  gradTypeRadialBtn.classList.add("is-active");
  gradTypeLinearBtn.classList.remove("is-active");
  render();
});

gradAngleInput.addEventListener("input", () => {
  angle = Number(gradAngleInput.value);
  render();
});

gradAddStopBtn.addEventListener("click", () => {
  if (stops.length >= MAX_STOPS) {
    showError("max");
    return;
  }
  // 새 색상은 마지막 색상 다음 순서의 기본 팔레트에서 가져오고, 위치는 기존 stop들
  // 사이 빈 구간의 중간값으로 잡아서 그라데이션이 자연스럽게 이어지게 합니다.
  const color = DEFAULT_COLORS[stops.length % DEFAULT_COLORS.length];
  const positions = sortedStops().map((s) => s.position);
  const lastPosition = positions[positions.length - 1] ?? 0;
  const secondLastPosition = positions[positions.length - 2] ?? 0;
  const newPosition = Math.round((lastPosition + secondLastPosition) / 2);
  stops.push({ id: nextStopId++, color, position: newPosition });
  render();
});

let copyResetTimer = null;
gradCopyBtn.addEventListener("click", () => {
  const text = gradCode.textContent;
  navigator.clipboard.writeText(text).then(() => {
    clearTimeout(copyResetTimer);
    gradCopyBtn.textContent = gradCopyBtn.dataset.copiedLabel;
    copyResetTimer = setTimeout(() => {
      gradCopyBtn.textContent = gradCopyBtn.dataset.copyLabel;
    }, 1500);
  });
});

render();
