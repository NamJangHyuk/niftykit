// 빌드 시점(build-time)에만 실행하는 스크립트입니다.
// emojibase-data(한/영/일/중 이모지 이름·키워드)와 Noto Emoji SVG를 미리 받아서
// 정적 파일로 저장해두면, 실제 사용자가 사이트를 방문했을 때는 외부 API 호출 없이
// 즉시 검색/복사/다운로드할 수 있습니다.
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

const LOCALES = ["en", "ko", "ja", "zh"];

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const THUMB_DIR = path.join(ROOT, "emoji-thumb"); // 화면 그리드용 (작게, 96px)
const PNG_DIR = path.join(ROOT, "emoji-png"); // 다운로드용 (512px)
const SVG_DIR = path.join(ROOT, "emoji-svg"); // 다운로드용 (벡터)
const OUTPUT_JSON = path.join(ROOT, "emojis.json");

async function fileExists(p) {
  try {
    await fs.access(p);
    return true;
  } catch {
    return false;
  }
}

async function loadLocaleData(locale) {
  const dataPath = path.join(__dirname, "node_modules/emojibase-data", locale, "data.json");
  const messagesPath = path.join(__dirname, "node_modules/emojibase-data", locale, "messages.json");
  const [data, messages] = await Promise.all([
    fs.readFile(dataPath, "utf8").then(JSON.parse),
    fs.readFile(messagesPath, "utf8").then(JSON.parse),
  ]);
  return { data, messages };
}

// noto-emoji 저장소의 SVG 파일명 규칙: emoji_u{코드포인트1}_{코드포인트2}...svg (소문자, 밑줄로 연결)
// emojibase의 hexcode는 "1F468-200D-1F469"처럼 대문자+하이픈이라 변환이 필요합니다.
function hexcodeToNotoFilename(hexcode) {
  // noto-emoji는 "FE0F"(변형 선택자-16, 그림 표시를 강제하는 코드포인트) 없이 파일명을
  // 짓습니다. 이걸 안 지우면 존재하는 파일도 404로 못 찾습니다.
  const stripped = hexcode.replace(/-?FE0F-?/g, "-").replace(/^-|-$/g, "");
  return `emoji_u${stripped.toLowerCase().replace(/-/g, "_")}.svg`;
}

async function main() {
  await fs.mkdir(THUMB_DIR, { recursive: true });
  await fs.mkdir(PNG_DIR, { recursive: true });
  await fs.mkdir(SVG_DIR, { recursive: true });

  const locales = {};
  for (const locale of LOCALES) {
    locales[locale] = await loadLocaleData(locale);
  }

  // 그룹(대분류, 10개: smileys-emotion, people-body, ...) 라벨을 언어별로 모읍니다.
  const groups = locales.en.messages.groups.map((g) => ({
    key: g.key,
    order: g.order,
    names: Object.fromEntries(LOCALES.map((l) => [l, locales[l].messages.groups[g.order].message])),
  }));

  // 서브그룹(소분류, 101개: face-smiling, sport, skin-tone, ...) 라벨도 함께 모아서
  // 이모지 그리드를 "얼굴", "스포츠", "피부색"처럼 세부 제목으로 나눠 보여줄 때 씁니다.
  const subgroups = locales.en.messages.subgroups.map((s) => ({
    key: s.key,
    order: s.order,
    names: Object.fromEntries(LOCALES.map((l) => [l, locales[l].messages.subgroups[s.order].message])),
  }));

  // en 로케일을 기준으로 이모지 목록을 순회합니다 (모든 로케일이 같은 hexcode 집합을 가짐).
  // group/order가 없는 항목(지역 지표 알파벳 등, 국기 조합용 부품)은 독립된 이모지가 아니라서 제외합니다.
  const baseList = locales.en.data.filter((e) => e.group !== undefined && e.order !== undefined);

  const byHexcode = {};
  for (const locale of LOCALES) {
    byHexcode[locale] = new Map(locales[locale].data.map((e) => [e.hexcode, e]));
  }

  const results = [];
  let done = 0;

  for (const base of baseList) {
    const { hexcode, emoji, group, subgroup, order } = base;

    const names = {};
    const searchTermSet = new Set();
    for (const locale of LOCALES) {
      const entry = byHexcode[locale].get(hexcode);
      const label = entry?.label || base.label;
      names[locale] = label;
      searchTermSet.add(label);
      for (const tag of entry?.tags || []) searchTermSet.add(tag);
    }

    const notoFile = hexcodeToNotoFilename(hexcode);
    const notoUrl = `https://raw.githubusercontent.com/googlefonts/noto-emoji/main/svg/${notoFile}`;
    const thumbDest = path.join(THUMB_DIR, `${hexcode}.png`);
    const pngDest = path.join(PNG_DIR, `${hexcode}.png`);
    const svgDest = path.join(SVG_DIR, `${hexcode}.svg`);

    let hasImage = await fileExists(thumbDest);

    if (!hasImage) {
      try {
        const res = await fetch(notoUrl);
        if (res.ok) {
          const svgText = await res.text();
          await fs.writeFile(svgDest, svgText);

          const svgBuf = Buffer.from(svgText);
          await sharp(svgBuf).resize(96, 96).png().toFile(thumbDest);
          await sharp(svgBuf).resize(512, 512).png().toFile(pngDest);
          hasImage = true;
        } else {
          console.warn(`  ↳ 이미지 없음: ${hexcode} (${base.label}) status ${res.status}`);
        }
      } catch (err) {
        console.warn(`  ↳ 이미지 실패: ${hexcode} (${base.label}): ${err.message}`);
      }
    }

    results.push({
      hexcode,
      emoji,
      group,
      subgroup,
      order,
      names,
      searchTerms: [...searchTermSet],
      hasImage,
    });

    done += 1;
    if (done % 200 === 0) console.log(`${done}/${baseList.length} 완료...`);
  }

  results.sort((a, b) => a.group - b.group || a.order - b.order);

  await fs.writeFile(OUTPUT_JSON, JSON.stringify({ groups, subgroups, emojis: results }, null, 2));
  console.log(`\n완료: 이모지 ${results.length}개, emojis.json 저장됨`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
