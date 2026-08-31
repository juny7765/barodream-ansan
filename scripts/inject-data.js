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

function baCard(r) {
  const meta = [r.description, r.duration ? `치료기간 ${r.duration}` : ""].filter(Boolean).join(" · ");
  return `      <div style="border:1px solid var(--line); border-radius:6px; overflow:hidden;">
        <div style="display:grid; grid-template-columns:1fr 1fr;">
          <img src="${esc(r.before_image_url)}" alt="치료 전" style="width:100%; height:220px; object-fit:cover;">
          <img src="${esc(r.after_image_url)}" alt="치료 후" style="width:100%; height:220px; object-fit:cover;">
        </div>
        <div style="padding:28px;">
          <p style="font-size:12px; letter-spacing:0.08em; color:var(--accent); margin:0 0 10px;">${esc(r.treatment_category)}</p>
          <h3 style="font-family:'Noto Serif KR',serif; font-weight:500; font-size:19px; line-height:1.5; letter-spacing:-0.02em; color:#1A1A1A; margin:0 0 10px;">${esc(r.treatment_name)}</h3>
          <p style="font-size:14px; line-height:1.6; color:#8A8A8A; margin:0;">${esc(meta)}</p>
        </div>
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

function docProfile(d, fallbackImg) {
  const specs = (d.specialties || []).join(" · ");
  const creds = [...(d.education || []), ...(d.certifications || []), ...(d.career || [])];
  const lis = creds.map((c) => `        <li>${esc(c)}</li>`).join("\n");
  const roleSpan = d.role
    ? ` <span style="font-size:.6em; font-weight:400; color:#8A8A8A;">${esc(d.role)}</span>`
    : "";
  const img = d.profile_image_url || fallbackImg || "";
  return `  <div class="bd-dr-profile">
    <div>
      <img src="${esc(img)}" alt="${esc(d.name)} 대표원장" style="width:100%; height:400px; object-fit:cover; border-radius:6px;">
    </div>
    <div>
      <h2 style="font-family:'Noto Serif KR',serif; font-weight:600; font-size:clamp(26px,3.4vw,32px); letter-spacing:-0.02em; color:#1A1A1A; margin:0 0 6px;">${esc(d.name)}${roleSpan}</h2>
      <p style="font-size:15px; color:#8A8A8A; margin:0 0 28px;">${esc(d.title)}</p>
      <p style="font-size:13px; letter-spacing:0.14em; color:#8A8A8A; margin:0 0 8px;">담당 진료</p>
      <p style="font-family:'Noto Serif KR',serif; font-size:20px; line-height:1.5; letter-spacing:-0.02em; color:#1A1A1A; margin:0 0 22px;">${esc(specs)}</p>
      <p style="font-family:'Noto Serif KR',serif; font-weight:500; font-size:15px; letter-spacing:0.02em; color:var(--accent); margin:0 0 14px;">주요경력 및 학력</p>
      <ul class="bd-cred">
${lis}
      </ul>
    </div>
  </div>`;
}

async function injectDoctors() {
  const data = await rest("doctors?select=*&is_active=eq.true");
  if (!data || !data.length) {
    console.log("원장 데이터 없음 — doctors.html 유지");
    return;
  }
  const byName = {};
  data.forEach((d) => { byName[d.name] = d; });
  let html = fs.readFileSync("doctors.html", "utf-8");
  let changed = false;
  const map = { kim: "김진희", han: "한지상" }; // section id → 이름
  const fallbackImg = { kim: "images/dr.kim.jpg", han: "images/dr.han.jpg" };
  for (const [id, name] of Object.entries(map)) {
    const d = byName[name];
    if (!d) continue;
    const re = new RegExp(`(<section id="${id}"[^>]*>)([\\s\\S]*?)(</section>)`);
    if (!re.test(html)) continue;
    html = html.replace(re, `$1\n${docProfile(d, fallbackImg[id])}\n$3`);
    changed = true;
  }
  if (changed) {
    fs.writeFileSync("doctors.html", html);
    console.log("doctors.html 원장 프로필 반영 완료");
  } else {
    console.log("doctors.html 섹션(kim/han) 매칭 없음 — 스킵");
  }
}

async function injectBeforeAfter() {
  const data = await rest(
    "before_after?select=treatment_name,treatment_category,before_image_url,after_image_url,description,duration,display_order" +
      "&is_active=eq.true&consent_signed=eq.true&order=display_order.asc",
  );
  if (!data || !data.length) {
    console.log("전후사진(동의·활성) 없음 — cases.html 기본값 유지");
    return;
  }
  let html = fs.readFileSync("cases.html", "utf-8");
  const cards = data.map(baCard).join("\n\n");
  const out = replaceBetween(html, "<!-- BEFORE_AFTER:START[^>]*-->", "<!-- BEFORE_AFTER:END -->", cards);
  if (!out) {
    console.log("cases.html에 BEFORE_AFTER 마커 없음 — 스킵");
    return;
  }
  fs.writeFileSync("cases.html", out);
  console.log(`cases.html 전후사진 ${data.length}건 반영 완료`);
}

(async () => {
  await injectMainReviews();
  await injectBeforeAfter();
  await injectDoctors();
  // 향후: injectFaqs() 등 추가
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
