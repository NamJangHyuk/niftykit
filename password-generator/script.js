// 비밀번호 생성기 도구의 핵심 로직
// Math.random()은 암호학적으로 안전하지 않아(예측 가능한 의사난수) 비밀번호 생성에는
// 부적합합니다. 반드시 브라우저의 crypto.getRandomValues()(Web Crypto API)를 사용해
// 예측이 사실상 불가능한 진짜 무작위 값으로 비밀번호를 만듭니다. 모든 처리는
// 브라우저 안에서만 이루어지며, 생성된 비밀번호는 서버로 전송되지 않습니다.

const pwOutput = document.getElementById("pw-output");
const pwCopyBtn = document.getElementById("pw-copy-btn");
const pwStrengthFill = document.getElementById("pw-strength-fill");
const pwStrengthLabel = document.getElementById("pw-strength-label");
const pwGenerateBtn = document.getElementById("pw-generate-btn");
const pwError = document.getElementById("pw-error");
const pwLengthInput = document.getElementById("pw-length");
const pwLengthValue = document.getElementById("pw-length-value");
const pwUpper = document.getElementById("pw-upper");
const pwLower = document.getElementById("pw-lower");
const pwNumbers = document.getElementById("pw-numbers");
const pwSymbols = document.getElementById("pw-symbols");

const CHARSETS = {
  upper: "ABCDEFGHIJKLMNOPQRSTUVWXYZ",
  lower: "abcdefghijklmnopqrstuvwxyz",
  numbers: "0123456789",
  // 사람이 눈으로 구분하기 쉬운 특수문자 위주로 골랐습니다(예: 백틱이나 따옴표류처럼
  // 화면·폰트에 따라 헷갈리는 문자는 제외).
  symbols: "!@#$%^&*()_+-=[]{}|;:,.<>?",
};

let currentPassword = "";

// 브라우저의 암호학적으로 안전한 난수 생성기로 비밀번호를 만듭니다.
// randomValues[i] % charset.length는 charset 길이가 256의 약수가 아니면 아주 미세한
// 편향(modulo bias)이 생기지만, 이 정도 규모(길이 4~64)에서는 실질적인 보안 영향이
// 없는 수준이라 대부분의 브라우저 기반 비밀번호 생성기가 쓰는 방식 그대로 채택했습니다.
function generatePassword(length, charset) {
  const randomValues = new Uint32Array(length);
  crypto.getRandomValues(randomValues);
  let password = "";
  for (let i = 0; i < length; i++) {
    password += charset[randomValues[i] % charset.length];
  }
  return password;
}

function buildCharset() {
  let charset = "";
  if (pwUpper.checked) charset += CHARSETS.upper;
  if (pwLower.checked) charset += CHARSETS.lower;
  if (pwNumbers.checked) charset += CHARSETS.numbers;
  if (pwSymbols.checked) charset += CHARSETS.symbols;
  return charset;
}

// 대략적인 엔트로피(비트) = 길이 × log2(문자 종류 수). 실제 크래킹 난이도의 정확한
// 척도는 아니지만, "문자 조합이 다양할수록·길수록 강하다"는 일반적인 기준을 사용자가
// 한눈에 볼 수 있게 4단계로 단순화해서 보여주는 용도로는 충분합니다.
function calculateStrength(length, charsetSize) {
  if (charsetSize === 0) return "weak";
  const entropyBits = length * Math.log2(charsetSize);
  if (entropyBits < 40) return "weak";
  if (entropyBits < 65) return "medium";
  if (entropyBits < 90) return "strong";
  return "veryStrong";
}

const STRENGTH_WIDTH = { weak: "25%", medium: "50%", strong: "75%", veryStrong: "100%" };
const STRENGTH_COLOR_VAR = {
  weak: "var(--pw-strength-weak)",
  medium: "var(--pw-strength-medium)",
  strong: "var(--pw-strength-strong)",
  veryStrong: "var(--pw-strength-very-strong)",
};
// data-very-strong처럼 하이픈이 들어간 HTML data-* 속성은 el.dataset에서
// camelCase(veryStrong)로 접근합니다.
const STRENGTH_DATASET_KEY = { weak: "weak", medium: "medium", strong: "strong", veryStrong: "veryStrong" };

function render() {
  const length = Number(pwLengthInput.value);
  pwLengthValue.textContent = String(length);

  const charset = buildCharset();

  if (!charset) {
    pwError.hidden = false;
    pwOutput.textContent = "";
    pwCopyBtn.disabled = true;
    pwStrengthFill.style.width = "0%";
    pwStrengthLabel.textContent = "";
    currentPassword = "";
    return;
  }

  pwError.hidden = true;
  pwCopyBtn.disabled = false;
  currentPassword = generatePassword(length, charset);
  pwOutput.textContent = currentPassword;

  const strength = calculateStrength(length, charset.length);
  pwStrengthFill.style.width = STRENGTH_WIDTH[strength];
  pwStrengthFill.style.background = STRENGTH_COLOR_VAR[strength];
  pwStrengthLabel.textContent = pwStrengthLabel.dataset[STRENGTH_DATASET_KEY[strength]];
}

[pwLengthInput, pwUpper, pwLower, pwNumbers, pwSymbols].forEach((el) => {
  el.addEventListener("input", render);
  el.addEventListener("change", render);
});

pwGenerateBtn.addEventListener("click", render);

let copyResetTimer = null;
pwCopyBtn.addEventListener("click", () => {
  if (!currentPassword) return;
  navigator.clipboard.writeText(currentPassword).then(() => {
    clearTimeout(copyResetTimer);
    pwCopyBtn.textContent = pwCopyBtn.dataset.copiedLabel;
    copyResetTimer = setTimeout(() => {
      pwCopyBtn.textContent = pwCopyBtn.dataset.copyLabel;
    }, 1500);
  });
});

render();
