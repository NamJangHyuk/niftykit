// content.*.json이나 template.html을 저장할 때마다 자동으로 build-i18n.mjs를 다시
// 실행해주는 watch 스크립트입니다. 새 npm 패키지 설치 없이 Node 내장 fs.watch만
// 사용합니다. 실행: node scripts/watch-i18n.mjs (Ctrl+C로 종료)

import { watch } from "node:fs";
import { spawn } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");

// 콘텐츠/템플릿 파일이 있는 폴더만 감시합니다(생성된 ko/en/ja/zh 출력 폴더는 감시 대상이 아님).
const WATCH_DIRS = ["", "flag-master", "emoji-search", "special-char", "privacy", "about"].map(
  (dir) => path.join(ROOT, dir)
);

function shouldTrigger(filename) {
  if (!filename) return false;
  return /^content\.[a-z]+\.json$/.test(filename) || filename === "template.html";
}

let building = false;
let pending = false;

function runBuild() {
  if (building) {
    pending = true;
    return;
  }
  building = true;
  console.log("\n🔨 빌드 중...");
  const proc = spawn("node", [path.join(ROOT, "scripts", "build-i18n.mjs")], {
    stdio: "inherit",
  });
  proc.on("exit", (code) => {
    building = false;
    console.log(code === 0 ? "✅ 빌드 완료\n" : "❌ 빌드 실패\n");
    if (pending) {
      pending = false;
      runBuild();
    }
  });
}

console.log("👀 content.*.json / template.html 변경을 감지하면 자동으로 빌드합니다. (Ctrl+C로 종료)");
runBuild();

for (const dir of WATCH_DIRS) {
  watch(dir, (eventType, filename) => {
    if (shouldTrigger(filename)) {
      console.log(`변경 감지: ${path.relative(ROOT, dir) || "."}/${filename}`);
      runBuild();
    }
  });
}
