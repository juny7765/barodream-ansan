/* ============================================================
 * barodream-api.js
 * 바로드림치과 안산점 · 방문자 사이트 ↔ Supabase 실시간 연동 (패턴 A)
 *
 * 사용법(방문자 사이트 각 HTML):
 *   </body> 직전에 아래 2줄(순서 중요):
 *     <script src="js/config.js"></script>
 *     <script src="js/barodream-api.js" defer></script>
 *   - 팝업: 자동 실행(추가 마크업 불필요)
 *   - 공지 배너: <div id="bd-notice-bar"></div> 있으면 자동 렌더
 *   - 상담 폼: <form id="consultation-form"> 있으면 자동 제출 처리
 *   - 진료시간: <tbody id="bd-hours"> 있으면 자동 렌더(미입력 시 기존 마크업 유지)
 *
 * ※ 키 값은 config.js 에서 관리합니다(이 파일은 수정 불필요).
 * ============================================================ */
(function () {
  'use strict';

  var CFG = window.BARODREAM_CONFIG || {};
  var SUPABASE_URL = CFG.SUPABASE_URL || 'https://YOUR_PROJECT.supabase.co';
  var SUPABASE_ANON_KEY = CFG.SUPABASE_ANON_KEY || 'YOUR_ANON_PUBLIC_KEY';

  var READY = SUPABASE_URL.indexOf('YOUR_PROJECT') === -1; // 키 미설정 시 조용히 대기
  var HEADERS = { apikey: SUPABASE_ANON_KEY, Authorization: 'Bearer ' + SUPABASE_ANON_KEY };
  var REST = SUPABASE_URL + '/rest/v1/';

  function api(path) {
    return fetch(REST + path, { headers: HEADERS }).then(function (r) { return r.json(); });
  }
  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c];
    });
  }

  /* ── 1. 팝업 (popups 테이블) ───────────────────────────── */
  function initPopup() {
    var hideUntil = null;
    try { hideUntil = localStorage.getItem('bd_popup_hide_until'); } catch (e) {}
    if (hideUntil && new Date(hideUntil) > new Date()) return;

    var now = new Date().toISOString();
    var qs = 'popups?is_active=eq.true&end_date=gte.' + now +
             '&start_date=lte.' + now + '&order=display_order.asc&limit=1';
    api(qs).then(function (rows) {
      if (rows && rows.length) renderPopup(rows[0]);
    }).catch(function () {});
  }

  function renderPopup(p) {
    var wrap = document.createElement('div');
    wrap.setAttribute('role', 'dialog');
    wrap.style.cssText = 'position:fixed; inset:0; z-index:9999; display:flex; align-items:center;' +
      'justify-content:center; background:rgba(20,15,10,.55); padding:20px;';
    var inner = p.link_url
      ? '<a href="' + esc(p.link_url) + '" style="display:block;"><img src="' + esc(p.image_url) +
        '" alt="' + esc(p.title) + '" style="max-width:min(92vw,420px); max-height:70vh; border-radius:8px; display:block;"></a>'
      : '<img src="' + esc(p.image_url) + '" alt="' + esc(p.title) +
        '" style="max-width:min(92vw,420px); max-height:70vh; border-radius:8px; display:block;">';
    wrap.innerHTML =
      '<div style="background:#fff; border-radius:10px; overflow:hidden; box-shadow:0 20px 60px rgba(0,0,0,.3);">' +
        inner +
        '<div style="display:flex; justify-content:space-between; align-items:center; padding:10px 14px; font-family:\'Pretendard\',sans-serif; font-size:13px;">' +
          (p.show_today_hide
            ? '<button data-bd="hide" style="background:none; border:none; color:#8A8A8A; cursor:pointer; padding:6px;">오늘 하루 보지 않기</button>'
            : '<span></span>') +
          '<button data-bd="close" style="background:none; border:none; color:#1A1A1A; cursor:pointer; padding:6px; font-weight:600;">닫기 ✕</button>' +
        '</div>' +
      '</div>';
    document.body.appendChild(wrap);

    function close() { wrap.remove(); }
    wrap.addEventListener('click', function (e) {
      var act = e.target.getAttribute && e.target.getAttribute('data-bd');
      if (e.target === wrap || act === 'close') return close();
      if (act === 'hide') {
        try {
          var t = new Date(); t.setHours(24, 0, 0, 0);
          localStorage.setItem('bd_popup_hide_until', t.toISOString());
        } catch (e2) {}
        close();
      }
    });
  }

  /* ── 2. 공지 배너 (notices 테이블) ─────────────────────── */
  function initNotices() {
    var bar = document.getElementById('bd-notice-bar');
    if (!bar) return;
    var today = new Date().toISOString().slice(0, 10);
    var qs = 'notices?is_active=eq.true&is_popup=eq.true&start_date=lte.' + today +
             '&or=(end_date.gte.' + today + ',end_date.is.null)' +
             '&order=start_date.desc&limit=1';
    api(qs).then(function (rows) {
      if (!rows || !rows.length) return;
      var n = rows[0];
      bar.innerHTML =
        '<div style="background:#6B4423; color:#fff; font-family:\'Pretendard\',sans-serif;' +
        'font-size:14px; text-align:center; padding:10px 16px;">' +
        '<strong style="font-weight:600;">[' + esc(n.category) + ']</strong> ' + esc(n.title) +
        '</div>';
    }).catch(function () {});
  }

  /* ── 3. 상담 예약 폼 (consultations 테이블, INSERT) ────── */
  function initConsultForm() {
    var form = document.getElementById('consultation-form');
    if (!form) return;
    form.addEventListener('submit', function (e) {
      e.preventDefault();
      if (!READY) { alert('상담 접수 준비 중입니다. 잠시 후 다시 시도해 주세요.'); return; }
      var fd = new FormData(form);
      var payload = {
        name: fd.get('name'),
        phone: fd.get('phone'),
        treatment_type: fd.get('treatment_type') || null,
        message: fd.get('message') || null,
        agree_to_terms: fd.get('agree_to_terms') ? true : false,
        source_page: location.pathname
      };
      var btn = form.querySelector('[type="submit"]');
      if (btn) { btn.disabled = true; btn.dataset.label = btn.textContent; btn.textContent = '접수 중...'; }
      fetch(REST + 'consultations', {
        method: 'POST',
        headers: Object.assign({ 'Content-Type': 'application/json', Prefer: 'return=minimal' }, HEADERS),
        body: JSON.stringify(payload)
      }).then(function (r) {
        if (r.ok) { alert('상담 신청이 접수되었습니다. 확인 후 연락드리겠습니다.'); form.reset(); }
        else { alert('접수 중 문제가 발생했습니다. 전화로 문의해 주세요.'); }
      }).catch(function () {
        alert('접수 중 문제가 발생했습니다. 전화로 문의해 주세요.');
      }).finally(function () {
        if (btn) { btn.disabled = false; btn.textContent = btn.dataset.label || '상담 신청'; }
      });
    });
  }

  /* ── 4. 진료 시간 (clinic_hours + special_hours) ───────── */
  var DAY_ORDER = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'];
  var DAY_SHORT = { mon: '월', tue: '화', wed: '수', thu: '목', fri: '금', sat: '토', sun: '일' };
  var DAY_FULL = {
    mon: '월요일', tue: '화요일', wed: '수요일', thu: '목요일',
    fri: '금요일', sat: '토요일', sun: '일요일'
  };

  function hhmm(t) { return t ? String(t).slice(0, 5) : ''; }

  function localToday() {
    var d = new Date();
    function p(n) { return (n < 10 ? '0' : '') + n; }
    return d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate());
  }

  function initClinicHours() {
    var box = document.getElementById('bd-hours');
    if (!box) return;
    var today = localToday();
    Promise.all([
      api('clinic_hours?select=*'),
      api('special_hours?select=*&date=gte.' + today + '&order=date.asc&limit=5')
    ]).then(function (res) {
      var hours = res[0] || [];
      var specials = res[1] || [];
      // 아직 원장님 확인 전(시간 미입력)이면 기존 안내 문구를 그대로 둔다.
      var usable = hours.filter(function (h) {
        return h.is_closed === true || (h.opens && h.closes);
      });
      if (!usable.length) return;
      box.innerHTML = renderHoursRows(hours) + renderSpecialRows(specials);
    }).catch(function () {});
  }

  /** 동일한 진료시간을 가진 요일끼리 묶어 표 행을 만든다. */
  function renderHoursRows(hours) {
    var byDay = {};
    hours.forEach(function (h) { byDay[h.day_of_week] = h; });

    var groups = [];   // { sig, days[], row }
    var index = {};
    DAY_ORDER.forEach(function (d) {
      var h = byDay[d];
      if (!h) return;
      var sig = h.is_closed
        ? 'closed'
        : [hhmm(h.opens), hhmm(h.closes), hhmm(h.lunch_start), hhmm(h.lunch_end), h.note || ''].join('|');
      if (index[sig] === undefined) {
        index[sig] = groups.length;
        groups.push({ sig: sig, days: [d], row: h });
      } else {
        groups[index[sig]].days.push(d);
      }
    });

    return groups.map(function (g) {
      var label = g.days.length === 1
        ? DAY_FULL[g.days[0]]
        : g.days.map(function (d) { return DAY_SHORT[d]; }).join(' · ');
      var closed = g.row.is_closed;
      var nameStyle = closed
        ? 'padding:8px 0; color:#8A8A8A;'
        : 'padding:8px 0; color:#1A1A1A; font-weight:500;';
      var valStyle = closed
        ? 'padding:8px 0; text-align:right; color:#8A8A8A;'
        : 'padding:8px 0; text-align:right;';
      var value;
      if (closed) {
        value = '휴진';
      } else {
        value = esc(hhmm(g.row.opens)) + ' – ' + esc(hhmm(g.row.closes));
        if (g.row.lunch_start && g.row.lunch_end) {
          value += '<br><span style="font-size:13px; color:#8A8A8A;">점심 ' +
            esc(hhmm(g.row.lunch_start)) + ' – ' + esc(hhmm(g.row.lunch_end)) + '</span>';
        }
        if (g.row.note) {
          value += '<br><span style="font-size:13px; color:#8A8A8A;">' + esc(g.row.note) + '</span>';
        }
      }
      return '<tr><td style="' + nameStyle + '">' + esc(label) + '</td>' +
             '<td style="' + valStyle + '">' + value + '</td></tr>';
    }).join('');
  }

  /** 다가오는 임시 변경(휴진·단축진료)을 표 아래에 덧붙인다. */
  function renderSpecialRows(specials) {
    if (!specials || !specials.length) return '';
    var rows = specials.map(function (s) {
      var d = new Date(s.date + 'T00:00:00');
      var when = (d.getMonth() + 1) + '월 ' + d.getDate() + '일 (' +
        ['일', '월', '화', '수', '목', '금', '토'][d.getDay()] + ')';
      var what = s.is_closed ? '휴진' : esc(hhmm(s.opens)) + ' – ' + esc(hhmm(s.closes));
      if (s.reason) what += ' <span style="color:#8A8A8A;">· ' + esc(s.reason) + '</span>';
      return '<tr><td style="padding:6px 0; color:#B45309; font-weight:500;">' + esc(when) + '</td>' +
             '<td style="padding:6px 0; text-align:right; color:#B45309;">' + what + '</td></tr>';
    }).join('');
    return '<tr><td colspan="2" style="padding:14px 0 4px;">' +
           '<div style="height:1px; background:#E8E2DA;"></div>' +
           '<div style="margin-top:10px; font-size:13px; color:#8A8A8A;">임시 진료시간 안내</div>' +
           '</td></tr>' + rows;
  }

  /* ── 실행 ──────────────────────────────────────────────── */
  function boot() {
    initConsultForm();      // 폼은 키 없어도 바인딩(제출 시 안내)
    if (!READY) return;     // 키 미설정 시 조회성 기능은 대기
    initPopup();
    initNotices();
    initClinicHours();
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})();
