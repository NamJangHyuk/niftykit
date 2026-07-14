// 가마 적재 개수 계산기(Kiln Loading Calculator)의 핵심 로직
// 실제 가마 적재는 3단계로 이뤄집니다.
// 1) 분판 1장 위에 도자기를 몇 개 배치할 수 있는지(2D 격자 배치): 분판 가장자리
//    여백을 뺀 "사용 가능한 면적"을 (도자기 크기+간격) 셀 크기로 나눠서 가로·세로
//    각각 몇 개가 들어가는지 구하고, 그 둘을 곱합니다.
// 2) 가마 바닥 한 층에 분판을 몇 장 나란히 놓을 수 있는지(2D 격자 배치): 가마
//    내부 가로·세로를 분판 가로·세로로 나눕니다. 가마가 분판보다 크면 한 층에
//    여러 장의 분판이 들어갑니다.
// 3) 가마 안에 이런 층을 몇 개나 쌓을 수 있는지(1D 계산): 도자기 높이+분판
//    두께+기둥 높이(층 사이 간격)를 한 "층"의 높이로 보고, 가마 높이를 그
//    층높이로 나눕니다.
// 최종 개수는 (분판 1장당 개수) × (층당 분판 수) × (층수)입니다.

const kilnWidthInput = document.getElementById("kl-kiln-width");
const kilnDepthInput = document.getElementById("kl-kiln-depth");
const kilnHeightInput = document.getElementById("kl-kiln-height");
const shelfWidthInput = document.getElementById("kl-shelf-width");
const shelfDepthInput = document.getElementById("kl-shelf-depth");
const shelfThicknessInput = document.getElementById("kl-shelf-thickness");

const shapeRoundRadio = document.getElementById("kl-shape-round");
const shapeSquareRadio = document.getElementById("kl-shape-square");
const shapeRectRadio = document.getElementById("kl-shape-rect");
const roundFieldsEl = document.getElementById("kl-round-fields");
const squareFieldsEl = document.getElementById("kl-square-fields");
const rectFieldsEl = document.getElementById("kl-rect-fields");
const pieceDiameterInput = document.getElementById("kl-piece-diameter");
const pieceSideInput = document.getElementById("kl-piece-side");
const pieceWidthInput = document.getElementById("kl-piece-width");
const pieceDepthInput = document.getElementById("kl-piece-depth");
const pieceHeightInput = document.getElementById("kl-piece-height");

const gapInput = document.getElementById("kl-gap");
const marginInput = document.getElementById("kl-margin");
const clearanceInput = document.getElementById("kl-clearance");

const errorEl = document.getElementById("kl-error");

const resultSection = document.querySelector(".kl-result-section");
const UNIT_LABEL = document.querySelector(".kl-unit").textContent;
const BOARDS_PER_LAYER_TEMPLATE = resultSection.dataset.boardsPerLayerTemplate;
const GRID_TEMPLATE = resultSection.dataset.gridTemplate;
const SHELVES_UNIT = resultSection.dataset.shelvesUnit;
const TOTAL_BOARDS_UNIT = resultSection.dataset.totalBoardsUnit;
const TOTAL_UNIT = resultSection.dataset.totalUnit;
const KILN_SIZE_TEMPLATE = resultSection.dataset.kilnSizeTemplate;
const SHELF_SIZE_TEMPLATE = resultSection.dataset.shelfSizeTemplate;
const PIECE_ROUND_TEMPLATE = resultSection.dataset.pieceRoundTemplate;
const PIECE_SQUARE_TEMPLATE = resultSection.dataset.pieceSquareTemplate;
const PIECE_RECT_TEMPLATE = resultSection.dataset.pieceRectTemplate;
const HEIGHT_TEMPLATE = resultSection.dataset.heightTemplate;
const BOARDS_PER_LAYER_CAPTION = resultSection.dataset.boardsPerLayerCaption;

const boardsPerLayerEl = document.getElementById("kl-result-boards-per-layer");
const perShelfEl = document.getElementById("kl-result-per-shelf");
const shelvesEl = document.getElementById("kl-result-shelves");
const totalBoardsEl = document.getElementById("kl-result-total-boards");
const totalEl = document.getElementById("kl-result-total");

const diagramsEl = document.getElementById("kl-diagrams");
const topKilnRect = document.getElementById("kl-top-kiln");
const topBoardsGroup = document.getElementById("kl-top-boards");
const topKilnLabel = document.getElementById("kl-top-kiln-label");
const topShelfLabel = document.getElementById("kl-top-shelf-label");
const topPieceLabel = document.getElementById("kl-top-piece-label");

const sideKilnRect = document.getElementById("kl-side-kiln");
const sideLayersGroup = document.getElementById("kl-side-layers");
const sideHeightLabel = document.getElementById("kl-side-height-label");
const sideBoardsLabel = document.getElementById("kl-side-boards-label");

function formatNumber(value) {
  return parseFloat(value.toFixed(2)).toString();
}

function readPositive(input) {
  const raw = input.value.trim();
  if (!raw) return null;
  const value = Number(raw);
  return Number.isFinite(value) && value > 0 ? value : NaN;
}

function readNonNegative(input) {
  const raw = input.value.trim();
  if (!raw) return null;
  const value = Number(raw);
  return Number.isFinite(value) && value >= 0 ? value : NaN;
}

// "round" | "square" | "rect" — 원형은 지름 하나, 정사각형은 한 변 하나,
// 직사각형은 가로·세로 두 값을 입력받습니다.
function currentShape() {
  if (shapeRoundRadio.checked) return "round";
  if (shapeSquareRadio.checked) return "square";
  return "rect";
}

function syncShapeFields() {
  const shape = currentShape();
  roundFieldsEl.hidden = shape !== "round";
  squareFieldsEl.hidden = shape !== "square";
  rectFieldsEl.hidden = shape !== "rect";
}

[shapeRoundRadio, shapeSquareRadio, shapeRectRadio].forEach((radio) => {
  radio.addEventListener("change", () => {
    syncShapeFields();
    update();
  });
});

function setText(el, x, y, text) {
  el.setAttribute("x", x);
  el.setAttribute("y", y);
  el.textContent = text;
}

// 가마 바닥(위에서 본 모습)에 분판이 몇 장, 어떻게 배치되는지 보여줍니다. 분판마다
// 그 위에 실제로 놓이는 도자기 격자까지 그려서, "층 하나에 분판이 몇 장 들어가고
// 분판 한 장에 도자기가 몇 개 들어가는지"를 한 그림에서 바로 확인할 수 있게 합니다.
function drawTopView(kilnWidth, kilnDepth, shelfWidth, shelfDepth, boardsX, boardsY, marginCm, cellW, cellD, countX, countY, pieceShape, pieceSizeW, pieceSizeD) {
  const viewSize = 240;
  const margin = 16;
  const labelSpace = 62;
  const available = viewSize - margin * 2 - labelSpace;
  const scale = available / Math.max(kilnWidth, kilnDepth);

  const drawKilnW = kilnWidth * scale;
  const drawKilnD = kilnDepth * scale;
  const originX = (viewSize - drawKilnW) / 2;
  const originY = margin;

  topKilnRect.setAttribute("x", originX);
  topKilnRect.setAttribute("y", originY);
  topKilnRect.setAttribute("width", drawKilnW);
  topKilnRect.setAttribute("height", drawKilnD);

  topBoardsGroup.innerHTML = "";

  const boardWPx = shelfWidth * scale;
  const boardDPx = shelfDepth * scale;
  const boardGap = 3; // 분판 사이 여백은 실제 치수가 아니라 그림을 구분해 보기 위한 장식용 간격입니다.
  const boardsAreaW = boardsX * boardWPx + (boardsX - 1) * boardGap;
  const boardsAreaD = boardsY * boardDPx + (boardsY - 1) * boardGap;
  const boardsStartX = originX + (drawKilnW - boardsAreaW) / 2;
  const boardsStartY = originY + (drawKilnD - boardsAreaD) / 2;

  const marginPx = marginCm * scale;
  const cellWPx = cellW * scale;
  const cellDPx = cellD * scale;

  for (let by = 0; by < boardsY; by++) {
    for (let bx = 0; bx < boardsX; bx++) {
      const boardX = boardsStartX + bx * (boardWPx + boardGap);
      const boardY = boardsStartY + by * (boardDPx + boardGap);

      const boardRect = document.createElementNS("http://www.w3.org/2000/svg", "rect");
      boardRect.setAttribute("x", boardX);
      boardRect.setAttribute("y", boardY);
      boardRect.setAttribute("width", boardWPx);
      boardRect.setAttribute("height", boardDPx);
      boardRect.setAttribute("class", "kl-board-outline");
      topBoardsGroup.appendChild(boardRect);

      const gridW = countX * cellWPx;
      const gridD = countY * cellDPx;
      const startX = boardX + marginPx + (boardWPx - marginPx * 2 - gridW) / 2;
      const startY = boardY + marginPx + (boardDPx - marginPx * 2 - gridD) / 2;

      for (let row = 0; row < countY; row++) {
        for (let col = 0; col < countX; col++) {
          const cx = startX + col * cellWPx + cellWPx / 2;
          const cy = startY + row * cellDPx + cellDPx / 2;
          let pieceEl;
          if (pieceShape === "round") {
            pieceEl = document.createElementNS("http://www.w3.org/2000/svg", "circle");
            pieceEl.setAttribute("cx", cx);
            pieceEl.setAttribute("cy", cy);
            pieceEl.setAttribute("r", Math.min(cellWPx, cellDPx) * 0.4);
          } else {
            const w = cellWPx * 0.8;
            const h = cellDPx * 0.8;
            pieceEl = document.createElementNS("http://www.w3.org/2000/svg", "rect");
            pieceEl.setAttribute("x", cx - w / 2);
            pieceEl.setAttribute("y", cy - h / 2);
            pieceEl.setAttribute("width", w);
            pieceEl.setAttribute("height", h);
          }
          pieceEl.setAttribute("class", "kl-piece-shape");
          topBoardsGroup.appendChild(pieceEl);
        }
      }
    }
  }

  const labelY = originY + drawKilnD + 26;
  setText(topKilnLabel, viewSize / 2, labelY, KILN_SIZE_TEMPLATE.replace("{w}", formatNumber(kilnWidth)).replace("{d}", formatNumber(kilnDepth)));
  setText(topShelfLabel, viewSize / 2, labelY + 26, SHELF_SIZE_TEMPLATE.replace("{w}", formatNumber(shelfWidth)).replace("{d}", formatNumber(shelfDepth)));
  const pieceText =
    pieceShape === "round"
      ? PIECE_ROUND_TEMPLATE.replace("{d}", formatNumber(pieceSizeW))
      : pieceShape === "square"
        ? PIECE_SQUARE_TEMPLATE.replace("{s}", formatNumber(pieceSizeW))
        : PIECE_RECT_TEMPLATE.replace("{w}", formatNumber(pieceSizeW)).replace("{d}", formatNumber(pieceSizeD));
  setText(topPieceLabel, viewSize / 2, labelY + 52, pieceText);
}

// 가마를 옆에서 본 모습입니다. 층마다 분판을 옆으로 나란히 놓은 만큼(boardsX장)
// 블록을 잘라서 그려, "이 층에 분판이 몇 장 들어있는지"를 옆면에서도 알 수 있게
// 합니다. 층과 층 사이의 빈틈은 기둥이 차지하는 높이(사용자가 입력한 층 사이
// 간격)를 그대로 반영합니다.
function drawSideView(kilnWidth, kilnHeight, layerHeight, numLayers, shelfThickness, boardsPerLayerX) {
  const viewWidth = 180;
  const viewHeight = 260;
  const marginTop = 16;
  const marginBottom = 44;
  const sideMargin = 20;
  const availableW = viewWidth - sideMargin * 2;
  const availableH = viewHeight - marginTop - marginBottom;
  const scale = Math.min(availableW / kilnWidth, availableH / kilnHeight);

  const drawHeight = kilnHeight * scale;
  const drawWidth = kilnWidth * scale;
  const originX = (viewWidth - drawWidth) / 2;
  const originY = marginTop;

  sideKilnRect.setAttribute("x", originX);
  sideKilnRect.setAttribute("y", originY);
  sideKilnRect.setAttribute("width", drawWidth);
  sideKilnRect.setAttribute("height", drawHeight);

  sideLayersGroup.innerHTML = "";
  const layerHeightPx = layerHeight * scale;
  const shelfThicknessPx = Math.max(shelfThickness * scale, 1.5);
  const segGap = 2;
  const segWidth = (drawWidth - segGap * (boardsPerLayerX - 1)) / boardsPerLayerX;

  for (let i = 0; i < numLayers; i++) {
    const shelfY = originY + drawHeight - i * layerHeightPx - shelfThicknessPx;
    for (let j = 0; j < boardsPerLayerX; j++) {
      const segX = originX + j * (segWidth + segGap);
      const seg = document.createElementNS("http://www.w3.org/2000/svg", "rect");
      seg.setAttribute("x", segX);
      seg.setAttribute("y", shelfY);
      seg.setAttribute("width", segWidth);
      seg.setAttribute("height", shelfThicknessPx);
      seg.setAttribute("class", "kl-shelf-line");
      sideLayersGroup.appendChild(seg);
    }
  }

  const labelY = originY + drawHeight + 20;
  setText(sideHeightLabel, viewWidth / 2, labelY, HEIGHT_TEMPLATE.replace("{h}", formatNumber(kilnHeight)));
  setText(sideBoardsLabel, viewWidth / 2, labelY + 19, BOARDS_PER_LAYER_CAPTION.replace("{count}", boardsPerLayerX));
}

function clearResults() {
  boardsPerLayerEl.textContent = "–";
  perShelfEl.textContent = "–";
  shelvesEl.textContent = "–";
  totalBoardsEl.textContent = "–";
  totalEl.textContent = "–";
  diagramsEl.hidden = true;
}

function update() {
  const kilnWidth = readPositive(kilnWidthInput);
  const kilnDepth = readPositive(kilnDepthInput);
  const kilnHeight = readPositive(kilnHeightInput);
  const shelfWidth = readPositive(shelfWidthInput);
  const shelfDepth = readPositive(shelfDepthInput);
  const shelfThickness = readPositive(shelfThicknessInput);
  const pieceHeight = readPositive(pieceHeightInput);
  const gap = readNonNegative(gapInput);
  const margin = readNonNegative(marginInput);
  const clearance = readNonNegative(clearanceInput);

  const shape = currentShape();
  const diameter = shape === "round" ? readPositive(pieceDiameterInput) : null;
  const side = shape === "square" ? readPositive(pieceSideInput) : null;
  const pieceWidth = shape === "rect" ? readPositive(pieceWidthInput) : null;
  const pieceDepth = shape === "rect" ? readPositive(pieceDepthInput) : null;

  const shapeValues = shape === "round" ? [diameter] : shape === "square" ? [side] : [pieceWidth, pieceDepth];
  const values = [kilnWidth, kilnDepth, kilnHeight, shelfWidth, shelfDepth, shelfThickness, pieceHeight, gap, margin, clearance, ...shapeValues];

  if (values.some((v) => Number.isNaN(v))) {
    errorEl.textContent = errorEl.dataset.invalidInputError;
    errorEl.hidden = false;
    clearResults();
    return;
  }

  if (values.some((v) => v === null)) {
    errorEl.hidden = true;
    clearResults();
    return;
  }

  if (shelfWidth > kilnWidth || shelfDepth > kilnDepth) {
    errorEl.textContent = errorEl.dataset.shelfTooBigError;
    errorEl.hidden = false;
    clearResults();
    return;
  }

  // 층 하나에 분판을 몇 장 나란히 놓을 수 있는지(가마 바닥 전체를 채우는 배치)
  const boardsPerLayerX = Math.floor(kilnWidth / shelfWidth);
  const boardsPerLayerY = Math.floor(kilnDepth / shelfDepth);
  const boardsPerLayer = boardsPerLayerX * boardsPerLayerY;

  const usableWidth = shelfWidth - 2 * margin;
  const usableDepth = shelfDepth - 2 * margin;

  const pieceSizeW = shape === "round" ? diameter : shape === "square" ? side : pieceWidth;
  const pieceSizeD = shape === "round" ? diameter : shape === "square" ? side : pieceDepth;
  const cellW = pieceSizeW + gap;
  const cellD = pieceSizeD + gap;

  const countX = usableWidth > 0 ? Math.floor(usableWidth / cellW) : 0;
  const countY = usableDepth > 0 ? Math.floor(usableDepth / cellD) : 0;
  const piecesPerBoard = countX * countY;

  if (piecesPerBoard < 1) {
    errorEl.textContent = errorEl.dataset.noFitError;
    errorEl.hidden = false;
    clearResults();
    return;
  }

  const layerHeight = pieceHeight + shelfThickness + clearance;
  const numLayers = Math.floor(kilnHeight / layerHeight);

  if (numLayers < 1) {
    errorEl.textContent = errorEl.dataset.kilnTooShortError;
    errorEl.hidden = false;
    clearResults();
    return;
  }

  errorEl.hidden = true;

  const totalBoards = boardsPerLayer * numLayers;
  const piecesPerLayer = boardsPerLayer * piecesPerBoard;
  const totalPieces = piecesPerLayer * numLayers;

  boardsPerLayerEl.textContent = BOARDS_PER_LAYER_TEMPLATE.replace("{x}", boardsPerLayerX).replace("{y}", boardsPerLayerY).replace("{total}", boardsPerLayer);
  perShelfEl.textContent = GRID_TEMPLATE.replace("{x}", countX).replace("{y}", countY).replace("{total}", piecesPerBoard);
  shelvesEl.textContent = `${numLayers} ${SHELVES_UNIT}`;
  totalBoardsEl.textContent = `${totalBoards} ${TOTAL_BOARDS_UNIT}`;
  totalEl.textContent = `${totalPieces} ${TOTAL_UNIT}`;

  diagramsEl.hidden = false;
  drawTopView(kilnWidth, kilnDepth, shelfWidth, shelfDepth, boardsPerLayerX, boardsPerLayerY, margin, cellW, cellD, countX, countY, shape, pieceSizeW, pieceSizeD);
  drawSideView(kilnWidth, kilnHeight, layerHeight, numLayers, shelfThickness, boardsPerLayerX);
}

[
  kilnWidthInput,
  kilnDepthInput,
  kilnHeightInput,
  shelfWidthInput,
  shelfDepthInput,
  shelfThicknessInput,
  pieceDiameterInput,
  pieceSideInput,
  pieceWidthInput,
  pieceDepthInput,
  pieceHeightInput,
  gapInput,
  marginInput,
  clearanceInput,
].forEach((el) => el.addEventListener("input", update));

update();
