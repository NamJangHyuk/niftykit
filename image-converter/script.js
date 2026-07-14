// 이미지 변환기: 첨부한 이미지를 사용자가 누른 포맷 버튼에 대해서만 그 즉시
// 변환합니다(여러 포맷을 미리 한꺼번에 만들어두지 않음). 변환은 전부 Canvas API로
// 브라우저 안에서만 처리되고, 서버로는 아무것도 전송되지 않습니다.

const dropzone = document.getElementById("ic-dropzone");
const fileInput = document.getElementById("ic-file-input");
const chooseBtn = document.getElementById("ic-choose-btn");
const globalError = document.getElementById("ic-global-error");
const fileListSection = document.getElementById("ic-file-list-section");
const fileListEl = document.getElementById("ic-file-list");
const fileCountEl = document.getElementById("ic-file-count");
const clearAllBtn = document.getElementById("ic-clear-all-btn");
const scaleRange = document.getElementById("ic-scale-range");
const scaleValueEl = document.getElementById("ic-scale-value");
const qualityRange = document.getElementById("ic-quality-range");
const qualityValueEl = document.getElementById("ic-quality-value");

// 실제 캔버스 변환 자체는 순식간에 끝나지만, 사용자가 "제대로 처리되고 있다"고
// 느낄 수 있도록(그리고 광고가 노출될 시간을 확보하도록) 최소 로딩 시간을 둡니다.
const MIN_CONVERT_DELAY_MS = 2200;

const STR = {
  formatLabel: {
    png: fileListSection.dataset.formatPngLabel,
    jpg: fileListSection.dataset.formatJpgLabel,
    webp: fileListSection.dataset.formatWebpLabel,
  },
  sameFormatHint: fileListSection.dataset.sameFormatHint,
  saveBtnText: fileListSection.dataset.saveBtnText,
  removeBtnText: fileListSection.dataset.removeBtnText,
  convertingText: fileListSection.dataset.convertingText,
  sizeChangeTemplate: fileListSection.dataset.sizeChangeTemplate,
  unsupportedFileError: fileListSection.dataset.unsupportedFileError,
  decodeErrorText: fileListSection.dataset.decodeErrorText,
  fileCountTemplate: fileListSection.dataset.fileCountTemplate,
};

const FORMATS = ["png", "jpg", "webp"];
const MIME_FOR_FORMAT = { png: "image/png", jpg: "image/jpeg", webp: "image/webp" };
const MIME_TO_FORMAT = { "image/png": "png", "image/jpeg": "jpg", "image/webp": "webp" };

let nextFileId = 1;
const entries = new Map();

function formatBytes(bytes) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function baseName(filename) {
  const dot = filename.lastIndexOf(".");
  return dot > 0 ? filename.slice(0, dot) : filename;
}

function updateFileCount() {
  fileCountEl.textContent = STR.fileCountTemplate.replace("{count}", entries.size);
  fileListSection.hidden = entries.size === 0;
}

function showGlobalError(message) {
  globalError.textContent = message;
  globalError.hidden = false;
}

function clearGlobalError() {
  globalError.hidden = true;
}

function addFiles(fileList) {
  const files = Array.from(fileList);
  let hadUnsupported = false;

  for (const file of files) {
    if (!file.type.startsWith("image/")) {
      hadUnsupported = true;
      continue;
    }
    clearGlobalError();
    const id = String(nextFileId++);
    const entry = {
      id,
      file,
      originalFormat: MIME_TO_FORMAT[file.type] || null,
      bitmap: null,
      conversions: {},
      activeFormat: null,
    };
    entries.set(id, entry);
    const card = renderFileCard(entry);
    fileListEl.appendChild(card);
    loadDimensions(entry, card);
  }

  if (hadUnsupported) {
    showGlobalError(STR.unsupportedFileError);
  }

  updateFileCount();
}

function renderFileCard(entry) {
  const card = document.createElement("div");
  card.className = "ic-file-card";
  card.dataset.fileId = entry.id;

  const info = document.createElement("div");
  info.className = "ic-file-info";

  const nameEl = document.createElement("span");
  nameEl.className = "ic-file-name";
  nameEl.textContent = entry.file.name;

  const metaEl = document.createElement("span");
  metaEl.className = "ic-file-meta";
  metaEl.textContent = formatBytes(entry.file.size);

  info.appendChild(nameEl);
  info.appendChild(metaEl);

  const actions = document.createElement("div");
  actions.className = "ic-file-actions";

  for (const format of FORMATS) {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "ic-format-btn";
    btn.dataset.format = format;
    btn.textContent = STR.formatLabel[format];
    btn.setAttribute("aria-pressed", "false");
    if (entry.originalFormat === format) {
      btn.title = STR.sameFormatHint;
    }
    actions.appendChild(btn);
  }

  const removeBtn = document.createElement("button");
  removeBtn.type = "button";
  removeBtn.className = "ic-remove-btn";
  removeBtn.setAttribute("aria-label", STR.removeBtnText);
  removeBtn.textContent = "×";
  actions.appendChild(removeBtn);

  const status = document.createElement("div");
  status.className = "ic-file-status";
  status.hidden = true;

  const statusText = document.createElement("span");
  statusText.className = "ic-file-status-text";
  status.appendChild(statusText);

  card.appendChild(info);
  card.appendChild(actions);
  card.appendChild(status);
  return card;
}

// 파일을 올리자마자(포맷 버튼을 누르기 전이라도) 원본 해상도를 보여주기 위해
// 미리 디코딩해둡니다. 어차피 변환 시에도 같은 비트맵을 재사용하므로 낭비가 아닙니다.
async function loadDimensions(entry, card) {
  try {
    entry.bitmap = await createImageBitmap(entry.file);
    const metaEl = card.querySelector(".ic-file-meta");
    if (metaEl) {
      metaEl.textContent = `${formatBytes(entry.file.size)} · ${entry.bitmap.width}×${entry.bitmap.height}`;
    }
  } catch (err) {
    // 여기서 실패해도 조용히 넘어갑니다 - 실제로 포맷 버튼을 눌러 변환을 시도하면
    // 그때 동일한 디코딩이 다시 시도되고, 그 시점에 정식 에러 메시지가 표시됩니다.
  }
}

function setStatusConverting(card) {
  const status = card.querySelector(".ic-file-status");
  status.hidden = false;
  status.classList.remove("ic-status-error");
  status.innerHTML = "";
  const spinner = document.createElement("span");
  spinner.className = "ic-spinner";
  spinner.setAttribute("aria-hidden", "true");
  const text = document.createElement("span");
  text.className = "ic-file-status-text";
  text.textContent = STR.convertingText;
  status.appendChild(spinner);
  status.appendChild(text);
}

function setStatusDone(card, entry, format) {
  const status = card.querySelector(".ic-file-status");
  status.hidden = false;
  status.classList.remove("ic-status-error");
  status.innerHTML = "";

  const result = entry.conversions[format];
  const fromDim = entry.bitmap ? `${entry.bitmap.width}×${entry.bitmap.height}` : "";
  const toDim = `${result.width}×${result.height}`;
  const text = document.createElement("span");
  text.className = "ic-file-status-text";
  text.textContent = STR.sizeChangeTemplate
    .replace("{fromSize}", formatBytes(entry.file.size))
    .replace("{fromDim}", fromDim)
    .replace("{toSize}", formatBytes(result.size))
    .replace("{toDim}", toDim);
  status.appendChild(text);

  const saveBtn = document.createElement("a");
  saveBtn.className = "ic-save-btn";
  saveBtn.textContent = STR.saveBtnText;
  saveBtn.href = result.url;
  saveBtn.download = `${baseName(entry.file.name)}.${format}`;
  status.appendChild(saveBtn);
}

function setStatusError(card) {
  const status = card.querySelector(".ic-file-status");
  status.hidden = false;
  status.classList.add("ic-status-error");
  status.innerHTML = "";
  const text = document.createElement("span");
  text.className = "ic-file-status-text";
  text.textContent = STR.decodeErrorText;
  status.appendChild(text);
}

function currentScalePercent() {
  return Number(scaleRange.value);
}

function currentQualityPercent() {
  return Number(qualityRange.value);
}

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function convertFile(entry, format, card) {
  const buttons = card.querySelectorAll(".ic-format-btn");
  buttons.forEach((b) => b.setAttribute("aria-pressed", String(b.dataset.format === format)));

  setStatusConverting(card);

  try {
    if (!entry.bitmap) {
      entry.bitmap = await createImageBitmap(entry.file);
    }
    const scale = currentScalePercent() / 100;
    const outWidth = Math.max(1, Math.round(entry.bitmap.width * scale));
    const outHeight = Math.max(1, Math.round(entry.bitmap.height * scale));

    const canvas = document.createElement("canvas");
    canvas.width = outWidth;
    canvas.height = outHeight;
    const ctx = canvas.getContext("2d");
    if (format !== "png") {
      // JPG/WebP는 투명 배경을 지원하지 않아 검게 나올 수 있으므로 흰 배경을 먼저 채웁니다.
      ctx.fillStyle = "#ffffff";
      ctx.fillRect(0, 0, outWidth, outHeight);
    }
    ctx.drawImage(entry.bitmap, 0, 0, outWidth, outHeight);

    const mime = MIME_FOR_FORMAT[format];
    const quality = format === "png" ? undefined : currentQualityPercent() / 100;

    const [blob] = await Promise.all([
      new Promise((resolve, reject) => {
        canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("toBlob failed"))), mime, quality);
      }),
      delay(MIN_CONVERT_DELAY_MS),
    ]);

    const oldUrl = entry.conversions[format]?.url;
    if (oldUrl) URL.revokeObjectURL(oldUrl);

    const url = URL.createObjectURL(blob);
    entry.conversions[format] = { url, size: blob.size, width: outWidth, height: outHeight };
    setStatusDone(card, entry, format);
  } catch (err) {
    setStatusError(card);
  }
}

function removeEntry(id) {
  const entry = entries.get(id);
  if (!entry) return;
  for (const format of FORMATS) {
    const conv = entry.conversions[format];
    if (conv) URL.revokeObjectURL(conv.url);
  }
  entry.bitmap = null;
  entries.delete(id);
  const card = fileListEl.querySelector(`[data-file-id="${id}"]`);
  if (card) card.remove();
  updateFileCount();
}

function clearAll() {
  for (const id of Array.from(entries.keys())) {
    removeEntry(id);
  }
}

fileListEl.addEventListener("click", (e) => {
  const formatBtn = e.target.closest(".ic-format-btn");
  if (formatBtn) {
    const card = formatBtn.closest(".ic-file-card");
    const entry = entries.get(card.dataset.fileId);
    convertFile(entry, formatBtn.dataset.format, card);
    return;
  }
  const removeBtn = e.target.closest(".ic-remove-btn");
  if (removeBtn) {
    const card = removeBtn.closest(".ic-file-card");
    removeEntry(card.dataset.fileId);
  }
});

clearAllBtn.addEventListener("click", clearAll);

scaleRange.addEventListener("input", () => {
  scaleValueEl.textContent = `${scaleRange.value}%`;
});

qualityRange.addEventListener("input", () => {
  qualityValueEl.textContent = `${qualityRange.value}%`;
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
  if (fileInput.files.length) addFiles(fileInput.files);
  fileInput.value = "";
});

["dragenter", "dragover"].forEach((eventName) => {
  dropzone.addEventListener(eventName, (e) => {
    e.preventDefault();
    e.stopPropagation();
    dropzone.classList.add("ic-dropzone-active");
  });
});

["dragleave", "drop"].forEach((eventName) => {
  dropzone.addEventListener(eventName, (e) => {
    e.preventDefault();
    e.stopPropagation();
    dropzone.classList.remove("ic-dropzone-active");
  });
});

dropzone.addEventListener("drop", (e) => {
  if (e.dataTransfer && e.dataTransfer.files.length) {
    addFiles(e.dataTransfer.files);
  }
});

updateFileCount();
