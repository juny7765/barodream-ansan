#!/usr/bin/env node
/**
 * 이미지 최적화: WebP 변환 + 역할별 리사이즈 (sharp 사용)
 * -------------------------------------------------------------
 * 설치:            npm install sharp
 * 미리보기(기본):   node scripts/optimize-images.js
 *     → 변환하지 않고 대상·현재크기·예상 절감만 표로 출력
 * 실제 적용:        node scripts/optimize-images.js --apply
 *     → images/<name>.webp 생성 + 전 HTML의 <img src>를 .webp로 교체
 *     → 원본 png/jpg는 남겨둠(확인 후 git rm 로 정리 권장)
 *
 * 역할별 리사이즈 폭(원본보다 크면 확대하지 않음):
 *     히어로 class="bd-hero-hide-m"  → 1600px
 *     정의   class="bd-define-img"   →  800px
 *     그 외 참조 이미지               → 1200px
 * 제외: og-image.jpg(OG 호환), dr.kim.jpg·dr.han.jpg(injector 폴백),
 *        외부(cloudinary/http) 이미지, 이미 .webp 인 것
 */
const fs = require("fs");
const path = require("path");

const ROOT = path.resolve(__dirname, "..");
const APPLY = process.argv.includes("--apply");
const EXCLUDE = new Set(["og-image.jpg", "dr.kim.jpg", "dr.han.jpg"]);
const QUALITY = 80;
const WIDTH = { hero: 1600, define: 800, other: 1200 };

let sharp;
try {
  sharp = require("sharp");
} catch {
  console.error("❌ sharp 미설치. 먼저 실행하세요:  npm install sharp");
  process.exit(1);
}

// 1) 전 HTML에서 로컬 이미지별 역할 수집
const htmls = fs.readdirSync(ROOT).filter((f) => f.endsWith(".html"));
const role = {}; // 'images/x.png' -> 'hero' | 'define' | 'other'
const cache = {};
const rank = { hero: 3, define: 2, other: 1 };
for (const f of htmls) {
  const h = fs.readFileSync(path.join(ROOT, f), "utf-8");
  cache[f] = h;
  for (const tag of h.match(/<img [^>]*>/g) || []) {
    const m = tag.match(/src="(images\/[^"]+\.(?:png|jpe?g))"/i);
    if (!m) continue;
    const src = m[1];
    let r = "other";
    if (/bd-hero-hide-m/.test(tag) ||
        /position:absolute; inset:0; width:100%; height:100%; object-fit:cover/.test(tag)) r = "hero";
    else if (/bd-define-img/.test(tag) || /height:420px/.test(tag)) r = "define";
    if (!role[src] || rank[r] > rank[role[src]]) role[src] = r; // 우선순위 hero>define>other
  }
}

const targets = Object.keys(role).filter((src) => {
  const base = path.basename(src);
  return !EXCLUDE.has(base) && fs.existsSync(path.join(ROOT, src));
});

(async () => {
  console.log(`대상 이미지: ${targets.length}개   모드: ${APPLY ? "★ 실제 적용" : "미리보기(변환 안 함)"}\n`);
  let totIn = 0, totOut = 0;
  const rewrites = {};
  for (const src of targets.sort((a, b) => rank[role[b]] - rank[role[a]] || a.localeCompare(b))) {
    const abs = path.join(ROOT, src);
    const inSize = fs.statSync(abs).size;
    const r = role[src];
    const meta = await sharp(abs).metadata();
    const targetW = Math.min(WIDTH[r], meta.width || WIDTH[r]);
    const buf = await sharp(abs)
      .resize({ width: targetW, withoutEnlargement: true })
      .webp({ quality: QUALITY })
      .toBuffer();
    totIn += inSize;
    totOut += buf.length;
    const pct = Math.round((1 - buf.length / inSize) * 100);
    console.log(
      `  [${r.padEnd(6)}] ${src.padEnd(34)} ${String((inSize / 1024) | 0).padStart(5)}KB → ${String((buf.length / 1024) | 0).padStart(4)}KB  -${pct}%  (${meta.width}px→${targetW}px)`,
    );
    if (APPLY) {
      const webpRel = src.replace(/\.(png|jpe?g)$/i, ".webp");
      fs.writeFileSync(path.join(ROOT, webpRel), buf);
      rewrites[src] = webpRel;
    }
  }
  console.log(
    `\n합계: ${(totIn / 1048576).toFixed(1)}MB → ${(totOut / 1048576).toFixed(1)}MB  (-${Math.round((1 - totOut / totIn) * 100)}%)`,
  );

  if (!APPLY) {
    console.log("\n실제 변환하려면:  node scripts/optimize-images.js --apply");
    return;
  }
  // 2) 전 HTML의 src 를 .webp 로 교체
  let changed = 0;
  for (const f of htmls) {
    let h = cache[f];
    const o = h;
    for (const [oldSrc, newSrc] of Object.entries(rewrites)) h = h.split(oldSrc).join(newSrc);
    if (h !== o) {
      fs.writeFileSync(path.join(ROOT, f), h);
      changed++;
    }
  }
  console.log(`\nHTML ${changed}개 파일의 이미지 경로를 .webp 로 교체 완료.`);
  console.log("원본은 남아 있습니다. 사이트 확인 후 정리:");
  console.log("  git rm " + targets.join(" "));
})();
