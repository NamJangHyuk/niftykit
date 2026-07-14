// QR코드 생성기 도구의 핵심 로직
// 1) 카테고리(URL/텍스트/Wi-Fi/연락처/이메일/전화/SMS/이벤트/위치)를 선택하면 그에 맞는 입력 폼이 나타나고,
//    입력값을 각 형식의 표준 규격(WIFI:, vCard, mailto:, tel:, SMSTO:, vCalendar, geo:)으로 조립합니다.
//    이 표준 규격 문자열이 바로 QR코드의 "페이로드"이며, 스캔했을 때 카메라 앱이 보여주는 배너
//    ("Wi-Fi 연결", "연락처 추가" 등)는 이 페이로드의 형식을 보고 스캐너가 자동으로 결정하는 것이라
//    우리가 직접 문구를 지정할 수는 없습니다.
// 2) QRCode.js 라이브러리(CDN)로 즉시 렌더링하고, PNG/SVG로 다운로드할 수 있게 합니다.
// QRCode.js는 지정한 컨테이너 안에 알아서 canvas/img(또는 svg)를 그려주는 방식이라,
// 우리는 컨테이너를 비우고 새로 생성하는 식으로 미리보기를 갱신합니다.
// 값이 QR코드 용량을 초과하면 라이브러리가 동기적으로 에러를 던지는데, 이를 잡아서
// 에러 메시지를 보여줍니다. 모든 처리는 브라우저에서 즉시 끝나며 서버 통신이 전혀 없습니다.

const tabsContainer = document.getElementById("qr-category-tabs");
const categoryDescEl = document.getElementById("qr-category-desc");
const formContainer = document.getElementById("qr-form-container");
const qrPreview = document.getElementById("qr-preview");
const emptyMessage = document.getElementById("qr-empty-message");
const errorMessage = document.getElementById("qr-error-message");
const downloadPngBtn = document.getElementById("download-png");
const downloadSvgBtn = document.getElementById("download-svg");

const designToggle = document.getElementById("design-toggle");
const designPanel = document.getElementById("design-panel");
const colorDarkInput = document.getElementById("design-color-dark");
const colorLightInput = document.getElementById("design-color-light");
const contrastWarningEl = document.getElementById("design-contrast-warning");
const marginInput = document.getElementById("design-margin");
const marginValueEl = document.getElementById("design-margin-value");
const borderEnabledInput = document.getElementById("design-border-enabled");
const borderWidthInput = document.getElementById("design-border-width");
const borderWidthValueEl = document.getElementById("design-border-width-value");
const borderColorInput = document.getElementById("design-border-color");
const designResetBtn = document.getElementById("design-reset");

const logoFileLabel = document.getElementById("logo-file-label");
const logoFileInput = document.getElementById("design-logo-file");
const logoFileWarningEl = document.getElementById("logo-file-warning");
const logoPreviewRow = document.getElementById("logo-preview-row");
const logoThumbnail = document.getElementById("logo-thumbnail");
const logoRemoveBtn = document.getElementById("logo-remove-btn");
const logoPositionGrid = document.getElementById("logo-position-grid");
const logoSizeRow = document.getElementById("logo-size-row");
const logoSizeLabelEl = document.getElementById("logo-size-label");
const logoSizeInput = document.getElementById("logo-size");
const logoSizeValueEl = document.getElementById("logo-size-value");
const logoSizeWarningEl = document.getElementById("logo-size-warning");

// 미리보기는 화면에 작게, 다운로드 파일은 인쇄해도 깨지지 않도록 고해상도로 따로 생성합니다.
const PREVIEW_SIZE = 260;
const DOWNLOAD_SIZE = 1024;
// 여백/테두리 굵기/모서리 둥글기는 사용자가 항상 "다운로드 해상도(1024px) 기준" 값으로
// 입력하고, 미리보기에서는 이 배율만큼 축소해서 그립니다. 이렇게 하면 미리보기와
// 실제 다운로드 파일의 비율이 항상 정확히 일치합니다.
const PREVIEW_SCALE = PREVIEW_SIZE / DOWNLOAD_SIZE;

const pageLang = document.documentElement.lang || "ko";

// 카테고리 탭/입력 폼의 라벨은 페이지 콘텐츠(content.*.json)가 아니라 여기 고정 UI 문구 테이블에서
// 가져옵니다. 이유는 "언어 순수성" 원칙 때문입니다 — 이 라벨들은 페이지 본문이 아니라 화면 어디서나
// 반복되는 인터페이스 요소라서, 페이지 언어(pageLang)에 정확히 고정돼야 다른 언어가 섞이지 않습니다.
const UI_STRINGS = {
  ko: {
    empty: "항목을 선택하고 내용을 입력하면 QR코드가 만들어져요",
    error: "이 값은 QR코드로 만들기에 너무 깁니다. 조금 줄여서 다시 시도해 주세요.",
    logo: {
      fileLabel: "로고 이미지 추가 (PNG·JPG·SVG)",
      removeText: "로고 제거",
      invalidTypeWarning: "PNG, JPG, SVG 파일만 추가할 수 있어요.",
      sizeLabel: "로고 크기",
      sizeWarning: "로고가 너무 크면 QR코드 인식이 안 될 수 있어요. 스캔 테스트를 꼭 해보세요.",
      positions: {
        center: "중앙",
        "top-edge": "상단 (QR 안쪽)",
        "bottom-edge": "하단 (QR 안쪽)",
        "left-edge": "좌측 (QR 안쪽)",
        "right-edge": "우측 (QR 안쪽)",
      },
    },
    categories: {
      url: {
        tabLabel: "URL",
        description: "스캔하면 브라우저에서 이 웹사이트가 열립니다.",
        fields: [{ key: "value", type: "text", label: "웹사이트 주소(URL)", placeholder: "https://example.com" }],
      },
      text: {
        tabLabel: "텍스트",
        description: "스캔하면 입력한 텍스트가 그대로 화면에 표시됩니다.",
        fields: [{ key: "value", type: "textarea", label: "텍스트", placeholder: "QR코드로 표시할 텍스트를 입력하세요", rows: 4 }],
      },
      wifi: {
        tabLabel: "Wi-Fi",
        description: "스캔하면 별도 입력 없이 이 와이파이 네트워크에 자동으로 연결됩니다.",
        fields: [
          { key: "ssid", type: "text", label: "네트워크 이름(SSID)", placeholder: "예: MyHomeWiFi" },
          { key: "password", type: "text", label: "비밀번호", placeholder: "Wi-Fi 비밀번호" },
          {
            key: "encryption",
            type: "select",
            label: "보안 방식",
            options: [
              { value: "WPA", label: "WPA/WPA2" },
              { value: "WEP", label: "WEP" },
              { value: "nopass", label: "없음 (개방형)" },
            ],
          },
          { key: "hidden", type: "checkbox", label: "숨김 네트워크입니다" },
        ],
      },
      vcard: {
        tabLabel: "연락처",
        description: "스캔하면 이 사람의 정보를 새 연락처로 저장할 수 있게 연락처 앱이 열립니다.",
        fields: [
          { key: "name", type: "text", label: "이름", placeholder: "홍길동" },
          { key: "org", type: "text", label: "회사/소속", placeholder: "(선택)" },
          { key: "title", type: "text", label: "직함", placeholder: "(선택)" },
          { key: "phone", type: "tel", label: "전화번호", placeholder: "(선택)" },
          { key: "email", type: "email", label: "이메일", placeholder: "(선택)" },
          { key: "url", type: "text", label: "웹사이트", placeholder: "(선택)" },
        ],
      },
      email: {
        tabLabel: "이메일",
        description: "스캔하면 메일 앱이 열리고 받는 사람·제목·내용이 미리 채워집니다.",
        fields: [
          { key: "to", type: "email", label: "받는 사람 이메일", placeholder: "example@email.com" },
          { key: "subject", type: "text", label: "제목", placeholder: "(선택)" },
          { key: "body", type: "textarea", label: "내용", placeholder: "(선택)", rows: 3 },
        ],
      },
      tel: {
        tabLabel: "전화",
        description: "스캔하면 전화 앱이 열리고 이 번호로 바로 걸 준비가 됩니다.",
        fields: [{ key: "phone", type: "tel", label: "전화번호", placeholder: "010-1234-5678" }],
      },
      sms: {
        tabLabel: "SMS",
        description: "스캔하면 문자 앱이 열리고 이 번호와 메시지가 미리 채워집니다.",
        fields: [
          { key: "phone", type: "tel", label: "전화번호", placeholder: "010-1234-5678" },
          { key: "message", type: "textarea", label: "메시지", placeholder: "(선택)", rows: 3 },
        ],
      },
      event: {
        tabLabel: "이벤트",
        description: "스캔하면 캘린더 앱에 이 일정을 추가할 수 있게 열립니다.",
        fields: [
          { key: "title", type: "text", label: "일정 제목", placeholder: "예: 팀 회의" },
          { key: "start", type: "datetime-local", label: "시작 일시" },
          { key: "end", type: "datetime-local", label: "종료 일시 (선택)" },
          { key: "location", type: "text", label: "장소", placeholder: "(선택)" },
          { key: "description", type: "textarea", label: "설명", placeholder: "(선택)", rows: 3 },
        ],
      },
      geo: {
        tabLabel: "위치",
        description: "스캔하면 지도 앱에서 이 좌표 위치가 열립니다.",
        fields: [
          { key: "lat", type: "number", label: "위도 (Latitude)", placeholder: "예: 37.5665" },
          { key: "lng", type: "number", label: "경도 (Longitude)", placeholder: "예: 126.9780" },
        ],
      },
    },
  },
  en: {
    empty: "Fill in the fields to generate your QR code",
    error: "This value is too long to fit in a QR code. Please shorten it and try again.",
    logo: {
      fileLabel: "Add a logo image (PNG, JPG, SVG)",
      removeText: "Remove logo",
      invalidTypeWarning: "Only PNG, JPG, or SVG files can be added.",
      sizeLabel: "Logo size",
      sizeWarning: "A large logo may keep the QR code from scanning. Please test-scan it before using it.",
      positions: {
        center: "Center",
        "top-edge": "Top (inside QR)",
        "bottom-edge": "Bottom (inside QR)",
        "left-edge": "Left (inside QR)",
        "right-edge": "Right (inside QR)",
      },
    },
    categories: {
      url: {
        tabLabel: "URL",
        description: "Scanning this opens the website in a browser.",
        fields: [{ key: "value", type: "text", label: "Website URL", placeholder: "https://example.com" }],
      },
      text: {
        tabLabel: "Text",
        description: "Scanning this shows the exact text you entered.",
        fields: [{ key: "value", type: "textarea", label: "Text", placeholder: "Enter the text to show in the QR code", rows: 4 }],
      },
      wifi: {
        tabLabel: "Wi-Fi",
        description: "Scanning this connects the device to this Wi-Fi network automatically — no typing required.",
        fields: [
          { key: "ssid", type: "text", label: "Network Name (SSID)", placeholder: "e.g. MyHomeWiFi" },
          { key: "password", type: "text", label: "Password", placeholder: "Wi-Fi password" },
          {
            key: "encryption",
            type: "select",
            label: "Security type",
            options: [
              { value: "WPA", label: "WPA/WPA2" },
              { value: "WEP", label: "WEP" },
              { value: "nopass", label: "None (open)" },
            ],
          },
          { key: "hidden", type: "checkbox", label: "This is a hidden network" },
        ],
      },
      vcard: {
        tabLabel: "Contact",
        description: "Scanning this offers to save this person's info as a new contact.",
        fields: [
          { key: "name", type: "text", label: "Name", placeholder: "John Smith" },
          { key: "org", type: "text", label: "Company", placeholder: "(optional)" },
          { key: "title", type: "text", label: "Job Title", placeholder: "(optional)" },
          { key: "phone", type: "tel", label: "Phone", placeholder: "(optional)" },
          { key: "email", type: "email", label: "Email", placeholder: "(optional)" },
          { key: "url", type: "text", label: "Website", placeholder: "(optional)" },
        ],
      },
      email: {
        tabLabel: "Email",
        description: "Scanning this opens the email app with the recipient, subject, and body pre-filled.",
        fields: [
          { key: "to", type: "email", label: "Recipient Email", placeholder: "example@email.com" },
          { key: "subject", type: "text", label: "Subject", placeholder: "(optional)" },
          { key: "body", type: "textarea", label: "Message", placeholder: "(optional)", rows: 3 },
        ],
      },
      tel: {
        tabLabel: "Phone",
        description: "Scanning this opens the phone app, ready to call this number.",
        fields: [{ key: "phone", type: "tel", label: "Phone Number", placeholder: "+1 555-123-4567" }],
      },
      sms: {
        tabLabel: "SMS",
        description: "Scanning this opens the messaging app with this number and message pre-filled.",
        fields: [
          { key: "phone", type: "tel", label: "Phone Number", placeholder: "+1 555-123-4567" },
          { key: "message", type: "textarea", label: "Message", placeholder: "(optional)", rows: 3 },
        ],
      },
      event: {
        tabLabel: "Event",
        description: "Scanning this offers to add this event to a calendar app.",
        fields: [
          { key: "title", type: "text", label: "Event Title", placeholder: "e.g. Team Meeting" },
          { key: "start", type: "datetime-local", label: "Start Date & Time" },
          { key: "end", type: "datetime-local", label: "End Date & Time (optional)" },
          { key: "location", type: "text", label: "Location", placeholder: "(optional)" },
          { key: "description", type: "textarea", label: "Description", placeholder: "(optional)", rows: 3 },
        ],
      },
      geo: {
        tabLabel: "Location",
        description: "Scanning this opens this location in a map app.",
        fields: [
          { key: "lat", type: "number", label: "Latitude", placeholder: "e.g. 37.5665" },
          { key: "lng", type: "number", label: "Longitude", placeholder: "e.g. 126.9780" },
        ],
      },
    },
  },
  ja: {
    empty: "項目を選んで入力すると、QRコードが作成されます",
    error: "この値はQRコードにするには長すぎます。短くしてもう一度お試しください。",
    categories: {
      url: {
        tabLabel: "URL",
        fields: [{ key: "value", type: "text", label: "ウェブサイトURL", placeholder: "https://example.com" }],
      },
      text: {
        tabLabel: "テキスト",
        fields: [{ key: "value", type: "textarea", label: "テキスト", placeholder: "QRコードに表示するテキストを入力してください", rows: 4 }],
      },
      wifi: {
        tabLabel: "Wi-Fi",
        fields: [
          { key: "ssid", type: "text", label: "ネットワーク名(SSID)", placeholder: "例: MyHomeWiFi" },
          { key: "password", type: "text", label: "パスワード", placeholder: "Wi-Fiのパスワード" },
          {
            key: "encryption",
            type: "select",
            label: "セキュリティ方式",
            options: [
              { value: "WPA", label: "WPA/WPA2" },
              { value: "WEP", label: "WEP" },
              { value: "nopass", label: "なし (オープン)" },
            ],
          },
          { key: "hidden", type: "checkbox", label: "非公開ネットワークです" },
        ],
      },
      vcard: {
        tabLabel: "連絡先",
        fields: [
          { key: "name", type: "text", label: "名前", placeholder: "山田太郎" },
          { key: "org", type: "text", label: "会社名", placeholder: "(任意)" },
          { key: "title", type: "text", label: "役職", placeholder: "(任意)" },
          { key: "phone", type: "tel", label: "電話番号", placeholder: "(任意)" },
          { key: "email", type: "email", label: "メールアドレス", placeholder: "(任意)" },
          { key: "url", type: "text", label: "ウェブサイト", placeholder: "(任意)" },
        ],
      },
      email: {
        tabLabel: "メール",
        fields: [
          { key: "to", type: "email", label: "宛先メールアドレス", placeholder: "example@email.com" },
          { key: "subject", type: "text", label: "件名", placeholder: "(任意)" },
          { key: "body", type: "textarea", label: "本文", placeholder: "(任意)", rows: 3 },
        ],
      },
      tel: {
        tabLabel: "電話",
        fields: [{ key: "phone", type: "tel", label: "電話番号", placeholder: "090-1234-5678" }],
      },
      sms: {
        tabLabel: "SMS",
        fields: [
          { key: "phone", type: "tel", label: "電話番号", placeholder: "090-1234-5678" },
          { key: "message", type: "textarea", label: "メッセージ", placeholder: "(任意)", rows: 3 },
        ],
      },
      event: {
        tabLabel: "予定",
        fields: [
          { key: "title", type: "text", label: "予定のタイトル", placeholder: "例: チーム会議" },
          { key: "start", type: "datetime-local", label: "開始日時" },
          { key: "end", type: "datetime-local", label: "終了日時 (任意)" },
          { key: "location", type: "text", label: "場所", placeholder: "(任意)" },
          { key: "description", type: "textarea", label: "説明", placeholder: "(任意)", rows: 3 },
        ],
      },
      geo: {
        tabLabel: "位置情報",
        fields: [
          { key: "lat", type: "number", label: "緯度 (Latitude)", placeholder: "例: 37.5665" },
          { key: "lng", type: "number", label: "経度 (Longitude)", placeholder: "例: 126.9780" },
        ],
      },
    },
  },
  zh: {
    empty: "选择类型并填写内容后，将自动生成二维码",
    error: "该内容过长，无法生成二维码，请缩短后重试。",
    categories: {
      url: {
        tabLabel: "网址",
        fields: [{ key: "value", type: "text", label: "网站网址", placeholder: "https://example.com" }],
      },
      text: {
        tabLabel: "文本",
        fields: [{ key: "value", type: "textarea", label: "文本", placeholder: "请输入要在二维码中显示的文本", rows: 4 }],
      },
      wifi: {
        tabLabel: "Wi-Fi",
        fields: [
          { key: "ssid", type: "text", label: "网络名称(SSID)", placeholder: "例如: MyHomeWiFi" },
          { key: "password", type: "text", label: "密码", placeholder: "Wi-Fi密码" },
          {
            key: "encryption",
            type: "select",
            label: "加密方式",
            options: [
              { value: "WPA", label: "WPA/WPA2" },
              { value: "WEP", label: "WEP" },
              { value: "nopass", label: "无 (开放网络)" },
            ],
          },
          { key: "hidden", type: "checkbox", label: "这是隐藏网络" },
        ],
      },
      vcard: {
        tabLabel: "联系人",
        fields: [
          { key: "name", type: "text", label: "姓名", placeholder: "张三" },
          { key: "org", type: "text", label: "公司", placeholder: "(选填)" },
          { key: "title", type: "text", label: "职位", placeholder: "(选填)" },
          { key: "phone", type: "tel", label: "电话号码", placeholder: "(选填)" },
          { key: "email", type: "email", label: "邮箱", placeholder: "(选填)" },
          { key: "url", type: "text", label: "网站", placeholder: "(选填)" },
        ],
      },
      email: {
        tabLabel: "邮件",
        fields: [
          { key: "to", type: "email", label: "收件人邮箱", placeholder: "example@email.com" },
          { key: "subject", type: "text", label: "主题", placeholder: "(选填)" },
          { key: "body", type: "textarea", label: "内容", placeholder: "(选填)", rows: 3 },
        ],
      },
      tel: {
        tabLabel: "电话",
        fields: [{ key: "phone", type: "tel", label: "电话号码", placeholder: "138-1234-5678" }],
      },
      sms: {
        tabLabel: "短信",
        fields: [
          { key: "phone", type: "tel", label: "电话号码", placeholder: "138-1234-5678" },
          { key: "message", type: "textarea", label: "短信内容", placeholder: "(选填)", rows: 3 },
        ],
      },
      event: {
        tabLabel: "日程",
        fields: [
          { key: "title", type: "text", label: "日程标题", placeholder: "例如: 团队会议" },
          { key: "start", type: "datetime-local", label: "开始时间" },
          { key: "end", type: "datetime-local", label: "结束时间 (选填)" },
          { key: "location", type: "text", label: "地点", placeholder: "(选填)" },
          { key: "description", type: "textarea", label: "描述", placeholder: "(选填)", rows: 3 },
        ],
      },
      geo: {
        tabLabel: "位置",
        fields: [
          { key: "lat", type: "number", label: "纬度 (Latitude)", placeholder: "例如: 37.5665" },
          { key: "lng", type: "number", label: "经度 (Longitude)", placeholder: "例如: 126.9780" },
        ],
      },
    },
  },
};
const T = UI_STRINGS[pageLang];

emptyMessage.textContent = T.empty;
errorMessage.textContent = T.error;

const CATEGORIES = ["url", "text", "wifi", "vcard", "email", "tel", "sms", "event", "geo"];
let activeCategory = "url";
let debounceTimer = null;

// --- 디자인(색상/여백/테두리) 상태 ---
// 값은 전부 "다운로드 해상도(1024px) 기준" 픽셀 단위로 저장하고, 그리는 시점에
// 미리보기냐 다운로드냐에 따라 PREVIEW_SCALE을 곱할지 말지만 다르게 처리합니다.
// QR코드 자체가 모듈들이 직각으로 맞물린 격자라서, 감싸는 여백/테두리도 모서리를
// 둥글리지 않고 직각으로 맞춰야 시각적으로 깔끔하게 맞아떨어집니다(둥근 테두리 안에
// 각진 QR을 넣으면 모서리가 어색하게 남습니다). 그래서 모서리 둥글기 옵션 자체를
// 없애고 항상 직각으로 그립니다.
const DEFAULT_DESIGN = {
  colorDark: "#000000",
  colorLight: "#ffffff",
  margin: 64,
  borderEnabled: false,
  borderWidth: 8,
  borderColor: "#0d9488",
};
const design = Object.assign({}, DEFAULT_DESIGN);

// --- 로고 삽입 상태 ---
// logoState.file은 { img, naturalWidth, naturalHeight } 형태로, FileReader로 읽은
// data URL을 <img>에 로드해 저장합니다. png/jpg/svg 모두 <img>+data URL로 동일하게
// 다룰 수 있어서 파일 형식별 분기 없이 한 가지 방식으로 처리합니다.
const LOGO_POSITIONS = ["center", "top-edge", "bottom-edge", "left-edge", "right-edge"];
// 35%까지 허용했다가 실제로 스캔이 안 되는 걸 확인했습니다. 이론상 오류복원율 H는
// 전체의 약 30%까지 복원 가능하지만, 로고 뒤에 까는 흰 배경 패치가 로고보다 더 크고
// (사방으로 패딩이 붙음), 실제 카메라 스캔은 이론적 한계보다 여유가 적어서 훨씬
// 보수적으로 잡아야 안전합니다. 25%를 상한으로 낮췄습니다.
const DEFAULT_LOGO_SIZE_PERCENT = 20;
const LOGO_SIZE_WARNING_THRESHOLD = 22;
const logoState = {
  file: null,
  position: "center",
  sizePercent: DEFAULT_LOGO_SIZE_PERCENT,
};

// WCAG 상대 휘도 공식으로 QR 색상과 배경색의 명암비를 계산합니다. 두 색이 너무
// 비슷하면(예: 밝은 배경에 밝은 QR) 스캐너가 모듈을 구분하지 못해 QR이 아예
// 인식되지 않을 수 있어서, 그런 경우 사용자에게 미리 경고해줍니다.
function hexToRgb(hex) {
  const clean = hex.replace("#", "");
  const value = parseInt(clean, 16);
  return { r: (value >> 16) & 255, g: (value >> 8) & 255, b: value & 255 };
}

function relativeLuminance(hex) {
  const { r, g, b } = hexToRgb(hex);
  const [rl, gl, bl] = [r, g, b].map((c) => {
    const s = c / 255;
    return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
  });
  return 0.2126 * rl + 0.7152 * gl + 0.0722 * bl;
}

function contrastRatio(hexA, hexB) {
  const l1 = relativeLuminance(hexA);
  const l2 = relativeLuminance(hexB);
  const lighter = Math.max(l1, l2);
  const darker = Math.min(l1, l2);
  return (lighter + 0.05) / (darker + 0.05);
}

const CONTRAST_WARNINGS = {
  ko: "이 색상 조합은 명암 차이가 작아 QR코드가 잘 인식되지 않을 수 있어요.",
  en: "This color combination has low contrast and the QR code may not scan reliably.",
};

function updateContrastWarning() {
  const warning = CONTRAST_WARNINGS[pageLang];
  const ratio = contrastRatio(design.colorDark, design.colorLight);
  if (warning && ratio < 2.5) {
    contrastWarningEl.textContent = warning;
    contrastWarningEl.hidden = false;
  } else {
    contrastWarningEl.hidden = true;
  }
}

// 둥근 모서리 사각형 경로. border-radius가 있는 배경/테두리를 캔버스에 그릴 때 씁니다.
function roundRectPath(ctx, x, y, w, h, r) {
  const radius = Math.max(0, Math.min(r, w / 2, h / 2));
  ctx.beginPath();
  ctx.moveTo(x + radius, y);
  ctx.arcTo(x + w, y, x + w, y + h, radius);
  ctx.arcTo(x + w, y + h, x, y + h, radius);
  ctx.arcTo(x, y + h, x, y, radius);
  ctx.arcTo(x, y, x + w, y, radius);
  ctx.closePath();
}

// QRCode.js가 그린 "QR 모듈만 있는" 캔버스(qrModuleCanvas)를 받아서, 그 주위에
// 여백(배경색)과 테두리를 추가한 최종 이미지를 targetCanvas에 그립니다.
// totalSize/margin/border* 값은 모두 같은 스케일(미리보기면 미리보기 스케일,
// 다운로드면 1024px 스케일)로 맞춰서 넘겨야 합니다.
function compositeQr(targetCanvas, qrModuleCanvas, totalSize, margin, scaledDesign) {
  targetCanvas.width = totalSize;
  targetCanvas.height = totalSize;
  const ctx = targetCanvas.getContext("2d");
  ctx.clearRect(0, 0, totalSize, totalSize);

  ctx.fillStyle = design.colorLight;
  ctx.fillRect(0, 0, totalSize, totalSize);
  const qrSize = totalSize - margin * 2;
  ctx.drawImage(qrModuleCanvas, margin, margin, qrSize, qrSize);

  if (scaledDesign.borderEnabled && scaledDesign.borderWidth > 0) {
    const inset = scaledDesign.borderWidth / 2;
    ctx.lineWidth = scaledDesign.borderWidth;
    ctx.strokeStyle = design.borderColor;
    ctx.strokeRect(inset, inset, totalSize - inset * 2, totalSize - inset * 2);
  }
}

// 로고 위치별로 그릴 사각형(x, y, w, h)을 계산합니다. 5개 위치(중앙 + 상/하/좌/우) 전부
// QR 모듈 위에 직접 겹쳐 그리므로, 스캔 실패를 막기 위해 한 변 길이를
// logoState.sizePercent(기본 22%, 사용자가 슬라이더로 조절 가능)로 제한하고 흰 배경
// 패치를 깔아 주변 모듈과 분리되어 보이게 합니다. edge 4곳은 파인더 패턴(모서리
// 3곳의 큰 사각형)을 피해 각 변의 정중앙에만 배치합니다.
function computeLogoRect(position, totalSize, margin, qrSize, img) {
  const aspect = (img.naturalWidth || 1) / (img.naturalHeight || 1);

  const maxSide = qrSize * (logoState.sizePercent / 100);
  let w = maxSide;
  let h = maxSide / aspect;
  if (h > maxSide) {
    h = maxSide;
    w = maxSide * aspect;
  }

  if (position === "center") {
    return { x: margin + (qrSize - w) / 2, y: margin + (qrSize - h) / 2, w, h, needsBacking: true };
  }

  // 파인더 패턴(좌상단·우상단·좌하단 큰 사각형 3개)은 항상 모서리에만 있고 변의
  // 정중앙까지는 침범하지 않으므로, 가장자리의 "중앙"만 골라 겹치면 세 파인더
  // 패턴을 전부 피할 수 있습니다. QR 크기의 5%만 안쪽으로 들여서 배치합니다.
  const inset = qrSize * 0.05;
  if (position === "top-edge") {
    return { x: margin + (qrSize - w) / 2, y: margin + inset, w, h, needsBacking: true };
  }
  if (position === "bottom-edge") {
    return { x: margin + (qrSize - w) / 2, y: margin + qrSize - inset - h, w, h, needsBacking: true };
  }
  if (position === "left-edge") {
    return { x: margin + inset, y: margin + (qrSize - h) / 2, w, h, needsBacking: true };
  }
  // right-edge
  return { x: margin + qrSize - inset - w, y: margin + (qrSize - h) / 2, w, h, needsBacking: true };
}

// 흰 배경 패치의 패딩 비율입니다. 패치는 로고보다 사방으로 이만큼씩 더 크게 그려져서
// 실제로 QR을 가리는 면적은 로고 자체보다 항상 더 넓습니다 — 로고 크기 상한을 정할 때
// 이 패딩까지 감안해서 보수적으로 잡아야 합니다.
const LOGO_BACKING_PAD_RATIO = 0.1;

function drawLogo(ctx, position, totalSize, margin, qrSize, img) {
  const rect = computeLogoRect(position, totalSize, margin, qrSize, img);
  if (rect.needsBacking) {
    const pad = rect.w * LOGO_BACKING_PAD_RATIO;
    ctx.save();
    roundRectPath(ctx, rect.x - pad, rect.y - pad, rect.w + pad * 2, rect.h + pad * 2, pad);
    ctx.fillStyle = design.colorLight;
    ctx.fill();
    ctx.restore();
  }
  ctx.drawImage(img, rect.x, rect.y, rect.w, rect.h);
}

// SVG 다운로드용: 로고를 <image> 요소(데이터 URI)로 삽입하는 마크업을 만듭니다.
// png/jpg/svg 로고 파일 전부 이 방식 하나로 처리됩니다 — <image>는 어떤 이미지
// 형식의 데이터 URI든 그대로 참조할 수 있어서 파일 형식별로 분기할 필요가 없습니다.
function buildLogoSvgMarkup(position, totalSize, margin, qrSize, logo) {
  const rect = computeLogoRect(position, totalSize, margin, qrSize, logo.img);
  let backing = "";
  if (rect.needsBacking) {
    const pad = rect.w * LOGO_BACKING_PAD_RATIO;
    backing = `<rect x="${rect.x - pad}" y="${rect.y - pad}" width="${rect.w + pad * 2}" height="${
      rect.h + pad * 2
    }" rx="${pad}" fill="${design.colorLight}" />`;
  }
  return `${backing}<image href="${logo.dataUrl}" x="${rect.x}" y="${rect.y}" width="${rect.w}" height="${rect.h}" />`;
}

// --- 카테고리별 입력값 -> QR 페이로드(표준 규격 문자열) 변환 ---
// 여기서 만드는 문자열들은 임의로 지어낸 형식이 아니라, 실제 QR 스캐너 앱들이 인식하는
// 표준 규격(Wi-Fi: zxing 규격, 연락처: vCard 3.0, 이벤트: iCalendar VEVENT 등)을 그대로 따릅니다.

// Wi-Fi 페이로드는 ; , : \ 문자가 필드 구분자와 충돌하므로 반드시 이스케이프해야 합니다.
function escapeWifiField(value) {
  return value.replace(/([\\;,:])/g, "\\$1");
}

// <input type="datetime-local">의 값("YYYY-MM-DDTHH:MM")을 iCalendar가 요구하는
// "YYYYMMDDTHHMMSS" 형식(타임존 없는 "floating time")으로 바꿉니다.
function formatICalDateTime(localValue) {
  if (!localValue) return "";
  const [datePart, timePart] = localValue.split("T");
  if (!datePart || !timePart) return "";
  return datePart.replace(/-/g, "") + "T" + timePart.replace(":", "") + "00";
}

const CATEGORY_BUILDERS = {
  url: (v) => (v.value || "").trim(),
  text: (v) => (v.value || "").trim(),
  wifi: (v) => {
    const ssid = (v.ssid || "").trim();
    if (!ssid) return "";
    const type = v.encryption || "WPA";
    const pass = type === "nopass" ? "" : escapeWifiField((v.password || "").trim());
    return `WIFI:T:${type};S:${escapeWifiField(ssid)};P:${pass};H:${v.hidden ? "true" : "false"};;`;
  },
  vcard: (v) => {
    const name = (v.name || "").trim();
    if (!name) return "";
    const lines = ["BEGIN:VCARD", "VERSION:3.0", `FN:${name}`, `N:${name};;;;`];
    if ((v.org || "").trim()) lines.push(`ORG:${v.org.trim()}`);
    if ((v.title || "").trim()) lines.push(`TITLE:${v.title.trim()}`);
    if ((v.phone || "").trim()) lines.push(`TEL;TYPE=CELL:${v.phone.trim()}`);
    if ((v.email || "").trim()) lines.push(`EMAIL:${v.email.trim()}`);
    if ((v.url || "").trim()) lines.push(`URL:${v.url.trim()}`);
    lines.push("END:VCARD");
    return lines.join("\r\n");
  },
  email: (v) => {
    const to = (v.to || "").trim();
    if (!to) return "";
    const params = [];
    if ((v.subject || "").trim()) params.push(`subject=${encodeURIComponent(v.subject.trim())}`);
    if ((v.body || "").trim()) params.push(`body=${encodeURIComponent(v.body.trim())}`);
    return `mailto:${to}${params.length ? "?" + params.join("&") : ""}`;
  },
  tel: (v) => {
    const phone = (v.phone || "").trim();
    return phone ? `tel:${phone}` : "";
  },
  sms: (v) => {
    const phone = (v.phone || "").trim();
    if (!phone) return "";
    return `SMSTO:${phone}:${(v.message || "").trim()}`;
  },
  event: (v) => {
    const title = (v.title || "").trim();
    const start = formatICalDateTime(v.start);
    if (!title || !start) return "";
    const lines = ["BEGIN:VCALENDAR", "VERSION:2.0", "BEGIN:VEVENT", `SUMMARY:${title}`, `DTSTART:${start}`];
    const end = formatICalDateTime(v.end);
    if (end) lines.push(`DTEND:${end}`);
    if ((v.location || "").trim()) lines.push(`LOCATION:${v.location.trim()}`);
    if ((v.description || "").trim()) lines.push(`DESCRIPTION:${v.description.trim().replace(/\n/g, "\\n")}`);
    lines.push("END:VEVENT", "END:VCALENDAR");
    return lines.join("\r\n");
  },
  geo: (v) => {
    const lat = parseFloat(v.lat);
    const lng = parseFloat(v.lng);
    if (Number.isNaN(lat) || Number.isNaN(lng)) return "";
    return `geo:${lat},${lng}`;
  },
};

// 다운로드 파일명은 매번 "qr-code.png"로 똑같이 저장되면 여러 개를 받았을 때 구분이 안 되므로,
// 실제 입력 내용(도메인명, SSID, 이름 등)에서 사람이 알아볼 수 있는 힌트를 뽑아 파일명에 반영합니다.
function extractHostname(url) {
  try {
    const withScheme = /^[a-zA-Z][a-zA-Z\d+\-.]*:\/\//.test(url) ? url : `https://${url}`;
    return new URL(withScheme).hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
}

const CATEGORY_FILENAME_HINT = {
  url: (v) => extractHostname((v.value || "").trim()),
  text: (v) => (v.value || "").trim(),
  wifi: (v) => v.ssid,
  vcard: (v) => v.name,
  email: (v) => v.to,
  tel: (v) => v.phone,
  sms: (v) => v.phone,
  event: (v) => v.title,
  geo: (v) => (v.lat && v.lng ? `${v.lat},${v.lng}` : ""),
};

function slugifyForFilename(str, maxLen = 40) {
  return (str || "")
    .trim()
    .replace(/[\/\\:*?"<>|]/g, "")
    .replace(/\s+/g, "-")
    .slice(0, maxLen);
}

function buildFilename(extension) {
  const values = getActiveFieldValues();
  const hint = slugifyForFilename(CATEGORY_FILENAME_HINT[activeCategory](values));
  return `qr_${hint || activeCategory}.${extension}`;
}

// --- 카테고리 탭 + 입력 폼 렌더링 ---
function createField(category, field) {
  const wrap = document.createElement("div");
  wrap.className = field.type === "checkbox" ? "qr-field qr-field-checkbox" : "qr-field";

  const label = document.createElement("label");
  label.textContent = field.label;
  label.setAttribute("for", `qr-${category}-${field.key}`);

  let input;
  if (field.type === "textarea") {
    input = document.createElement("textarea");
    input.rows = field.rows || 3;
  } else if (field.type === "select") {
    input = document.createElement("select");
    field.options.forEach((opt) => {
      const optionEl = document.createElement("option");
      optionEl.value = opt.value;
      optionEl.textContent = opt.label;
      input.appendChild(optionEl);
    });
  } else if (field.type === "checkbox") {
    input = document.createElement("input");
    input.type = "checkbox";
  } else {
    input = document.createElement("input");
    input.type = field.type;
  }

  input.id = `qr-${category}-${field.key}`;
  input.dataset.field = field.key;
  if (field.placeholder) input.placeholder = field.placeholder;
  input.addEventListener("input", render);
  input.addEventListener("change", render);

  if (field.type === "checkbox") {
    wrap.appendChild(input);
    wrap.appendChild(label);
  } else {
    wrap.appendChild(label);
    wrap.appendChild(input);
  }
  return wrap;
}

function buildForms() {
  formContainer.innerHTML = "";
  CATEGORIES.forEach((category) => {
    const formEl = document.createElement("div");
    formEl.className = "qr-form";
    formEl.dataset.category = category;
    formEl.hidden = category !== activeCategory;
    T.categories[category].fields.forEach((field) => {
      formEl.appendChild(createField(category, field));
    });
    formContainer.appendChild(formEl);
  });
}

// 카테고리 설명은 아직 한국어/영어만 작성되어 있습니다(일본어·중국어는 번역 요청 시 추가 예정).
// 해당 언어에 설명이 없으면 빈 문구를 억지로 보여주는 대신 박스 자체를 숨겨서
// "언어 순수성" 원칙을 지키면서도(엉뚱한 언어가 섞이지 않음) 자연스럽게 처리합니다.
function updateCategoryDesc() {
  const description = T.categories[activeCategory].description;
  if (description) {
    categoryDescEl.textContent = description;
    categoryDescEl.hidden = false;
  } else {
    categoryDescEl.hidden = true;
  }
}

function buildTabs() {
  tabsContainer.innerHTML = "";
  CATEGORIES.forEach((category) => {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "qr-category-tab";
    btn.textContent = T.categories[category].tabLabel;
    btn.classList.toggle("is-active", category === activeCategory);
    btn.addEventListener("click", () => {
      if (category === activeCategory) return;
      activeCategory = category;
      tabsContainer.querySelectorAll(".qr-category-tab").forEach((b) => b.classList.remove("is-active"));
      btn.classList.add("is-active");
      formContainer.querySelectorAll(".qr-form").forEach((f) => {
        f.hidden = f.dataset.category !== category;
      });
      updateCategoryDesc();
      render();
    });
    tabsContainer.appendChild(btn);
  });
}

function getActiveFieldValues() {
  const formEl = formContainer.querySelector(`.qr-form[data-category="${activeCategory}"]`);
  const values = {};
  formEl.querySelectorAll("[data-field]").forEach((input) => {
    values[input.dataset.field] = input.type === "checkbox" ? input.checked : input.value;
  });
  return values;
}

function getQrValue() {
  return CATEGORY_BUILDERS[activeCategory](getActiveFieldValues());
}

function setDownloadEnabled(enabled) {
  downloadPngBtn.disabled = !enabled;
  downloadSvgBtn.disabled = !enabled;
}

function showEmpty() {
  qrPreview.hidden = true;
  errorMessage.hidden = true;
  emptyMessage.hidden = false;
  setDownloadEnabled(false);
}

function showError() {
  qrPreview.hidden = true;
  emptyMessage.hidden = true;
  errorMessage.hidden = false;
  setDownloadEnabled(false);
}

function showPreview() {
  qrPreview.hidden = false;
  emptyMessage.hidden = true;
  errorMessage.hidden = true;
  setDownloadEnabled(true);
}

// QRCode.js를 화면 밖(-9999px) 임시 컨테이너에 렌더링해서, 그 안에서 생성된
// "QR 모듈만 있는" raw canvas/svg를 얻습니다. 여백·테두리는 여기 포함되지 않고,
// compositeQr()이나 SVG 조립 단계에서 별도로 추가합니다.
function withOffscreenQr(value, qrSize, options, callback) {
  const hidden = document.createElement("div");
  hidden.style.position = "fixed";
  hidden.style.left = "-9999px";
  document.body.appendChild(hidden);

  try {
    new QRCode(
      hidden,
      Object.assign(
        {
          text: value,
          width: qrSize,
          height: qrSize,
          colorDark: design.colorDark,
          colorLight: design.colorLight,
          // 로고가 있으면 QR 일부가 가려지므로, 오류 복원율을 최고 단계(H, 약 30%까지
          // 복원 가능)로 올려서 로고 때문에 스캔이 안 되는 걸 방지합니다.
          correctLevel: logoState.file ? QRCode.CorrectLevel.H : QRCode.CorrectLevel.M,
        },
        options
      )
    );
    callback(hidden);
  } catch (err) {
    // 호출부에서 에러 상태를 별도로 처리하므로 여기서는 다시 던지기만 합니다.
    throw err;
  } finally {
    hidden.remove();
  }
}

function render() {
  const value = getQrValue();
  clearTimeout(debounceTimer);
  updateContrastWarning();

  if (!value) {
    showEmpty();
    return;
  }

  debounceTimer = setTimeout(() => {
    try {
      const margin = Math.round(design.margin * PREVIEW_SCALE);
      const qrSize = PREVIEW_SIZE - margin * 2;
      withOffscreenQr(value, qrSize, {}, (hidden) => {
        const qrCanvas = hidden.querySelector("canvas");
        if (!qrCanvas) throw new Error("QR canvas not generated");
        compositeQr(qrPreview, qrCanvas, PREVIEW_SIZE, margin, {
          borderEnabled: design.borderEnabled,
          borderWidth: design.borderWidth * PREVIEW_SCALE,
        });
        if (logoState.file) {
          drawLogo(qrPreview.getContext("2d"), logoState.position, PREVIEW_SIZE, margin, qrSize, logoState.file.img);
        }
      });
      showPreview();
    } catch (err) {
      showError();
    }
  }, 150);
}

function triggerDownload(href, filename) {
  const link = document.createElement("a");
  link.href = href;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
}

downloadPngBtn.addEventListener("click", () => {
  const value = getQrValue();
  if (!value) return;

  try {
    const margin = design.margin;
    const qrSize = DOWNLOAD_SIZE - margin * 2;
    withOffscreenQr(value, qrSize, {}, (hidden) => {
      // QRCode.js는 canvas에 그린 뒤 별도로 <img>에 데이터 URI를 비동기로 채워 넣는데,
      // 그 타이밍을 기다리지 않고 canvas를 직접 읽으면 즉시(동기적으로) 정확한
      // 이미지를 얻을 수 있습니다 — draw()는 생성자 안에서 이미 끝나 있습니다.
      const qrCanvas = hidden.querySelector("canvas");
      if (!qrCanvas) return;
      const finalCanvas = document.createElement("canvas");
      compositeQr(finalCanvas, qrCanvas, DOWNLOAD_SIZE, margin, {
        borderEnabled: design.borderEnabled,
        borderWidth: design.borderWidth,
      });
      if (logoState.file) {
        drawLogo(finalCanvas.getContext("2d"), logoState.position, DOWNLOAD_SIZE, margin, qrSize, logoState.file.img);
      }
      triggerDownload(finalCanvas.toDataURL("image/png"), buildFilename("png"));
    });
  } catch (err) {
    // 미리보기에서 이미 같은 값으로 에러가 표시되고 있을 것이므로 별도 알림 없이 무시합니다.
  }
});

downloadSvgBtn.addEventListener("click", () => {
  const value = getQrValue();
  if (!value) return;

  try {
    const margin = design.margin;
    const totalSize = DOWNLOAD_SIZE;
    const qrSize = totalSize - margin * 2;
    withOffscreenQr(value, qrSize, { useSVG: true }, (hidden) => {
      const svgEl = hidden.querySelector("svg");
      if (!svgEl) return;

      const innerContent = svgEl.innerHTML;

      let borderRect = "";
      if (design.borderEnabled && design.borderWidth > 0) {
        const inset = design.borderWidth / 2;
        borderRect = `<rect x="${inset}" y="${inset}" width="${totalSize - inset * 2}" height="${
          totalSize - inset * 2
        }" fill="none" stroke="${design.borderColor}" stroke-width="${design.borderWidth}" />`;
      }

      const logoMarkup = logoState.file
        ? buildLogoSvgMarkup(logoState.position, totalSize, margin, qrSize, logoState.file)
        : "";

      const svgString =
        '<?xml version="1.0" encoding="UTF-8"?>\n' +
        `<svg xmlns="http://www.w3.org/2000/svg" width="${totalSize}" height="${totalSize}" viewBox="0 0 ${totalSize} ${totalSize}">` +
        `<rect width="${totalSize}" height="${totalSize}" fill="${design.colorLight}" />` +
        `<g transform="translate(${margin},${margin})">${innerContent}</g>` +
        borderRect +
        logoMarkup +
        `</svg>`;

      const blob = new Blob([svgString], { type: "image/svg+xml" });
      const url = URL.createObjectURL(blob);
      triggerDownload(url, buildFilename("svg"));
      URL.revokeObjectURL(url);
    });
  } catch (err) {
    // 미리보기에서 이미 같은 값으로 에러가 표시되고 있을 것이므로 별도 알림 없이 무시합니다.
  }
});

// --- 디자인 패널 UI 연결 ---
function updateDesignValueLabels() {
  marginValueEl.textContent = `${design.margin}px`;
  borderWidthValueEl.textContent = `${design.borderWidth}px`;
}

function applyDesignToInputs() {
  colorDarkInput.value = design.colorDark;
  colorLightInput.value = design.colorLight;
  marginInput.value = String(design.margin);
  borderEnabledInput.checked = design.borderEnabled;
  borderWidthInput.value = String(design.borderWidth);
  borderColorInput.value = design.borderColor;
  updateDesignValueLabels();
}

designToggle.addEventListener("click", () => {
  const expanded = designToggle.getAttribute("aria-expanded") === "true";
  designToggle.setAttribute("aria-expanded", String(!expanded));
  designPanel.hidden = expanded;
});

colorDarkInput.addEventListener("input", () => {
  design.colorDark = colorDarkInput.value;
  render();
});

colorLightInput.addEventListener("input", () => {
  design.colorLight = colorLightInput.value;
  render();
});

marginInput.addEventListener("input", () => {
  design.margin = Number(marginInput.value);
  updateDesignValueLabels();
  render();
});

borderEnabledInput.addEventListener("change", () => {
  design.borderEnabled = borderEnabledInput.checked;
  render();
});

borderWidthInput.addEventListener("input", () => {
  design.borderWidth = Number(borderWidthInput.value);
  updateDesignValueLabels();
  render();
});

borderColorInput.addEventListener("input", () => {
  design.borderColor = borderColorInput.value;
  render();
});

designResetBtn.addEventListener("click", () => {
  Object.assign(design, DEFAULT_DESIGN);
  applyDesignToInputs();
  render();
});

// --- 로고 삽입 UI 연결 ---
// 로고 관련 문구는 아직 ko/en만 UI_STRINGS에 있습니다(ja/zh는 번역 요청 시 추가 예정).
// 없는 언어에서는 라벨 없는 파일 입력창만 덩그러니 보이는 것보다, 로고 섹션 자체를
// 숨기는 쪽이 자연스러워서 그렇게 처리합니다("언어 순수성" 원칙과 동일한 맥락).
function initLogoSection() {
  if (!T.logo) {
    document.querySelector(".qr-logo-section").hidden = true;
    return;
  }

  logoFileLabel.textContent = T.logo.fileLabel;
  logoRemoveBtn.textContent = T.logo.removeText;
  logoSizeLabelEl.textContent = T.logo.sizeLabel;
  logoSizeInput.value = String(logoState.sizePercent);

  logoPositionGrid.innerHTML = "";
  LOGO_POSITIONS.forEach((position) => {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "qr-logo-position-btn";
    btn.textContent = T.logo.positions[position];
    btn.classList.toggle("is-active", position === logoState.position);
    btn.addEventListener("click", () => {
      logoState.position = position;
      logoPositionGrid.querySelectorAll(".qr-logo-position-btn").forEach((b) => b.classList.remove("is-active"));
      btn.classList.add("is-active");
      render();
    });
    logoPositionGrid.appendChild(btn);
  });
}

function updateLogoSizeLabel() {
  logoSizeValueEl.textContent = `${logoState.sizePercent}%`;
  if (T.logo && logoState.sizePercent >= LOGO_SIZE_WARNING_THRESHOLD) {
    logoSizeWarningEl.textContent = T.logo.sizeWarning;
    logoSizeWarningEl.hidden = false;
  } else {
    logoSizeWarningEl.hidden = true;
  }
}

function showLogoUploaded() {
  logoThumbnail.src = logoState.file.dataUrl;
  logoPreviewRow.hidden = false;
  logoPositionGrid.hidden = false;
  logoSizeRow.hidden = false;
  logoFileWarningEl.hidden = true;
  updateLogoSizeLabel();
}

function clearLogo() {
  logoState.file = null;
  logoFileInput.value = "";
  logoPreviewRow.hidden = true;
  logoPositionGrid.hidden = true;
  logoSizeRow.hidden = true;
  logoSizeWarningEl.hidden = true;
}

const LOGO_ALLOWED_TYPES = ["image/png", "image/jpeg", "image/svg+xml"];

// 파일 입력창(클릭해서 선택)과 드래그앤드롭 둘 다 결국 File 객체 하나를 받는 건
// 동일해서, 실제 검증·로드 로직은 이 함수 하나로 공유합니다.
function handleLogoFile(file) {
  if (!file) return;

  if (!LOGO_ALLOWED_TYPES.includes(file.type)) {
    logoFileWarningEl.textContent = T.logo ? T.logo.invalidTypeWarning : "";
    logoFileWarningEl.hidden = !T.logo;
    logoFileInput.value = "";
    return;
  }

  const reader = new FileReader();
  reader.onload = () => {
    const dataUrl = reader.result;
    const img = new Image();
    img.onload = () => {
      logoState.file = { img, dataUrl };
      showLogoUploaded();
      render();
    };
    img.onerror = () => {
      logoFileWarningEl.textContent = T.logo ? T.logo.invalidTypeWarning : "";
      logoFileWarningEl.hidden = !T.logo;
      logoFileInput.value = "";
    };
    img.src = dataUrl;
  };
  reader.readAsDataURL(file);
}

logoFileInput.addEventListener("change", () => {
  handleLogoFile(logoFileInput.files && logoFileInput.files[0]);
});

// 드래그앤드롭: 로고 섹션 전체를 드롭 영역으로 씁니다. dragover에서 매번
// preventDefault()를 해줘야 브라우저가 파일을 새 탭으로 여는 기본 동작 대신
// drop 이벤트를 실제로 발생시켜 줍니다.
const logoDropZone = document.querySelector(".qr-logo-section");

["dragenter", "dragover"].forEach((eventName) => {
  logoDropZone.addEventListener(eventName, (e) => {
    e.preventDefault();
    e.stopPropagation();
    logoDropZone.classList.add("is-drag-over");
  });
});

["dragleave", "drop"].forEach((eventName) => {
  logoDropZone.addEventListener(eventName, (e) => {
    e.preventDefault();
    e.stopPropagation();
    logoDropZone.classList.remove("is-drag-over");
  });
});

logoDropZone.addEventListener("drop", (e) => {
  const file = e.dataTransfer.files && e.dataTransfer.files[0];
  handleLogoFile(file);
});

logoRemoveBtn.addEventListener("click", () => {
  clearLogo();
  render();
});

logoSizeInput.addEventListener("input", () => {
  logoState.sizePercent = Number(logoSizeInput.value);
  updateLogoSizeLabel();
  render();
});

initLogoSection();
buildTabs();
buildForms();
updateCategoryDesc();
applyDesignToInputs();
showEmpty();
