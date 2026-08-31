/* inject-data.js — 패턴 B: Supabase 데이터를 정적 HTML에 빌드 시 삽입
 * GitHub Actions(rebuild-site.yml)에서 실행. 의존성 없음(Node 내장 fetch 사용).
 * env: SUPABASE_URL, SUPABASE_KEY (publishable key — 공개 읽기 정책)
 */
const fs = require("fs");

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_KEY;

if (!SUPABASE_URL || !SUPABASE_KEY) {
  console.error("SUPABASE_URL / SUPABASE_KEY 환경변수가 없습니다.");
  process.exit(1);
}

async function rest(path) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
    headers: { apikey: SUPABASE_KEY, Authorization: `Bearer ${SUPABASE_KEY}` },
  });
  if (!res.ok) throw new Error(`Supabase ${res.status}: ${await res.text()}`);
  return res.json();
}

function esc(s) {
  return String(s == null ? "" : s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function reviewCard(r) {
  const badge = r.treatment_name
    ? `\n      <span style="display:inline-block; margin-top:10px; font-size:12px; color:var(--accent); border:1px solid var(--accent); border-radius:99px; padding:4px 12px;">${esc(r.treatment_name)}</span>`
    : "";
  return `    <div style="scroll-snap-align:start; flex:0 0 380px; padding:44px 40px; background:var(--bg2); border-radius:6px;">
      <span style="font-family:'Playfair Display',serif; font-size:44px; color:var(--accent); line-height:.6;">“</span>
      <p style="font-family:'Noto Serif KR',serif; font-weight:400; font-size:19px; line-height:1.7; letter-spacing:-0.01em; color:#1A1A1A; margin:14px 0 26px;">${esc(r.content)}</p>
      <p style="font-size:14px; color:#4A4A4A; margin:0;">${esc(r.patient_name)}</p>${badge}
    </div>`;
}

function replaceBetween(html, startRe, endMarker, inner) {
  const re = new RegExp(`(${startRe})([\\s\\S]*?)(${endMarker})`);
  if (!re.test(html)) return null;
  return html.replace(re, `$1\n${inner}\n    $3`);
}

async function injectMainReviews() {
  const data = await rest(
    "reviews?select=patient_name,content,treatment_name,display_order" +
      "&is_active=eq.true&is_featured=eq.true&order=display_order.asc&limit=8",
  );
  if (!data || !data.length) {
    console.log("대표리뷰(featured·active) 없음 — index.html 기본값 유지");
    return;
  }
  let html = fs.readFileSync("index.html", "utf-8");
  const cards = data.map(reviewCard).join("\n");
  const out = replaceBetween(html, "<!-- REVIEWS:START[^>]*-->", "<!-- REVIEWS:END -->", cards);
  if (!out) {
    console.log("index.html에 REVIEWS 마커 없음 — 스킵");
    return;
  }
  fs.writeFileSync("index.html", out);
  console.log(`index.html 대표리뷰 ${data.length}건 반영 완료`);
}

(async () => {
  await injectMainReviews();
  // 향후: injectBeforeAfter(), injectDoctors(), injectFaqs() 등 추가
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
