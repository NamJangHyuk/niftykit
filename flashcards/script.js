// 플래시카드 도구의 핵심 로직
// 카드(질문/답변 쌍)는 localStorage에 저장해서 브라우저를 다시 열어도 그대로
// 남아있게 합니다. 학습 순서는 Fisher-Yates 셔플로 무작위 배치합니다 — 배열 뒤에서
// 앞으로 훑으면서 아직 안 뽑은 원소들 중 하나를 무작위로 골라 자리를 맞바꾸는
// 방식이라, 모든 순열이 정확히 같은 확률로 나오는 것이 수학적으로 증명된 셔플
// 알고리즘입니다(단순히 Math.random()으로 정렬 비교 함수를 만드는 방식은 순열이
// 고르게 나오지 않는다고 알려져 있어 이 방식을 씁니다).

const studySection = document.querySelector(".fc-study-section");
const progressEl = document.getElementById("fc-progress");
const cardEl = document.getElementById("fc-card");
const cardInnerEl = document.getElementById("fc-card-inner");
const questionEl = document.getElementById("fc-card-question");
const answerEl = document.getElementById("fc-card-answer");
const flipHintEl = document.getElementById("fc-flip-hint");
const prevBtn = document.getElementById("fc-prev-btn");
const nextBtn = document.getElementById("fc-next-btn");
const shuffleBtn = document.getElementById("fc-shuffle-btn");

const questionInput = document.getElementById("fc-question-input");
const answerInput = document.getElementById("fc-answer-input");
const addBtn = document.getElementById("fc-add-btn");
const errorEl = document.getElementById("fc-error");
const listHeadingEl = document.getElementById("fc-list-heading");
const emptyEl = document.getElementById("fc-empty");
const listEl = document.getElementById("fc-list");

const STORAGE_KEY = "niftykit-flashcards";
const PROGRESS_TEMPLATE = studySection.dataset.progressTemplate;
const EMPTY_STUDY_MESSAGE = studySection.dataset.emptyStudyMessage;
const DELETE_LABEL = listEl.dataset.deleteLabel;
const HEADING_TEMPLATE = listEl.dataset.headingTemplate;

function loadCards() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function saveCards(cards) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(cards));
}

function shuffle(array) {
  const result = [...array];
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}

let cards = loadCards();
let deck = shuffle(cards);
let currentIndex = 0;
let isFlipped = false;

function renderStudyCard() {
  const hasCards = deck.length > 0;
  cardEl.hidden = !hasCards;
  flipHintEl.hidden = !hasCards;
  prevBtn.disabled = !hasCards;
  nextBtn.disabled = !hasCards;
  shuffleBtn.disabled = !hasCards;

  if (!hasCards) {
    progressEl.textContent = EMPTY_STUDY_MESSAGE;
    return;
  }

  if (currentIndex >= deck.length) currentIndex = 0;
  const card = deck[currentIndex];
  questionEl.textContent = card.question;
  answerEl.textContent = card.answer;
  cardInnerEl.classList.toggle("is-flipped", isFlipped);
  progressEl.textContent = PROGRESS_TEMPLATE.replace("{current}", currentIndex + 1).replace("{total}", String(deck.length));
}

function renderManageList() {
  listHeadingEl.textContent = HEADING_TEMPLATE.replace("{count}", String(cards.length));
  emptyEl.hidden = cards.length > 0;
  listEl.innerHTML = "";

  cards.forEach((card) => {
    const item = document.createElement("div");
    item.className = "fc-list-item";

    const textEl = document.createElement("span");
    textEl.className = "fc-list-item-text";
    textEl.textContent = card.question;

    const deleteBtn = document.createElement("button");
    deleteBtn.type = "button";
    deleteBtn.className = "fc-list-item-delete";
    deleteBtn.textContent = DELETE_LABEL;
    deleteBtn.addEventListener("click", () => {
      cards = cards.filter((c) => c.id !== card.id);
      saveCards(cards);
      deck = shuffle(cards);
      currentIndex = 0;
      isFlipped = false;
      renderStudyCard();
      renderManageList();
    });

    item.appendChild(textEl);
    item.appendChild(deleteBtn);
    listEl.appendChild(item);
  });
}

function showError(kind) {
  errorEl.textContent = kind === "question" ? errorEl.dataset.questionError : errorEl.dataset.answerError;
  errorEl.hidden = false;
}

function toggleFlip() {
  if (deck.length === 0) return;
  isFlipped = !isFlipped;
  cardInnerEl.classList.toggle("is-flipped", isFlipped);
}

cardEl.addEventListener("click", toggleFlip);
cardEl.addEventListener("keydown", (e) => {
  if (e.key === "Enter" || e.key === " ") {
    e.preventDefault();
    toggleFlip();
  }
});

prevBtn.addEventListener("click", () => {
  if (deck.length === 0) return;
  currentIndex = (currentIndex - 1 + deck.length) % deck.length;
  isFlipped = false;
  renderStudyCard();
});

nextBtn.addEventListener("click", () => {
  if (deck.length === 0) return;
  currentIndex = (currentIndex + 1) % deck.length;
  isFlipped = false;
  renderStudyCard();
});

shuffleBtn.addEventListener("click", () => {
  deck = shuffle(cards);
  currentIndex = 0;
  isFlipped = false;
  renderStudyCard();
});

addBtn.addEventListener("click", () => {
  const question = questionInput.value.trim();
  const answer = answerInput.value.trim();

  if (!question) {
    showError("question");
    questionInput.focus();
    return;
  }
  if (!answer) {
    showError("answer");
    answerInput.focus();
    return;
  }

  errorEl.hidden = true;
  cards.push({ id: Date.now(), question, answer });
  saveCards(cards);
  questionInput.value = "";
  answerInput.value = "";
  questionInput.focus();

  deck = shuffle(cards);
  currentIndex = 0;
  isFlipped = false;
  renderStudyCard();
  renderManageList();
});

[questionInput, answerInput].forEach((el) => {
  el.addEventListener("keydown", (e) => {
    if (e.key === "Enter") addBtn.click();
  });
});

renderStudyCard();
renderManageList();
