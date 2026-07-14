// 라인아트 벡터 변환기: 업로드한 이미지를 브라우저 안에서 WASM(vtracer)으로 흑백 SVG
// 벡터로 변환합니다. 서버로는 아무것도 전송되지 않습니다. 업로드하면 별도 버튼 없이
// 바로 변환되고, 결과가 너무 각지거나 뭉개져 보이면 "선 매끄러움" 슬라이더로 다시
// 변환할 수 있습니다.

const VTRACER_JS_URL = "https://cdn.jsdelivr.net/npm/vtracer-web@0.1.0/vtracer.js";
const VTRACER_WASM_URL = "https://cdn.jsdelivr.net/npm/vtracer-web@0.1.0/vtracer.wasm";
const SVGO_URL = "https://cdn.jsdelivr.net/npm/svgo@3.3.2/dist/svgo.browser.js";

// 너무 큰 이미지는 WASM 처리 시간과 결과 SVG 용량이 과도하게 커지므로, 긴 변을
// 이 픽셀 수로 미리 줄인 뒤 변환합니다. 이 도구는 정밀한 라인아트 재현이 핵심이라
// 여유 있게 잡았습니다(실사용 테스트 이미지 기준 이 해상도까지는 처리 시간이 1초 내외).
const MAX_DIMENSION = 3000;

const dropzone = document.getElementById("vc-dropzone");
const fileInput = document.getElementById("vc-file-input");
const chooseBtn = document.getElementById("vc-choose-btn");
const globalError = document.getElementById("vc-global-error");
const workspace = document.getElementById("vc-workspace");
const originalImg = document.getElementById("vc-original-img");
const originalMeta = document.getElementById("vc-original-meta");
const resultBox = document.getElementById("vc-result-box");
const resultFrame = document.getElementById("vc-result-frame");
const resultMeta = document.getElementById("vc-result-meta");
const detailRange = document.getElementById("vc-detail-range");
const detailValue = document.getElementById("vc-detail-value");
const tooLargeWarning = document.getElementById("vc-too-large-warning");
const convertError = document.getElementById("vc-convert-error");
const resultActions = document.getElementById("vc-result-actions");
const downloadBtn = document.getElementById("vc-download-btn");
const convertAnotherBtn = document.getElementById("vc-convert-another-btn");

const STR = {
  convertingText: workspace.dataset.convertingText,
  fileSizeTemplate: workspace.dataset.fileSizeTemplate,
  svgSizeTemplate: workspace.dataset.svgSizeTemplate,
  unsupportedFileError: workspace.dataset.unsupportedFileError,
  decodeErrorText: workspace.dataset.decodeErrorText,
  conversionErrorText: workspace.dataset.conversionErrorText,
  engineLoadErrorText: workspace.dataset.engineLoadErrorText,
  tooLargeWarning: workspace.dataset.tooLargeWarning,
};

const deg2rad = (deg) => (deg * Math.PI) / 180;
const lerp = (a, b, t) => a + (b - a) * t;

// "선 매끄러움" 슬라이더(0=선명하게 ~ 100=부드럽게)를 vtracer 파라미터로 변환합니다.
//
// 발견 1: vtracer-web(WASM)의 cornerThreshold/spliceThreshold는 "도(degree)"가 아니라
// "라디안" 단위로 그대로 소비됩니다(각도처럼 보이는 필드명과 달리 내부에서 deg→rad 변환을
// 하지 않음 — WASM 바이너리를 직접 호출해서 검증). deg2rad로 정확히 변환해서 넣습니다.
//
// 발견 2: 원본 이미지(특히 사진을 스캔·압축한 소스)에는 잉크 선 주변에 미세한 회색
// 그라데이션·압축 노이즈가 섞여 있는데, vtracer의 이진화 기준은 "R채널 < 128" 고정이라
// (조정 불가) 그 노이즈가 threshold 경계에서 삐죽삐죽한 각진 윤곽으로 그대로 남습니다.
// 코너/스플라인 파라미터(cornerThreshold 등)를 아무리 조정해도 이 각짐은 거의 줄지
// 않았고(실제로 값을 크게 바꿔도 결과가 거의 동일했습니다), 이진화 직전에 살짝
// 블러(blur)를 줘서 노이즈를 눌러야만 눈에 띄게 부드러워졌습니다. 다만 블러를 과하게
// 주면 가는 선(눈썹 잔털 등)이 서로 뭉개져 붙어버리는 반대쪽 부작용이 있고, 그 경계가
// 이미지마다 달라서 하나의 기본값으로는 모든 이미지에 맞출 수 없었습니다. 그래서 이
// blur·filterSpeckle 두 값을 슬라이더로 직접 연속 조절할 수 있게 노출합니다 — 각지면
// 오른쪽(부드럽게)으로, 뭉개지면 왼쪽(선명하게)으로 옮겨서 이미지에 맞는 지점을 찾을 수
// 있습니다. cornerThreshold 등 나머지 값은 위 실험에서 체감 차이가 없었던 값이라
// 고정해서 슬라이더 하나로 단순하게 유지합니다.
function smoothnessToParams(sliderValue) {
  const t = Math.min(100, Math.max(0, sliderValue)) / 100;
  return {
    blur: lerp(0, 1.6, t),
    filterSpeckle: Math.round(lerp(2, 16, t)),
  };
}

function buildConfig(sliderValue) {
  const { filterSpeckle } = smoothnessToParams(sliderValue);
  return {
    binary: true,
    mode: "spline",
    hierarchical: "stacked",
    cornerThreshold: deg2rad(90),
    lengthThreshold: 4,
    maxIterations: 4,
    spliceThreshold: deg2rad(70),
    filterSpeckle,
    colorPrecision: 6,
    layerDifference: 5,
    pathPrecision: 8,
  };
}

// vtracer(WASM)와 svgo(결과 SVG 경량화)는 첫 변환 시도 시에만 CDN에서 불러옵니다
// (Lazy Loading) — 이미지를 올리기만 하고 변환이 시작되기 전에는 불필요한 다운로드가
// 없도록 합니다.
let vtracerModulePromise = null;
function loadVtracer() {
  if (!vtracerModulePromise) {
    vtracerModulePromise = import(VTRACER_JS_URL).then(async (mod) => {
      await mod.default({ module_or_path: VTRACER_WASM_URL });
      return mod;
    });
  }
  return vtracerModulePromise;
}

let svgoModulePromise = null;
function loadSvgo() {
  if (!svgoModulePromise) {
    svgoModulePromise = import(SVGO_URL);
  }
  return svgoModulePromise;
}

function formatBytes(bytes) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function baseName(filename) {
  const dot = filename.lastIndexOf(".");
  return dot > 0 ? filename.slice(0, dot) : filename;
}

function showGlobalError(message) {
  globalError.textContent = message;
  globalError.hidden = false;
}

function clearGlobalError() {
  globalError.hidden = true;
}

function showConvertError(message) {
  convertError.textContent = message;
  convertError.hidden = false;
}

function clearConvertError() {
  convertError.hidden = true;
}

// 현재 첨부된 파일의 상태입니다. 새 파일을 올리면 통째로 교체됩니다.
let state = null;

function resetToUpload() {
  if (state) {
    if (state.originalUrl) URL.revokeObjectURL(state.originalUrl);
    if (state.resultUrl) URL.revokeObjectURL(state.resultUrl);
  }
  state = null;
  workspace.hidden = true;
  resultBox.hidden = true;
  resultActions.hidden = true;
  tooLargeWarning.hidden = true;
  clearConvertError();
  fileInput.value = "";
}

async function handleFile(file) {
  if (!file.type.startsWith("image/")) {
    showGlobalError(STR.unsupportedFileError);
    return;
  }
  clearGlobalError();

  let bitmap;
  try {
    bitmap = await createImageBitmap(file);
  } catch (err) {
    showGlobalError(STR.decodeErrorText);
    return;
  }

  if (state) {
    if (state.originalUrl) URL.revokeObjectURL(state.originalUrl);
    if (state.resultUrl) URL.revokeObjectURL(state.resultUrl);
  }

  const originalUrl = URL.createObjectURL(file);
  state = { file, bitmap, originalUrl, resultUrl: null };

  originalImg.src = originalUrl;
  originalMeta.textContent = STR.fileSizeTemplate
    .replace("{size}", formatBytes(file.size))
    .replace("{width}", bitmap.width)
    .replace("{height}", bitmap.height);

  const wasResized = bitmap.width > MAX_DIMENSION || bitmap.height > MAX_DIMENSION;
  tooLargeWarning.hidden = !wasResized;

  workspace.hidden = false;
  resultActions.hidden = true;
  clearConvertError();

  workspace.scrollIntoView({ behavior: "smooth", block: "nearest" });

  convert();
}

// 원본 비트맵을 (필요하면 축소해서) 캔버스에 그린 뒤 RGBA 픽셀 배열을 뽑아냅니다.
// vtracer의 to_svg(pixels, width, height, config)가 기대하는 입력 형식입니다.
// blurPx는 이진화(threshold) 전에 미세 노이즈를 눌러 각진 윤곽을 줄이기 위한
// 사전 블러 양입니다(위 BW_DETAIL_PRESETS 주석 참고).
function extractPixels(bitmap, blurPx) {
  let { width, height } = bitmap;
  if (width > MAX_DIMENSION || height > MAX_DIMENSION) {
    const scale = MAX_DIMENSION / Math.max(width, height);
    width = Math.max(1, Math.round(width * scale));
    height = Math.max(1, Math.round(height * scale));
  }
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  // 배경이 투명이 아니라 흰색으로 확실히 채워지도록 합니다(이진화 기준선이 되는 배경색).
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, width, height);
  if (blurPx > 0) ctx.filter = `blur(${blurPx}px)`;
  ctx.drawImage(bitmap, 0, 0, width, height);
  const { data } = ctx.getImageData(0, 0, width, height);
  return { pixels: data, width, height };
}

// vtracer가 만든 배경 클러스터 도형은 캔버스 모서리를 완벽히 덮지 못할 때가 있어(클러스터링
// 알고리즘이 근사한 도형이라 아주 미세하게 둥글게 남는 경우), 실제 만족 결과물 SVG처럼
// 맨 앞에 캔버스 전체를 덮는 배경 사각형을 하나 깔아 어떤 이미지에서도 빈틈이 없게 합니다.
function addBackgroundRect(svgString, width, height) {
  return svgString.replace(
    /(<svg[^>]*>)/,
    `$1<rect x="0" y="0" width="${width}" height="${height}" fill="#ffffff"/>`
  );
}

async function optimizeSvg(svgString) {
  try {
    const svgo = await loadSvgo();
    const result = svgo.optimize(svgString, { multipass: true });
    return result.data;
  } catch (err) {
    // svgo 최적화가 실패해도(네트워크 문제 등) 원본 SVG로 계속 진행합니다.
    return svgString;
  }
}

async function convert() {
  if (!state) return;

  clearConvertError();
  resultActions.hidden = true;
  resultBox.hidden = false;
  resultFrame.innerHTML = "";
  const spinner = document.createElement("div");
  spinner.className = "vc-spinner";
  spinner.setAttribute("aria-hidden", "true");
  resultFrame.appendChild(spinner);
  resultMeta.textContent = STR.convertingText;

  try {
    const mod = await loadVtracer();
    const smoothness = Number(detailRange.value);
    const { pixels, width, height } = extractPixels(state.bitmap, smoothnessToParams(smoothness).blur);
    const config = buildConfig(smoothness);

    let svg = mod.to_svg(new Uint8Array(pixels), width, height, config);
    svg = addBackgroundRect(svg, width, height);
    svg = await optimizeSvg(svg);

    if (state.resultUrl) URL.revokeObjectURL(state.resultUrl);
    const blob = new Blob([svg], { type: "image/svg+xml" });
    const resultUrl = URL.createObjectURL(blob);
    state.resultUrl = resultUrl;

    resultFrame.innerHTML = "";
    const img = document.createElement("img");
    img.src = resultUrl;
    img.alt = "";
    resultFrame.appendChild(img);

    const pathCount = (svg.match(/<path/g) || []).length;
    resultMeta.textContent = STR.svgSizeTemplate
      .replace("{size}", formatBytes(blob.size))
      .replace("{paths}", pathCount);

    downloadBtn.href = resultUrl;
    downloadBtn.download = `${baseName(state.file.name)}.svg`;
    resultActions.hidden = false;
  } catch (err) {
    resultBox.hidden = true;
    const isEngineError = !vtracerModulePromise || err?.message?.includes("fetch");
    showConvertError(isEngineError ? STR.engineLoadErrorText : STR.conversionErrorText);
  }
}

convertAnotherBtn.addEventListener("click", resetToUpload);

// input은 슬라이더를 끄는 동안 계속 발생하므로 숫자 표시만 실시간으로 갱신하고,
// 실제(비용이 드는) 재변환은 손을 뗀 시점(change)에 한 번만 실행합니다.
detailRange.addEventListener("input", () => {
  detailValue.textContent = detailRange.value;
});

detailRange.addEventListener("change", () => {
  if (state) convert();
});

chooseBtn.addEventListener("click", (e) => {
  e.stopPropagation();
  fileInput.click();
});

dropzone.addEventListener("click", () => fileInput.click());
dropzone.addEventListener("keydown", (e) => {
  if (e.key === "Enter" || e.key === " ") {
    e.preventDefault();
    fileInput.click();
  }
});

fileInput.addEventListener("change", () => {
  if (fileInput.files.length) handleFile(fileInput.files[0]);
});

["dragenter", "dragover"].forEach((eventName) => {
  dropzone.addEventListener(eventName, (e) => {
    e.preventDefault();
    e.stopPropagation();
    dropzone.classList.add("vc-dropzone-active");
  });
});

["dragleave", "drop"].forEach((eventName) => {
  dropzone.addEventListener(eventName, (e) => {
    e.preventDefault();
    e.stopPropagation();
    dropzone.classList.remove("vc-dropzone-active");
  });
});

dropzone.addEventListener("drop", (e) => {
  if (e.dataTransfer && e.dataTransfer.files.length) {
    handleFile(e.dataTransfer.files[0]);
  }
});
