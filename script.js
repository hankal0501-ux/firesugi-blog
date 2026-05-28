// ===== TAB SYSTEM =====
function showTab(tabName) {
  // 관리자 전용 탭 가드 (접속상황판만)
  if (tabName === 'dashboard' && !isAdmin()) {
    alert('🔒 관리자 전용 페이지입니다.');
    return;
  }
  document.querySelectorAll('.tab-page').forEach(p => p.classList.remove('active'));
  document.querySelectorAll('nav a').forEach(a => a.classList.remove('active'));
  const tab = document.getElementById('tab-' + tabName);
  if (tab) { tab.classList.add('active'); window.scrollTo(0, 0); }
  const navLink = document.querySelector(`nav a[data-tab="${tabName}"]`);
  if (navLink) navLink.classList.add('active');
  // Reset program detail on tab switch + 동적 렌더
  if (tabName === 'programs') { hideProgramDetail(); renderPrograms(); }
  if (tabName === 'records') { showTab('programs'); return; }  // 개발중 → AI 프로그램으로 통합 리다이렉트
  if (tabName === 'home') renderHomeBoard();
  if (tabName === 'dashboard') renderDashboard();
  if (tabName === 'laws') renderLaws();
  if (tabName === 'tech') renderTech();
  if (tabName === 'forms') renderForms();
  if (tabName === 'news') { renderNews(); renderBlogRefs(); }
  if (tabName === 'members-info') { renderMyArea(); renderMembers(); }
}

// ===== INIT =====
document.addEventListener('DOMContentLoaded', () => {
  // Header scroll
  window.addEventListener('scroll', () => {
    document.querySelector('header').classList.toggle('scrolled', window.scrollY > 50);
  });
  // Mobile nav
  const toggle = document.querySelector('.nav-toggle');
  const nav = document.querySelector('nav');
  if (toggle) {
    toggle.addEventListener('click', () => {
      const isOpen = nav.classList.toggle('open');
      toggle.classList.toggle('is-open', isOpen);
      toggle.textContent = isOpen ? '✕' : '☰';
    });
    document.querySelectorAll('nav a').forEach(a => a.addEventListener('click', () => {
      nav.classList.remove('open');
      toggle.classList.remove('is-open');
      toggle.textContent = '☰';
    }));
  }
  // Particles & Stats
  createParticles();
  initStats();
  // 사용자 추가 프로그램 로드 (programData에 머지)
  loadUserPrograms();
  // Board
  renderBoard();
  renderHomeBoard();
  // Reveal animations
  initReveal();
  // Back to Top
  initBackToTop();
  // 카테고리 탭 바인딩 (KFMA 스타일 게시판)
  bindCategoryTabs();
  // 일일 뉴스 자동수집 (로컬 풀 - 백업)
  autoAddDailyNews();
  // 원격 news.json 페치 (GitHub Actions 자동수집 결과)
  fetchRemoteNews();
  // 자동 글쓰기 — 일일 1회 (클라이언트 폴백)
  autoWriteDailyIfDue();
  // 원격 board-auto.json 페치 (GitHub Actions cron 결과)
  fetchRemoteBoardPosts();
});

// ===== REMOTE BOARD AUTO POSTS (GitHub Actions cron) =====
async function fetchRemoteBoardPosts() {
  try {
    const res = await fetch('board-auto.json?t=' + Date.now(), { cache: 'no-store' });
    if (!res.ok) return;
    const remote = await res.json();
    if (!Array.isArray(remote) || !remote.length) return;

    const local = getPosts();
    const localIds = new Set(local.map(p => String(p.id)));
    const localTitles = new Set(local.map(p => p.title));

    const newOnes = remote.filter(r =>
      !localIds.has(String(r.id)) && !localTitles.has(r.title)
    );
    if (!newOnes.length) return;

    const merged = [...newOnes, ...local];
    savePosts(merged);
    console.log(`📝 원격 게시판 자동글 ${newOnes.length}건 동기화 (전체 ${merged.length}건)`);
    if (typeof renderBoard === 'function' && document.getElementById('tab-board')) {
      renderBoard();
      renderHomeBoard();
    }
  } catch (e) {
    console.log('ℹ️  board-auto.json 페치 스킵:', e.message);
  }
}

// ===== REMOTE NEWS FETCH (GitHub Actions 결과 가져오기) =====
async function fetchRemoteNews() {
  try {
    // 캐시 무효화를 위해 timestamp 쿼리
    const res = await fetch('news.json?t=' + Date.now(), { cache: 'no-store' });
    if (!res.ok) return;
    const remote = await res.json();
    if (!Array.isArray(remote) || !remote.length) return;

    const local = getNews();
    const localUrls = new Set(local.map(n => n.url).filter(Boolean));
    const localTitles = new Set(local.map(n => n.title));

    const newOnes = remote.filter(r =>
      r.url && !localUrls.has(r.url) && !localTitles.has(r.title)
    );
    if (!newOnes.length) return;

    // 기존 isNew 해제 → 신규만 NEW
    local.forEach(n => { n.isNew = false; });
    const merged = [...newOnes.map(n => ({ ...n, isNew: true })), ...local].slice(0, 200);
    saveNews(merged);

    console.log(`🤖 원격에서 신규 뉴스 ${newOnes.length}건 동기화`);
    if (typeof renderNews === 'function' &&
        document.getElementById('tab-news')?.classList.contains('active')) {
      renderNews();
    }
  } catch (e) {
    // file:// 로 열거나 news.json 없으면 조용히 무시
    console.log('ℹ️  원격 뉴스 동기화 스킵:', e.message);
  }
}

// ===== PARTICLES =====
function createParticles() {
  const hero = document.querySelector('.hero');
  if (!hero) return;
  const colors = ['#ff6b35','#e63946','#ffba08','#f77f00'];
  for (let i = 0; i < 20; i++) {
    const p = document.createElement('div');
    p.classList.add('particle');
    const size = Math.random() * 4 + 2;
    p.style.cssText = `width:${size}px;height:${size}px;left:${Math.random()*100}%;bottom:-10px;background:${colors[Math.floor(Math.random()*colors.length)]};animation-duration:${Math.random()*6+4}s;animation-delay:${Math.random()*6}s;`;
    hero.appendChild(p);
  }
}

// ===== STATS =====
function getStatValue(key) {
  switch (key) {
    case 'programs':
      // 숨겨진 프로그램 제외한 실제 프로그램 수
      const hidden = (typeof getHiddenPrograms === 'function') ? getHiddenPrograms() : [];
      return Object.keys(programData).filter(k => !hidden.includes(k)).length;
    case 'laws':
      // 주요 법령(lawData) + 관계법령(relatedLawData) 합산
      const main = (typeof lawData !== 'undefined') ? lawData.length : 0;
      const related = (typeof relatedLawData !== 'undefined') ? relatedLawData.length : 0;
      return main + related;
    case 'posts':
      // 게시판 글 수
      return (typeof getPosts === 'function') ? getPosts().length : 0;
    default:
      return 0;
  }
}

function initStats() {
  const els = document.querySelectorAll('.stat-number');
  // data-key 기반으로 실제 값을 data-target에 반영
  els.forEach(el => {
    const key = el.dataset.key;
    if (key) {
      const val = getStatValue(key);
      el.dataset.target = String(val);
    }
  });
  const obs = new IntersectionObserver(entries => {
    entries.forEach(e => { if (e.isIntersecting) { animateNum(e.target); obs.unobserve(e.target); } });
  }, { threshold: 0.5 });
  els.forEach(el => obs.observe(el));
}
function animateNum(el) {
  const end = parseInt(el.dataset.target), suffix = el.dataset.suffix || '';
  const start = performance.now();
  (function update(now) {
    const p = Math.min((now - start) / 2000, 1);
    el.textContent = Math.floor(end * (1 - Math.pow(1 - p, 3))) + suffix;
    if (p < 1) requestAnimationFrame(update);
  })(start);
}

// ===== BOARD SYSTEM =====
let currentPostId = null;
let boardSearchQuery = '';
let boardDisplayCount = 5; // Initial number of posts to show

function getPosts() { return JSON.parse(localStorage.getItem('fireSugiBoardPosts') || '[]'); }
function savePosts(posts) {
  localStorage.setItem('fireSugiBoardPosts', JSON.stringify(posts));
  // 변경 시에만 push (자동 인터벌과 별도)
  if (typeof fbPushAllPosts === 'function') fbPushAllPosts(posts).catch(() => {});
}

function renderBoard() {
  const admin = isAdmin();
  const allPosts = getPosts().sort((a, b) => b.id - a.id);
  // 비공개 글: 일반인도 목록(제목·닉네임)은 보임. 내용은 viewPost 에서 차단
  const visiblePosts = allPosts;
  const filteredPosts = visiblePosts.filter(p =>
    p.title.toLowerCase().includes(boardSearchQuery.toLowerCase()) ||
    p.author.toLowerCase().includes(boardSearchQuery.toLowerCase()) ||
    // 비공개 글은 내용 검색에서 제외 (관리자만)
    ((p.visibility !== 'private' && !p.secret) || admin) &&
      p.content.toLowerCase().includes(boardSearchQuery.toLowerCase())
  );

  const tbody = document.getElementById('boardBody');
  const empty = document.getElementById('boardEmpty');
  const table = document.getElementById('boardTable');
  const pagination = document.getElementById('boardPagination');

  document.getElementById('boardCount').textContent = filteredPosts.length;

  if (!filteredPosts.length) {
    table.style.display = 'none';
    empty.style.display = 'block';
    pagination.style.display = 'none';
    return;
  }

  table.style.display = 'table';
  empty.style.display = 'none';

  const displayPosts = filteredPosts.slice(0, boardDisplayCount);
  pagination.style.display = filteredPosts.length > boardDisplayCount ? 'block' : 'none';

  tbody.innerHTML = displayPosts.map((post) => {
    const isPrivate = post.visibility === 'private' || post.secret;
    const hasPw = !!post.viewPwHash;
    const isBot = post.author === BOT_AUTHOR || post.autoWritten;
    let icon = '';
    if (isPrivate) icon = '<span class="secret-icon">🔒</span>';
    else if (hasPw) icon = '<span class="secret-icon" title="비번 보호">🔑</span>';
    const titleHtml = icon + esc(post.title);
    const authorHtml = `${esc(post.author)}${isBot ? ' <span class="bot-tag">🤖</span>' : ''}`;
    return `<tr onclick="viewPost(${post.id})">
      <td class="col-no" style="text-align:center;">${allPosts.indexOf(post) + 1}</td>
      <td class="col-title td-title">${titleHtml}</td>
      <td class="col-author">${authorHtml}</td>
      <td class="col-date" style="color:var(--text-secondary);font-size:0.85rem;">${post.date}</td>
      <td class="col-views" style="text-align:center;">${post.views || 0}</td>
    </tr>`;
  }).join('');
}

// 홈 화면 — 최근 게시판 글 5건 위젯
function renderHomeBoard() {
  const host = document.getElementById('homeBoardList');
  if (!host) return;
  const admin = isAdmin();
  // 비공개 글: 일반인도 제목·닉네임은 보임. 내용은 viewPost 에서 차단
  const allRecent = getPosts().sort((a, b) => b.id - a.id);
  const posts = allRecent.slice(0, 5);
  const me = getCurrentUser();
  if (!posts.length) {
    host.innerHTML = `
      <div class="home-board-empty">
        📭 아직 게시글이 없습니다.
        <button class="btn btn-primary btn-sm" style="margin-top:12px;" onclick="showTab('board'); setTimeout(()=>toggleWriteForm(), 100);">✏️ 첫 글 쓰기</button>
      </div>`;
    return;
  }
  host.innerHTML = posts.map(p => {
    // 제목·닉네임은 항상 보임. 내용은 viewPost 에서 차단
    const isPrivate = (p.visibility === 'private' || p.secret);
    const lockIcon = isPrivate ? '<span class="hb-lock">🔒</span> ' : '';
    const title = lockIcon + esc(p.title);
    const isBot = p.author === 'FireSugi-Bot' || p.autoWritten;
    const onclickAction = `showTab('board'); setTimeout(()=>viewPost(${p.id}), 80);`;
    return `
      <div class="hb-item" onclick="${onclickAction}">
        <div class="hb-title">${title}${isBot ? ' <span class="hb-tag-bot">🤖 AUTO</span>' : ''}</div>
        <div class="hb-meta">
          <span class="hb-author">${esc(p.author)}</span>
          <span class="hb-date">${p.date}</span>
          <span class="hb-views">👁 ${p.views || 0}</span>
          ${(p.comments || []).length ? `<span class="hb-comments">💬 ${p.comments.length}</span>` : ''}
        </div>
      </div>`;
  }).join('');
}

function searchBoard() {
  boardSearchQuery = document.getElementById('boardSearchInput').value.trim();
  boardDisplayCount = 5; // Reset count on search
  renderBoard();
}

function loadMorePosts() {
  boardDisplayCount += 5;
  renderBoard();
}

function toggleWriteForm() {
  // 누구나 작성 가능 — 인증 제거
  const f = document.getElementById('writeForm');
  f.style.display = f.style.display === 'none' ? 'block' : 'none';
}

// 게시판 요청 양식 자동 채우기 — 이름·이메일·주소·요청글 템플릿
function insertPostTemplate() {
  const ta = document.getElementById('postContent');
  if (!ta) return;
  const template =
    '이름: \n' +
    '이메일: \n' +
    '주소(시·동): \n' +
    '요청글: \n';
  if (ta.value && !confirm('현재 입력된 내용을 양식으로 덮어쓰시겠습니까?')) return;
  ta.value = template;
  ta.focus();
  // 첫 줄 '이름: ' 다음으로 커서 이동
  ta.setSelectionRange(4, 4);
  // 비공개 자동 권장 (개인정보 보호)
  const priv = document.getElementById('visPrivate');
  if (priv) priv.checked = true;
}
window.insertPostTemplate = insertPostTemplate;

async function submitPost() {
  const title = document.getElementById('postTitle').value.trim();
  const content = document.getElementById('postContent').value.trim();
  if (!title || !content) { alert('제목과 내용을 입력하세요.'); return; }

  // 공개/비공개 (라디오)
  const visEl = document.querySelector('input[name="postVisibility"]:checked');
  const visibility = visEl ? visEl.value : 'public';

  // 글 비번 (선택) — SHA-256 으로 해시 저장
  const pwEl = document.getElementById('postPw');
  const pwRaw = (pwEl && pwEl.value) || '';
  let viewPwHash = null;
  if (pwRaw) {
    try { viewPwHash = await sha256(pwRaw); } catch (e) { console.warn('hash err:', e); }
  }

  // 닉네임
  const nickEl = document.getElementById('postAuthor');
  let author = (nickEl && nickEl.value.trim()) || '';
  if (!author) {
    const tail = Math.floor(Math.random() * 9000 + 1000);
    author = `익명_${tail}`;
  }

  const posts = getPosts();
  const now = new Date();
  const date = `${now.getFullYear()}.${String(now.getMonth()+1).padStart(2,'0')}.${String(now.getDate()).padStart(2,'0')}`;
  posts.push({
    id: Date.now(),
    author, title, content, date,
    views: 0,
    visibility,        // 'public' | 'private'
    viewPwHash,        // 글 열람 비번 (옵션)
    secret: visibility === 'private',  // 하위 호환
    comments: []
  });
  savePosts(posts);
  logActivity(`글작성(${visibility}): ${title.slice(0, 30)}`, author);

  document.getElementById('postTitle').value = '';
  document.getElementById('postContent').value = '';
  if (pwEl) pwEl.value = '';
  if (nickEl) nickEl.value = '';
  document.getElementById('visPublic').checked = true;
  toggleWriteForm();
  renderBoard();
  renderHomeBoard();
}

async function viewPost(id) {
  const posts = getPosts();
  const post = posts.find(p => p.id === id);
  if (!post) return;
  const admin = isAdmin();

  // 비공개 글은 관리자만 (이론상 도달 못 함, 안전 차단)
  if ((post.visibility === 'private' || post.secret) && !admin) {
    alert('🔒 비공개 글은 관리자만 열람할 수 있습니다.');
    return;
  }

  // 글 비번 보호 — 세션당 1회 인증 캐시
  if (post.viewPwHash && !admin) {
    const cacheKey = 'postPwOK_' + id;
    if (sessionStorage.getItem(cacheKey) !== '1') {
      const pw = prompt(`🔑 "${post.title}" — 글 비밀번호:`);
      if (pw === null) return;
      let inputHash = '';
      try { inputHash = await sha256(pw); } catch (e) {}
      if (inputHash !== post.viewPwHash) {
        alert('❌ 비밀번호가 일치하지 않습니다.');
        return;
      }
      sessionStorage.setItem(cacheKey, '1');
    }
  }

  post.views = (post.views || 0) + 1;
  savePosts(posts); renderBoard();
  currentPostId = id;
  document.getElementById('modalTitle').textContent = post.title;
  document.getElementById('modalAuthor').textContent = '✍️ ' + post.author;
  document.getElementById('modalDate').textContent = '📅 ' + post.date;
  document.getElementById('modalViews').textContent = '👁️ 조회 ' + post.views;
  document.getElementById('modalBody').textContent = post.content;
  let cat = '자유게시판';
  if (post.visibility === 'private' || post.secret) cat = '🔒 비공개';
  else if (post.viewPwHash) cat = '🔑 비번 보호';
  document.getElementById('modalCategory').textContent = cat;
  renderComments(post);
  document.getElementById('postModal').style.display = 'flex';
  document.body.style.overflow = 'hidden';
}

function closePostModal() {
  document.getElementById('postModal').style.display = 'none';
  document.body.style.overflow = '';
  currentPostId = null;
}

async function deletePost() {
  if (!currentPostId) return;
  // 관리자만 삭제 가능 — 비번 prompt
  if (!(await checkDeletePassword())) return;
  if (!confirm('이 글을 삭제하시겠습니까?')) return;
  const deletedId = currentPostId;
  const posts = getPosts();
  savePosts(posts.filter(p => p.id !== currentPostId));
  if (typeof fbDeletePost === 'function') fbDeletePost(deletedId).catch(() => {});
  closePostModal(); renderBoard();
}

// ===== COMMENTS =====
function renderComments(post) {
  const list = document.getElementById('commentsList');
  const comments = post.comments || [];
  list.innerHTML = comments.length
    ? comments.map(c => `<div class="comment-item"><div class="comment-header"><span class="comment-author">👤 ${esc(c.author)}</span><span class="comment-date">${c.date}</span></div><div class="comment-text">${esc(c.text)}</div></div>`).join('')
    : '<p style="color:var(--text-secondary);font-size:0.85rem;text-align:center;padding:16px;">아직 댓글이 없습니다.</p>';
}

function submitComment() {
  const input = document.getElementById('commentInput');
  const text = input.value.trim();
  if (!text) return;
  // 댓글 작성자: 닉네임 필드가 있으면 그 값, 없으면 익명
  const nickEl = document.getElementById('commentAuthor');
  let author = (nickEl && nickEl.value.trim()) || '';
  if (!author) {
    const tail = Math.floor(Math.random() * 9000 + 1000);
    author = `익명_${tail}`;
  }
  const posts = getPosts();
  const post = posts.find(p => p.id === currentPostId);
  if (!post) return;
  if (!post.comments) post.comments = [];
  const now = new Date();
  const date = `${now.getFullYear()}.${String(now.getMonth()+1).padStart(2,'0')}.${String(now.getDate()).padStart(2,'0')} ${String(now.getHours()).padStart(2,'0')}:${String(now.getMinutes()).padStart(2,'0')}`;
  post.comments.push({ author, text, date });
  savePosts(posts);
  input.value = '';
  if (nickEl) nickEl.value = '';
  renderComments(post);
}

// ===== PROGRAM DETAIL =====
const programData = {
  nftc: {
    icon: '📖', name: '화재안전기준 공부하기 (NFTC 학습카드)', tag: '교육',
    desc: 'NFPC/NFTC 화재안전기준을 플래시카드 형태로 학습하는 프로그램입니다. 비밀번호 보호로 회원만 접근 가능하며, 한 번 입력하면 같은 기기에서 다시 묻지 않습니다. 6단계 암기 평가와 반복 학습 기능으로 효율적인 시험 대비가 가능합니다.',
    features: [
      { title: '📇 플래시카드 학습', desc: 'NFTC 101~501 전 기준 조문을 카드 형태로 제시. 좌측 ☰ 메뉴에서 학습할 기준 선택.' },
      { title: '🎨 6단계 평가', desc: '모른다 · 중요 · 기억 · 메모 · 무시 · 안다 — 하단 컬러 버튼으로 카드별 암기 상태 평가 후 반복 학습.' },
      { title: '🏠 PWA 설치', desc: '"홈 화면에 추가" 안내에서 [설치] 클릭 시 앱처럼 홈 화면 실행 + 비밀번호도 기억해 즉시 접속.' }
    ],
    howto: [
      '1. 접속 후 비밀번호("nftc2026") 입력 → 상단 셀렉터 또는 좌측 ☰ 메뉴에서 학습할 NFTC 기준 선택.',
      '2. 플래시카드 조문을 읽고 하단 6단계 컬러 버튼으로 평가: ❌ 모른다 / ⭐ 중요 / ✓ 기억 / 📝 메모 / 🚫 무시 / ✅ 안다.',
      '3. "모른다·중요"로 분류한 카드 반복 학습. 자주 쓸 경우 "홈 화면에 추가" 안내의 [설치]를 누르면 앱처럼 사용 가능.'
    ],
    link: 'https://nftc-cards.vercel.app',
    version: 'NFTC 2026 · PWA 지원',
    platform: '브라우저 (PC·모바일) · 홈 화면 설치 가능',
    screenshots: [
      { url: 'https://image.thum.io/get/width/800/https://nftc-cards.vercel.app',
        caption: '① NFTC 학습카드 메인 화면 — 비밀번호 입력 후 플래시카드 학습' },
      { url: 'https://image.thum.io/get/width/400/viewportWidth/400/https://nftc-cards.vercel.app',
        caption: '② 모바일 뷰 — 6단계 평가 버튼 + PWA 설치 안내' }
    ]
  },
  recorder: {
    icon: '🎙️', name: '녹음 기록기 (Voice Memo)', tag: '음성·사진 기록',
    desc: '점검 현장에서 음성 녹음, 사진 첨부, 표 형식 메모 작성, 카카오톡 공유까지 한 번에 처리하는 모바일 최적화 도구입니다. 별도 설치 없이 브라우저에서 바로 사용할 수 있습니다.',
    features: [
      { title: '🎤 원버튼 음성 녹음', desc: '화면 상단의 🎤 버튼으로 즉시 녹음 시작/정지. 녹음 파일이 메모와 함께 저장됩니다.' },
      { title: '📊 표 형식 + 사진 첨부', desc: '행·열을 추가해 점검 기록을 표로 정리하고, 📷 카메라 또는 🖼 사진첩에서 현장 사진을 직접 첨부.' },
      { title: '💾 폴더 저장 + 💬 카톡 공유', desc: '기기의 원하는 폴더에 저장 후, 카카오톡으로 팀·고객에게 현장에서 즉시 공유.' }
    ],
    howto: [
      '1. 🆕 새 메모 → 행·열 추가로 표 구조 생성 후 🎤 음성 녹음 + 📷 카메라/🖼 사진첩으로 현장 사진 첨부.',
      '2. 각 셀에 점검 결과를 직접 입력하거나 음성으로 받아쓰기, 💾 저장 버튼으로 파일명·폴더 지정해 보관.',
      '3. 💬 카카오톡 공유로 팀에 즉시 전송 또는 📥 기기에 저장으로 PC 동기화.'
    ],
    link: 'https://hankal0501-ux.github.io/voice-memo/',
    version: 'ver.P8462',
    platform: '모바일·데스크탑 (브라우저)',
    screenshots: [
      { url: 'https://image.thum.io/get/width/800/crop/600/https://hankal0501-ux.github.io/voice-memo/',
        caption: '메인 화면 — 표 형식 메모 작성 + 상단 🆕📂💾🎤 컨트롤' },
      { url: 'https://image.thum.io/get/width/400/crop/700/viewportWidth/400/https://hankal0501-ux.github.io/voice-memo/',
        caption: '모바일 화면 — 스마트폰 점검 현장 최적화' }
    ]
  },
  pdfconverter: {
    icon: '📄', name: '점검 보고서 PDF 변환', tag: 'ZIP → PDF',
    desc: '녹음 기록기로 작성·저장한 ZIP 파일을 자동으로 PDF 보고서(텍스트·표 포함)와 사진 ZIP으로 분리 변환하는 도구입니다. 여러 개의 ZIP을 한 번에 처리하며, 모든 변환이 브라우저에서 직접 수행돼 파일이 외부로 전송되지 않습니다.',
    features: [
      { title: '📦 ZIP 일괄 변환', desc: '여러 개 ZIP을 한 번에 선택해서 동시 변환. 점검 건이 누적된 경우 일괄 처리 가능.' },
      { title: '📄 PDF + 사진 ZIP 분리', desc: 'jsPDF·autotable 기반 텍스트·표 PDF 보고서 + 첨부 사진은 별도 ZIP으로 분리 출력.' },
      { title: '⚡ 100% 브라우저 처리', desc: '서버 없이 클라이언트에서 직접 처리 — 민감한 점검자료가 외부로 전송되지 않아 보안 확보.' }
    ],
    howto: [
      '1. 녹음 기록기(Voice Memo)에서 점검 메모를 작성·저장하여 ZIP 파일을 만듭니다.',
      '2. 본 PDF 변환 도구 URL에 접속합니다 (또는 index.html 파일을 더블클릭).',
      '3. "여기를 눌러 ZIP 파일 선택" 영역을 클릭하여 변환할 ZIP 파일을 선택합니다 — 여러 개 동시 선택 가능.',
      '4. "PDF 변환 시작" 버튼이 활성화되면 클릭합니다.',
      '5. 자동으로 PDF 파일(텍스트·표)과 사진 ZIP 파일이 각각 생성되어 다운로드 폴더에 저장됩니다.',
      '6. 생성된 PDF를 점검 보고서로 제출하거나, 카카오톡·이메일로 공유하여 팀·고객에게 즉시 전달합니다.',
      '7. 사진 ZIP은 별도로 증빙자료로 보관하거나, 필요 시 PDF에 첨부합니다.'
    ],
    link: '#',
    version: 'v2026.04.10e',
    platform: '브라우저 (PC·태블릿·스마트폰)',
    techStack: 'jsPDF + jspdf-autotable + html2canvas + JSZip',
    workflow: '녹음 기록기 → ZIP 저장 → 본 도구로 변환 → PDF 보고서 + 사진 ZIP'
  },
  video: {
    icon: '🎬', name: '반복 학습 플레이어 (Repeat Player)', tag: '학습도구',
    desc: '교육 영상·외국어 강의·소방 안전교육 영상을 문장 단위로 무한 반복 재생하는 모바일 최적화 플레이어입니다. 로컬 파일(mp4·mkv·webm·mov)과 YouTube URL 모두 지원하며, 최근 영상 목록과 자동재생으로 학습 흐름이 끊기지 않습니다.',
    features: [
      { title: '🎬 파일·YouTube 모두 지원', desc: '폰의 갤러리·다운로드 폴더에서 영상 파일(mp4·mkv·webm·mov) 선택 또는 YouTube URL 붙여넣기 — 다운로드 없이 스트리밍 재생.' },
      { title: '🔁 반복 횟수 선택', desc: '없음 · 2x · 3x · 5x · ∞(무한반복) 5단계로 학습 강도 조절. 외국어 문장·소방 안전수칙 암기에 효과적.' },
      { title: '📚 최근 영상 + 자동재생', desc: '최근 재생한 영상 목록 자동 저장. 자동재생 ON 시 학습이 끊기지 않고 다음 영상으로 자동 진행.' }
    ],
    howto: [
      '1. 영상 파일 선택 또는 YouTube URL 붙여넣기로 영상 로드.',
      '2. 반복 설정 버튼에서 횟수 선택 (없음 / 2x / 3x / 5x / ∞) 후 ▶ 재생 → 자동 반복.',
      '3. [자동 재생 ON] 토글 시 최근 영상 목록에서 다음 영상으로 자동 이어재생.'
    ],
    link: 'https://hankal0501-ux.github.io/repeat-player/',
    version: 'Mobile 전용',
    platform: '모바일 브라우저 (안드로이드·iOS)',
    techStack: '로컬 파일 재생 + YouTube 스트리밍',
    workflow: '파일/URL 선택 → 반복 횟수 설정 → 재생 → 자동 다음 영상',
    screenshots: [
      { url: 'https://image.thum.io/get/width/800/https://hankal0501-ux.github.io/repeat-player/',
        caption: '① 메인 화면 — 영상 파일 선택 + YouTube URL 입력 + 반복 횟수 버튼' },
      { url: 'https://image.thum.io/get/width/400/viewportWidth/400/https://hankal0501-ux.github.io/repeat-player/',
        caption: '② 모바일 뷰 — 자동재생 토글 + 최근 영상 목록' }
    ]
  },
  firesugi: {
    icon: '📋', name: '점검 지적서 (Fire-Sugi)', tag: 'AI 분석',
    desc: '소방시설 점검 결과를 자동으로 분석하고 지적사항을 생성하는 핵심 프로그램입니다.',
    features: [
      { title: '🤖 Gemini AI OCR', desc: 'Gemini API로 수기 메모·사진을 자동 인식해 텍스트로 변환' },
      { title: '⚖️ 법종 자동 판단', desc: '시설 유형별로 적용되는 화재안전기준·법종을 자동 매칭' },
      { title: '📊 지적서 자동 생성', desc: '규격에 맞는 점검 지적서를 즉시 작성·출력' }
    ],
    howto: ['1. 점검 대상 건물 정보를 입력합니다.','2. 수기 메모 또는 사진을 촬영/업로드합니다.','3. AI가 자동으로 지적사항을 분석합니다.','4. 생성된 지적서를 검토하고 출력합니다.'],
    link: null
  },
  law: {
    icon: '⚖️', name: '소방법령 DB 허브', tag: '통합 지식DB',
    desc: '소방 관련 모든 법령·고시·질의응답·매뉴얼을 한 곳에 통합한 지식 데이터베이스. 카테고리별 청크 분포: 소방관련법령 49,846 · 설비연혁 39,716 · 메뉴얼·해설서 15,998 · 화재안전기준 7,660 · 질의응답자료집 2,385 등 총 192,920건의 법령 텍스트 조각을 즉시 검색·열람할 수 있습니다.',
    features: [
      { title: '📚 소방청 공식 자료 통합', desc: '질의응답·고시·지침·해설서·매뉴얼·형식승인기준·업무처리지침·소방법규용어집까지 한 화면에서 검색.' },
      { title: '⏰ 설비연혁 39,716건', desc: '시설별 법령 변경 연혁을 연도별로 추적. 당시법 판정 시 근거자료로 즉시 인용 가능.' },
      { title: '🔄 15초 자동 갱신 · FTS5', desc: '15초마다 DB 현황 자동 갱신. SQLite FTS5 전문검색으로 법령 본문 즉시 hit.' }
    ],
    howto: [
      '1. 소방법령 DB 허브에 접속해 카테고리(소방시설종합·시설조회·게시판)를 선택합니다.',
      '2. [소방법령정보센터]에서 건축물대장 기반 당시법 통합 검토.',
      '3. [당시법·소방시설]에서 허가일 기준 적용 판정.',
      '4. [점검시 중점체크사항]에서 현장 점검 기록·결과 관리.',
      '5. [소방청 질의응답]에서 공식 질의응답·법령 해석 사례 조회.',
      '6. [법령 본문 검색]에서 법·령·규칙·별표 + 연도 필터로 2,161건 즉시 검색.',
      '7. [DB 실시간 현황]에서 인덱싱 파일 18,899건과 카테고리별 청크 분포 확인.'
    ],
    link: null,
    version: 'DB 909MB · FTS5 인덱스 (준비 중)',
    platform: '브라우저 (PC·태블릿)',
    techStack: 'SQLite FTS5 · 자동 인덱싱 (15초 주기) · 카테고리별 청크 검색',
    workflow: '카테고리 선택 → 키워드/연도 검색 → 본문·인용 즉시 열람'
  },
  historical: {
    featured: true,
    crown: '👑',
    stars: '⭐⭐⭐',
    ribbonText: '👑 CORE · AI 메인 시스템 ⭐',
    icon: '👑', name: '소방시설 종합조회 시스템', tag: '🏆 AI 핵심',
    desc: '건축물대장 PDF 한 장으로 허가일 기준의 당시법과 현행법을 동시에 적용해 소방시설 설치의무를 자동 판정하는 AI 시스템. SQLite FTS5 기반 909MB DB(법령텍스트 192,920건·PDF/MD 18,899건)로 1958년 구 소방법부터 현행 NFTC 통합본까지 전체 소방법령을 망라합니다.',
    features: [
      { title: '🏛️ 당시법·현행법 자동 판정', desc: '건축물대장 허가일을 자동 추출 → 그 시점의 소방법(법·시행령·시행규칙·NFTC)을 매칭 + 강화기준(현행) 동시 비교로 소급여부 판정.' },
      { title: '🤖 AI 도우미 + FTS5 본문 검색', desc: '법령 본문 2,161건 즉시 검색 + AI가 자연어 질의에 답변. 소방청 질의응답·고시·매뉴얼 49,846건 통합 인덱싱.' },
      { title: '📊 시설별 자동 분류', desc: '시설을 소화설비·경보설비·피난구조·소화활동설비·기타 5개로 자동 분류하고 설치의무·자체점검 대상 자동 표시.' }
    ],
    howto: [
      '1. 로그인 후 좌측 [건축물대장 파일 업로드] 영역에 PDF를 끌어다 놓고 자동 추출 결과를 확인합니다.',
      '2. 하단 [⚡ 소방시설 자동 판정]을 클릭하면 중앙에 [강화기준 — 신규 허가 시 적용]과 [당시 소방시설] 카드가 동시에 표시됩니다.',
      '3. 좌상단 7개 탭(시설조회·개정연혁·설치판정·AI 도우미·당시법 판정·당시법 시설·시설별 기준)에서 원하는 모드 선택 후 우측 보고서로 PDF 출력 또는 점검 지적서로 연계.'
    ],
    link: 'http://firelaw.duckdns.org/login.html',
    version: 'v1.4.0 (24remte-control)',
    platform: '브라우저 (PC 권장) · SQLite FTS5 백엔드',
    techStack: 'SQLite FTS5 + 909MB DB · PDF 자동추출 · LLM(AI 도우미)',
    workflow: '건축물대장 PDF 업로드 → 자동 추출 → 허가일 기반 당시법·현행법 동시 판정 → 시설별 분류 리포트',
    screenshots: [
      { url: 'https://image.thum.io/get/width/800/http://firelaw.duckdns.org/login.html',
        caption: '① 로그인 화면 — 발급받은 계정으로 접속' },
      { url: 'https://image.thum.io/get/width/400/viewportWidth/400/http://firelaw.duckdns.org/login.html',
        caption: '② 모바일 뷰 — 건축물대장 업로드 + 7개 탭 (서버 켜진 경우만)' }
    ]
  },
  calculators: {
    icon: '🧮', name: '소방 수리학 계산기', tag: '설계지원',
    desc: '펌프 용량, 배관 마찰손실 등 소방 수리학 계산을 지원합니다.',
    features: [
      { title: '🌊 헤젠-윌리엄스', desc: '배관 마찰손실 자동 계산' },
      { title: '💨 가스계 농도', desc: '할로겐화합물 및 불활성기체 소화설비 설계농도 계산' },
      { title: '⚡ 수동 계산 모드', desc: '다양한 공식을 활용한 자유로운 수치 대입' }
    ],
    howto: ['1. 계산할 항목(마찰손실/농도 등)을 선택합니다.','2. 요구되는 수치(유량, 길이, 관경 등)를 입력합니다.','3. 결과값과 함께 풀이 과정을 확인합니다.'],
    link: null
  },
  dy_sobang: {
    icon: '📸', name: '현장사진-음성,수기', tag: '현장기록 · 안드로이드',
    desc: '현장 사진 + 메모를 즉시 기록. GPS·주소·메모가 사진에 워터마크로 자동 합성되어 그 자체로 점검 보고서가 됩니다.',
    features: [
      { title: '📷 워터마크 자동 합성', desc: '사업장·층수·메모·GPS·주소·시각이 사진에 영구 새겨져 별도 보고서 작성 불필요. 사진 한 장 = 완성된 점검 메모.' },
      { title: '🎙️ 한국어 음성인식 STT', desc: '네이티브 음성인식으로 지적사항을 받아쓰기. 오프라인 동작, 연속 발화 지원. 마이크 권한만 허용하면 즉시 사용.' },
      { title: '🔄 자동 업데이트 시스템', desc: 'GitHub Actions가 APK 빌드 → version.json 폴링으로 폰에서 자동 업데이트 모달 → "지금 업데이트" 탭하면 위에 덮어쓰기 설치 (IndexedDB 기록 유지).' }
    ],
    howto: [
      '1. 다운로드 페이지에서 APK 설치 → 권한 3개 허용 (카메라·마이크·위치).',
      '2. 현장 도착 → 사업장/층수 입력 → 📸 사진 촬영 (GPS·주소 자동 수집).',
      '3. 🎙️ 음성으로 지적사항 받아쓰기 (또는 직접 타이핑) → [기록 추가] 탭.',
      '4. 워터마크 합성된 JPEG가 즉시 공유 시트로 표시 → 카톡·드라이브·메일 선택해 전송.',
      '5. 새 버전 출시 시 앱 실행 시 자동 알림 → [지금 업데이트] 탭하여 덮어쓰기 설치 (기록 유지됨).'
    ],
    link: 'https://hankal0501-ux.github.io/firesugi-blog/dy-sobang/',
    version: 'v1.0.0',
    platform: 'Android (APK 직접 설치)',
    techStack: 'Capacitor 6 + IndexedDB + 네이티브 STT · GitHub Actions 자동 빌드',
    workflow: '사진 촬영 + 음성 받아쓰기 → 워터마크 자동 합성 → 즉시 공유 → 자동 업데이트로 신규 버전 배포'
  },
  inspection_board: {
    icon: '📋', name: '점검상황 게시판', tag: '진행관리 · 일정관리',
    desc: '점검 사업장별 마감일과 진행 단계를 한 화면에서 추적하는 내부 운영 게시판입니다. 초기파일 → 점검내역서 → 팀장확인 → 보고서·점검표 → confirm → 소방서제출까지 8단계 워크플로를 행 단위로 시각화하여 누락 없이 흐름을 관리합니다. (외부 공개 URL 없음 — 내부 보안)',
    features: [
      { title: '📅 마감일·Time-Line 시각화', desc: '사업장별 마감일을 자동 정렬하고 Time-Line 막대로 진행도(D-Day)를 한눈에 표시. 마감 임박 건을 즉시 식별.' },
      { title: '✅ 8단계 워크플로 추적', desc: '배치확인서 · 점검내역서(예전원본·별지) · 팀장확인 · 보고서-최종 · 점검표-최종 · 보고서확인-팀장 · confirm확인 · 소방서제출 8단계를 ⚫(완료)/⚪(미완료) 토글로 관리.' },
      { title: '🔄 사업장 검색·연월 필터·다단말 동기화', desc: '사업장명 즉시 검색, 연도·월 셀렉터, 동기화 대기 상태 표시 — 여러 단말 간 진행 상태 공유.' }
    ],
    howto: [
      '1. 상단 [전체 32 / 진행 32 / 완료 0] 카운터로 전체 진행 분포를 확인합니다.',
      '2. 사업장 검색 / 연도·월 필터로 대상 범위를 좁히고, 마감일 컬럼 기준 정렬을 확인합니다.',
      '3. 각 행의 8단계 셀(배치확인서 → 점검내역서 → 팀장확인 → 보고서·점검표 → confirm → 소방서제출)을 단계가 끝날 때마다 ⚫(완료)로 토글합니다.',
      '4. Time-Line 막대로 마감 임박 사업장 우선 처리하고, 동기화 대기 상태에서 다른 단말로 자동 반영됩니다.'
    ],
    link: null,
    completed: true,
    version: 'ver 2.9 (내부 운영판)',
    platform: '브라우저 (PC 권장) · 내부 시스템',
    techStack: '게시판 단계 추적 · 다단말 동기화',
    workflow: '사업장 등록 → 마감일·단계 입력 → 8단계 토글 → confirm → 소방서 제출',
    screenshots: [
      { url: 'images/inspection-board.png',
        caption: '전체 사업장 목록 — 마감일 정렬 + Time-Line + 8단계 진행 체크 (초기파일·점검·보고서·컨펌·전달)' }
    ]
  }
};

// ===== 사용자 추가 프로그램 (관리자 직접 입력) =====
const USER_PROGRAMS_KEY = 'fireSugiUserPrograms';

function getUserPrograms() {
  return JSON.parse(localStorage.getItem(USER_PROGRAMS_KEY) || '{}');
}
function saveUserPrograms(obj) {
  localStorage.setItem(USER_PROGRAMS_KEY, JSON.stringify(obj));
  // 변경 시에만 push (자동 인터벌과 별도)
  if (typeof fbDb !== 'undefined') {
    Object.entries(obj).forEach(([key, p]) => {
      fbDb.collection('userPrograms').doc(key).set(p, { merge: true }).catch(() => {});
    });
  }
}

// ============================================================
// 🔐 관리자 비밀번호 시스템 (SHA-256 해시 기반)
// - 평문 password 코드에서 제거됨
// - 변경하려면 네이버 이메일 OR 폰번호 본인 인증 필요
// ============================================================

// 기본 password 해시 (= 'dodan0501!')
// 사용자가 익숙한 기존 비번으로 환원. 본인이 더 강한 비번으로 바꾸려면 changeAdminPassword() 호출
const DEFAULT_PWD_HASH = '161a1e1429d73e85fcb329d6211247a88c000c241e5d68ec6c11353799da4119';
const PWD_KEY_LOCAL = 'fireSugiAdminPwdHash_v3';
const PWD_AUTH_SESSION = 'progAuth_v3';

// 본인 인증 화이트리스트 (네이버 OR 폰번호 둘 중 하나만 맞아도 통과)
const AUTH_WHITELIST = Object.freeze({
  naverEmail: 'hankal0501@naver.com',
  phoneFull: '01098078004',   // 010-9807-8004
  phoneNoDash: '010-9807-8004',
  phoneLast4: '8004'
});

async function sha256(text) {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(String(text)));
  return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, '0')).join('');
}

// 이전 강제 변경된 default 해시 (FireSugi#2026-Hankal@Secure!) — 자동 제거
const LEGACY_DEFAULT_HASH = '4ae5afde210e289b1d6fb317741976b1ac554561dcf53e245b9b2a8d0d96be8e';

function getActiveAdminHash() {
  const stored = localStorage.getItem(PWD_KEY_LOCAL);
  if (stored === LEGACY_DEFAULT_HASH) {
    localStorage.removeItem(PWD_KEY_LOCAL);
    return DEFAULT_PWD_HASH;
  }
  return stored || DEFAULT_PWD_HASH;
}

async function verifyAdminPassword(pw) {
  if (!pw) return false;
  try {
    const hash = await sha256(pw);
    return hash === getActiveAdminHash();
  } catch (e) {
    console.error('hash error:', e);
    return false;
  }
}

// 비관리자 차단 헬퍼
function _blockNonAdmin() {
  alert('🔒 관리자만 수정·편집할 수 있습니다.\n\n[🔐 관리자] 버튼으로 먼저 로그인하세요.');
  return false;
}

// 파일 업로드 label 클릭 가드 — 파일 선택창이 뜨기 전에 관리자 여부 검사
function _guardAdminUpload(actionName) {
  if (typeof isAdmin === 'function' && isAdmin()) return true;
  alert('🔒 관리자 전용 기능입니다.\n\n[' + (actionName || '업로드') + ']은(는) 관리자만 사용할 수 있습니다.\n먼저 헤더의 [🔐 관리자] 버튼으로 로그인하세요.');
  return false;
}
window._guardAdminUpload = _guardAdminUpload;

// 한 번 비번 통과 후 세션 동안 자동 통과 (탭 닫히면 리셋)
async function _adminPasswordOnce(label) {
  // 이미 인증됨 — 그냥 통과
  if (sessionStorage.getItem(PWD_AUTH_SESSION) === 'ok') return true;
  // 첫 클릭 — 비번 prompt
  const pw = prompt(`🔐 ${label || '관리 작업'} — 비밀번호 (이번 한 번만, 이후 자동 통과):`);
  if (pw === null) return false;
  if (!(await verifyAdminPassword(pw))) {
    alert('❌ 비밀번호가 일치하지 않습니다.');
    return false;
  }
  sessionStorage.setItem(PWD_AUTH_SESSION, 'ok');
  return true;
}

// 등록용 — 관리자 + 세션당 1회 비번
async function checkProgPassword(label) {
  if (!(typeof isAdmin === 'function' && isAdmin())) return _blockNonAdmin();
  return _adminPasswordOnce(label || '등록');
}

// 삭제·편집용 — 관리자 + 세션당 1회 비번
async function checkDeletePassword(label) {
  if (!(typeof isAdmin === 'function' && isAdmin())) return _blockNonAdmin();
  return _adminPasswordOnce(label || '삭제·편집');
}

// 비밀번호 변경 — 네이버 OR 폰번호 본인 인증 후 변경
async function changeAdminPassword() {
  const intro = '🔐 관리자 비밀번호 변경\n\n' +
                '본인 인증 후 변경할 수 있습니다.\n' +
                '다음 중 하나를 정확히 입력하세요:\n\n' +
                '• 네이버 이메일 (예: yourname@naver.com)\n' +
                '• 폰 번호 (예: 010-1234-5678)\n' +
                '• 폰 번호 마지막 4자리';
  const auth = prompt(intro);
  if (auth === null) return;

  const norm = String(auth).trim().toLowerCase().replace(/[\s\-\.\(\)]/g, '');
  const allowed = [
    AUTH_WHITELIST.naverEmail.toLowerCase(),
    AUTH_WHITELIST.phoneFull,
    AUTH_WHITELIST.phoneNoDash.replace(/-/g, ''),
    AUTH_WHITELIST.phoneLast4
  ].map(v => v.toLowerCase());

  if (!allowed.includes(norm)) {
    alert('❌ 인증 실패 — 등록된 본인 정보가 아닙니다.\n시도가 기록되었습니다.');
    if (typeof logActivity === 'function') {
      logActivity(`⚠️ 비번 변경 인증 실패: ${norm.slice(0, 4)}***`);
    }
    return;
  }

  const newPw = prompt('✅ 인증 성공\n\n새 비밀번호 (8자 이상):');
  if (newPw === null) return;
  if (String(newPw).length < 8) {
    alert('❌ 비밀번호는 8자 이상이어야 합니다.');
    return;
  }
  const confirm2 = prompt('새 비밀번호 다시 입력 (확인):');
  if (confirm2 !== newPw) {
    alert('❌ 두 비밀번호가 일치하지 않습니다.');
    return;
  }

  const newHash = await sha256(newPw);
  localStorage.setItem(PWD_KEY_LOCAL, newHash);
  sessionStorage.removeItem(PWD_AUTH_SESSION);
  if (typeof logActivity === 'function') {
    logActivity(`✅ 관리자 비번 변경됨 (인증 수단: ${norm.includes('@') ? '네이버' : '폰'})`);
  }
  alert('✅ 비밀번호가 변경되었습니다.\n\n다음 관리 작업 시 새 비밀번호로 인증하세요.');
}

// 글로벌 노출 (다른 모듈/HTML inline onclick에서 호출 가능)
window.changeAdminPassword = changeAdminPassword;

// ============================================================
// 📊 접속 통계 그래프 — 관리자 전용
// ============================================================
function showVisitStats() {
  if (typeof isAdmin !== 'function' || !isAdmin()) {
    alert('🔒 관리자만 사용할 수 있습니다.');
    return;
  }
  const modal = document.getElementById('statsModal');
  if (!modal) return;
  renderVisitStats();
  modal.style.display = 'flex';
  document.body.style.overflow = 'hidden';
}
function hideStatsModal() {
  const modal = document.getElementById('statsModal');
  if (modal) modal.style.display = 'none';
  document.body.style.overflow = '';
}
window.showVisitStats = showVisitStats;
window.hideStatsModal = hideStatsModal;

function renderVisitStats() {
  const logs = JSON.parse(localStorage.getItem('fireSugiAccessLogs') || '[]');
  const anonVisits = JSON.parse(localStorage.getItem('fireSugiAnonVisits') || '[]');
  // 모든 접속 이벤트 통합 (ts 만 필요)
  const allTs = [
    ...logs.map(l => l.ts),
    ...anonVisits.map(v => v.ts)
  ].filter(t => t && !isNaN(t)).sort((a, b) => a - b);

  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());

  // 일별 (최근 30일)
  const daily = [];
  for (let i = 29; i >= 0; i--) {
    const day = new Date(today.getTime() - i * 86400000);
    const next = new Date(day.getTime() + 86400000);
    const count = allTs.filter(t => t >= day.getTime() && t < next.getTime()).length;
    daily.push({
      label: `${day.getMonth()+1}/${day.getDate()}`,
      fullLabel: `${day.getFullYear()}-${pad(day.getMonth()+1)}-${pad(day.getDate())}`,
      count
    });
  }

  // 월별 (최근 12개월)
  const monthly = [];
  for (let i = 11; i >= 0; i--) {
    const mStart = new Date(today.getFullYear(), today.getMonth() - i, 1);
    const mEnd = new Date(today.getFullYear(), today.getMonth() - i + 1, 1);
    const count = allTs.filter(t => t >= mStart.getTime() && t < mEnd.getTime()).length;
    monthly.push({
      label: `${mStart.getFullYear().toString().slice(2)}.${pad(mStart.getMonth()+1)}`,
      fullLabel: `${mStart.getFullYear()}-${pad(mStart.getMonth()+1)}`,
      count
    });
  }

  // 요약
  const todayCount = daily[daily.length - 1].count;
  const week = daily.slice(-7).reduce((s, d) => s + d.count, 0);
  const month = monthly[monthly.length - 1].count;
  const total = allTs.length;

  // 프로그램 클릭(접속) 통계 — 모든 프로그램 표시 (클릭 0 포함)
  const progClicks = (typeof getProgramClicks === 'function') ? getProgramClicks() : {};
  const totalProgClicks = Object.values(progClicks).reduce((s, p) => s + (p.count || 0), 0);
  // AI 프로그램 그리드와 동일한 순서(프로그램 정의 순서, featured 우선)로 정렬
  // → 통계 N번 = AI 프로그램 카드 N번째 위치 완전 일치
  const rankMap = getProgramRankMap();
  const hidden = (typeof getHiddenPrograms === 'function') ? getHiddenPrograms() : [];
  const allProgs = Object.entries(programData)
    .filter(([k]) => !hidden.includes(k))
    .map(([k, p]) => ({
      key: k,
      name: p.name || k,
      icon: p.icon || '📦',
      count: progClicks[k]?.count || 0,
      lastClick: progClicks[k]?.lastClick || null
    }))
    .sort((a, b) => (rankMap[a.key] || 9999) - (rankMap[b.key] || 9999));

  document.getElementById('statsSummary').innerHTML = `
    <div class="ss-card"><div class="ss-num">${todayCount}</div><div class="ss-lab">오늘 방문</div></div>
    <div class="ss-card"><div class="ss-num">${week}</div><div class="ss-lab">최근 7일</div></div>
    <div class="ss-card"><div class="ss-num">${month}</div><div class="ss-lab">이번 달</div></div>
    <div class="ss-card"><div class="ss-num">${total}</div><div class="ss-lab">전체 방문</div></div>
    <div class="ss-card" style="background:#e8f5ff; border-color:#1c5cd6;">
      <div class="ss-num" style="color:#1c5cd6;">${totalProgClicks}</div>
      <div class="ss-lab">📥 프로그램 다운로드 총수</div>
    </div>
  `;

  document.getElementById('dailyChart').innerHTML = renderBars(daily);
  document.getElementById('monthlyChart').innerHTML = renderBars(monthly);

  // 프로그램별 클릭(다운로드) — 모든 프로그램 표시 (0회 포함)
  let progSection = document.getElementById('progDownloadSection');
  if (!progSection) {
    progSection = document.createElement('div');
    progSection.id = 'progDownloadSection';
    progSection.className = 'stats-section';
    // 차트 2열 grid 행 다음(밖)에 삽입 — grid 안에 들어가면 3번째 칸이 됨
    const chartsRow = document.querySelector('.stats-charts-row')
      || document.getElementById('monthlyChart').parentElement;
    chartsRow.after(progSection);
  }
  const maxClick = Math.max(1, ...allProgs.map(p => p.count));
  progSection.innerHTML = `
    <h3 class="stats-h3" style="margin:6px 0 4px;">📥 프로그램별 클릭 (전체 ${allProgs.length}개 · 합계 ${totalProgClicks}회)</h3>
    <div class="prog-rank-list">
      ${allProgs.map((p, i) => {
        const pct = Math.round((p.count / maxClick) * 100);
        const dim = p.count === 0 ? ' style="opacity:0.5;"' : '';
        return `<div class="prog-rank-row"${dim}>
          <span class="prog-rank-no">${i+1}</span>
          <span class="prog-rank-name">${p.icon} ${esc(p.name)}</span>
          <div class="prog-rank-barbg"><div class="prog-rank-bar" style="width:${pct}%;"></div></div>
          <span class="prog-rank-count">${p.count}회</span>
        </div>`;
      }).join('')}
    </div>`;

  // 📍 일별 IP 펼치기 — 날짜 클릭 시 그날의 IP 목록 표시
  renderDailyIpSection(logs, anonVisits);
}

// 일별 IP 그룹화 + 펼치기 UI
function renderDailyIpSection(logs, anonVisits) {
  const all = [
    ...logs.map(l => ({ ts: l.ts, ip: l.ip || '', who: l.id || '익명', ua: l.ua || '', kind: 'log' })),
    ...anonVisits.map(v => ({ ts: v.ts, ip: v.ip || '', who: v.anonId || '익명', ua: v.ua || '', kind: 'visit' }))
  ].filter(r => r.ts).sort((a, b) => b.ts - a.ts);

  // 날짜별 그룹화
  const byDay = {};
  all.forEach(r => {
    const d = new Date(r.ts);
    const key = `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}`;
    if (!byDay[key]) byDay[key] = [];
    byDay[key].push(r);
  });
  const days = Object.keys(byDay).sort().reverse().slice(0, 30); // 최근 30일

  let ipSection = document.getElementById('dailyIpSection');
  if (!ipSection) {
    ipSection = document.createElement('div');
    ipSection.id = 'dailyIpSection';
    ipSection.className = 'stats-section';
    document.getElementById('progDownloadSection').after(ipSection);
  }

  if (!days.length) {
    ipSection.innerHTML = `<h3 class="stats-h3" style="margin:6px 0 4px;">📍 일별 IP 목록</h3>
      <p style="color:#888; font-size:0.85rem;">아직 IP 기록이 없습니다. (IP는 v20260526w+ 부터 수집)</p>`;
    return;
  }

  ipSection.innerHTML = `
    <h3 class="stats-h3" style="margin:6px 0 4px;">📍 일별 IP 목록 — 날짜 클릭하여 펼치기</h3>
    <div class="daily-ip-list">
      ${days.map(day => {
        const rows = byDay[day];
        // IP 별 카운트
        const ipMap = {};
        rows.forEach(r => {
          const ipKey = r.ip || '(미수집)';
          if (!ipMap[ipKey]) ipMap[ipKey] = { count: 0, samples: [] };
          ipMap[ipKey].count++;
          if (ipMap[ipKey].samples.length < 3) {
            ipMap[ipKey].samples.push({ ts: r.ts, who: r.who, ua: r.ua });
          }
        });
        const uniqIps = Object.keys(ipMap).length;
        const totalHits = rows.length;
        return `<details class="daily-ip-day" style="margin-bottom:6px; background:#f7f9fc; border:1px solid #e5eaf2; border-radius:6px;">
          <summary style="padding:10px 14px; cursor:pointer; font-weight:600; font-size:0.9rem; user-select:none;">
            📅 ${day} <span style="color:#1c5cd6;">· ${totalHits}회 접속</span> <span style="color:#888;">· 고유 IP ${uniqIps}개</span>
          </summary>
          <div style="padding:8px 14px 12px; font-size:0.82rem;">
            ${Object.entries(ipMap).sort((a,b) => b[1].count - a[1].count).map(([ip, info]) => `
              <div style="padding:6px 0; border-top:1px dashed #d8dde6;">
                <div style="font-family:monospace; font-weight:600; color:${ip === '(미수집)' ? '#999' : '#1c5cd6'};">
                  ${esc(ip)} <span style="color:#666; font-weight:400;">· ${info.count}회</span>
                </div>
                <div style="color:#666; font-size:0.78rem; margin-top:3px; line-height:1.5;">
                  ${info.samples.map(s => {
                    const d = new Date(s.ts);
                    return `${pad(d.getHours())}:${pad(d.getMinutes())} · ${esc(s.who)} · ${esc(s.ua)}`;
                  }).join(' / ')}
                </div>
              </div>
            `).join('')}
          </div>
        </details>`;
      }).join('')}
    </div>`;
}

function renderBars(data) {
  const max = Math.max(1, ...data.map(d => d.count));
  // 차트 height 50px - padding 14px = 36px 가용, 여유 빼고 최대 32px
  return data.map(d => {
    const h = Math.max(2, Math.round((d.count / max) * 32));
    return `<div class="bar ${d.count === 0 ? 'zero' : ''}" style="height:${h}px;" title="${d.fullLabel}: ${d.count}회">
      <span class="bar-val">${d.count}</span>
      <span class="bar-lab">${d.label}</span>
    </div>`;
  }).join('');
}

function pad(n) { return String(n).padStart(2, '0'); }

function exportStatsCSV() {
  const logs = JSON.parse(localStorage.getItem('fireSugiAccessLogs') || '[]');
  const anonVisits = JSON.parse(localStorage.getItem('fireSugiAnonVisits') || '[]');
  const all = [
    ...logs.map(l => ({ ts: l.ts, type: 'log', detail: l.action || '', user: l.id || '' })),
    ...anonVisits.map(v => ({ ts: v.ts, type: 'visit', detail: '', user: v.anonId || '' }))
  ].filter(r => r.ts).sort((a, b) => b.ts - a.ts);
  const csv = ['date,time,type,user,detail'];
  all.forEach(r => {
    const d = new Date(r.ts);
    csv.push(`${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())},${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())},${r.type},${(r.user||'').replace(/,/g,'')},${(r.detail||'').replace(/,/g,'')}`);
  });
  const blob = new Blob(['﻿' + csv.join('\n')], { type: 'text/csv;charset=utf-8' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `fire-sugi-stats-${new Date().toISOString().slice(0,10)}.csv`;
  document.body.appendChild(a); a.click(); document.body.removeChild(a);
}
window.exportStatsCSV = exportStatsCSV;

// 🔄 모든 기기 즉시 동기화 — Firebase quota 락 해제 + push/pull 강제
async function forceSyncAll() {
  // 🛡 관리자 전용 — 일반 방문자는 사용 불가
  const admin = (typeof isAdmin === 'function') ? isAdmin() : false;
  if (!admin) {
    alert('🔒 관리자 전용 기능입니다.\n\n먼저 [🔐 관리자] 버튼으로 로그인하세요.');
    return;
  }
  if (!confirm('🔄 모든 기기 즉시 동기화\n\n로컬 데이터를 Firestore에 강제 push 하고, 다른 기기의 변경분을 pull 합니다.\n\n진행하시겠습니까?')) return;

  // 1) Firebase quota 자동차단 락 해제
  const wasBlocked = localStorage.getItem('fbQuotaExceededAt');
  if (wasBlocked) {
    localStorage.removeItem('fbQuotaExceededAt');
    if (typeof fbSyncReady !== 'undefined') {
      try { window.fbSyncReady = true; } catch(e) {}
    }
    console.log('🔓 Firebase quota 락 해제');
  }

  // 2) 로컬 사용자 프로그램 강제 push
  let pushedProgs = 0;
  if (typeof fbDb !== 'undefined') {
    const userProgs = getUserPrograms();
    for (const [key, p] of Object.entries(userProgs)) {
      try {
        await fbDb.collection('userPrograms').doc(key).set(p, { merge: true });
        pushedProgs++;
      } catch (e) {
        console.warn('push 실패:', key, e.message);
        if (e?.message?.includes('resource-exhausted')) {
          alert('❌ Firebase 할당량 초과 — 다음 KST 17시까지 대기 필요\n\n현재까지 push: ' + pushedProgs + '건');
          return;
        }
      }
    }
  }

  // 3) initFirebaseSync 호출 (users + posts + logs + anonVisits pull/merge)
  let syncOk = false;
  if (typeof initFirebaseSync === 'function') {
    try {
      await initFirebaseSync();
      syncOk = true;
    } catch (e) {
      console.warn('initFirebaseSync 실패:', e.message);
    }
  }

  // 4) Firestore 의 userPrograms 도 pull → 로컬 병합
  let pulledProgs = 0;
  if (typeof fbDb !== 'undefined') {
    try {
      const snap = await fbDb.collection('userPrograms').get();
      const remote = {};
      snap.forEach(doc => { remote[doc.id] = doc.data(); });
      const local = getUserPrograms();
      let added = 0;
      for (const [key, p] of Object.entries(remote)) {
        if (!local[key]) {
          local[key] = p;
          programData[key] = p;
          added++;
        }
      }
      if (added > 0) {
        localStorage.setItem(USER_PROGRAMS_KEY, JSON.stringify(local));
        renderPrograms();
      }
      pulledProgs = added;
    } catch (e) {
      console.warn('userPrograms pull 실패:', e.message);
    }
  }

  // 5) 스크린샷(사진) 동기화 — programScreenshots 컬렉션
  let pushedShots = 0, pulledShots = 0;
  if (typeof fbDb !== 'undefined') {
    try {
      // PUSH: 로컬의 fireSugiShots_* 키 모두 Firestore 로
      for (let i = 0; i < localStorage.length; i++) {
        const k = localStorage.key(i);
        if (!k || !k.startsWith('fireSugiShots_')) continue;
        const progKey = k.replace('fireSugiShots_', '');
        const shots = JSON.parse(localStorage.getItem(k) || '[]');
        if (!shots.length) continue;
        // Firestore 문서 한도 1MB — 큰 base64 이미지는 경고
        const size = JSON.stringify(shots).length;
        if (size > 950 * 1024) {
          console.warn(`스크린샷 ${progKey} 크기 ${(size/1024).toFixed(0)}KB → 1MB 한도 근접, 스킵`);
          continue;
        }
        try {
          await fbDb.collection('programScreenshots').doc(progKey).set({ shots, updatedAt: Date.now() }, { merge: true });
          pushedShots++;
        } catch (e) {
          console.warn('스크린샷 push 실패:', progKey, e.message);
          if (e?.message?.includes('resource-exhausted')) break;
        }
      }
      // PULL: Firestore programScreenshots → 로컬에 없거나 더 오래된 것만 덮어쓰기
      const snap = await fbDb.collection('programScreenshots').get();
      snap.forEach(doc => {
        const k = 'fireSugiShots_' + doc.id;
        const remote = doc.data();
        const localRaw = localStorage.getItem(k);
        const localUpdatedAt = (() => { try { return JSON.parse(localStorage.getItem(k + '_meta') || '{}').updatedAt || 0; } catch { return 0; } })();
        if (!localRaw || (remote.updatedAt && remote.updatedAt > localUpdatedAt)) {
          if (remote.shots && Array.isArray(remote.shots)) {
            localStorage.setItem(k, JSON.stringify(remote.shots));
            localStorage.setItem(k + '_meta', JSON.stringify({ updatedAt: remote.updatedAt }));
            pulledShots++;
          }
        }
      });
    } catch (e) {
      console.warn('screenshots sync 실패:', e.message);
    }
  }

  const msg = `✅ 동기화 완료\n\n` +
              `🔼 PUSH: 프로그램 ${pushedProgs}건 · 사진 ${pushedShots}건\n` +
              `🔽 PULL: 신규 프로그램 ${pulledProgs}건 · 신규 사진 ${pulledShots}건\n` +
              `🔄 회원·게시글: ${syncOk ? '동기화됨' : '스킵'}\n` +
              (wasBlocked ? '🔓 quota 락 해제됨\n' : '') +
              `\n다른 기기들도 새로고침하면 즉시 반영됩니다.`;
  alert(msg);
  hideAdminModal();
}
window.forceSyncAll = forceSyncAll;

// 빠른 삭제 — 카드의 ✕ 버튼 클릭 시
// 삭제된 사용자 프로그램 보관소 (휴지통)
const DELETED_PROGRAMS_KEY = 'fireSugiDeletedPrograms';
function getDeletedPrograms() {
  return JSON.parse(localStorage.getItem(DELETED_PROGRAMS_KEY) || '{}');
}
function saveDeletedPrograms(obj) {
  localStorage.setItem(DELETED_PROGRAMS_KEY, JSON.stringify(obj));
}

async function quickDeleteProgram(key) {
  const prog = programData[key];
  if (!prog) return;
  if (!(await checkDeletePassword())) return;
  const userProgs = getUserPrograms();
  const isUserAdded = !!userProgs[key];
  if (!confirm(`"${prog.name}"을(를) 휴지통으로 이동하시겠습니까?\n(언제든 복원 가능)`)) return;

  if (isUserAdded) {
    // 휴지통으로 이동 (soft delete)
    const deleted = getDeletedPrograms();
    deleted[key] = { ...userProgs[key], deletedAt: Date.now() };
    saveDeletedPrograms(deleted);
    delete userProgs[key];
    delete programData[key];
    localStorage.setItem(USER_PROGRAMS_KEY, JSON.stringify(userProgs));
    if (typeof fbDb !== 'undefined') {
      fbDb.collection('userPrograms').doc(key).delete().catch(() => {});
    }
  } else {
    // 빌트인 — 숨김 (programData에서 안 지움, 휴지통의 hidden 영역에서 복원 가능)
    const hidden = getHiddenPrograms();
    if (!hidden.includes(key)) hidden.push(key);
    saveHiddenPrograms(hidden);
  }
  if (typeof logActivity === 'function') logActivity('삭제: ' + prog.name);
  renderPrograms();
}

// 사용자 프로그램 복원 (휴지통 → 활성)
async function restoreUserProgram(key) {
  if (!(await checkDeletePassword())) return;
  const deleted = getDeletedPrograms();
  const prog = deleted[key];
  if (!prog) return alert('휴지통에 없는 프로그램입니다.');
  delete prog.deletedAt;
  const userProgs = getUserPrograms();
  userProgs[key] = prog;
  saveUserPrograms(userProgs);
  programData[key] = prog;
  delete deleted[key];
  saveDeletedPrograms(deleted);
  if (typeof logActivity === 'function') logActivity('복원: ' + prog.name);
  renderPrograms();
}

// 사용자 프로그램 영구 삭제 (휴지통에서 완전 제거)
async function permanentDeleteUserProgram(key) {
  if (!(await checkDeletePassword())) return;
  const deleted = getDeletedPrograms();
  const prog = deleted[key];
  if (!prog) return;
  if (!confirm(`"${prog.name}"을(를) 영구 삭제하시겠습니까?\n⚠️ 복원 불가합니다.`)) return;
  delete deleted[key];
  saveDeletedPrograms(deleted);
  if (typeof logActivity === 'function') logActivity('영구삭제: ' + prog.name);
  renderPrograms();
}

// 빌트인 프로그램 영구 삭제 — 복원 불가, 페이지 로드 시 programData에서 제거
const BUILTIN_FORGOTTEN_KEY = 'fireSugiBuiltinForgotten';
function getForgottenBuiltins() {
  return JSON.parse(localStorage.getItem(BUILTIN_FORGOTTEN_KEY) || '[]');
}
async function permanentDeleteBuiltin(key) {
  if (!(await checkDeletePassword())) return;
  const prog = programData[key];
  if (!prog) return alert('해당 프로그램이 없습니다.');
  if (prog.featured) return alert('⛔ 핵심 프로그램은 영구 삭제할 수 없습니다.');
  if (!confirm(`"${prog.name}" 을(를) 영구 삭제합니다.\n⚠️ 휴지통에서도 사라지며 복원 불가.\n새로고침 후에도 다시 나타나지 않습니다.\n\n진행하시겠습니까?`)) return;

  // 1) 영구 망각 목록에 추가
  const forgotten = getForgottenBuiltins();
  if (!forgotten.includes(key)) forgotten.push(key);
  localStorage.setItem(BUILTIN_FORGOTTEN_KEY, JSON.stringify(forgotten));

  // 2) hidden 목록에서 제거 (이미 hidden 이므로)
  const arr = getHiddenPrograms().filter(k => k !== key);
  saveHiddenPrograms(arr);

  // 3) programData 런타임에서 제거
  delete programData[key];

  if (typeof logActivity === 'function') logActivity('빌트인 영구삭제: ' + (prog.name || key));
  renderPrograms();
  alert('✅ 영구 삭제 완료');
}
window.permanentDeleteBuiltin = permanentDeleteBuiltin;

// 휴지통 비우기 — 사용자 프로그램 모두 영구 삭제
async function emptyTrash() {
  if (!(await checkDeletePassword())) return;
  const deleted = getDeletedPrograms();
  const count = Object.keys(deleted).length;
  if (!count) return alert('휴지통이 비어있습니다.');
  if (!confirm(`휴지통의 사용자 프로그램 ${count}건을 모두 영구 삭제하시겠습니까?\n⚠️ 복원 불가합니다.`)) return;
  saveDeletedPrograms({});
  if (typeof logActivity === 'function') logActivity(`휴지통 비우기: ${count}건`);
  renderPrograms();
}

// 빠른 등록 — 이름·URL·파일 입력으로 즉시 추가 (URL 있으면 완료, 없으면 개발중)
async function quickAddProgram() {
  const nameInput = document.getElementById('quickAddName');
  const urlInput = document.getElementById('quickAddUrl');
  const fileInput = document.getElementById('quickAddFile');
  if (!nameInput) return;

  const name = (nameInput.value || '').trim();
  if (!name) {
    nameInput.focus();
    alert('프로그램 이름을 입력하세요.');
    return;
  }

  const url = (urlInput?.value || '').trim();
  if (url && !/^https?:\/\//.test(url)) {
    urlInput.focus();
    alert('URL은 http:// 또는 https://로 시작해야 합니다.');
    return;
  }

  // 파일 → base64 (3MB 제한)
  let attachment = null;
  if (fileInput && fileInput.files && fileInput.files[0]) {
    const file = fileInput.files[0];
    if (file.size > 3 * 1024 * 1024) {
      alert('⚠️ 파일은 3MB 이하만 가능합니다.');
      return;
    }
    try {
      attachment = {
        name: file.name,
        type: file.type,
        size: file.size,
        data: await new Promise((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = e => resolve(e.target.result);
          reader.onerror = reject;
          reader.readAsDataURL(file);
        })
      };
    } catch (e) {
      alert('파일 읽기 실패: ' + e.message);
      return;
    }
  }

  if (!(await checkProgPassword())) return;

  const isDone = !!url;
  const key = 'user_' + Date.now();
  const newProg = {
    key,
    name,
    icon: '📦',
    tag: 'AI 도구',
    desc: isDone
      ? name + ' — 정식 공개된 프로그램입니다.'
      : name + ' (현재 개발 중인 프로그램입니다. 곧 공개 예정.)',
    features: [],
    howto: ['1. 사이트 접속 후 사용하세요.'],
    link: url || null,
    attachment,
    userAdded: true,
    addedAt: Date.now(),
    addedBy: (typeof getCurrentUser === 'function' && getCurrentUser()?.id) || 'guest'
  };
  const all = getUserPrograms();
  all[key] = newProg;
  saveUserPrograms(all);
  programData[key] = newProg;
  if (typeof logActivity === 'function') {
    logActivity('빠른 등록: ' + name + (isDone ? ' (완료)' : ' (개발중)') + (attachment ? ' +첨부' : ''));
  }
  nameInput.value = '';
  if (urlInput) urlInput.value = '';
  if (fileInput) fileInput.value = '';
  const label = document.getElementById('quickAddFileLabel');
  if (label) label.textContent = '📎 파일';
  renderPrograms();
  setTimeout(() => {
    const grid = document.getElementById('programsGrid');
    if (grid) grid.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }, 100);
  console.log('✅ 프로그램 등록 완료:', name, isDone ? '(완료)' : '(개발중)', attachment ? '+첨부' : '');
}

// 빠른 등록 — 파일 선택 시 라벨에 파일명 표시
function updateQuickFileLabel() {
  const fileInput = document.getElementById('quickAddFile');
  const label = document.getElementById('quickAddFileLabel');
  if (!fileInput || !label) return;
  if (fileInput.files && fileInput.files[0]) {
    const f = fileInput.files[0];
    const kb = (f.size / 1024).toFixed(1);
    label.textContent = `📎 ${f.name.slice(0, 18)}${f.name.length > 18 ? '…' : ''} (${kb}KB)`;
  } else {
    label.textContent = '📎 파일';
  }
}

function showAddProgramModal(devOnly) {
  document.getElementById('programAddModal').style.display = 'flex';
  document.body.style.overflow = 'hidden';
  const linkEl = document.getElementById('paLink');
  if (devOnly && linkEl) {
    linkEl.value = '';
    linkEl.placeholder = '(비워두면 개발중 — 완성 후 URL 추가하면 자동 AI 프로그램 탭으로 이동)';
  } else if (linkEl) {
    linkEl.placeholder = 'https://... (선택 — 없으면 개발중 표시)';
  }
  document.getElementById('paName').focus();
}

// 기존 프로그램 URL 편집 — URL 자체만 변경 (완료 여부는 토글 버튼으로 별도 결정)
async function editProgramLink(key) {
  if (!(await checkDeletePassword())) return;
  const prog = programData[key];
  if (!prog) return;
  const currentUrl = (prog.link && prog.link !== '#') ? prog.link : '';
  const newUrl = prompt(
    `📝 "${prog.name}" URL 편집\n\nhttp:// 또는 https:// 로 시작하는 주소를 입력하세요.\n비우면 URL이 제거됩니다 (완료/개발중 상태는 따로 토글 버튼으로 변경).`,
    currentUrl
  );
  if (newUrl === null) return;

  const trimmed = newUrl.trim();
  if (trimmed && !/^https?:\/\//.test(trimmed)) {
    return alert('URL은 http:// 또는 https://로 시작해야 합니다.');
  }

  const userProgs = getUserPrograms();
  const newLink = trimmed || null;
  if (userProgs[key]) {
    userProgs[key].link = newLink;
    saveUserPrograms(userProgs);
  } else {
    // 빌트인 프로그램 — 오버라이드 localStorage 에 저장하여 새로고침 후에도 유지
    setBuiltinOverride(key, { link: newLink });
  }
  programData[key].link = newLink;
  if (typeof logActivity === 'function') logActivity(`URL 편집: ${key} → ${trimmed || '(없음)'}`);
  showProgramDetail(key);
  renderPrograms();
}

// 완료/개발중 상태 토글 — URL/파일 유무와 독립
async function toggleProgramStatus(key) {
  if (!(await checkDeletePassword())) return;
  const prog = programData[key];
  if (!prog) return;
  const wasDone = !!prog.completed || (!!prog.link && prog.link !== '#');
  const newCompleted = !wasDone;

  const userProgs = getUserPrograms();
  if (userProgs[key]) {
    userProgs[key].completed = newCompleted;
    saveUserPrograms(userProgs);
  } else {
    // 빌트인 프로그램 — 오버라이드 localStorage 에 저장
    setBuiltinOverride(key, { completed: newCompleted });
  }
  programData[key].completed = newCompleted;
  if (typeof logActivity === 'function') logActivity(`상태 토글: ${key} → ${newCompleted ? '완료' : '개발중'}`);
  showProgramDetail(key);
  renderPrograms();
}

// 상세 페이지에서 프로그램에 파일 첨부 (이미지·PDF·ZIP, 3MB)
async function uploadProgramAttachment(key, inputEl) {
  if (!inputEl.files || !inputEl.files[0]) return;
  const file = inputEl.files[0];
  if (file.size > 3 * 1024 * 1024) {
    inputEl.value = '';
    return alert('⚠️ 파일은 3MB 이하만 가능합니다.');
  }
  if (!(await checkDeletePassword())) { inputEl.value = ''; return; }
  const prog = programData[key];
  if (!prog) { inputEl.value = ''; return; }

  let attachment;
  try {
    attachment = {
      name: file.name,
      type: file.type,
      size: file.size,
      data: await new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = e => resolve(e.target.result);
        reader.onerror = reject;
        reader.readAsDataURL(file);
      })
    };
  } catch (e) {
    inputEl.value = '';
    return alert('파일 읽기 실패: ' + e.message);
  }

  const userProgs = getUserPrograms();
  if (userProgs[key]) {
    userProgs[key].attachment = attachment;
    saveUserPrograms(userProgs);
  }
  programData[key].attachment = attachment;
  if (typeof logActivity === 'function') logActivity(`첨부 업로드: ${key} ← ${file.name}`);
  inputEl.value = '';
  alert(`✅ "${file.name}" 첨부됨 (${(file.size/1024).toFixed(1)} KB)`);
  showProgramDetail(key);
}

// 📷 상세 페이지에서 스크린샷 업로드 (비번 보호 — admin이 아니어도 가능)
async function uploadProgramScreenshot(key, inputEl) {
  if (!inputEl.files || !inputEl.files[0]) return;
  const file = inputEl.files[0];
  if (file.size > 3 * 1024 * 1024) {
    if (!confirm(`⚠️ 파일이 ${(file.size/1024/1024).toFixed(1)}MB로 큽니다.\nlocalStorage 용량 초과 위험. 계속하시겠습니까?`)) {
      inputEl.value = ''; return;
    }
  }
  if (!(await checkDeletePassword())) { inputEl.value = ''; return; }
  const caption = prompt('캡션 (사진 설명):', file.name.replace(/\.[^.]+$/, '')) || '';
  try {
    const url = await readFileAsDataURL(file);
    const arr = getProgramScreenshots(key);
    arr.push({ url, caption, custom: true, fileName: file.name });
    saveProgramScreenshots(key, arr);
    if (typeof logActivity === 'function') logActivity('스크린샷 추가: ' + key);
    inputEl.value = '';
    showProgramDetail(key);
  } catch (err) {
    alert('파일 읽기 실패: ' + err.message);
    inputEl.value = '';
  }
}

// ✏️ 상세 페이지에서 프로그램 내용 (이름·분류·설명) 편집
async function editProgramContent(key) {
  if (!(await checkDeletePassword())) return;
  const prog = programData[key];
  if (!prog) return;

  const newName = prompt('프로그램 이름:', prog.name || '');
  if (newName === null) return;
  if (!newName.trim()) return alert('이름은 비울 수 없습니다.');

  const newTag = prompt('분류 (예: AI 분석, AI 도구):', prog.tag || '');
  if (newTag === null) return;

  const newDesc = prompt('설명 (한 줄):', prog.desc || '');
  if (newDesc === null) return;

  const userProgs = getUserPrograms();
  const finalName = newName.trim();
  const finalTag = newTag.trim() || prog.tag;
  const finalDesc = newDesc.trim() || prog.desc;
  if (userProgs[key]) {
    userProgs[key].name = finalName;
    userProgs[key].tag = finalTag;
    userProgs[key].desc = finalDesc;
    saveUserPrograms(userProgs);
  } else {
    // 빌트인 프로그램 — 오버라이드 localStorage 에 저장 (새로고침 후에도 유지)
    setBuiltinOverride(key, { name: finalName, tag: finalTag, desc: finalDesc });
  }
  programData[key].name = finalName;
  programData[key].tag = finalTag;
  programData[key].desc = finalDesc;

  if (typeof logActivity === 'function') logActivity(`내용 편집: ${key} (${finalName})`);
  showProgramDetail(key);
  renderPrograms();
  alert('✅ 내용이 수정되었습니다.');
}

// 상세 페이지에서 첨부 파일 제거
async function removeProgramAttachment(key) {
  if (!(await checkDeletePassword())) return;
  const prog = programData[key];
  if (!prog || !prog.attachment) return;
  if (!confirm(`첨부 파일 "${prog.attachment.name}"을(를) 제거합니까?`)) return;

  const userProgs = getUserPrograms();
  if (userProgs[key]) {
    delete userProgs[key].attachment;
    saveUserPrograms(userProgs);
  }
  delete programData[key].attachment;
  if (typeof logActivity === 'function') logActivity(`첨부 제거: ${key}`);
  showProgramDetail(key);
}

function hideAddProgramModal() {
  document.getElementById('programAddModal').style.display = 'none';
  document.body.style.overflow = '';
}

async function submitAddProgram() {
  if (!(await checkProgPassword())) return;
  const get = id => document.getElementById(id).value.trim();
  const name = get('paName');
  const icon = get('paIcon') || '📦';
  const tag = get('paTag');
  const desc = get('paDesc');
  const link = get('paLink');
  const version = get('paVersion');
  const platform = get('paPlatform');
  const errEl = document.getElementById('paError');

  if (!name || !tag || !desc) { errEl.textContent = '이름·분류·설명은 필수입니다.'; return; }

  // 첨부 파일 → base64
  const fileInput = document.getElementById('paAttachment');
  let attachment = null;
  if (fileInput.files && fileInput.files[0]) {
    const file = fileInput.files[0];
    if (file.size > 3 * 1024 * 1024) {
      errEl.textContent = '⚠️ 파일은 3MB 이하만 가능합니다.';
      return;
    }
    try {
      attachment = {
        name: file.name,
        type: file.type,
        size: file.size,
        data: await new Promise((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = e => resolve(e.target.result);
          reader.onerror = reject;
          reader.readAsDataURL(file);
        })
      };
    } catch (e) { errEl.textContent = '파일 읽기 실패: ' + e.message; return; }
  }

  // 기능 3개
  const features = [];
  for (let i = 1; i <= 3; i++) {
    const t = get('paF' + i + 'Title');
    const d = get('paF' + i + 'Desc');
    if (t || d) features.push({ title: t || ('기능 ' + i), desc: d || '' });
  }

  // 사용 매뉴얼
  const howto = get('paHowto').split(/\n/).map(s => s.trim()).filter(Boolean);

  // 키 생성 (이름 기반 slug)
  const key = 'user_' + Date.now();

  const newProg = {
    key, icon, name, tag, desc,
    features,
    howto: howto.length ? howto : ['1. 사이트 접속 후 사용하세요.'],
    link: link || null,
    version: version || undefined,
    platform: platform || undefined,
    attachment,
    userAdded: true,
    addedAt: Date.now(),
    addedBy: getCurrentUser()?.id || 'unknown'
  };

  // 저장
  const all = getUserPrograms();
  all[key] = newProg;
  saveUserPrograms(all);

  // programData에 추가하여 즉시 표시
  programData[key] = newProg;

  logActivity('프로그램 추가: ' + name);
  hideAddProgramModal();
  renderPrograms();
  alert('✅ "' + name + '" 프로그램 추가 완료!');

  // 폼 초기화
  ['paName','paIcon','paTag','paDesc','paLink','paVersion','paPlatform',
   'paF1Title','paF1Desc','paF2Title','paF2Desc','paF3Title','paF3Desc','paHowto'
  ].forEach(id => document.getElementById(id).value = '');
  document.getElementById('paAttachment').value = '';
  errEl.textContent = '';
}

// 첨부 파일 정보 표시
document.addEventListener('DOMContentLoaded', () => {
  const inp = document.getElementById('paAttachment');
  if (inp) {
    inp.addEventListener('change', e => {
      const info = document.getElementById('paAttachmentInfo');
      const f = e.target.files[0];
      if (!f) { info.textContent = ''; return; }
      info.textContent = `📎 ${f.name} (${(f.size/1024).toFixed(1)} KB, ${f.type || '알 수 없는 형식'})`;
    });
  }
});

// 페이지 로드 시 user-added programs를 programData에 머지
function loadUserPrograms() {
  // 1) 일회성 마이그레이션: 모든 "개발중" 사용자 프로그램 자동 제거
  //    (link 없거나 #이고, completed 도 false 인 것들 모두 삭제)
  cleanupDevUserPrograms();

  const userProgs = getUserPrograms();
  Object.assign(programData, userProgs);
  // 영구 삭제된 빌트인 제거 (featured 는 보호)
  const forgotten = getForgottenBuiltins();
  forgotten.forEach(key => {
    if (programData[key] && !programData[key].featured) {
      delete programData[key];
    }
  });
  // 2) 빌트인 프로그램 오버라이드(편집·완료 토글) 적용 — 새로고침 후에도 유지
  applyBuiltinOverrides();
}

// ===== 빌트인 프로그램 오버라이드 (편집·완료 토글이 새로고침 후에도 유지되도록) =====
const BUILTIN_OVERRIDES_KEY = 'fireSugiBuiltinOverrides';

function getBuiltinOverrides() {
  try { return JSON.parse(localStorage.getItem(BUILTIN_OVERRIDES_KEY) || '{}'); }
  catch { return {}; }
}
function setBuiltinOverride(key, patch) {
  const all = getBuiltinOverrides();
  all[key] = { ...(all[key] || {}), ...patch, updatedAt: Date.now() };
  localStorage.setItem(BUILTIN_OVERRIDES_KEY, JSON.stringify(all));
}
function applyBuiltinOverrides() {
  const all = getBuiltinOverrides();
  Object.entries(all).forEach(([key, patch]) => {
    if (programData[key]) {
      // updatedAt 는 메타데이터라 카드에 노출 안 되게 분리해서 적용
      const { updatedAt, ...rest } = patch;
      Object.assign(programData[key], rest);
    }
  });
}

// 일회성 정리: 모든 개발중(미완료) 사용자 프로그램 영구 삭제
const DEV_CLEANUP_KEY = 'fireSugiDevCleanupV2';
function cleanupDevUserPrograms() {
  if (localStorage.getItem(DEV_CLEANUP_KEY)) return; // 이미 실행됨
  const userProgs = getUserPrograms();
  const keys = Object.keys(userProgs);
  if (keys.length === 0) {
    localStorage.setItem(DEV_CLEANUP_KEY, String(Date.now()));
    return;
  }
  const removed = [];
  for (const [key, p] of Object.entries(userProgs)) {
    const isDev = !p.completed && (!p.link || p.link === '#');
    if (isDev) {
      removed.push({ key, name: p.name || key });
      delete userProgs[key];
      delete programData[key];
      // Firestore 에서도 삭제 (quota 살아있을 때만, 실패해도 무시)
      if (typeof fbDb !== 'undefined' && !localStorage.getItem('fbQuotaExceededAt')) {
        fbDb.collection('userPrograms').doc(key).delete().catch(() => {});
      }
    }
  }
  if (removed.length > 0) {
    localStorage.setItem('fireSugiUserPrograms', JSON.stringify(userProgs));
    console.log(`🧹 개발중 사용자 프로그램 ${removed.length}건 자동 제거:`, removed.map(r => r.name).join(', '));
  }
  localStorage.setItem(DEV_CLEANUP_KEY, String(Date.now()));
}

async function deleteUserProgram(key) {
  if (!(await checkDeletePassword())) return;
  const all = getUserPrograms();
  if (!all[key]) return alert('사용자 추가 프로그램이 아닙니다.');
  if (!confirm(`"${all[key].name}"을(를) 영구 삭제하시겠습니까?\n⚠️ 휴지통을 거치지 않고 즉시 영구 삭제됩니다.`)) return;
  const name = all[key].name;
  delete all[key];
  delete programData[key];
  localStorage.setItem(USER_PROGRAMS_KEY, JSON.stringify(all));
  if (typeof fbDb !== 'undefined') {
    fbDb.collection('userPrograms').doc(key).delete().catch(() => {});
  }
  logActivity('프로그램 삭제: ' + name);
  hideProgramDetail();
  renderPrograms();
}

// 이미지 로드 실패 시 사용할 SVG 플레이스홀더 (data URL)
function makePlaceholderSvg(progName, caption) {
  const title = (progName || '프로그램').slice(0, 30);
  const sub = (caption || '스크린샷').slice(0, 60);
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 800 450">
    <defs>
      <linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0" stop-color="#e6f8ee"/>
        <stop offset="0.5" stop-color="#e8f1ff"/>
        <stop offset="1" stop-color="#fff4d4"/>
      </linearGradient>
    </defs>
    <rect width="800" height="450" fill="url(#g)"/>
    <g text-anchor="middle" font-family="'Noto Sans KR',sans-serif">
      <text x="400" y="190" font-size="56" fill="#1c5cd6" font-weight="900">📷</text>
      <text x="400" y="250" font-size="26" fill="#222" font-weight="800">${escSvg(title)}</text>
      <text x="400" y="290" font-size="16" fill="#666">${escSvg(sub)}</text>
      <text x="400" y="340" font-size="13" fill="#888">스크린샷 준비 중</text>
    </g>
  </svg>`;
  return 'data:image/svg+xml;utf8,' + encodeURIComponent(svg);
}
function escSvg(s) {
  return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

// ===== 프로그램 숨김(삭제) / 복원 =====
const HIDDEN_PROGS_KEY = 'fireSugiHiddenPrograms';

function getHiddenPrograms() {
  // 핵심 프로그램(featured)이 실수로 hidden 목록에 들어있으면 자동 제거
  let arr = JSON.parse(localStorage.getItem(HIDDEN_PROGS_KEY) || '[]');
  const filtered = arr.filter(key => !(programData[key] && programData[key].featured));
  if (filtered.length !== arr.length) {
    localStorage.setItem(HIDDEN_PROGS_KEY, JSON.stringify(filtered));
    console.log('🔧 핵심 프로그램 자동 복원:', arr.filter(k => !filtered.includes(k)).join(', '));
    arr = filtered;
  }
  return arr;
}
function saveHiddenPrograms(arr) {
  // featured 보호 — hide 못함
  const safe = arr.filter(key => !(programData[key] && programData[key].featured));
  localStorage.setItem(HIDDEN_PROGS_KEY, JSON.stringify(safe));
}
async function deleteProgram(key) {
  // 빌트인 삭제도 매번 비번 입력
  if (!(await checkDeletePassword())) return;
  const prog = programData[key];
  if (!prog) return;
  if (!confirm(`"${prog.name}" 을(를) 목록에서 숨기시겠습니까?\n(휴지통에서 [복원] 가능)`)) return;
  const arr = getHiddenPrograms();
  if (!arr.includes(key)) arr.push(key);
  saveHiddenPrograms(arr);
  if (typeof logActivity === 'function') logActivity('프로그램 숨김: ' + key);
  hideProgramDetail();
  renderPrograms();
}
async function restoreProgram(key) {
  if (!(await checkDeletePassword())) return;
  const arr = getHiddenPrograms().filter(k => k !== key);
  saveHiddenPrograms(arr);
  if (typeof logActivity === 'function') logActivity('프로그램 복원: ' + key);
  renderPrograms();
}
async function restoreAllPrograms() {
  if (!(await checkDeletePassword())) return;
  if (!confirm('휴지통의 모든 프로그램(빌트인 + 사용자 추가)을 복원하시겠습니까?')) return;
  // 빌트인 숨김 해제
  saveHiddenPrograms([]);
  // 사용자 추가 삭제분 복원
  if (typeof getDeletedPrograms === 'function') {
    const deleted = getDeletedPrograms();
    const userProgs = getUserPrograms();
    Object.entries(deleted).forEach(([k, p]) => {
      delete p.deletedAt;
      userProgs[k] = p;
      programData[k] = p;
    });
    saveUserPrograms(userProgs);
    saveDeletedPrograms({});
  }
  if (typeof logActivity === 'function') logActivity('전체 복원');
  renderPrograms();
}

// ===== 프로그램 스크린샷 관리 (관리자가 직접 추가·교체·삭제) =====
const SCREENSHOTS_KEY = (key) => `fireSugiShots_${key}`;

function getProgramScreenshots(progKey) {
  const stored = localStorage.getItem(SCREENSHOTS_KEY(progKey));
  if (stored) {
    try { return JSON.parse(stored); } catch (e) {}
  }
  return (programData[progKey] && programData[progKey].screenshots) || [];
}
function saveProgramScreenshots(progKey, arr) {
  try {
    localStorage.setItem(SCREENSHOTS_KEY(progKey), JSON.stringify(arr));
    localStorage.setItem(SCREENSHOTS_KEY(progKey) + '_meta', JSON.stringify({ updatedAt: Date.now() }));
    // 변경 시 즉시 Firestore push (quota 살아있을 때만)
    if (typeof fbDb !== 'undefined' && !localStorage.getItem('fbQuotaExceededAt')) {
      const size = JSON.stringify(arr).length;
      if (size <= 950 * 1024) {
        fbDb.collection('programScreenshots').doc(progKey)
          .set({ shots: arr, updatedAt: Date.now() }, { merge: true })
          .catch(e => console.warn('스크린샷 자동 push 실패:', e.message));
      }
    }
  } catch (e) {
    alert('⚠️ 저장 실패: ' + e.message + '\n\n사진이 너무 큽니다. 압축된 이미지(<1MB)를 사용해 주세요.');
  }
}

// 파일 → DataURL 변환
function readFileAsDataURL(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = e => resolve(e.target.result);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

// 사진 추가 (input file 트리거)
function triggerAddScreenshot(progKey) {
  if (!isAdmin()) return alert('관리자만 가능합니다.');
  const input = document.createElement('input');
  input.type = 'file';
  input.accept = 'image/*';
  input.onchange = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    if (file.size > 3 * 1024 * 1024) {
      if (!confirm(`⚠️ 파일이 ${(file.size/1024/1024).toFixed(1)}MB로 큽니다.\nlocalStorage 용량 초과 위험. 계속하시겠습니까?`)) return;
    }
    const caption = prompt('캡션(설명):', file.name.replace(/\.[^.]+$/, '')) || '';
    try {
      const url = await readFileAsDataURL(file);
      const arr = getProgramScreenshots(progKey);
      arr.push({ url, caption, custom: true, fileName: file.name });
      saveProgramScreenshots(progKey, arr);
      if (typeof logActivity === 'function') logActivity('사진 추가: ' + progKey);
      showProgramDetail(progKey);
    } catch (err) {
      alert('읽기 실패: ' + err.message);
    }
  };
  input.click();
}

// 사진 교체 (특정 인덱스의 사진을 새 파일로 덮어쓰기) — 비번 보호
async function triggerReplaceScreenshot(progKey, index) {
  if (!(await checkDeletePassword())) return;
  const input = document.createElement('input');
  input.type = 'file';
  input.accept = 'image/*';
  input.onchange = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    try {
      const url = await readFileAsDataURL(file);
      const arr = getProgramScreenshots(progKey);
      if (!arr[index]) return;
      arr[index].url = url;
      arr[index].custom = true;
      arr[index].fileName = file.name;
      saveProgramScreenshots(progKey, arr);
      if (typeof logActivity === 'function') logActivity('사진 교체: ' + progKey + '[' + index + ']');
      showProgramDetail(progKey);
    } catch (err) {
      alert('읽기 실패: ' + err.message);
    }
  };
  input.click();
}

// 사진 삭제 — 비번 보호
async function deleteScreenshot(progKey, index) {
  if (!(await checkDeletePassword())) return;
  if (!confirm('이 스크린샷을 삭제하시겠습니까?')) return;
  const arr = getProgramScreenshots(progKey);
  arr.splice(index, 1);
  saveProgramScreenshots(progKey, arr);
  if (typeof logActivity === 'function') logActivity('사진 삭제: ' + progKey + '[' + index + ']');
  showProgramDetail(progKey);
}

// 캡션 수정 — 비번 보호
async function editScreenshotCaption(progKey, index) {
  if (!(await checkDeletePassword())) return;
  const arr = getProgramScreenshots(progKey);
  if (!arr[index]) return;
  const newCap = prompt('새 캡션:', arr[index].caption || '');
  if (newCap === null) return;
  arr[index].caption = newCap;
  saveProgramScreenshots(progKey, arr);
  showProgramDetail(progKey);
}

// 순서 변경 (앞으로/뒤로) — 비번 보호
async function moveScreenshot(progKey, index, dir) {
  if (!(await checkDeletePassword())) return;
  const arr = getProgramScreenshots(progKey);
  const target = index + dir;
  if (target < 0 || target >= arr.length) return;
  [arr[index], arr[target]] = [arr[target], arr[index]];
  saveProgramScreenshots(progKey, arr);
  showProgramDetail(progKey);
}

// 기본값으로 복원 — 비번 보호
async function resetProgramScreenshots(progKey) {
  if (!(await checkDeletePassword())) return;
  if (!confirm('이 프로그램의 모든 사진을 초기값으로 되돌리시겠습니까?\n(추가/교체한 사진은 모두 사라집니다.)\n\n⚠️ 모든 단말에서 즉시 반영됩니다.')) return;
  // 1) 로컬 키·메타 모두 제거
  localStorage.removeItem(SCREENSHOTS_KEY(progKey));
  localStorage.removeItem(SCREENSHOTS_KEY(progKey) + '_meta');
  // 2) Firestore 문서도 삭제 — 안 그러면 다음 sync 때 PULL 되어 다시 살아남
  if (typeof fbDb !== 'undefined' && !localStorage.getItem('fbQuotaExceededAt')) {
    try {
      await fbDb.collection('programScreenshots').doc(progKey).delete();
      console.log('🗑 Firestore 스크린샷 삭제:', progKey);
    } catch (e) {
      console.warn('Firestore 스크린샷 삭제 실패 (다음 동기화 때 다시 살아날 수 있음):', e.message);
    }
  }
  if (typeof logActivity === 'function') logActivity('사진 초기화: ' + progKey);
  showProgramDetail(progKey);
}

function renderProgramCardHtml(key, p, rank) {
  const isDone = !!p.completed || (!!p.link && p.link !== '#');
  const isFeatured = !!p.featured;
  const statusBadge = isDone
    ? '<span class="prog-status prog-done">완료</span>'
    : '<span class="prog-status prog-dev">개발중</span>';
  // 항상 실제 desc 노출 — 편집한 내용이 카드에 즉시 보이도록. 상태는 뱃지로 구분.
  const desc = `<p>${esc(p.desc || '')}</p>`;
  const rankClass = rank === 1 ? ' rank-gold' : rank === 2 ? ' rank-silver' : rank === 3 ? ' rank-bronze' : '';
  const rankBadge = rank ? `<span class="card-rank-no${rankClass}" title="클릭 랭킹 ${rank}위">${rank}</span>` : '';

  if (isFeatured) {
    return `
      <div class="program-card is-featured ${isDone ? '' : 'is-dev'}" onclick="showProgramDetail('${key}')">
        ${rankBadge}
        <div class="featured-ribbon">${esc(p.ribbonText || '👑 CORE · AI 메인 ⭐')}</div>
        <div class="featured-stars">${p.stars || '⭐⭐⭐'}</div>
        <div class="prog-header">
          <h3>${p.crown ? p.crown + ' ' : ''}<span class="featured-name">${esc(p.name)}</span> ${p.stars || ''}</h3>
          ${statusBadge}
        </div>
        ${desc}
        <div class="featured-tags">
          <span class="ft-ai">🤖 AI</span>
          <span class="ft-core">⭐ 핵심</span>
          <span class="ft-main">🏆 메인</span>
          <span class="ft-crown">👑 CORE</span>
        </div>
        <span class="card-tag">${esc(p.tag)}</span>
      </div>`;
  }

  return `
    <div class="program-card ${isDone ? '' : 'is-dev'}" onclick="showProgramDetail('${key}')">
      ${rankBadge}
      <div class="card-icon">${p.icon}</div>
      <div class="prog-header">
        <h3>${esc(p.name)}</h3>
        ${statusBadge}
      </div>
      ${desc}
      <span class="card-tag">${esc(p.tag)}</span>
    </div>`;
}

function renderPrograms() {
  const gridCompleted = document.getElementById('programsGrid');
  const gridDev = document.getElementById('devProgramsGrid');
  const hidden = getHiddenPrograms();
  const admin = isAdmin();

  // 번호 뱃지는 클릭 랭킹(DESC) 기준 — 통계 모달과 완전히 동일 (같은 헬퍼 사용)
  const rankByKey = getProgramRankMap();

  // 표시 순서 = 클릭 랭킹 순서 → 앞에서부터 1, 2, 3, 4... 카드 위치가 통계 번호와 1:1 일치
  const all = Object.entries(programData)
    .filter(([k]) => !hidden.includes(k))
    .sort(([keyA], [keyB]) => (rankByKey[keyA] || 9999) - (rankByKey[keyB] || 9999));

  if (gridCompleted) {
    gridCompleted.innerHTML = all.length
      ? all.map(([k, p]) => renderProgramCardHtml(k, p, rankByKey[k])).join('')
      : '<div class="empty-state">📭 등록된 프로그램이 없습니다.</div>';
  }
  // devProgramsGrid는 더 이상 사용 안 함 (탭 삭제됨)
  if (gridDev) gridDev.innerHTML = '';

  // 휴지통 영역 — 빌트인 숨김 + 사용자 추가 삭제분 통합
  const trashHost = document.getElementById('programTrash');
  if (trashHost) {
    const deletedUser = (typeof getDeletedPrograms === 'function') ? getDeletedPrograms() : {};
    const totalTrash = hidden.length + Object.keys(deletedUser).length;
    if (totalTrash > 0) {
      trashHost.style.display = 'block';
      trashHost.innerHTML = `
        <div class="trash-header">
          <h3>🗑 휴지통 (${totalTrash}건)</h3>
          <div style="display:flex; gap:6px;">
            <button class="btn btn-outline btn-sm" onclick="restoreAllPrograms()">↺ 전체 복원</button>
            ${Object.keys(deletedUser).length ? '<button class="btn btn-outline btn-sm" onclick="emptyTrash()">🗑 사용자 휴지통 비우기</button>' : ''}
          </div>
        </div>
        <div class="trash-list">
          ${Object.entries(deletedUser).map(([k, p]) => {
            const dDate = p.deletedAt ? new Date(p.deletedAt).toLocaleDateString('ko-KR') : '-';
            return `
              <div class="trash-item">
                <span class="trash-name">${esc(p.name)}</span>
                <span class="trash-tag">${esc(p.tag || '')} · 사용자 추가</span>
                <span style="color:var(--text-muted); font-size:0.78rem;">삭제 ${dDate}</span>
                <button class="btn-mini" onclick="restoreUserProgram('${k}')">↺ 복원</button>
                <button class="btn-mini btn-mini-danger" onclick="permanentDeleteUserProgram('${k}')">🗑 영구삭제</button>
              </div>`;
          }).join('')}
          ${hidden.map(k => {
            const p = programData[k];
            if (!p) return '';
            return `
              <div class="trash-item">
                <span class="trash-name">${esc(p.name)}</span>
                <span class="trash-tag">${esc(p.tag)} · 빌트인</span>
                <button class="btn-mini" onclick="restoreProgram('${k}')">↺ 복원</button>
                <button class="btn-mini btn-mini-danger" onclick="permanentDeleteBuiltin('${k}')">🗑 영구삭제</button>
              </div>`;
          }).join('')}
        </div>`;
    } else {
      trashHost.style.display = 'none';
      trashHost.innerHTML = '';
    }
  }
}

function showProgramDetail(key) {
  const data = programData[key];
  if (!data) return;
  document.getElementById('programList').style.display = 'none';
  document.getElementById('programDetail').style.display = 'block';

  // 통합 렌더 — 개발중·완료 모두 같은 풀 상세 표시. 상태 뱃지/접속 버튼만 분기.
  const hasUrl = !!data.link && data.link !== '#';
  const hasFile = !!data.attachment;
  const isDone = !!data.completed || hasUrl;
  const clickCount = getProgramClickCount(key);
  let linkHtml;
  if (hasUrl) {
    linkHtml = `<div class="access-row">
         <button class="btn btn-primary detail-link-btn" onclick="openSecureLink('${key}')">📖 ${esc(data.name)} 접속하기 →</button>
         <span class="click-count-badge" id="clickCountBadge_${key}">👁 클릭 ${clickCount}회</span>
       </div>`;
  } else if (isDone && hasFile) {
    linkHtml = `<div class="access-row">
         <a href="${data.attachment.data}" download="${esc(data.attachment.name)}" class="btn btn-primary detail-link-btn" style="text-decoration:none;">📥 ${esc(data.attachment.name)} 다운로드</a>
         <span class="click-count-badge">📎 파일 (${(data.attachment.size/1024).toFixed(1)} KB)</span>
       </div>`;
  } else if (isDone) {
    linkHtml = `<div class="locked-link">
         <button class="btn btn-outline detail-link-btn" disabled>✅ 완료 — 접속 URL·파일 미등록</button>
         <p class="locked-msg">완료로 표시됐지만 접속 URL 또는 파일이 아직 없습니다.</p>
       </div>`;
  } else {
    linkHtml = `<div class="locked-link">
         <button class="btn btn-outline detail-link-btn" disabled>⏳ 준비 중</button>
         <p class="locked-msg">현재 개발 중입니다. URL 또는 파일을 등록하고 [✅ 완료로 표시] 버튼을 누르면 활성화됩니다.</p>
       </div>`;
  }

  // 메타 정보 (버전, 플랫폼, 기술스택, 워크플로우)
  const accessLabel = hasUrl ? '✅ 공개됨' : '⏳ 준비 중';
  const metaHtml = (data.version || data.platform || data.techStack || data.workflow) ? `
    <div class="detail-meta-row">
      ${data.version ? `<span class="detail-meta"><b>버전</b> ${esc(data.version)}</span>` : ''}
      ${data.platform ? `<span class="detail-meta"><b>플랫폼</b> ${esc(data.platform)}</span>` : ''}
      ${data.techStack ? `<span class="detail-meta"><b>기술</b> ${esc(data.techStack)}</span>` : ''}
      ${data.workflow ? `<span class="detail-meta"><b>흐름</b> ${esc(data.workflow)}</span>` : ''}
      <span class="detail-meta"><b>접속</b> <em style="color:var(--text-muted);">${accessLabel}</em></span>
    </div>` : '';

  // 스크린샷 갤러리 (localStorage 우선, 기본값 fallback)
  const screenshots = getProgramScreenshots(key);
  // 공개 모드: 컨트롤은 항상 노출하되, 클릭 시 비번 prompt로 보호 (checkDeletePassword)
  const admin = true;
  const screenshotsHtml = `
    <div class="detail-section">
      <h3>📸 스크린샷
        ${admin ? `<span class="ss-admin-controls">
          <button class="btn-mini" onclick="triggerAddScreenshot('${key}')">📤 사진 추가</button>
          <button class="btn-mini btn-mini-warn" onclick="resetProgramScreenshots('${key}')">↺ 초기값 복원</button>
        </span>` : ''}
      </h3>
      ${screenshots.length ? `
        <div class="screenshots-grid">
          ${screenshots.map((s, i) => `
            <figure class="screenshot-item">
              <a href="${esc(s.url)}" target="_blank">
                <img src="${esc(s.url)}" alt="${esc(s.caption || '스크린샷')}" loading="lazy"
                     onerror="this.src='${makePlaceholderSvg(data.name, s.caption)}'; this.onerror=null;">
              </a>
              <figcaption>
                ${esc(s.caption || '(캡션 없음)')}
                ${s.custom ? '<span class="ss-tag-custom">사용자 추가</span>' : ''}
              </figcaption>
              ${admin ? `<div class="ss-admin-row">
                <button class="btn-mini" onclick="triggerReplaceScreenshot('${key}', ${i})" title="교체">🔁 교체</button>
                <button class="btn-mini" onclick="editScreenshotCaption('${key}', ${i})" title="캡션 수정">✏️ 캡션</button>
                <button class="btn-mini" onclick="moveScreenshot('${key}', ${i}, -1)" title="앞으로" ${i === 0 ? 'disabled' : ''}>◀</button>
                <button class="btn-mini" onclick="moveScreenshot('${key}', ${i}, 1)" title="뒤로" ${i === screenshots.length - 1 ? 'disabled' : ''}>▶</button>
                <button class="btn-mini btn-mini-danger" onclick="deleteScreenshot('${key}', ${i})" title="삭제">🗑</button>
              </div>` : ''}
            </figure>
          `).join('')}
        </div>` : `
        <div class="screenshot-empty">
          📷 등록된 스크린샷이 없습니다.
          ${admin ? '<br><button class="btn btn-outline btn-sm" style="margin-top:10px;" onclick="triggerAddScreenshot(\'' + key + '\')">📤 첫 사진 추가</button>' : ''}
        </div>`}
      ${admin ? '<p class="screenshot-note">※ 관리자: 사진을 추가/교체/삭제할 수 있습니다. 이미지는 브라우저(localStorage)에 저장되며, 파일은 3MB 이하 권장.</p>' : ''}
    </div>`;

  document.getElementById('programDetailContent').innerHTML = `
    <div class="detail-card">
      <div class="detail-header">
        <div class="detail-icon">${data.icon}</div>
        <div>
          <h2>${esc(data.name)}</h2>
          <span class="card-tag">${esc(data.tag)}</span>
          ${isDone
            ? '<span class="prog-status prog-done" style="margin-left:8px;">완료</span>'
            : '<span class="prog-status prog-dev" style="margin-left:8px;">개발중</span>'}
        </div>
        <div class="detail-top-actions">
          ${isDone
            ? `<button class="top-action-btn top-action-warn" onclick="toggleProgramStatus('${key}')" title="개발중으로 표시 (🔐 비번)">🚧 개발중</button>`
            : `<button class="top-action-btn top-action-done" onclick="toggleProgramStatus('${key}')" title="완료로 표시 (🔐 비번)">✅ 완료</button>`}
          <button class="top-action-btn" onclick="editProgramContent('${key}')" title="이름·설명·기능 편집 (🔐 비번)">✏️ 편집</button>
          <button class="top-action-btn" onclick="editProgramLink('${key}')" title="URL 편집 (🔐 비번)">📝 URL</button>
          <label class="top-action-btn" style="cursor:pointer; margin:0;" title="스크린샷 추가 (🔐 관리자 전용)"
                 onclick="if(!_guardAdminUpload('스크린샷 추가')){event.preventDefault();return false;}">
            📷 사진
            <input type="file" accept="image/*" style="display:none;" onchange="uploadProgramScreenshot('${key}', this)">
          </label>
          <label class="top-action-btn" style="cursor:pointer; margin:0;" title="파일 첨부 (🔐 관리자 전용)"
                 onclick="if(!_guardAdminUpload('파일 첨부')){event.preventDefault();return false;}">
            📎 파일
            <input type="file" accept="image/*,application/pdf,.zip" style="display:none;" onchange="uploadProgramAttachment('${key}', this)">
          </label>
          ${data.featured ? '' : `<button class="top-action-btn top-action-danger" onclick="quickDeleteProgram('${key}'); hideProgramDetail();" title="이 프로그램 삭제 (🔐 비번)">🗑 삭제</button>`}
        </div>
      </div>
      ${metaHtml}
      <div class="detail-section detail-section-access"><h3>🔗 접속 / 바로가기</h3>${linkHtml}</div>
      <div class="detail-section"><h3>📌 소개</h3><p>${esc(data.desc)}</p></div>
      ${screenshotsHtml}
      ${data.attachment ? `
        <div class="detail-section">
          <h3>📎 첨부 파일</h3>
          <a href="${data.attachment.data}" download="${esc(data.attachment.name)}" class="btn btn-outline btn-sm" style="text-decoration:none;">
            📥 ${esc(data.attachment.name)} (${(data.attachment.size/1024).toFixed(1)} KB)
          </a>
          ${data.attachment.type && data.attachment.type.startsWith('image/')
            ? `<div style="margin-top:12px;"><img src="${data.attachment.data}" alt="${esc(data.attachment.name)}" style="max-width:100%; border:1px solid var(--border); border-radius:8px;"></div>`
            : ''}
        </div>` : ''}
      <div class="detail-section program-comments-section" id="progCommentsSection_${key}">
        ${renderProgramCommentsHtml(key)}
      </div>
    </div>`;
  window.scrollTo(0, 0);
}

function hideProgramDetail() {
  document.getElementById('programList').style.display = 'block';
  document.getElementById('programDetail').style.display = 'none';
}

// ============================================================
// 프로그램 정의 순서 기반 통합 번호 — 통계 모달과 AI 프로그램 그리드가 동일한 번호를 보이도록
// featured(👑 CORE) 가 1번, 나머지는 programData 정의 순서대로 2, 3, 4...
// 클릭 횟수와 무관하게 카드 위치 = 통계 번호 가 항상 일치
// ============================================================
function getProgramRankMap() {
  const hidden = (typeof getHiddenPrograms === 'function') ? getHiddenPrograms() : [];
  const sortedEntries = Object.entries(programData)
    .filter(([k]) => !hidden.includes(k))
    .sort(([, a], [, b]) => {
      if (a.featured && !b.featured) return -1;
      if (!a.featured && b.featured) return 1;
      return 0; // 정의 순서 유지 (Object.entries 가 insertion order 보장)
    });
  const map = {};
  sortedEntries.forEach(([k], i) => { map[k] = i + 1; });
  return map;
}

// ============================================================
// 프로그램별 댓글 시스템 — 공개 / 비공개(비밀번호 보호) 선택
// ============================================================
const PROG_COMMENTS_KEY = (key) => `fireSugiProgComments_${key}`;
const PROG_COMMENT_REVEALED_KEY = (key) => `fireSugiProgCommentRevealed_${key}`;
const PROG_COMMENT_OWNED_KEY = (key) => `fireSugiProgCommentOwned_${key}`; // 작성자 본인 식별 (영구)

function getProgramComments(key) {
  try { return JSON.parse(localStorage.getItem(PROG_COMMENTS_KEY(key)) || '[]'); }
  catch { return []; }
}
function saveProgramComments(key, arr) {
  const now = Date.now();
  localStorage.setItem(PROG_COMMENTS_KEY(key), JSON.stringify(arr));
  localStorage.setItem(PROG_COMMENTS_KEY(key) + '_meta', JSON.stringify({ updatedAt: now }));
  // Firestore push (quota 살아있을 때만)
  if (typeof fbDb !== 'undefined' && !localStorage.getItem('fbQuotaExceededAt')) {
    const size = JSON.stringify(arr).length;
    if (size <= 950 * 1024) {
      fbDb.collection('programComments').doc(key)
        .set({ comments: arr, updatedAt: now }, { merge: true })
        .catch(e => console.warn('댓글 push 실패:', e.message));
    }
  }
}
function getRevealedComments(key) {
  try { return JSON.parse(sessionStorage.getItem(PROG_COMMENT_REVEALED_KEY(key)) || '[]'); }
  catch { return []; }
}
function markCommentRevealed(key, id) {
  const arr = getRevealedComments(key);
  if (!arr.includes(id)) {
    arr.push(id);
    sessionStorage.setItem(PROG_COMMENT_REVEALED_KEY(key), JSON.stringify(arr));
  }
}
// 작성자 본인 식별 — localStorage 에 ID 영구 저장 (세션·브라우저 재시작 후에도 유지)
function getOwnedComments(key) {
  try { return JSON.parse(localStorage.getItem(PROG_COMMENT_OWNED_KEY(key)) || '[]'); }
  catch { return []; }
}
function markOwned(key, id) {
  const arr = getOwnedComments(key);
  if (!arr.includes(id)) {
    arr.push(id);
    localStorage.setItem(PROG_COMMENT_OWNED_KEY(key), JSON.stringify(arr));
  }
}
function isOwnComment(key, id) {
  return getOwnedComments(key).includes(id);
}
// 댓글 트리에서 id 로 댓글(또는 답글) 찾기
function findCommentById(arr, id) {
  for (const c of arr) {
    if (c.id === id) return { comment: c, parent: null };
    if (Array.isArray(c.replies)) {
      for (const r of c.replies) {
        if (r.id === id) return { comment: r, parent: c };
      }
    }
  }
  return null;
}

function renderCommentItem(key, c, depth) {
  const adminMode = (typeof isAdmin === 'function') && isAdmin();
  const revealed = getRevealedComments(key).includes(c.id);
  const own = isOwnComment(key, c.id);
  const isPrivate = !!c.passwordHash;
  const canShow = !isPrivate || own || revealed || adminMode;
  const canEdit = own || adminMode;
  const replies = Array.isArray(c.replies) ? c.replies : [];

  const textHtml = canShow
    ? `<div class="prog-comment-text">${esc(c.text)}</div>`
    : `<div class="prog-comment-text prog-comment-locked" onclick="revealProgramComment('${key}', '${c.id}')">
         🔒 비공개 댓글 — 클릭하여 비밀번호 입력
       </div>`;

  // depth 0 댓글에만 답글 토글, depth 1(답글) 에는 없음
  const replyArea = depth === 0 ? `
    <div class="prog-comment-actions">
      <button class="prog-reply-btn" onclick="toggleReplyForm('${key}', '${c.id}')">↩ 답글</button>
      ${replies.length ? `<span class="prog-reply-count">답글 ${replies.length}</span>` : ''}
    </div>
    <div class="prog-reply-form" id="replyForm_${c.id}" style="display:none;">
      <input type="text" class="prog-cmt-author" id="replyAuthor_${c.id}" placeholder="닉네임" maxlength="20">
      <input type="text" class="prog-cmt-input" id="replyInput_${c.id}" placeholder="답글 — Enter 로 등록" maxlength="300"
             onkeydown="if(event.key==='Enter'&&!event.shiftKey){event.preventDefault();submitProgramReply('${key}','${c.id}')}">
      <label class="prog-cmt-toggle" title="🔒 비공개">
        <input type="checkbox" id="replyPrivate_${c.id}" onchange="toggleReplyPrivate('${c.id}')"> 🔒
      </label>
      <input type="password" class="prog-cmt-pwd" id="replyPwd_${c.id}" placeholder="비번 4자+" style="display:none;" maxlength="20">
      <button class="btn btn-primary btn-sm" onclick="submitProgramReply('${key}','${c.id}')">등록</button>
    </div>
    ${replies.length ? `<div class="prog-replies">${replies.map(r => renderCommentItem(key, r, 1)).join('')}</div>` : ''}
  ` : '';

  return `<div class="prog-comment-item ${depth ? 'prog-comment-reply' : ''}">
    <div class="prog-comment-header">
      <span class="prog-comment-author">${depth ? '↳ ' : '👤 '}${esc(c.author)}</span>
      ${isPrivate ? '<span class="prog-comment-private-badge">🔒 비공개</span>' : '<span class="prog-comment-public-badge">🌐 공개</span>'}
      ${own ? '<span class="prog-comment-own-badge" title="내가 작성한 댓글">⭐ 내 글</span>' : ''}
      <span class="prog-comment-date">${esc(c.date)}</span>
      ${canEdit ? `<button class="prog-comment-edit" onclick="editProgramComment('${key}', '${c.id}')" title="수정">✏️</button>` : ''}
      <button class="prog-comment-del" onclick="deleteProgramComment('${key}', '${c.id}')" title="삭제">🗑</button>
    </div>
    ${textHtml}
    ${replyArea}
  </div>`;
}

function renderProgramCommentsHtml(key) {
  const comments = getProgramComments(key);
  const cnt = comments.length;
  const list = cnt
    ? comments.map(c => renderCommentItem(key, c, 0)).join('')
    : '<p class="prog-comment-empty">아직 댓글이 없습니다. 첫 번째로 의견을 남겨보세요!</p>';

  return `
    <h3>💬 댓글 <span class="prog-comment-count">${cnt}</span></h3>
    <div class="prog-comments-list">${list}</div>
    <div class="prog-comment-write">
      <div class="prog-cmt-row">
        <input type="text" class="prog-cmt-author" id="progCmtAuthor_${key}" placeholder="닉네임" maxlength="20"
               title="비우면 익명_XXXX 자동 부여">
        <input type="text" class="prog-cmt-input" id="progCmtInput_${key}" placeholder="이 프로그램 의견·질문·후기 — Enter 로 등록" maxlength="500"
               onkeydown="if(event.key==='Enter'&&!event.shiftKey){event.preventDefault();submitProgramComment('${key}')}">
        <label class="prog-cmt-toggle" title="🔒 비공개: 비밀번호 아는 사람만 본문 열람">
          <input type="checkbox" id="progCmtPrivate_${key}" onchange="togglePrivateInput('${key}')">
          🔒
        </label>
        <input type="password" class="prog-cmt-pwd" id="progCmtPwd_${key}" placeholder="비번 4자+" style="display:none;" maxlength="20">
        <button class="btn btn-primary btn-sm prog-cmt-submit" onclick="submitProgramComment('${key}')">등록</button>
      </div>
      <p class="prog-cmt-note">※ 비밀댓글은 작성자와 관리자만 본문·수정 가능 (이 기기에 작성자 식별 저장) · Enter 로 등록</p>
    </div>`;
}

function togglePrivateInput(key) {
  const cb = document.getElementById(`progCmtPrivate_${key}`);
  const pwd = document.getElementById(`progCmtPwd_${key}`);
  if (cb && pwd) pwd.style.display = cb.checked ? 'block' : 'none';
}
window.togglePrivateInput = togglePrivateInput;

function refreshProgCommentSection(key) {
  const sec = document.getElementById(`progCommentsSection_${key}`);
  if (sec) sec.innerHTML = renderProgramCommentsHtml(key);
}

function makeCommentDate() {
  const n = new Date();
  return `${n.getFullYear()}.${String(n.getMonth()+1).padStart(2,'0')}.${String(n.getDate()).padStart(2,'0')} ${String(n.getHours()).padStart(2,'0')}:${String(n.getMinutes()).padStart(2,'0')}`;
}
function makeCommentId() {
  return `c${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

async function submitProgramComment(key) {
  const authorEl = document.getElementById(`progCmtAuthor_${key}`);
  const inputEl = document.getElementById(`progCmtInput_${key}`);
  const privateEl = document.getElementById(`progCmtPrivate_${key}`);
  const pwdEl = document.getElementById(`progCmtPwd_${key}`);
  if (!inputEl) return;
  const text = inputEl.value.trim();
  if (!text) return alert('댓글 내용을 입력하세요.');
  let author = (authorEl && authorEl.value.trim()) || '';
  if (!author) author = `익명_${Math.floor(Math.random() * 9000 + 1000)}`;

  let passwordHash = null;
  if (privateEl && privateEl.checked) {
    const pwd = (pwdEl && pwdEl.value) || '';
    if (pwd.length < 4) return alert('비공개 댓글은 4자 이상 비밀번호가 필요합니다.');
    passwordHash = await sha256(pwd);
  }

  const id = makeCommentId();
  const arr = getProgramComments(key);
  arr.push({ id, author, text, date: makeCommentDate(), passwordHash, replies: [] });
  saveProgramComments(key, arr);
  markOwned(key, id); // 작성자 본인 식별 영구 저장 (브라우저 재시작 후에도 본인 글 인식)
  if (passwordHash) markCommentRevealed(key, id);
  if (typeof logActivity === 'function') logActivity(`프로그램 댓글 등록: ${key} (${author}${passwordHash ? ' · 비공개' : ''})`);
  refreshProgCommentSection(key);
}
window.submitProgramComment = submitProgramComment;

// 답글 등록
function toggleReplyForm(key, parentId) {
  const form = document.getElementById(`replyForm_${parentId}`);
  if (form) form.style.display = form.style.display === 'none' ? 'flex' : 'none';
}
window.toggleReplyForm = toggleReplyForm;

function toggleReplyPrivate(parentId) {
  const cb = document.getElementById(`replyPrivate_${parentId}`);
  const pwd = document.getElementById(`replyPwd_${parentId}`);
  if (cb && pwd) pwd.style.display = cb.checked ? 'block' : 'none';
}
window.toggleReplyPrivate = toggleReplyPrivate;

async function submitProgramReply(key, parentId) {
  const authorEl = document.getElementById(`replyAuthor_${parentId}`);
  const inputEl = document.getElementById(`replyInput_${parentId}`);
  const privateEl = document.getElementById(`replyPrivate_${parentId}`);
  const pwdEl = document.getElementById(`replyPwd_${parentId}`);
  if (!inputEl) return;
  const text = inputEl.value.trim();
  if (!text) return alert('답글 내용을 입력하세요.');
  let author = (authorEl && authorEl.value.trim()) || '';
  if (!author) author = `익명_${Math.floor(Math.random() * 9000 + 1000)}`;

  let passwordHash = null;
  if (privateEl && privateEl.checked) {
    const pwd = (pwdEl && pwdEl.value) || '';
    if (pwd.length < 4) return alert('비공개 답글은 4자 이상 비밀번호가 필요합니다.');
    passwordHash = await sha256(pwd);
  }

  const arr = getProgramComments(key);
  const parent = arr.find(c => c.id === parentId);
  if (!parent) return alert('원 댓글을 찾을 수 없습니다.');
  if (!Array.isArray(parent.replies)) parent.replies = [];

  const id = makeCommentId();
  parent.replies.push({ id, author, text, date: makeCommentDate(), passwordHash });
  saveProgramComments(key, arr);
  markOwned(key, id);
  if (passwordHash) markCommentRevealed(key, id);
  if (typeof logActivity === 'function') logActivity(`프로그램 답글 등록: ${key} (${author})`);
  refreshProgCommentSection(key);
}
window.submitProgramReply = submitProgramReply;

async function revealProgramComment(key, id) {
  const arr = getProgramComments(key);
  const found = findCommentById(arr, id);
  if (!found) return;
  const c = found.comment;
  if (isOwnComment(key, id)) { markCommentRevealed(key, id); refreshProgCommentSection(key); return; }
  if (!c.passwordHash) { markCommentRevealed(key, id); refreshProgCommentSection(key); return; }
  const pwd = prompt('🔒 비공개 댓글 — 비밀번호 입력:');
  if (pwd === null) return;
  const h = await sha256(pwd);
  if (h !== c.passwordHash) return alert('비밀번호가 일치하지 않습니다.');
  markCommentRevealed(key, id);
  refreshProgCommentSection(key);
}
window.revealProgramComment = revealProgramComment;

async function editProgramComment(key, id) {
  const arr = getProgramComments(key);
  const found = findCommentById(arr, id);
  if (!found) return;
  const c = found.comment;
  const adminMode = (typeof isAdmin === 'function') && isAdmin();
  if (!(isOwnComment(key, id) || adminMode)) {
    return alert('🔒 본인이 작성한 댓글 또는 관리자만 수정할 수 있습니다.');
  }
  // 비공개 글이고 관리자가 아니면 비번 확인 (작성자라도 비번 분실 시 막혀야 함은 user-side trust 이슈 — 본 기기 표시면 OK)
  const newText = prompt('댓글 수정:', c.text);
  if (newText === null) return;
  const trimmed = newText.trim();
  if (!trimmed) return alert('빈 댓글로 수정할 수 없습니다.');
  c.text = trimmed;
  c.date = makeCommentDate() + ' (수정됨)';
  saveProgramComments(key, arr);
  if (typeof logActivity === 'function') logActivity(`프로그램 댓글 수정: ${key} (${c.author})`);
  refreshProgCommentSection(key);
}
window.editProgramComment = editProgramComment;

async function deleteProgramComment(key, id) {
  const arr = getProgramComments(key);
  const found = findCommentById(arr, id);
  if (!found) return;
  const c = found.comment;
  const adminMode = (typeof isAdmin === 'function') && isAdmin();
  const own = isOwnComment(key, id);
  if (!adminMode && !own) {
    // 비관리자·비소유자: 비공개면 비번 확인, 공개면 차단
    if (!c.passwordHash) {
      return alert('🔒 공개 댓글은 관리자만 삭제할 수 있습니다.');
    }
    const pwd = prompt('🔐 본인 댓글 삭제 — 작성 시 입력한 비밀번호:');
    if (pwd === null) return;
    const h = await sha256(pwd);
    if (h !== c.passwordHash) return alert('비밀번호가 일치하지 않습니다.');
  } else {
    if (!confirm(`이 ${found.parent ? '답글' : '댓글'}을 삭제하시겠습니까?\n작성자: ${c.author}`)) return;
  }
  // 트리에서 제거
  if (found.parent) {
    found.parent.replies = found.parent.replies.filter(r => r.id !== id);
  } else {
    const idx = arr.findIndex(x => x.id === id);
    if (idx >= 0) arr.splice(idx, 1);
  }
  saveProgramComments(key, arr);
  if (typeof logActivity === 'function') logActivity(`프로그램 댓글 삭제: ${key} (${c.author})`);
  refreshProgCommentSection(key);
}
window.deleteProgramComment = deleteProgramComment;

// 프로그램 클릭 횟수 카운터 (localStorage + Firestore 양방향 sync)
const PROG_CLICKS_KEY = 'fireSugiProgramClicks';
function getProgramClicks() {
  return JSON.parse(localStorage.getItem(PROG_CLICKS_KEY) || '{}');
}
function getProgramClickCount(key) {
  const clicks = getProgramClicks();
  return (clicks[key] && clicks[key].count) || 0;
}
function incrementProgramClicks(key) {
  const clicks = getProgramClicks();
  if (!clicks[key]) clicks[key] = { count: 0 };
  clicks[key].count++;
  clicks[key].lastClick = Date.now();
  localStorage.setItem(PROG_CLICKS_KEY, JSON.stringify(clicks));
  // Firestore 백업 (quota 살아있을 때만) — 다른 단말 / 브라우저 캐시 클리어 후에도 복원 가능
  if (typeof fbDb !== 'undefined' && !localStorage.getItem('fbQuotaExceededAt')) {
    fbDb.collection('programClicks').doc('global')
      .set({ clicks, updatedAt: Date.now() }, { merge: true })
      .catch(e => console.warn('클릭 카운터 push 실패:', e.message));
  }
}

// 페이지 로드 시 Firestore 에서 클릭 카운터 PULL — 로컬 비어있을 때만 복원
async function pullProgramClicksFromFirestore() {
  if (typeof fbDb === 'undefined' || localStorage.getItem('fbQuotaExceededAt')) return;
  try {
    const doc = await fbDb.collection('programClicks').doc('global').get();
    if (!doc.exists) return;
    const data = doc.data();
    if (!data || !data.clicks) return;
    const local = getProgramClicks();
    // 로컬이 비어있거나 카운트가 더 적으면 Firestore 값으로 보강
    const localTotal = Object.values(local).reduce((s, p) => s + (p.count || 0), 0);
    const remoteTotal = Object.values(data.clicks).reduce((s, p) => s + (p.count || 0), 0);
    if (remoteTotal > localTotal) {
      // 각 키별로 max(local, remote) 머지
      const merged = { ...local };
      Object.entries(data.clicks).forEach(([k, v]) => {
        const lCnt = merged[k]?.count || 0;
        const rCnt = v.count || 0;
        if (rCnt > lCnt) merged[k] = { count: rCnt, lastClick: v.lastClick || Date.now() };
      });
      localStorage.setItem(PROG_CLICKS_KEY, JSON.stringify(merged));
      console.log(`📊 클릭 카운터 ${remoteTotal}건 복원 (로컬 ${localTotal}건 → ${remoteTotal}건)`);
      if (typeof renderPrograms === 'function') renderPrograms();
    }
  } catch (e) {
    console.warn('클릭 카운터 pull 실패:', e.message);
  }
}
window.pullProgramClicksFromFirestore = pullProgramClicksFromFirestore;
// 페이지 로드 후 1초 후 자동 PULL (Firebase 초기화 대기)
setTimeout(() => { pullProgramClicksFromFirestore(); }, 1000);

// 공개 모드 — 누구나 프로그램 접속 가능 (권한 체크 제거)
function openSecureLink(key) {
  const data = programData[key];
  if (!data) return;
  if (!data.link || data.link === '#') {
    alert('⏳ 아직 배포되지 않은 프로그램입니다.');
    return;
  }
  // 🛡 보안 — HTTP 링크는 사용자 확인 (HTTPS 강제 권장)
  if (data.link.startsWith('http://')) {
    const ok = confirm(
      '⚠️ 보안 경고\n\n' +
      '이 프로그램은 암호화되지 않은 HTTP 로 연결됩니다.\n' +
      '도청·MITM 공격 위험이 있습니다.\n\n' +
      '계속 진행하시겠습니까?'
    );
    if (!ok) return;
  }
  // 안전한 외부 새 탭 열기 (rel=noopener — opener 접근 차단)
  const a = document.createElement('a');
  a.href = data.link;
  a.target = '_blank';
  a.rel = 'noopener noreferrer';
  a.style.display = 'none';
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  incrementProgramClicks(key);
  if (typeof logActivity === 'function') logActivity('프로그램 접속: ' + key);
  const badge = document.getElementById('clickCountBadge_' + key);
  if (badge) badge.textContent = '👁 클릭 ' + getProgramClickCount(key) + '회';
}

// 프로그램 링크 클릭 핸들러 — 정회원/관리자만 통과
function openProgramLink(key) {
  const data = programData[key];
  if (!data) return;
  if (!data.link || data.link === '#') {
    alert('⏳ 아직 배포되지 않은 프로그램입니다.');
    return;
  }
  const tier = getTier();
  if (tier !== 'admin' && tier !== 'premium') {
    alert('🔒 정회원 또는 관리자만 이용할 수 있습니다.\n\n[회원정보] → 관리자에게 정회원 승급을 요청하세요.');
    return;
  }
  // <a> 태그 click 방식 — window.open()보다 안정적 (about:blank 방지)
  const a = document.createElement('a');
  a.href = data.link;
  a.target = '_blank';
  a.rel = 'noopener';
  a.style.display = 'none';
  document.body.appendChild(a);
  a.click();
  setTimeout(() => document.body.removeChild(a), 100);
  if (typeof logActivity === 'function') logActivity('프로그램 접속: ' + key);
}

// ===== REVEAL ANIMATION =====
function initReveal() {
  const reveals = document.querySelectorAll('.reveal');
  const obs = new IntersectionObserver(entries => {
    entries.forEach(e => {
      if (e.isIntersecting) {
        e.target.classList.add('active');
        // Once active, we don't need to observe it anymore
        obs.unobserve(e.target);
      }
    });
  }, { threshold: 0.1 });
  reveals.forEach(r => obs.observe(r));
}

// ===== BACK TO TOP =====
function initBackToTop() {
  const btn = document.getElementById('backToTop');
  if (!btn) return;
  window.addEventListener('scroll', () => {
    btn.classList.toggle('visible', window.scrollY > 300);
  });
  btn.addEventListener('click', (e) => {
    e.preventDefault();
    window.scrollTo({ top: 0, behavior: 'smooth' });
  });
}

// ===================================================================
// AUTO-POST SYSTEM (봇 자동 글쓰기 — 게시판에 매일 1건 자동 등록)
// ===================================================================
const AUTOPOST_KEY = 'fireSugiAutoPostLast';
const BOT_AUTHOR = 'FireSugi-Bot';

const AUTO_POST_POOL = [
  { title: '오늘의 학습 — NFTC 103 스프링클러설비',
    content: `📌 NFTC 103 스프링클러설비 핵심 정리\n\n▸ 헤드 설치 간격: 3.2~4.5m (장방형 배치 시 대각거리 5m 이내)\n▸ 가지배관 헤드 수: 8개 이하\n▸ 송수구 설치: 65mm 쌍구형, 지면 0.5~1m 높이\n▸ 수원량: 헤드 수 × 80L/min × 20분\n\n자체점검 시 자주 지적되는 사항:\n1. 헤드 페인트 칠 (필히 교체)\n2. 송수구 캡 분실\n3. 압력계·유수검지장치 시험 누락` },
  { title: '점검 메모 — 자동화재탐지설비 작동기능시험',
    content: `🔍 NFTC 203 작동기능시험 절차\n\n1. 수신기 → 동작시험 스위치 ON\n2. 회로별 시험버튼 순차 작동\n3. 지구표시등·주음향장치 정상 점등 확인\n4. 비화재보 시 즉시 복구\n\n주의: 시험 중에는 수신기 스위치를 반드시 시험 위치로 두고, 종료 후 복구하지 않으면 실제 화재 시 작동하지 않을 수 있음.` },
  { title: '법령 변경 — 화재안전기준 통합본 적용 시점',
    content: `⚖️ NFPC/NFTC 통합 체계 전환\n\n▸ 시행: 2026년 1월 1일\n▸ 적용 대상: 신축·증축·용도변경 시점부터\n▸ 기존 건물: 종전 NFSC 기준 유지 (소급 X)\n\n공사업자·관리업자 모두 통합본 숙지 필수. 별표 번호와 일부 수치 기준이 변경됐으니 점검표·계약서 양식도 갱신해야 함.` },
  { title: '사례 분석 — 물류창고 화재 원인과 교훈',
    content: `📦 최근 발생한 물류창고 화재 분석\n\n원인: 적치 높이 초과 → 스프링클러 헤드 차단\n결과: 초기 진압 실패, 전소\n\n교훈:\n• 적치 높이 = 헤드 직하 0.6m 이상 이격\n• 폭 1.2m 이상 통로 확보\n• 분기별 적치 상태 사진 점검 필수\n• 자동화재탐지·스프링클러 인터록 점검` },
  { title: '실무 팁 — 점검 지적서 작성 노하우',
    content: `📝 효율적인 지적서 작성 5단계\n\n1. 사진 + 위치(층/실명) 명시\n2. 위반 법조문 정확히 인용 (예: NFTC 103 2.7.1)\n3. 시정 기한 명시 (경미: 30일, 중대: 즉시)\n4. 조치 방법 구체적 제시\n5. 재점검 일자 합의\n\nFire-Sugi 자동 분석을 활용하면 1~2단계가 자동화돼 작성 시간이 80% 단축됩니다.` },
  { title: '안전 점검 — 겨울철 난방기구 화재 예방',
    content: `❄️ 겨울철 화재 다발 원인\n\n1위: 전기장판 (단선·노후)\n2위: 전기히터 (가연물 근접)\n3위: 가스보일러 (배기구 막힘)\n\n예방:\n• KS·KC 인증품 사용\n• 외출 시 전원 차단\n• 멀티탭 문어발 금지\n• 보일러 배기구 주변 1m 이내 가연물 제거` },
  { title: '교육 자료 — 의용소방대 기본 교육 정리',
    content: `🎓 의용소방대원 기본 과정\n\n▸ 화재 진압 절차: 인명구조 → 연소 확대 차단 → 소화\n▸ 호스 전개: 굴절 최소화, 30m 단위 결합\n▸ 응급처치: 심폐소생술 30:2 비율\n▸ 무전기 사용: 코드네임·간결한 보고\n\n2026년 표준교재 개정판이 5년 만에 발행됐으니 교육 시 신판으로 진행 권장.` },
  { title: 'AI 도구 활용 — Gemini API로 점검 메모 변환',
    content: `🤖 Fire-Sugi의 Gemini OCR 활용법\n\n수기 메모 사진 → 즉시 텍스트 변환 → 법규 자동 매칭 → 지적서 초안 생성\n\n사용 팁:\n• 메모는 검은 펜으로, 한 장에 한 항목\n• 사진 촬영 시 정면·플래시 켜기\n• 변환 후 항목별 검수 필수\n• 법조문 자동 인용은 90%+ 정확도` },
  { title: '연구 노트 — 리튬배터리 화재 진압 신기술',
    content: `🔋 리튬이온 배터리 화재 특성\n\n• 열폭주(thermal runaway) 시 자체 산소 공급\n• 일반 ABC 소화기 효과 제한적\n• 침수조(water immersion) 진압이 가장 효과적\n\n신기술:\n• 리튬 전용 D급 소화기\n• 진압포(fire blanket) 차폐\n• 격리 컨테이너로 외부 이송 후 침수` },
  { title: '월간 리포트 — 우리 동네 화재 통계',
    content: `📊 최근 한 달 통계 (가상 데이터)\n\n• 화재 건수: 142건 (전월比 -8%)\n• 인명피해: 사망 0, 부상 3\n• 주요 원인: 전기 32%, 부주의 28%, 방화 5%\n• 대응시간 평균: 5분 42초\n\n주거지역 비주거지 비율 7:3, 주거지 화재의 60%가 야간(22~05시) 발생.` },
  { title: '점검 체크리스트 — 옥내소화전설비',
    content: `✅ NFTC 102 옥내소화전 자체점검\n\n□ 함 표지판·축광 표시\n□ 호스·관창 결속·고정\n□ 노즐 막힘·변형\n□ 펌프 자동기동 (방수압 0.17MPa 이상)\n□ 토출량 130L/min 이상\n□ 수원량 충분 (130L/min × 20분 × 헤드수)\n\n2.5MPa 초과 시 감압장치 또는 호스밸브 분리 필수.` },
  { title: '소화기 종류와 적용 화재 정리',
    content: `🧯 소화기 분류\n\n• A급 (일반): 종이·목재·섬유 → 분말·물·강화액\n• B급 (유류): 휘발유·기름 → 분말·CO2·포\n• C급 (전기): 누전·합선 → CO2·분말·청정약제\n• D급 (금속): 마그네슘·리튬 → 전용 D급 약제\n• K급 (식용유): 주방 → 강화액·K급 전용\n\n다중이용시설은 A·B·C 겸용 분말 + 식당은 K급 추가.` },
  { title: '소방시설관리사 시험 대비 — 빈출 키워드',
    content: `📚 2026 시험 출제 동향\n\n빈출 분야:\n• 화재안전기준 통합본 (NFPC/NFTC)\n• 자체점검 제도 개편\n• 위험물 안전관리법 개정\n• 다중이용업소 안전기준\n\n실무사례 비중이 확대됐으니 사고사례·판례·점검 실제 사진을 기출 문제와 연결해 학습 권장.` },
  { title: '사고 처벌 사례 — 부실점검 행정처분',
    content: `⚖️ 최근 부실점검 처벌 사례\n\n사례1: 점검 미실시 위반 → 영업정지 1개월\n사례2: 허위 점검결과 보고 → 등록취소 + 과태료 1,000만원\n사례3: 안전관리자 미선임 → 200만원 과태료\n\n2026년 개정 시행규칙으로 부실점검 처벌이 강화됐고, 점검대장은 5년 보관 의무.` },
  { title: '화재 예방 — 다중이용업소 운영자가 꼭 알아야 할 5가지',
    content: `🏬 다중이용업소 안전 5계명\n\n1. 비상구 폐쇄·잠금 절대 금지\n2. 영업 중 자동화재탐지·스프링클러 작동 가능 상태 유지\n3. 가연성 인테리어 (스티로폼 등) 사용 금지\n4. 분기별 자체점검·연 1회 종합점검 필수\n5. 야간영업장은 비상조명·유도등 자동전환 점검\n\n위반 시 영업정지·과태료. 인명피해 시 형사처벌까지.` }
];

function getRecentBotPosts() {
  return getPosts().filter(p => p.author === BOT_AUTHOR);
}

// 봇 계정 자동 보장 (없으면 생성)
function ensureBotAccount() {
  const users = getUsers();
  if (!users.find(u => u.id === BOT_AUTHOR)) {
    const now = new Date();
    const joinDate = `${now.getFullYear()}.${String(now.getMonth()+1).padStart(2,'0')}.${String(now.getDate()).padStart(2,'0')}`;
    users.push({
      id: BOT_AUTHOR,
      pw: '__bot_' + Date.now(),  // 사람이 로그인 못 하도록 임의 PW
      joinDate, role: 'user', banned: false, lastLogin: null
    });
    saveUsers(users);
  }
}

function autoWritePost() {
  ensureBotAccount();
  const usedTitles = new Set(getRecentBotPosts().map(p => p.title));
  const unused = AUTO_POST_POOL.filter(t => !usedTitles.has(t.title));
  const pool = unused.length ? unused : AUTO_POST_POOL;
  const pick = pool[Math.floor(Math.random() * pool.length)];

  const posts = getPosts();
  const now = new Date();
  const date = `${now.getFullYear()}.${String(now.getMonth()+1).padStart(2,'0')}.${String(now.getDate()).padStart(2,'0')}`;

  const newPost = {
    id: Date.now() + Math.floor(Math.random() * 1000),
    author: BOT_AUTHOR,
    title: '🤖 ' + pick.title,
    content: pick.content + '\n\n———\n🤖 본 글은 Fire-Sugi 자동 글쓰기로 생성됐습니다.',
    date,
    views: 0,
    secret: false,
    comments: [],
    autoWritten: true
  };
  posts.push(newPost);
  savePosts(posts);

  if (typeof logActivity === 'function') logActivity('자동글: ' + pick.title.slice(0, 30));
  if (typeof renderBoard === 'function') renderBoard();
  return newPost;
}

// 일일 1회 자동 글쓰기 (페이지 방문 시 트리거)
function autoWriteDailyIfDue() {
  const last = localStorage.getItem(AUTOPOST_KEY);
  const today = (() => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
  })();
  if (last === today) return false;
  const post = autoWritePost();
  localStorage.setItem(AUTOPOST_KEY, today);
  console.log('🤖 자동 글 작성 완료:', post.title);
  return true;
}

// 관리자: 즉시 N건 생성 (테스트용)
function adminAutoWriteBatch(count) {
  if (!isAdmin()) return alert('관리자만 사용할 수 있습니다.');
  const n = Math.max(1, Math.min(20, parseInt(count) || 1));
  const created = [];
  for (let i = 0; i < n; i++) {
    created.push(autoWritePost());
  }
  alert(`✅ 자동 글 ${created.length}건 작성 완료\n\n` +
    created.map((p, i) => `${i+1}. ${p.title}`).join('\n'));
  return created;
}

// ===================================================================
// NEWS SYSTEM (일일 자동 수집 + 관리자 수동등록)
// ===================================================================
const NEWS_KEY = 'fireSugiNews';
const NEWS_LAST_AUTO = 'fireSugiNewsLastAuto';

// 큐레이션된 뉴스 풀 — 자동수집 시 순차 사용
// query 필드: 네이버 뉴스 실시간 검색에 사용 → 클릭 시 해당 키워드의 최신 실제 기사 목록으로 직행
const NEWS_POOL = [
  { source:'소방청', emoji:'🏛️', topic:'정책',
    title:'2026년 화재안전기준 통합본(NFPC/NFTC) 시행',
    summary:'소방청은 종전 NFSC(국가화재안전기준) 체계를 NFPC(성능기준)와 NFTC(기술기준)로 이원화한 통합 체계를 2026년 1월 1일부터 본격 시행한다고 밝혔다. 신축·증축·용도변경 시점부터 신기준이 적용되며, 기존 건물은 종전 기준 유지(소급 X). 별표 번호와 일부 수치 기준이 변경돼 점검표·계약서·교육자료 갱신이 필요하다. 소방시설관리사·공사업자·관리업자는 통합본 숙지 필수. 자세한 개정 사항과 경과조치는 소방청 화재안전기준 통합본 PDF에서 확인 가능.',
    query:'2026 화재안전기준 NFPC NFTC 시행' },
  { source:'소방신문', emoji:'❄️', topic:'사고',
    title:'겨울철 난방기구 화재 전년比 30% 급증',
    summary:'전국 소방서 집계 결과 12월~2월 사이 발생한 난방기구 관련 화재가 전년 동기 대비 30% 증가했다. 1위 원인은 전기장판 단선·노후 사용(42%), 2위는 전기히터 가연물 근접(28%), 3위는 가스보일러 배기구 막힘(15%). 사망자의 70%가 야간 취침 중 발생했으며, 평균 진화시간은 7분 12초로 일반 화재 대비 30% 길었다. 소방당국은 KS·KC 인증품 사용, 외출 시 전원 차단, 보일러 배기구 1m 이내 가연물 제거를 강력 권고했다.',
    query:'겨울철 난방기구 화재 전기장판' },
  { source:'소방청', emoji:'🏢', topic:'정책',
    title:'노후 아파트 스프링클러 설치 지원사업 본격 시행',
    summary:'1992년 12월 31일 이전 준공된 노후 아파트(전국 약 18만 세대)의 스프링클러 설치비를 정부가 50%까지 지원하는 사업이 본격 시행된다. 세대당 평균 250만원 한도이며, 입주자 의결을 거친 단지부터 신청 가능. 우선순위는 고층(15층 이상) → 중층(10~14층) → 저층 순. 지자체별 접수창구와 신청 자격 요건이 공고됐고, 현장조사·설계·시공·완공검사까지 평균 4~6개월 소요 예상. 대상 단지는 한국소방안전원 홈페이지에서 조회 가능.',
    query:'노후 아파트 스프링클러 설치 지원' },
  { source:'소방방재신문', emoji:'⚡', topic:'기술',
    title:'전기차 화재 진압 매뉴얼 개정 — 침수조 활용 표준화',
    summary:'리튬이온 배터리 특성을 고려한 전기차 화재 진압 매뉴얼 개정판이 공개됐다. 핵심은 (1) 일반 ABC 소화기 효과 제한적, (2) 열폭주(thermal runaway) 발생 시 1,200℃까지 상승, (3) 침수조(water immersion) 진압 또는 격리 컨테이너 이송이 가장 효과적이라는 점. 대당 진압에 필요한 물량은 30,000~110,000L로 일반 차량 화재의 30배에 달한다. 전국 주요 소방서에 전용 침수조 1,200대를 단계적으로 보급할 계획이며, 인명구조 우선·연소확대 차단·소화 순서를 표준화했다.',
    query:'전기차 화재 진압 매뉴얼 침수조' },
  { source:'행정안전부', emoji:'📋', topic:'정책',
    title:'소방시설 자체점검 제도 개편 — 부실점검 처벌 강화',
    summary:'행정안전부는 소방시설 자체점검 제도 개선안을 입법예고했다. 주요 내용은 (1) 점검자의 책임 강화 — 부실점검 시 등록취소까지 가능, (2) 점검대장 5년 보관 및 전산 등록 의무화, (3) 점검결과 허위보고 시 영업정지 1개월~과태료 1,000만원, (4) 안전관리자 미선임 시 200만원 과태료. 또한 분기별 자체점검 + 연 1회 종합점검 체계가 확정됐고, 다중이용시설은 점검주기가 단축된다. 시행은 공포 후 6개월 경과 시점.',
    query:'소방시설 자체점검 부실점검 처벌' },
  { source:'한국소방안전원', emoji:'🎓', topic:'교육',
    title:'2026년 소방안전관리자 강습교육 연간 일정 공고',
    summary:'한국소방안전원은 특급·1급·2급·3급 소방안전관리자 강습교육 2026년 연간 일정을 공고했다. 특급(80시간/30만원), 1급(40시간/15만원), 2급(20시간/8만원), 3급(8시간/4만원)으로 구성되며, 온라인 사전 신청 후 지정 교육원에서 대면 수강. 코로나 이후 일부 과정은 온라인 병행 운영. 합격률은 평균 87%이며, 미수료 시 6개월 이내 보충교육 가능. 신청은 안전원 홈페이지(kfsi.or.kr)에서 선착순 접수.',
    query:'2026 소방안전관리자 강습교육 일정' },
  { source:'소방청', emoji:'🔍', topic:'정책',
    title:'2025년 4분기 화재안전조사 결과 공개 — 부적합률 8.2%',
    summary:'소방청이 전국 다중이용업소 12,400개소를 대상으로 실시한 2025년 4분기 화재안전조사 결과 부적합 비율이 8.2%로 전년 동기 대비 1.5%p 감소했다. 주요 부적합 사항은 (1) 비상구 폐쇄·잠금(34%), (2) 자동화재탐지설비 정비불량(22%), (3) 소화기 비치불량(18%), (4) 임시소방시설 미설치(15%). 부적합 시설에는 시정명령 후 재점검을 진행하며, 미시정 시 영업정지·과태료 부과. 업종별로는 PC방·노래방의 부적합률이 가장 높았다.',
    query:'화재안전조사 결과 다중이용업소 부적합' },
  { source:'서울소방재난본부', emoji:'⛪', topic:'점검',
    title:'서울 종교시설 1,250개소 화재안전특별점검 시행',
    summary:'서울소방재난본부는 시내 종교시설 1,250개소를 대상으로 11월부터 12월까지 화재안전특별점검을 시행한다. 점검항목은 자동화재탐지·스프링클러·간이스프링클러·피난계단·비상조명·유도등 등. 자체점검 결과가 부실하거나 시정 미이행 시 행정처분(과태료 또는 영업정지) 예정. 특히 신도 100명 이상이 모이는 대형 종교시설과 지하·고층 종교시설을 우선 점검. 위반사항이 적발된 시설은 즉시 시정명령 후 재방문 점검.',
    query:'서울 종교시설 화재안전특별점검' },
  { source:'소방청', emoji:'📝', topic:'시험',
    title:'소방시설관리사 시험 출제기준 개편 — 실무사례 비중 확대',
    summary:'소방청은 2026년 시행 소방시설관리사 시험부터 출제기준을 개편한다고 밝혔다. 주요 변경점은 (1) NFPC/NFTC 통합 화재안전기준 100% 반영, (2) 실무사례·판례 비중 30%로 확대, (3) 점검 실무 사진·도면 분석 문제 신설, (4) 자체점검 부실 사례 분석 신규. 1차(객관식)와 2차(논술)로 구성되며, 합격률은 최근 5년 평균 14.3%. 응시 자격과 시험 일정은 한국소방안전원에서 공고.',
    query:'소방시설관리사 시험 출제기준 개편' },
  { source:'소방신문', emoji:'🔋', topic:'기술',
    title:'리튬배터리 화재 대응 신기술 — 전국 소방서에 D급 소화기 보급',
    summary:'소방청은 리튬이온·리튬폴리머 배터리 전용 D급 소화기 및 진압포(fire blanket)를 전국 소방서에 단계적으로 보급한다고 밝혔다. 우선 보급 대상은 ESS(에너지저장장치) 화재 위험 지역과 전기차 충전소 인접 119안전센터 200곳. 기존 ABC 분말소화기로는 리튬 화재 진압이 사실상 불가능해 인명·재산 피해 확대를 막기 어려웠다는 지적이 반영됐다. 1단계 보급 1,500대, 2단계 추가 3,000대 예정.',
    query:'리튬배터리 화재 D급 소화기 진압포' },
  { source:'소방방재신문', emoji:'🏬', topic:'정책',
    title:'다중이용업소 안전관리 강화 — 자동화재탐지·간이스프링클러 의무 확대',
    summary:'다중이용업소(PC방·노래방·찜질방·고시원·산후조리원 등)에 대한 안전관리 기준이 대폭 강화된다. 주요 내용은 (1) 자동화재탐지설비 의무 대상 확대 — 영업장 면적 100㎡ 이상으로 하향, (2) 간이스프링클러 의무 — 지하 영업장 전체 + 2층 이상 노래방·찜질방, (3) 임시소방시설 점검주기 단축(분기 → 격월), (4) 비상구 자동개방 시스템 의무화. 신규 영업장은 즉시, 기존 영업장은 1년 유예.',
    query:'다중이용업소 안전관리 자동화재탐지 간이스프링클러' },
  { source:'경기소방재난본부', emoji:'⛽', topic:'정책',
    title:'경기도, 가스누출 자동차단 시스템 의무화 조례 발의',
    summary:'경기도의회는 도내 신축 다중이용시설에 가스누출 자동차단 시스템 설치를 의무화하는 조례안을 발의했다. 적용 대상은 영업장 면적 100㎡ 이상 음식점, 호텔·콘도 주방, 공동주택 단지내 상가 등. 가스누출 감지 시 자동으로 밸브를 차단하고 119에 자동신고하는 IoT 기반 시스템으로, 가구당 설치비 30~50만원 수준. 경기도는 우선 도내 학교 급식실·노유자시설 1,200곳에 시범 설치 예정.',
    query:'경기도 가스누출 자동차단 시스템 의무화' },
  { source:'행정안전부', emoji:'⚖️', topic:'정책',
    title:'화재예방 및 안전관리법 시행규칙 개정 공포',
    summary:'행정안전부는 화재의 예방 및 안전관리에 관한 법률 시행규칙 개정안을 공포했다. 핵심 변경사항은 (1) 화재예방안전진단 대상 확대 — 대형 병원·요양시설·복합쇼핑몰 추가, (2) 자체소방대 편성 기준 변경 — 위험물 지정수량 1,000배 이상 사업장으로 강화, (3) 안전관리자 선임 자격 명확화, (4) 안전관리계획서 매년 갱신 의무화. 시행은 공포일로부터 3개월 경과 시점이며, 기존 시설은 6개월 유예기간 부여.',
    query:'화재예방 안전관리법 시행규칙 개정' },
  { source:'소방청', emoji:'📱', topic:'기술',
    title:'119안전신고 앱 전면 개편 — 영상신고·위치자동전송 기능 추가',
    summary:'소방청은 119안전신고 앱을 전면 개편해 신규 기능을 추가했다. 새 기능은 (1) GPS 위치정보 자동전송 — 신고 즉시 좌표를 119상황실에 송신, (2) 영상신고 — 30초까지 실시간 영상 전송 가능, (3) 청각장애인 수어상담 — 화상통화로 119상담사와 직접 수어 소통, (4) 다국어 자동통역(영·중·일·베트남어 4개 언어). 안드로이드·iOS 모두 지원하며 무료 다운로드. 첫 달 다운로드 50만건 돌파.',
    query:'119안전신고 앱 영상신고 위치전송' },
  { source:'소방신문', emoji:'📦', topic:'사고',
    title:'대형 물류창고 화재 방지 가이드라인 — 적치·방화구획·자동소화 표준',
    summary:'최근 3년간 발생한 대형 물류창고 화재 분석 결과, 60% 이상이 적치 높이 초과로 인한 스프링클러 작동 실패가 원인이었다. 새 가이드라인의 핵심은 (1) 적치 높이 = 헤드 직하 0.6m 이상 이격 강제, (2) 통로 폭 1.2m 이상 확보, (3) 1,000㎡ 이상 시설 자동방화셔터 의무, (4) 분기별 적치상태 사진점검 보고. 자동화재탐지 + 스프링클러 인터록 시스템도 권장. 위반 적발 시 업무정지·벌금 부과.',
    query:'물류창고 화재 가이드라인 적치 방화구획' },
  { source:'소방청', emoji:'🤖', topic:'기술',
    title:'AI 기반 화재예측 시스템 5개 지자체 시범운영 시작',
    summary:'소방청은 기상·건축물·과거 화재이력·인구밀도 데이터를 학습한 AI 화재예측 시스템을 서울·부산·인천·대구·광주 등 5개 광역지자체에서 시범운영한다. 시간대별·지역별 화재 발생 확률을 0~100%로 예측해 119안전센터에 실시간 표시, 고위험 지역에 인력·장비를 사전 배치한다. 1년 시범 후 효과 검증을 거쳐 전국 확대 예정. 머신러닝 정확도는 현재 78%이며, 데이터 누적으로 매년 개선될 전망.',
    query:'AI 화재예측 시스템 시범운영' },
  { source:'한국소방안전원', emoji:'📚', topic:'교육',
    title:'의용소방대 표준교재 5년 만에 개정 — 디지털 장비 사용법 추가',
    summary:'한국소방안전원은 의용소방대원 기본·전문 교육과정 표준교재 개정판을 발행했다. 5년 만의 전면 개정으로 (1) 2026 화재안전기준 통합본 반영, (2) 드론·열화상 카메라 등 디지털 장비 사용법, (3) 리튬배터리·전기차 화재 대응, (4) 외상성 응급처치 절차 업데이트가 추가됐다. 전국 의용소방대원 약 9만명에게 배포되며, 분기별 보수교육에서 활용. PDF는 안전원 홈페이지에서 무료 다운로드.',
    query:'의용소방대 표준교재 개정' },
  { source:'소방방재신문', emoji:'👥', topic:'정책',
    title:'노유자시설 피난약자 보호 기준 강화 — 자동화재속보 의무 확대',
    summary:'어린이집·요양원·장애인거주시설 등 피난약자 시설의 안전기준이 대폭 강화된다. 신설 의무사항은 (1) 자동화재속보설비 의무 — 30인 이상 모든 시설, (2) 간이스프링클러 의무 — 2층 이상 시설, (3) 대피공간(refuge area) 설치 — 100인 이상 시설, (4) 휠체어 피난로 폭 1.5m 이상 확보, (5) 피난약자 1인당 보호인력 비율 명시. 신축은 즉시, 기존 시설은 2년 이내 보강 완료.',
    query:'노유자시설 피난약자 자동화재속보 간이스프링클러' },
  { source:'소방청', emoji:'🚑', topic:'장비',
    title:'119구급차에 첨단의료장비 도입 확대',
    summary:'소방청은 전국 119구급차 약 1,800대에 첨단 응급의료장비를 단계적으로 보급한다. 핵심 장비는 (1) 12-Lead 심전도 자동분석기 — 심근경색 조기 진단, (2) 자동흉부압박기(LUCAS·AutoPulse) — 이송 중 CPR 지속, (3) 휴대용 인공호흡기, (4) 비디오 후두경. 기존 장비 대비 환자 생존율이 1.8배 개선된다는 연구결과 반영. 1차 보급 600대(2026년), 2차 1,200대(2027년) 예정.',
    query:'119구급차 첨단의료장비 자동흉부압박기 심전도' },
  { source:'서울소방재난본부', emoji:'🚇', topic:'점검',
    title:'서울 지하철 1~9호선 모든 역사 소방시설 일제점검',
    summary:'서울소방재난본부는 1~9호선 모든 지하철 역사 326개소의 소방시설 일제점검을 실시한다. 점검 항목은 자동화재탐지·스프링클러·제연설비·연결살수·비상조명·유도등·피난통로·휠체어 리프트 등. 결과는 분기별로 시민에게 공개되며, 부적합 사항은 운영기관에 즉시 시정 요구. 특히 환승역과 지하 5층 이상 깊이의 역사를 우선 점검. 화재 발생 시 대규모 인명피해 우려 때문에 안전관리 강화 차원.',
    query:'서울 지하철 역사 소방시설 일제점검' },
  { source:'소방신문', emoji:'☀️', topic:'분석',
    title:'신재생에너지 설비 화재 통계 분석 — 설계·시공 결함이 70%',
    summary:'한국화재보험협회와 소방청이 공동 발표한 보고서에 따르면 최근 5년간 태양광·풍력·ESS 등 신재생에너지 설비 화재 1,247건 중 약 70%가 설계·시공 단계의 결함으로 발생했다. 주요 원인은 (1) 인버터 과열·노후, (2) 배선 접속부 발열, (3) 배터리 셀 불량, (4) 환기 부족. 이에 따라 설치 단계 안전 검사를 강화하고, 연 2회 이상 정기점검 의무화 추진. 보고서 전문은 소방청 홈페이지에서 다운로드.',
    query:'신재생에너지 태양광 ESS 화재 통계' },
  { source:'소방청', emoji:'💼', topic:'행정',
    title:'소방기술자 경력관리 전산시스템 전면 개편 — 종이서류 폐지',
    summary:'소방청은 소방기술자 경력 등록·증빙 절차를 100% 온라인화한 새 전산시스템을 가동했다. 기존에 종이로 제출하던 경력증명서·재직증명서 등이 모두 전자문서로 대체되며, 협회·소속기관에서 직접 입력·인증하는 방식. 처리기간이 평균 14일에서 3일로 단축됐고, 위변조 방지를 위해 블록체인 기반 인증 도입. 기존 등록자는 자동 마이그레이션되며, 신규 등록자는 본인인증 후 즉시 발급 가능.',
    query:'소방기술자 경력관리 전산시스템 개편' },
  { source:'행정안전부', emoji:'🛢️', topic:'정책',
    title:'위험물 안전관리법 시행령 개정 — 옥외저장소 안전거리 강화',
    summary:'행정안전부는 위험물 안전관리법 시행령 개정안을 공포했다. 주요 변경사항은 (1) 일부 위험물의 지정수량 기준 조정 — 4류 위험물 중 일부 하향, (2) 옥외저장소 안전거리 강화 — 학교·병원으로부터 50m → 100m, (3) 위험물 운반 차량 표시 의무화 — 차체 양측 위험물 종류 명기, (4) 자체소방대 편성 기준 강화. 시행 후 6개월 이내 기존 시설도 보강 완료해야 함.',
    query:'위험물 안전관리법 시행령 옥외저장소' },
  { source:'소방청', emoji:'🏥', topic:'정책',
    title:'화재예방안전진단 대상 확대 — 대형 병원·복합쇼핑몰 포함',
    summary:'소방청은 화재예방안전진단 의무 대상을 대폭 확대한다고 밝혔다. 신규 포함 대상은 (1) 500병상 이상 종합병원, (2) 200인 이상 요양시설, (3) 연면적 30,000㎡ 이상 복합쇼핑몰, (4) 50층 이상 초고층 건축물. 진단은 정량적 위험도 평가·소방시설 점검·피난계획 검토·인명대피시뮬레이션 등을 포함하며, 5년마다 갱신 의무. 첫 진단은 2026년 상반기 시작 예정.',
    query:'화재예방안전진단 대상 확대 병원 쇼핑몰' },
  { source:'소방신문', emoji:'🧯', topic:'분석',
    title:'전국 가정용 소화기 보급률 60% 돌파 — 2030년 80% 목표',
    summary:'소방청 발표에 따르면 전국 가정용 소화기 보급률이 처음으로 60%를 넘어섰다. 지자체별로는 서울 71%, 부산 65%, 광주 58% 순. 정부는 2030년까지 80% 달성을 목표로 (1) 신축 주택 의무 비치, (2) 노후 주택 무료 보급사업, (3) 학교 안전교육 시 가정용 소화기 사용법 교육 강화 등을 추진한다. 가정용 소화기는 1.5kg ABC 분말 또는 강화액 권장, 5년마다 점검·교체 필요.',
    query:'가정용 소화기 보급률 통계' },
  { source:'소방청', emoji:'🚁', topic:'장비',
    title:'산불 진화 헬기 운영 매뉴얼 표준화 — 광역 공동대응 체계 정비',
    summary:'소방청은 전국 산불 진화 헬기의 운영·정비·인력교대·연료보급·통신 매뉴얼을 표준화했다. 광역 공동대응 체계도 정비해 산림청·지자체·소방청 헬기가 동일 절차로 협력 가능하도록 했다. 또한 야간 산불 대응을 위해 적외선 카메라 장착 헬기 12대를 추가 도입하고, 조종사·정비사 통합교육을 매년 2회 시행. 매뉴얼 준수 시 진화 효율이 평균 25% 향상될 것으로 예상.',
    query:'산불 진화 헬기 매뉴얼 광역 공동대응' },
  { source:'한국소방안전원', emoji:'🎯', topic:'시험',
    title:'위험물기능사 시험제도 개편 — CBT 도입·실기 비중 확대',
    summary:'한국소방안전원은 위험물기능사 시험제도를 개편한다. 주요 변경은 (1) 필기시험 CBT(Computer Based Test) 도입 — 종이시험 폐지, (2) 실기시험 비중 40 → 60% 확대, (3) 작업형 실기에 위험물 누출 대응 시나리오 추가, (4) 합격기준 명확화 — 필기·실기 각 60점 이상. 응시료도 합리화돼 평균 5만원 수준. 첫 시행은 2026년 2회 시험부터 적용.',
    query:'위험물기능사 시험 CBT 실기' },
  { source:'경기소방재난본부', emoji:'🔋', topic:'정책',
    title:'경기도 ESS(에너지저장장치) 화재 안전기준 대폭 강화',
    summary:'경기도는 도내 ESS 시설의 안전기준을 대폭 강화하는 조례를 시행한다. 핵심 내용은 (1) ESS 컨테이너 간 이격거리 3m → 6m로 확대, (2) 자동소화장치(전용 D급) 의무 설치, (3) 24시간 원격 모니터링 시스템 의무화, (4) 분기별 셀 단위 점검 의무, (5) 화재 발생 시 즉시 격리 가능한 자동차단 시스템. 도내 약 320개 ESS 시설이 적용 대상이며, 위반 시 운영정지·과태료 부과.',
    query:'경기도 ESS 에너지저장장치 화재 안전기준' },
  { source:'소방방재신문', emoji:'📉', topic:'분석',
    title:'도시가스 사고 30% 감소 — 안전관리 강화 정책 효과 입증',
    summary:'한국가스안전공사 발표에 따르면 도시가스 사고가 전년 대비 30% 감소한 것으로 나타났다. 주요 감소 요인은 (1) 노후 배관 교체 사업 확대, (2) 가스누출 자동차단 시스템 보급, (3) 사용자 안전교육 강화, (4) 정기점검 주기 단축. 사고 유형별로는 노후 호스 파손이 가장 많이 줄었고(-45%), 보일러 가스 누출 사고도 감소(-32%). 다만 전기차 충전소 인근 가스 사고는 전년 대비 증가해 추가 안전대책 필요.',
    query:'도시가스 사고 감소 안전관리' },
  { source:'소방청', emoji:'👨‍🚒', topic:'행정',
    title:'2026년 소방공무원 신규 채용 12% 확대 — 구급·특수구조 보강',
    summary:'소방청은 2026년 소방공무원 신규 채용 인원을 전년 대비 12% 확대한다고 발표했다. 총 채용 규모는 약 3,400명으로, 구급대원·특수구조대(수난·산악·고층) 인력 보강이 중점. 응시 자격은 만 18~40세, 신체검사 기준 충족, 한국사·영어 능력 인증 필수. 시험은 필기(과목별 객관식) → 체력 → 면접 순. 합격자는 중앙소방학교에서 24주 신임교육 후 임용. 자세한 일정은 소방청 홈페이지 공고.',
    query:'2026 소방공무원 채용 구급대원' }
];

// 풀 항목의 url을 동적 생성 — 항상 네이버 뉴스 실시간 검색 결과(실제 기사)로 직행
function newsItemUrl(item) {
  // 우선순위 1: query (큐레이션 풀의 검색어) → 검색 URL
  if (item.query) {
    return `https://search.naver.com/search.naver?where=news&query=${encodeURIComponent(item.query)}&sort=1`;
  }
  // 우선순위 2: 명시된 url이 '홈페이지'가 아니라 '실제 기사 URL'이면 사용
  // (관리자가 수동 등록 시 입력한 article URL)
  if (item.url && /^https?:\/\//.test(item.url) && !isHomepageUrl(item.url)) {
    return item.url;
  }
  // 우선순위 3: 제목으로 네이버 뉴스 검색 → 실제 기사 결과
  return `https://search.naver.com/search.naver?where=news&query=${encodeURIComponent(item.title)}&sort=1`;
}

// URL이 홈페이지(루트)인지 감지 — path가 없거나 '/' 뿐이면 홈페이지로 간주
function isHomepageUrl(url) {
  try {
    const u = new URL(url);
    const path = u.pathname.replace(/\/$/, '');
    return path === '' || path.length < 3;  // 빈 path 또는 너무 짧으면 홈페이지
  } catch (e) {
    return false;
  }
}

// ───── 참고 블로그 / 사이트 큐레이션 ─────
const BLOG_REFS = [
  { name:'소방청 공식 블로그', tag:'정부', host:'blog.naver.com',
    desc:'소방청에서 직접 운영하는 공식 블로그. 보도자료, 안전 캠페인, 화재 예방 가이드, 통계 등을 정기적으로 게시.',
    url:'https://blog.naver.com/119_blog' },
  { name:'한국소방안전원', tag:'협회', host:'kfsi.or.kr',
    desc:'소방안전관리자 강습교육·시험·자격관리를 담당하는 공공기관. 교재·교육일정·법령해설 자료가 풍부.',
    url:'https://www.kfsi.or.kr' },
  { name:'한국화재보험협회 (KFPA)', tag:'협회', host:'kfpa.or.kr',
    desc:'화재보험·방재 기술 연구소 운영. 화재 통계 분석, 위험성 평가, 손해예방 기술자료 무료 공개.',
    url:'https://www.kfpa.or.kr' },
  { name:'국가화재정보시스템 (NFDS)', tag:'데이터', host:'nfds.go.kr',
    desc:'전국 화재 발생 통계, 원인 분석, 시간대·지역별 데이터를 시각화로 제공. 점검·연구 시 필수 출처.',
    url:'https://www.nfds.go.kr' },
  { name:'소방신문 (FPN)', tag:'언론', host:'fpn119.co.kr',
    desc:'소방·안전 분야 전문 언론. 정책·사고·기술·인물 인터뷰까지 폭넓은 취재. 매일 업데이트.',
    url:'https://www.fpn119.co.kr' },
  { name:'한국소방시설협회', tag:'협회', host:'kfica.or.kr',
    desc:'소방시설 점검·공사·관리 업체의 협회. 점검 표준·기술 가이드·계약서 양식 제공.',
    url:'https://www.kfica.or.kr' },
  { name:'행정안전부 안전한국', tag:'정부', host:'safekorea.go.kr',
    desc:'국민재난안전포털. 화재·재난 행동요령, 대피소 위치, 재난문자 이력, 안전교육 콘텐츠 제공.',
    url:'https://www.safekorea.go.kr' },
  { name:'네이버 카페 — 소방기술', tag:'커뮤니티', host:'cafe.naver.com',
    desc:'소방기술사·관리사·실무자들이 모인 대형 커뮤니티. 시험 후기·실무 Q&A·구인구직 활발.',
    url:'https://cafe.naver.com/firetech' }
];

function renderBlogRefs() {
  const grid = document.getElementById('blogRefsGrid');
  if (!grid) return;
  grid.innerHTML = BLOG_REFS.map(b => `
    <a href="${esc(b.url)}" target="_blank" rel="noopener" class="blog-ref-card">
      <div class="brc-top">
        <span class="brc-tag">${esc(b.tag)}</span>
        <span class="brc-host">${esc(b.host)}</span>
      </div>
      <div class="brc-name">${esc(b.name)}</div>
      <div class="brc-desc">${esc(b.desc)}</div>
      <div class="brc-link">방문하기 →</div>
    </a>
  `).join('');
}

const SOURCE_COLORS = {
  '소방청': '#1e5fa8',
  '행정안전부': '#0068c3',
  '소방신문': '#c93030',
  '소방방재신문': '#a85020',
  '한국소방안전원': '#6020a8',
  '서울소방재난본부': '#02a64a',
  '경기소방재난본부': '#02a64a',
  '기타': '#666666'
};
function sourceColor(src) { return SOURCE_COLORS[src] || '#666'; }

function getNews() {
  const v = localStorage.getItem(NEWS_KEY);
  if (v) return JSON.parse(v);
  return seedInitialNews();
}
function saveNews(arr) { localStorage.setItem(NEWS_KEY, JSON.stringify(arr)); }

function seedInitialNews() {
  // 첫 방문 시 최근 5건을 5일치 날짜로 시드
  const seed = NEWS_POOL.slice(0, 5).map((item, i) => ({
    ...item,
    image: item.emoji,
    id: Date.now() - i * 86400000,
    date: dateNDaysAgo(i),
    autoAdded: true,
    isNew: i === 0
  }));
  saveNews(seed);
  localStorage.setItem(NEWS_LAST_AUTO, todayStr());
  return seed;
}

function todayStr() {
  const d = new Date();
  return `${d.getFullYear()}-${pad2(d.getMonth()+1)}-${pad2(d.getDate())}`;
}
function dateNDaysAgo(n) {
  const d = new Date(); d.setDate(d.getDate() - n);
  return `${d.getFullYear()}.${pad2(d.getMonth()+1)}.${pad2(d.getDate())}`;
}
function pad2(n) { return String(n).padStart(2, '0'); }

// 매일 1회 자동 추가 (페이지 방문 시 트리거)
function autoAddDailyNews() {
  const last = localStorage.getItem(NEWS_LAST_AUTO);
  if (last === todayStr()) return false;

  const news = getNews();
  const usedTitles = new Set(news.map(n => n.title));
  const unused = NEWS_POOL.filter(p => !usedTitles.has(p.title));
  const pick = unused.length ? unused[Math.floor(Math.random() * unused.length)]
                              : NEWS_POOL[Math.floor(Math.random() * NEWS_POOL.length)];

  // 기존 isNew 모두 해제
  news.forEach(n => n.isNew = false);

  news.unshift({
    ...pick,
    image: pick.emoji,
    id: Date.now(),
    date: `${new Date().getFullYear()}.${pad2(new Date().getMonth()+1)}.${pad2(new Date().getDate())}`,
    autoAdded: true,
    isNew: true
  });
  saveNews(news);
  localStorage.setItem(NEWS_LAST_AUTO, todayStr());
  if (typeof logActivity === 'function') logActivity('뉴스 자동수집: ' + pick.title.slice(0, 30));
  return true;
}

let currentNewsFilter = 'all'; // 'all' | source 이름 | 'topic:최신기술' 등
function setNewsFilter(filter) {
  currentNewsFilter = filter;
  document.querySelectorAll('#newsFilterTabs .kfma-tab').forEach(t =>
    t.classList.toggle('active', t.dataset.src === filter)
  );
  renderNews();
}

const TOPIC_META = {
  '최신기술':   { emoji:'🚀', color:'#0068c3', label:'최신기술' },
  '논문연구':   { emoji:'📚', color:'#6020a8', label:'논문·연구' },
  '사고처벌':   { emoji:'⚖️', color:'#c93030', label:'사고·처벌' }
};

function renderNews() {
  const news = getNews();
  const q = (document.getElementById('newsSearchInput')?.value || '').trim().toLowerCase();
  const filtered = news.filter(n => {
    if (currentNewsFilter !== 'all') {
      if (currentNewsFilter.startsWith('topic:')) {
        if (n.topic !== currentNewsFilter.slice(6)) return false;
      } else if (n.source !== currentNewsFilter) return false;
    }
    if (q && !n.title.toLowerCase().includes(q) && !n.summary.toLowerCase().includes(q)) return false;
    return true;
  });

  const countEl = document.getElementById('newsCount');
  const lastEl = document.getElementById('newsLastUpdate');
  if (countEl) countEl.textContent = filtered.length;
  if (lastEl) lastEl.textContent = localStorage.getItem(NEWS_LAST_AUTO) || '-';

  const list = document.getElementById('newsListGrid');
  if (!list) return;
  if (!filtered.length) {
    list.innerHTML = '<div style="grid-column:1/-1; text-align:center; padding:48px; color:var(--text-muted);">📭 검색 결과가 없습니다.</div>';
    return;
  }

  list.innerHTML = filtered.map(n => {
    const topicMeta = TOPIC_META[n.topic];
    const color = topicMeta ? topicMeta.color : (n.color || sourceColor(n.source));
    const thumbEmoji = topicMeta ? topicMeta.emoji : (n.image || n.emoji || '📰');
    const topicBadge = topicMeta
      ? `<span class="topic-chip" style="background:${color};">${topicMeta.emoji} ${topicMeta.label}</span>`
      : '';
    return `
    <article class="news-card-naver" style="border-top:5px solid ${color}; box-shadow:0 4px 14px ${color}1a, 0 1px 3px rgba(0,0,0,0.08);">
      <div class="news-card-body" onclick="showNewsDetail('${n.id}')" style="cursor:pointer;">
        <div class="news-card-meta">
          ${topicBadge}
          <span class="news-source-chip" style="background:${color}; color:#fff;">${esc(n.source)}</span>
          ${n.isNew ? `<span class="badge-new" style="background:${color}; color:#fff; box-shadow:0 2px 6px ${color}66;">NEW</span>` : ''}
        </div>
        <h3 class="news-card-title">${esc(n.title)}</h3>
        <p class="news-card-summary">${esc(n.summary)}</p>
        <div class="news-card-footer" onclick="event.stopPropagation();">
          <span class="news-card-date">📅 ${n.date}</span>
          <a href="#" onclick="event.preventDefault(); event.stopPropagation(); showNewsDetail('${n.id}'); return false;" class="news-card-link" style="color:${color}; font-weight:700;">📖 자세히 보기</a>
          <a href="${esc(newsItemUrl(n))}" target="_blank" rel="noopener" class="news-card-link" onclick="event.stopPropagation();" style="color:${color};">원문 ↗</a>
          ${isAdmin() ? `<button class="btn-mini btn-mini-danger" onclick="event.stopPropagation(); deleteNews(${n.id})" title="삭제">🗑</button>` : ''}
        </div>
      </div>
    </article>`;
  }).join('');
}

// ===== 뉴스 상세 보기 모달 =====
function showNewsDetail(id) {
  const news = getNews();
  const n = news.find(x => String(x.id) === String(id));
  if (!n) return;

  const topicMeta = TOPIC_META[n.topic];
  const color = topicMeta ? topicMeta.color : sourceColor(n.source);
  const topicBadge = topicMeta
    ? `<span class="topic-chip" style="background:${color};">${topicMeta.label}</span>`
    : '';

  document.getElementById('newsModalMeta').innerHTML = `
    ${topicBadge}
    <span class="news-source-chip" style="background:${color}cc;">${esc(n.source)}</span>
    ${n.isNew ? '<span class="badge-new">NEW</span>' : ''}
  `;
  document.getElementById('newsModalTitle').textContent = n.title;
  document.getElementById('newsModalInfo').innerHTML = `
    <span><b>출처</b> ${esc(n.source)}</span>
    <span><b>등록일</b> ${esc(n.date || '-')}</span>
    ${n.topic ? `<span><b>주제</b> ${esc(n.topic)}</span>` : ''}
    ${n.collectedAt ? `<span><b>수집</b> ${formatTs ? formatTs(new Date(n.collectedAt).getTime()) : n.collectedAt.slice(0,10)}</span>` : ''}
  `;
  // 상세 모달에는 fullDesc(원본 전체) 우선, 없으면 summary 사용
  document.getElementById('newsModalBody').innerHTML = formatNewsContent(n.fullDesc || n.summary || '');
  document.getElementById('newsModalLink').href = newsItemUrl(n);
  document.getElementById('newsModal').style.display = 'flex';
  document.body.style.overflow = 'hidden';
}

function closeNewsModal() {
  document.getElementById('newsModal').style.display = 'none';
  document.body.style.overflow = '';
}

// 요약 텍스트를 구조화된 HTML로 변환 — 번호 패턴, 불릿, 단락 자동 감지
function formatNewsContent(text) {
  if (!text) return '<p class="empty">요약이 없습니다.</p>';

  // 1) "(1) ..., (2) ..., (3) ..." 번호 패턴 감지
  const numberedMatch = text.match(/\(\d+\)/g);
  if (numberedMatch && numberedMatch.length >= 2) {
    const parts = text.split(/(?=\(\d+\))/g);
    const intro = parts[0].trim();
    const items = parts.slice(1).map(s => s.replace(/^\(\d+\)\s*/, '').replace(/[,，]\s*$/, '').trim()).filter(Boolean);
    return `
      ${intro ? `<p class="lead">${esc(intro)}</p>` : ''}
      <ol class="news-list">${items.map(s => `<li>${highlightKeyTerms(esc(s))}</li>`).join('')}</ol>
    `;
  }

  // 2) "▸" 또는 "•" 또는 "·" 불릿 감지
  if (/[▸•]/g.test(text)) {
    const parts = text.split(/[▸•]/).map(s => s.trim()).filter(Boolean);
    if (parts.length >= 2) {
      const intro = parts[0];
      const items = parts.slice(1);
      return `
        ${intro ? `<p class="lead">${esc(intro)}</p>` : ''}
        <ul class="news-list">${items.map(s => `<li>${highlightKeyTerms(esc(s))}</li>`).join('')}</ul>
      `;
    }
  }

  // 3) 콜론(":")으로 나뉜 패턴: "원인: 적치 ... / 결과: 전소 ..."
  const colonGroups = text.split(/(?=(?:원인|결과|교훈|예방|핵심|주요|특징|효과|개정|시행)\s*:)/g);
  if (colonGroups.length >= 2) {
    return `<dl class="news-dl">${
      colonGroups.map(g => {
        const m = g.match(/^([가-힣\s]+):\s*(.*)$/);
        if (m) return `<dt>${esc(m[1].trim())}</dt><dd>${highlightKeyTerms(esc(m[2].trim()))}</dd>`;
        return `<dd class="dd-only">${highlightKeyTerms(esc(g.trim()))}</dd>`;
      }).join('')
    }</dl>`;
  }

  // 4) 기본: 단락 분할 (마침표·줄바꿈 기준 2~3문장씩 묶기)
  const sentences = text.split(/(?<=[.。])\s+/).map(s => s.trim()).filter(Boolean);
  if (sentences.length <= 2) {
    return `<p>${highlightKeyTerms(esc(text))}</p>`;
  }
  // 3문장씩 묶기
  const paras = [];
  for (let i = 0; i < sentences.length; i += 3) {
    paras.push(sentences.slice(i, i + 3).join(' '));
  }
  return paras.map(p => `<p>${highlightKeyTerms(esc(p))}</p>`).join('');
}

// 핵심 키워드 강조 (숫자·날짜·법령명 등)
function highlightKeyTerms(html) {
  return html
    // 퍼센트, 배수 (예: 30%, 1.8배, 12%p)
    .replace(/(\d+(?:\.\d+)?%p?|\d+(?:\.\d+)?배)/g, '<b class="kw-num">$1</b>')
    // 년도 (예: 2026년, 1992년)
    .replace(/(\d{4}년)/g, '<b class="kw-year">$1</b>')
    // 금액 (예: 1,000만원, 200만원)
    .replace(/(\d{1,3}(?:,\d{3})*만원)/g, '<b class="kw-money">$1</b>')
    // 법령 약어 (NFTC, NFPC, NFSC + 번호)
    .replace(/(NF[TPS]C\s*\d{3})/g, '<b class="kw-law">$1</b>');
}

async function deleteNews(id) {
  // 관리자 확인 + 세션당 1회 비밀번호 (checkDeletePassword 내부에 isAdmin 가드 포함)
  if (!(await checkDeletePassword('뉴스 삭제'))) return;
  if (!confirm('이 뉴스를 삭제하시겠습니까?')) return;
  saveNews(getNews().filter(n => n.id !== id));
  if (typeof logActivity === 'function') logActivity('뉴스 삭제: id=' + id);
  renderNews();
}

function toggleNewsAddForm() {
  const f = document.getElementById('newsAddForm');
  if (!f) return;
  f.hidden = !f.hidden;
}

function manualAddNews() {
  if (!isAdmin()) return alert('관리자만 가능합니다.');
  const source = document.getElementById('newsAddSource').value;
  const title = document.getElementById('newsAddTitle').value.trim();
  const summary = document.getElementById('newsAddSummary').value.trim();
  const url = document.getElementById('newsAddUrl').value.trim();
  const emoji = document.getElementById('newsAddEmoji').value.trim() || '📰';
  if (!title || !summary || !url) { alert('제목·요약·URL을 모두 입력하세요.'); return; }
  if (!/^https?:\/\//.test(url)) { alert('URL은 http:// 또는 https://로 시작해야 합니다.'); return; }

  const news = getNews();
  news.forEach(n => n.isNew = false);
  news.unshift({
    id: Date.now(), source, title, summary, url, image: emoji, emoji,
    date: `${new Date().getFullYear()}.${pad2(new Date().getMonth()+1)}.${pad2(new Date().getDate())}`,
    autoAdded: false, isNew: true
  });
  saveNews(news);

  document.getElementById('newsAddTitle').value = '';
  document.getElementById('newsAddSummary').value = '';
  document.getElementById('newsAddUrl').value = '';
  document.getElementById('newsAddEmoji').value = '';
  toggleNewsAddForm();
  renderNews();
  if (typeof logActivity === 'function') logActivity('뉴스 수동등록: ' + title.slice(0, 30));
}

function forceAutoCollect() {
  if (!isAdmin()) return alert('관리자만 가능합니다.');
  localStorage.removeItem(NEWS_LAST_AUTO);
  const ok = autoAddDailyNews();
  renderNews();
  alert(ok ? '✅ 새 뉴스 1건이 추가됐습니다.' : '⚠️ 추가 가능한 뉴스가 없습니다.');
}

// ===== KFMA STYLE: LAWS / TECH / FORMS / MEMBER INFO =====

// --- 법령 데이터 (국가법령정보센터 링크) ---
const lawData = [
  {
    name: '소방기본법',
    color: '#03c75a',
    desc: '소방활동·소방기관의 설치·운영 등 기본 사항 (1958년 제정, 현행)',
    items: [
      { type: '법', label: '소방기본법', url: 'https://www.law.go.kr/법령/소방기본법' },
      { type: '시행령', label: '소방기본법 시행령', url: 'https://www.law.go.kr/법령/소방기본법시행령' },
      { type: '시행규칙', label: '소방기본법 시행규칙', url: 'https://www.law.go.kr/법령/소방기본법시행규칙' }
    ]
  },
  {
    name: '소방시설법',
    color: '#0068c3',
    desc: '소방시설 설치·관리에 관한 법률 (2022.12.1 분법 시행)',
    items: [
      { type: '법', label: '소방시설 설치 및 관리에 관한 법률', url: 'https://www.law.go.kr/법령/소방시설설치및관리에관한법률' },
      { type: '시행령', label: '소방시설법 시행령', url: 'https://www.law.go.kr/법령/소방시설설치및관리에관한법률시행령' },
      { type: '시행규칙', label: '소방시설법 시행규칙', url: 'https://www.law.go.kr/법령/소방시설설치및관리에관한법률시행규칙' }
    ]
  },
  {
    name: '화재예방법',
    color: '#f5a623',
    desc: '화재의 예방 및 안전관리에 관한 법률 (2022.12.1 신설)',
    items: [
      { type: '법', label: '화재의 예방 및 안전관리에 관한 법률', url: 'https://www.law.go.kr/법령/화재의예방및안전관리에관한법률' },
      { type: '시행령', label: '화재예방법 시행령', url: 'https://www.law.go.kr/법령/화재의예방및안전관리에관한법률시행령' },
      { type: '시행규칙', label: '화재예방법 시행규칙', url: 'https://www.law.go.kr/법령/화재의예방및안전관리에관한법률시행규칙' }
    ]
  },
  {
    name: '공사업법',
    color: '#9333ea',
    desc: '소방시설공사업에 관한 법률 — 등록·시공·감리·하자보수',
    items: [
      { type: '법', label: '소방시설공사업법', url: 'https://www.law.go.kr/법령/소방시설공사업법' },
      { type: '시행령', label: '소방시설공사업법 시행령', url: 'https://www.law.go.kr/법령/소방시설공사업법시행령' },
      { type: '시행규칙', label: '소방시설공사업법 시행규칙', url: 'https://www.law.go.kr/법령/소방시설공사업법시행규칙' }
    ]
  },
  {
    name: '위험물안전관리법',
    color: '#0d9488',
    desc: '위험물의 저장·취급·운반 안전관리 (지정수량·옥내·옥외저장소)',
    items: [
      { type: '법', label: '위험물안전관리법', url: 'https://www.law.go.kr/법령/위험물안전관리법' },
      { type: '시행령', label: '위험물안전관리법 시행령', url: 'https://www.law.go.kr/법령/위험물안전관리법시행령' },
      { type: '시행규칙', label: '위험물안전관리법 시행규칙', url: 'https://www.law.go.kr/법령/위험물안전관리법시행규칙' }
    ]
  },
  {
    name: '다중이용업소법',
    color: '#6366f1',
    desc: '다중이용업소 안전관리에 관한 특별법 (PC방·노래방·찜질방 등)',
    items: [
      { type: '법', label: '다중이용업소의 안전관리에 관한 특별법', url: 'https://www.law.go.kr/법령/다중이용업소의안전관리에관한특별법' },
      { type: '시행령', label: '다중이용업소법 시행령', url: 'https://www.law.go.kr/법령/다중이용업소의안전관리에관한특별법시행령' },
      { type: '시행규칙', label: '다중이용업소법 시행규칙', url: 'https://www.law.go.kr/법령/다중이용업소의안전관리에관한특별법시행규칙' }
    ]
  }
];

// 소방 관계법령 (건축 관련 — 소방시설 설계 시 참조 필수)
const relatedLawData = [
  {
    name: '건축법',
    color: '#0d9488',
    desc: '건축물 대지·구조·설비 기준 — 소방시설 설계의 기초',
    items: [
      { type: '법', label: '건축법', url: 'https://www.law.go.kr/법령/건축법' },
      { type: '시행령', label: '건축법 시행령', url: 'https://www.law.go.kr/법령/건축법시행령' },
      { type: '시행규칙', label: '건축법 시행규칙', url: 'https://www.law.go.kr/법령/건축법시행규칙' }
    ]
  },
  {
    name: '피난·방화구조 규칙',
    color: '#9333ea',
    desc: '건축물의 피난·방화구조 등의 기준 — 방화문·방화구획·피난계단',
    items: [
      { type: '규칙', label: '건축물의 피난·방화구조 등의 기준에 관한 규칙', url: 'https://www.law.go.kr/법령/건축물의피난·방화구조등의기준에관한규칙' }
    ]
  },
  {
    name: '건축 설비기준 규칙',
    color: '#0068c3',
    desc: '건축물의 설비기준 등에 관한 규칙 — 환기·배연·승강기·정화조',
    items: [
      { type: '규칙', label: '건축물의 설비기준 등에 관한 규칙', url: 'https://www.law.go.kr/법령/건축물의설비기준등에관한규칙' }
    ]
  }
];

// 구법(폐지) — 시점법 판단 시 참조
const oldLawData = [
  { name: '소방시설 설치·유지 및 안전관리에 관한 법률 (구법)',
    note: '2022.12.1 폐지 → "소방시설법" + "화재예방법"으로 분리·승계',
    url: 'https://www.law.go.kr/법령/소방시설설치유지및안전관리에관한법률' },
  { name: '구 소방법 (1958~2003)',
    note: '2003년 소방기본법·소방시설법·공사업법·위험물법으로 분리되면서 폐지',
    url: 'https://www.law.go.kr/lsInfoP.do?efYd=20030629&lsiSeq=24559' },
  { name: '소방시설 설치·유지법 시행령 (제23272호, 2012)',
    note: '2012.2.7 개정본 — 2010~2014년 허가 건축물 적용 기준',
    url: 'https://www.law.go.kr' },
  { name: '소방시설 설치·유지법 시행령 (제26033호, 2015)',
    note: '2015.1.6 개정본 — 2015~2017년 허가 건축물 적용 기준',
    url: 'https://www.law.go.kr' }
];

const ruleData = [
  { cat: '기술기준 (점검·시공)', items: [
    { name: '소방기술기준에 관한 규칙', url: 'https://www.law.go.kr/법령/소방기술기준에관한규칙' },
    { name: '소방시설 자체점검사항 등에 관한 고시', url: 'https://www.law.go.kr/행정규칙/소방시설자체점검사항등에관한고시' },
    { name: '특정소방대상물의 안전관리에 관한 고시', url: 'https://www.law.go.kr' }
  ]},
  { cat: '제품·형식승인', items: [
    { name: '감지기의 형식승인 및 제품검사의 기술기준', url: 'https://www.law.go.kr/행정규칙/감지기의형식승인및제품검사의기술기준' },
    { name: '소방용품의 품질관리 등에 관한 규칙', url: 'https://www.law.go.kr/법령/소방용품의품질관리등에관한규칙' }
  ]},
  { cat: '경력·자격·교육', items: [
    { name: '소방기술자 실무교육에 관한 규정', url: 'https://www.law.go.kr' },
    { name: '소방시설관리사 시험 시행규칙', url: 'https://www.law.go.kr' }
  ]}
];

function renderLawCardGrid(host, dataArr) {
  if (!host) return;
  host.innerHTML = dataArr.map(law => `
    <div class="law-card" style="--law-color:${law.color}">
      <div class="law-card-header">
        <h4>${esc(law.name)}</h4>
        <span>${esc(law.desc)}</span>
      </div>
      <div class="law-links">
        ${law.items.map(item => `
          <a href="${esc(item.url)}" target="_blank" rel="noopener" class="law-link" title="${esc(item.label)}">
            <span class="ll-type">${esc(item.type)}</span>
            <span class="ll-arrow">↗</span>
          </a>`).join('')}
      </div>
    </div>
  `).join('');
}

function renderLaws() {
  // 주요 법령 (6개)
  renderLawCardGrid(document.getElementById('lawMainGrid'), lawData);

  // 관계법령 (건축 관련)
  renderLawCardGrid(document.getElementById('lawRelatedGrid'), relatedLawData);

  // 행정규칙
  const ruleList = document.getElementById('lawRuleList');
  if (ruleList) {
    ruleList.innerHTML = ruleData.map(g => `
      <div class="rule-group">
        <h5>📌 ${esc(g.cat)}</h5>
        <ul>
          ${g.items.map(r => `<li><a href="${esc(r.url)}" target="_blank" rel="noopener">${esc(r.name)} <span class="rule-ext">↗</span></a></li>`).join('')}
        </ul>
      </div>
    `).join('');
  }

  // 구법 (시점법 참조)
  const oldList = document.getElementById('lawOldList');
  if (oldList) {
    oldList.innerHTML = oldLawData.map(o => `
      <div class="old-law-item">
        <a href="${esc(o.url)}" target="_blank" rel="noopener" class="old-law-name">${esc(o.name)} <span class="rule-ext">↗</span></a>
        <p class="old-law-note">${esc(o.note)}</p>
      </div>
    `).join('');
  }
}

// --- 기술자료 ---
const techData = [
  { id: 32, cat: '점검', title: 'NFTC 103 스프링클러설비 자체점검 체크리스트', file: 'PDF', date: '2026.05.08', views: 412, isNew: true },
  { id: 31, cat: '해설', title: '2026년 화재안전기준 통합본 해설(개정사항 요약)', file: 'PDF', date: '2026.05.05', views: 891, isNew: true },
  { id: 30, cat: '설계', title: '옥내소화전 토출량·양정 산정 예제', file: 'XLSX', date: '2026.04.28', views: 256, isNew: true },
  { id: 29, cat: '시공', title: '내진설계 적용 배관 시공 표준 도면집', file: 'ZIP', date: '2026.04.20', views: 533 },
  { id: 28, cat: '감리', title: '소방감리 일일점검표 양식(엑셀)', file: 'XLSX', date: '2026.04.15', views: 322 },
  { id: 27, cat: '점검', title: '간이스프링클러설비 점검 매뉴얼 v3.2', file: 'PDF', date: '2026.04.10', views: 478 },
  { id: 26, cat: '해설', title: 'NFPC 203 자동화재탐지설비 개정 해설', file: 'PDF', date: '2026.04.02', views: 612 },
  { id: 25, cat: '설계', title: '제연설비 풍량·풍압 계산 가이드', file: 'PDF', date: '2026.03.28', views: 198 },
  { id: 24, cat: '시공', title: '연결송수관설비 배관 시공기준 정리', file: 'PDF', date: '2026.03.22', views: 267 },
  { id: 23, cat: '점검', title: '비상조명등·유도등 점검 사례집', file: 'PDF', date: '2026.03.15', views: 389 },
  { id: 22, cat: '해설', title: '특정소방대상물 분류 기준 해설(별표2)', file: 'PDF', date: '2026.03.08', views: 745 },
  { id: 21, cat: '감리', title: '준공검사 시 자주 지적되는 사항 TOP 20', file: 'PDF', date: '2026.02.28', views: 1024 }
];
let techFilter = 'all';
function renderTech() {
  const q = (document.getElementById('techSearchInput')?.value || '').trim().toLowerCase();
  const filtered = techData.filter(t =>
    (techFilter === 'all' || t.cat === techFilter) &&
    (!q || t.title.toLowerCase().includes(q))
  );
  document.getElementById('techCount').textContent = filtered.length;
  const tbody = document.getElementById('techBody');
  if (!filtered.length) {
    tbody.innerHTML = '<tr><td colspan="6" style="text-align:center; padding:40px; color:var(--text-muted);">📭 자료가 없습니다.</td></tr>';
    return;
  }
  tbody.innerHTML = filtered.map((t, i) => `
    <tr onclick="alert('📥 ${esc(t.title)} (${t.file}) — 회원 전용 자료입니다.')">
      <td class="col-no" style="text-align:center; color:var(--text-muted);">${filtered.length - i}</td>
      <td><span class="cat-chip cat-${cssCat(t.cat)}">${t.cat}</span></td>
      <td class="td-title">
        ${esc(t.title)}
        ${t.isNew ? '<span class="badge-new">NEW</span>' : ''}
      </td>
      <td style="text-align:center;"><span class="file-badge file-${(t.file||'').toLowerCase()}">${t.file}</span></td>
      <td style="color:var(--text-secondary); font-size:0.85rem;">${t.date}</td>
      <td style="text-align:center;">${t.views.toLocaleString()}</td>
    </tr>`).join('');
}

// --- 서식자료 ---
const formData = [
  { id: 24, cat: '점검표', title: '소방시설 자체점검 결과보고서 (2026 개정)', file: 'HWP', date: '2026.05.07', dl: 1240, isNew: true },
  { id: 23, cat: '점검표', title: '소방안전관리자 업무수행 일지 양식', file: 'XLSX', date: '2026.05.01', dl: 856, isNew: true },
  { id: 22, cat: '신고서', title: '소방시설공사업 등록사항 변경 신고서', file: 'HWP', date: '2026.04.25', dl: 432 },
  { id: 21, cat: '신고서', title: '특정소방대상물 사용승인 동의 요청서', file: 'HWP', date: '2026.04.18', dl: 678 },
  { id: 20, cat: '계약서', title: '소방시설 점검 표준계약서 (감리 포함)', file: 'DOCX', date: '2026.04.10', dl: 1532 },
  { id: 19, cat: '계약서', title: '소방시설 유지관리 위탁계약서 표준안', file: 'DOCX', date: '2026.04.05', dl: 945 },
  { id: 18, cat: '대장', title: '소방시설 점검대장 (월간/분기/반기/연간)', file: 'XLSX', date: '2026.03.28', dl: 2103 },
  { id: 17, cat: '대장', title: '소방안전관리자 선임자 명부', file: 'XLSX', date: '2026.03.22', dl: 765 },
  { id: 16, cat: '점검표', title: '간이스프링클러설비 자체점검표', file: 'HWP', date: '2026.03.15', dl: 1187 },
  { id: 15, cat: '기타', title: '화재발생 통보·접수 표준 양식', file: 'HWP', date: '2026.03.08', dl: 423 },
  { id: 14, cat: '신고서', title: '소방기술자 경력 신고서', file: 'HWP', date: '2026.02.28', dl: 612 },
  { id: 13, cat: '기타', title: '피난·방화시설 정비계획 작성 양식', file: 'XLSX', date: '2026.02.20', dl: 388 }
];
let formFilter = 'all';
function renderForms() {
  const q = (document.getElementById('formSearchInput')?.value || '').trim().toLowerCase();
  const filtered = formData.filter(f =>
    (formFilter === 'all' || f.cat === formFilter) &&
    (!q || f.title.toLowerCase().includes(q))
  );
  document.getElementById('formCount').textContent = filtered.length;
  const tbody = document.getElementById('formBody');
  if (!filtered.length) {
    tbody.innerHTML = '<tr><td colspan="6" style="text-align:center; padding:40px; color:var(--text-muted);">📭 양식이 없습니다.</td></tr>';
    return;
  }
  tbody.innerHTML = filtered.map((f, i) => `
    <tr>
      <td class="col-no" style="text-align:center; color:var(--text-muted);">${filtered.length - i}</td>
      <td><span class="cat-chip cat-${cssCat(f.cat)}">${f.cat}</span></td>
      <td class="td-title">
        ${esc(f.title)}
        ${f.isNew ? '<span class="badge-new">NEW</span>' : ''}
      </td>
      <td style="text-align:center;"><span class="file-badge file-${(f.file||'').toLowerCase()}">${f.file}</span></td>
      <td style="color:var(--text-secondary); font-size:0.85rem;">${f.date}</td>
      <td style="text-align:center;">
        <button class="btn-mini btn-dl" onclick="downloadForm(${f.id})">⬇ 받기</button>
      </td>
    </tr>`).join('');
}
function downloadForm(id) {
  const f = formData.find(x => x.id === id);
  if (!f) return;
  f.dl++;
  alert(`📥 다운로드: ${f.title}\n파일형식: ${f.file}\n총 다운로드: ${f.dl.toLocaleString()}회\n\n※ 데모이며 실제 파일은 제공되지 않습니다.`);
  if (typeof logActivity === 'function') logActivity('서식다운: ' + f.title.slice(0, 30));
  renderForms();
}

function renderMyArea() {
  const area = document.getElementById('miMyArea');
  if (!area) return;
  const u = getCurrentUser();
  if (!u) {
    area.innerHTML = `
      <h3>👤 마이페이지</h3>
      <div class="mi-empty">
        <div style="font-size:2.4rem; margin-bottom:8px;">🔒</div>
        <p>로그인 후 본인의 회원정보·이웃 새글을 확인할 수 있습니다.</p>
        <button class="btn btn-primary" style="margin-top:12px;" onclick="showLoginModal()">🔑 로그인</button>
      </div>`;
    return;
  }
  const dbUser = getUsers().find(x => x.id === u.id) || {};
  const posts = getPosts().filter(p => p.author === u.id);
  const stats = getNeighborStats(u.id);
  const grade = dbUser.role === 'admin' ? 'gold' : (posts.length >= 5 ? 'silver' : 'bronze');
  const gradeName = grade === 'gold' ? '프리미엄/관리자' : (grade === 'silver' ? '정회원' : '일반회원');
  const gradeIcon = grade === 'gold' ? '👑' : (grade === 'silver' ? '🥈' : '🥉');

  area.innerHTML = `
    <h3>👤 마이페이지</h3>
    <div class="mi-profile">
      <div class="mi-avatar">${u.id.charAt(0).toUpperCase()}</div>
      <div class="mi-info">
        <div class="mi-name">${esc(u.id)} <span class="grade-badge ${grade}">${gradeIcon} ${gradeName}</span></div>
        <div class="mi-meta">가입일: ${dbUser.joinDate || '-'}</div>
      </div>
    </div>
    <div class="mi-stats">
      <div><div class="mi-num">${posts.length}</div><div class="mi-lab">작성한 글</div></div>
      <div><div class="mi-num">${posts.reduce((s,p)=>s+(p.views||0),0)}</div><div class="mi-lab">총 조회수</div></div>
      <div><div class="mi-num">${stats.following}</div><div class="mi-lab">🤝 내 이웃</div></div>
      <div><div class="mi-num">${stats.followers}</div><div class="mi-lab">💚 나를 추가</div></div>
    </div>
    <div class="mi-actions">
      <button class="btn btn-outline btn-sm" onclick="showTab('board')">📋 내 게시글 보기</button>
      <button class="btn btn-outline btn-sm" onclick="showTab('board'); boardNeighborOnly=true; renderBoard();">🤝 이웃 글만</button>
      ${dbUser.role === 'admin'
        ? '<button class="btn btn-primary btn-sm" onclick="showTab(\'dashboard\')">📊 접속상황판</button>'
        : '<button class="btn btn-outline btn-sm" onclick="tryAdminAuthorize()">🔑 관리자 인증</button>'}
      <button class="btn btn-outline btn-sm" onclick="logout(); renderMyArea();">로그아웃</button>
    </div>
    <!-- 이웃 새글 위젯 -->
    <div class="mi-neighbor-feed">
      <div class="mnf-header">
        <h4>🤝 이웃의 새글</h4>
        <span class="mnf-count" id="mnfCount">0</span>
      </div>
      <div id="mnfList"></div>
    </div>
  `;
  renderNeighborFeed();
}

function renderNeighborFeed() {
  const list = document.getElementById('mnfList');
  if (!list) return;
  const me = getCurrentUser();
  if (!me) return;

  const myNeighbors = getMyNeighbors();
  const neighborPosts = getPosts()
    .filter(p => myNeighbors.includes(p.author))
    .sort((a, b) => b.id - a.id)
    .slice(0, 8);

  document.getElementById('mnfCount').textContent = neighborPosts.length;

  if (!myNeighbors.length) {
    list.innerHTML = `<div class="mnf-empty">
      🌱 아직 추가한 이웃이 없습니다.<br>
      <a href="#" onclick="document.getElementById('memberSearchInput')?.focus(); return false;" style="color:var(--naver-green);">아래 회원 현황</a>에서 이웃을 추가해 보세요.
    </div>`;
    return;
  }
  if (!neighborPosts.length) {
    list.innerHTML = '<div class="mnf-empty">🤝 이웃은 있지만 아직 게시글이 없습니다.</div>';
    return;
  }

  list.innerHTML = neighborPosts.map(p => `
    <div class="mnf-item" onclick="showTab('board'); setTimeout(()=>viewPost(${p.id}), 50);">
      <div class="mnf-avatar">${p.author.charAt(0).toUpperCase()}</div>
      <div class="mnf-body">
        <div class="mnf-title">${p.secret ? '🔒 ' : ''}${esc(p.title)}</div>
        <div class="mnf-meta">
          <span class="mnf-author">${esc(p.author)}</span>
          <span class="mnf-date">${p.date}</span>
          <span>👁 ${p.views || 0}</span>
        </div>
      </div>
    </div>
  `).join('');
}

// 카테고리 탭 클릭 핸들러
function bindCategoryTabs() {
  document.querySelectorAll('#techCategoryTabs .kfma-tab').forEach(b => {
    b.onclick = () => {
      document.querySelectorAll('#techCategoryTabs .kfma-tab').forEach(x => x.classList.remove('active'));
      b.classList.add('active');
      techFilter = b.dataset.cat;
      renderTech();
    };
  });
  document.querySelectorAll('#formCategoryTabs .kfma-tab').forEach(b => {
    b.onclick = () => {
      document.querySelectorAll('#formCategoryTabs .kfma-tab').forEach(x => x.classList.remove('active'));
      b.classList.add('active');
      formFilter = b.dataset.cat;
      renderForms();
    };
  });
}

function cssCat(cat) {
  const map = { '점검':'check', '설계':'design', '시공':'build', '감리':'super', '해설':'guide',
                '점검표':'check', '신고서':'report', '계약서':'contract', '대장':'ledger', '기타':'etc' };
  return map[cat] || 'etc';
}

// ===== MEMBERS (통합: 일반 회원 목록 + 관리자 관리 기능) =====
function renderMembers() {
  const q = (document.getElementById('memberSearchInput')?.value || '').trim().toLowerCase();
  const users = getUsers();
  const posts = getPosts();
  const onlineMap = getOnline();
  const now = Date.now();
  const admin = isAdmin();
  const me = getCurrentUser();

  const filtered = users.filter(u => !q || u.id.toLowerCase().includes(q));

  // 상단 통계 (관리자만 DOM에 보임 — 비관리자에게는 .admin-only로 숨김)
  if (document.getElementById('mTotal')) {
    document.getElementById('mTotal').textContent = users.length;
    document.getElementById('mAdmins').textContent = users.filter(u => u.role === 'admin').length;
    document.getElementById('mBanned').textContent = users.filter(u => u.banned).length;
    document.getElementById('mOnline').textContent = getOnlineUsers().length;
  }
  if (document.getElementById('memberCount')) {
    document.getElementById('memberCount').textContent = filtered.length;
  }

  const tbody = document.getElementById('memberBody');
  const empty = document.getElementById('memberEmpty');
  const table = document.getElementById('memberTable');
  if (!tbody) return;
  if (!filtered.length) {
    table.style.display = 'none';
    empty.style.display = 'block';
    return;
  }
  table.style.display = 'table';
  empty.style.display = 'none';

  tbody.innerHTML = filtered.map((u, i) => {
    const postCount = posts.filter(p => p.author === u.id).length;
    const isMe = me && me.id === u.id;
    const lastSeen = onlineMap[u.id];
    const isOnline = lastSeen && (now - lastSeen) < 5 * 60 * 1000;
    const lastLoginStr = u.lastLogin ? formatRel(u.lastLogin) : '—';
    const userTier = u.role === 'admin' ? 'admin' : (u.tier === 'premium' ? 'premium' : 'user');
    const tMeta = TIER_META[userTier];
    const roleBadge = `<span class="tier-pill ${tMeta.cssClass}">${tMeta.icon} ${tMeta.label}</span>`;
    const statusBadge = u.banned
      ? '<span class="badge badge-banned">🚫 차단</span>'
      : (isOnline ? '<span class="badge badge-online">🟢 온라인</span>' : '<span class="badge badge-offline">오프라인</span>');

    // 이웃 버튼 (로그인 + 본인 아닐 때만)
    let neighborCell = '<td></td>';
    if (me && !isMe) {
      const isNB = isNeighbor(u.id);
      neighborCell = `<td><button class="btn-neighbor ${isNB ? 'is-neighbor' : ''}" onclick="toggleNeighbor('${esc(u.id)}')">
        ${isNB ? '✓ 이웃' : '+ 이웃추가'}
      </button></td>`;
    } else if (isMe) {
      neighborCell = '<td><span style="color:var(--text-muted); font-size:0.78rem;">—</span></td>';
    } else {
      neighborCell = '<td><span style="color:var(--text-muted); font-size:0.78rem;">로그인 필요</span></td>';
    }

    let actionsCell = '';
    if (admin) {
      const actions = isMe
        ? '<span style="color:var(--text-muted); font-size:0.8rem;">본인</span>'
        : `
          <select class="tier-select" onchange="adminSetTier('${esc(u.id)}', this.value)" title="등급 변경">
            <option value="admin" ${userTier === 'admin' ? 'selected' : ''}>👑 관리자</option>
            <option value="premium" ${userTier === 'premium' ? 'selected' : ''}>💎 정회원</option>
            <option value="user" ${userTier === 'user' ? 'selected' : ''}>👤 일반</option>
          </select>
          <button class="btn-mini ${u.banned ? 'btn-mini-warn' : ''}" onclick="adminToggleBan('${esc(u.id)}')">${u.banned ? '차단해제' : '차단'}</button>
          <button class="btn-mini btn-mini-danger" onclick="adminDeleteUser('${esc(u.id)}')">삭제</button>
        `;
      actionsCell = `<td class="admin-only-cell"><div class="action-row">${actions}</div></td>`;
    }

    return `<tr>
      <td class="col-no" style="text-align:center;">${i + 1}</td>
      <td class="td-title">${esc(u.id)}${isMe ? ' <span style="color:var(--naver-green); font-size:0.75rem;">(나)</span>' : ''}</td>
      <td style="color:var(--text-secondary); font-size:0.85rem;">${u.joinDate}</td>
      <td style="color:var(--text-secondary); font-size:0.85rem;">${lastLoginStr}</td>
      <td style="text-align:center;">${postCount}</td>
      <td>${roleBadge}</td>
      <td>${statusBadge}</td>
      ${neighborCell}
      ${actionsCell}
    </tr>`;
  }).join('');
}

// ===== DASHBOARD (admin) =====
function renderDashboard() {
  if (!isAdmin()) return;
  const logs = getLogs();
  const posts = getPosts();
  const online = getOnlineUsers();
  const now = Date.now();
  const startOfDay = new Date(); startOfDay.setHours(0, 0, 0, 0);

  // 통계
  document.getElementById('dOnline').textContent = online.length;
  document.getElementById('dPosts').textContent = posts.length;

  const todayLogs = logs.filter(l => l.ts >= startOfDay.getTime());
  const todayUsers = new Set(todayLogs.map(l => l.id)).size;
  document.getElementById('dToday').textContent = todayUsers;
  document.getElementById('dTodaySub').textContent = `로그 ${todayLogs.length}건`;

  const weekStart = now - 7 * 24 * 60 * 60 * 1000;
  const weekLogs = logs.filter(l => l.ts >= weekStart);
  document.getElementById('dWeek').textContent = weekLogs.length;

  // ===== 어제 활동 요약 =====
  const yStart = new Date(); yStart.setDate(yStart.getDate() - 1); yStart.setHours(0, 0, 0, 0);
  const yEnd = new Date(yStart); yEnd.setHours(23, 59, 59, 999);
  const yStartMs = yStart.getTime(), yEndMs = yEnd.getTime();
  const yDateStr = `${yStart.getFullYear()}.${String(yStart.getMonth()+1).padStart(2,'0')}.${String(yStart.getDate()).padStart(2,'0')}`;

  const allUsers = getUsers();
  const yestSignups = allUsers.filter(u => u.joinDate === yDateStr && !u.id.toLowerCase().includes('bot'));
  const yestLogs = logs.filter(l => l.ts >= yStartMs && l.ts <= yEndMs);
  const yestLogins = yestLogs.filter(l => l.action && l.action.startsWith('로그인')).length;
  const yestPostsLogs = yestLogs.filter(l => l.action && l.action.startsWith('글작성')).length;
  const yestActiveUsers = new Set(yestLogs.map(l => l.id)).size;

  const elYestDate = document.getElementById('dYesterdayDate');
  if (elYestDate) elYestDate.textContent = `(${yDateStr})`;
  const setText = (id, v) => { const el = document.getElementById(id); if (el) el.textContent = v; };
  setText('dYestSignups', yestSignups.length);
  setText('dYestLogins', yestLogins);
  setText('dYestPosts', yestPostsLogs);
  setText('dYestActive', yestActiveUsers);

  // 가입자 리스트
  const signupList = document.getElementById('dYestSignupList');
  if (signupList) {
    signupList.innerHTML = yestSignups.length
      ? yestSignups.map(u => {
          const tier = u.role === 'admin' ? '👑 관리자' : (u.tier === 'premium' ? '💎 정회원' : '👤 일반');
          return `<div class="yest-item">
            <span class="yest-id">${esc(u.id)}</span>
            <span class="yest-tier">${tier}</span>
            <span class="yest-date">${u.joinDate}</span>
          </div>`;
        }).join('')
      : '<div class="yest-empty">📭 어제 가입한 회원이 없습니다 (이 브라우저 기준)</div>';
  }

  // 활동 로그 리스트 (최대 20건)
  const logList = document.getElementById('dYestLogList');
  if (logList) {
    const recentYest = yestLogs.slice().reverse().slice(0, 20);
    logList.innerHTML = recentYest.length
      ? recentYest.map(l => {
          const time = new Date(l.ts);
          const hhmm = `${String(time.getHours()).padStart(2,'0')}:${String(time.getMinutes()).padStart(2,'0')}`;
          return `<div class="yest-item">
            <span class="yest-time">${hhmm}</span>
            <span class="yest-id">${esc(l.id)}</span>
            <span class="yest-action">${esc(l.action || '-')}</span>
          </div>`;
        }).join('') + (yestLogs.length > 20 ? `<div class="yest-more">+ ${yestLogs.length - 20} 건 더</div>` : '')
      : '<div class="yest-empty">📭 어제 활동 기록이 없습니다 (이 브라우저 기준)</div>';
  }

  // 일반인(비로그인) 익명 방문 통계
  const anonVisits = (typeof getAnonVisits === 'function') ? getAnonVisits() : [];
  const anonYest = anonVisits.filter(v => v.ts >= yStartMs && v.ts <= yEndMs);
  const anonYestUnique = new Set(anonYest.map(v => v.anonId)).size;
  setText('dYestAnon', anonYestUnique);
  const anonToday = anonVisits.filter(v => v.ts >= startOfDay.getTime());
  const anonWeek = anonVisits.filter(v => v.ts >= weekStart);
  // 오늘 고유 익명 방문자 수 (anonId 기준 unique)
  const anonTodayUnique = new Set(anonToday.map(v => v.anonId)).size;
  const anonWeekUnique = new Set(anonWeek.map(v => v.anonId)).size;
  const elAnonToday = document.getElementById('dAnonToday');
  const elAnonWeek = document.getElementById('dAnonWeek');
  if (elAnonToday) elAnonToday.textContent = anonTodayUnique;
  if (elAnonWeek) elAnonWeek.textContent = anonWeekUnique;

  document.getElementById('dPostsSub').textContent = `오늘 작성 ${todayLogs.filter(l => l.action.startsWith('글작성')).length}건`;
  document.getElementById('dOnlineSub').textContent = online.length ? online.map(o => o.id).slice(0, 3).join(', ') + (online.length > 3 ? ' 외' : '') : '없음';

  // 7일 차트
  const days = [];
  for (let i = 6; i >= 0; i--) {
    const d = new Date(); d.setHours(0, 0, 0, 0); d.setDate(d.getDate() - i);
    const next = d.getTime() + 24 * 60 * 60 * 1000;
    const count = logs.filter(l => l.ts >= d.getTime() && l.ts < next).length;
    days.push({ label: `${d.getMonth() + 1}/${d.getDate()}`, count });
  }
  const max = Math.max(1, ...days.map(d => d.count));
  document.getElementById('dChart').innerHTML = days.map(d => {
    const h = Math.round((d.count / max) * 100);
    return `<div class="bar-col">
      <div class="bar-value">${d.count}</div>
      <div class="bar"><div class="bar-fill" style="height:${h}%"></div></div>
      <div class="bar-label">${d.label}</div>
    </div>`;
  }).join('');

  // 온라인 리스트
  const onlineList = document.getElementById('dOnlineList');
  onlineList.innerHTML = online.length
    ? online.sort((a, b) => b.lastSeen - a.lastSeen).map(o =>
        `<div class="online-row">
          <span class="online-dot"></span>
          <span class="online-id">${esc(o.id)}${isAdmin({id: o.id}) ? ' 👑' : ''}</span>
          <span class="online-time">${formatRel(o.lastSeen)}</span>
        </div>`).join('')
    : '<div style="text-align:center; color:var(--text-muted); padding:24px; font-size:0.88rem;">현재 접속 중인 사용자가 없습니다.</div>';

  // 로그 테이블
  const filter = document.getElementById('dLogFilter')?.value || 'all';
  const filtered = logs.slice().reverse().filter(l => {
    if (filter === 'all') return true;
    if (filter === '페이지') return l.action.startsWith('페이지');
    if (filter === '글작성') return l.action.startsWith('글작성');
    return l.action.startsWith(filter);
  }).slice(0, 100);

  const logBody = document.getElementById('dLogBody');
  const logEmpty = document.getElementById('dLogEmpty');
  if (!filtered.length) {
    logBody.innerHTML = '';
    logEmpty.style.display = 'block';
  } else {
    logEmpty.style.display = 'none';
    logBody.innerHTML = filtered.map(l => {
      const cls = logActionClass(l.action);
      return `<tr>
        <td style="color:var(--text-secondary); font-size:0.82rem;">${formatTs(l.ts)}</td>
        <td class="td-title">${esc(l.id)}</td>
        <td><span class="log-action ${cls}">${esc(l.action)}</span></td>
        <td style="color:var(--text-muted); font-size:0.8rem;">${esc(l.ua || '-')}</td>
      </tr>`;
    }).join('');
  }
}

function clearLogs() {
  if (!isAdmin()) return;
  if (!confirm('정말 모든 활동 로그를 삭제하시겠습니까?')) return;
  saveLogs([]);
  logActivity('로그 초기화');
  renderDashboard();
}

function logActionClass(action) {
  if (action.startsWith('로그인')) return 'log-login';
  if (action.startsWith('로그아웃')) return 'log-logout';
  if (action.startsWith('회원가입')) return 'log-signup';
  if (action.startsWith('글작성')) return 'log-post';
  if (action.startsWith('차단') || action.startsWith('회원삭제')) return 'log-warn';
  if (action.startsWith('권한변경')) return 'log-admin';
  return 'log-default';
}

function formatTs(ts) {
  const d = new Date(ts);
  const pad = n => String(n).padStart(2, '0');
  return `${d.getMonth() + 1}/${d.getDate()} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}

function formatRel(ts) {
  const diff = Date.now() - ts;
  if (diff < 60 * 1000) return '방금 전';
  if (diff < 60 * 60 * 1000) return Math.floor(diff / 60000) + '분 전';
  if (diff < 24 * 60 * 60 * 1000) return Math.floor(diff / 3600000) + '시간 전';
  if (diff < 7 * 24 * 60 * 60 * 1000) return Math.floor(diff / 86400000) + '일 전';
  return formatTs(ts);
}

// ===== GLOBAL SEARCH (Naver-style) =====
function doGlobalSearch() {
  const q = document.getElementById('globalSearchInput').value.trim();
  const scope = document.getElementById('searchScope').value;
  if (!q) {
    document.getElementById('globalSearchInput').focus();
    return;
  }
  const lower = q.toLowerCase();

  // 1) 법령정보
  if (scope === 'all' || scope === 'laws') {
    const lawHit = lawData.some(l =>
      l.name.toLowerCase().includes(lower) ||
      l.desc.toLowerCase().includes(lower) ||
      l.items.some(it => it.label.toLowerCase().includes(lower))
    );
    if (lawHit || scope === 'laws') { showTab('laws'); return; }
  }
  // 2) 기술자료
  if (scope === 'all' || scope === 'tech') {
    const techHit = techData.some(t => t.title.toLowerCase().includes(lower) || t.cat.toLowerCase().includes(lower));
    if (techHit || scope === 'tech') {
      showTab('tech');
      const input = document.getElementById('techSearchInput');
      if (input) { input.value = q; renderTech(); }
      return;
    }
  }
  // 3) 서식자료
  if (scope === 'all' || scope === 'forms') {
    const formHit = formData.some(f => f.title.toLowerCase().includes(lower) || f.cat.toLowerCase().includes(lower));
    if (formHit || scope === 'forms') {
      showTab('forms');
      const input = document.getElementById('formSearchInput');
      if (input) { input.value = q; renderForms(); }
      return;
    }
  }
  // 4) 프로그램
  if (scope === 'all' || scope === 'programs') {
    const hit = Object.entries(programData).find(([key, p]) =>
      p.name.toLowerCase().includes(lower) ||
      p.tag.toLowerCase().includes(lower) ||
      p.desc.toLowerCase().includes(lower) ||
      key.toLowerCase().includes(lower)
    );
    if (hit) {
      showTab('programs');
      showProgramDetail(hit[0]);
      return;
    }
  }
  // 5) 게시판
  if (scope === 'board' || scope === 'all') {
    const posts = getPosts().filter(p =>
      p.title.toLowerCase().includes(lower) ||
      p.content.toLowerCase().includes(lower)
    );
    if (posts.length || scope === 'board') {
      showTab('board');
      const input = document.getElementById('boardSearchInput');
      if (input) { input.value = q; searchBoard(); }
      return;
    }
  }
  // 6) 직접 이동
  if (scope === 'records') { showTab('records'); return; }
  if (scope === 'news') { showTab('news'); return; }
  // 매칭 없음
  showTab('programs');
  alert(`"${q}" 검색 결과가 없습니다.`);
}

// ===== UTILS =====
function esc(str) { const d = document.createElement('div'); d.textContent = str; return d.innerHTML; }

// === 이벤트 탭 중복 방지 — 항상 같은 named window 재사용 ===
window.__eventsWin = null;
function openEventsTab(e) {
  if (e && e.preventDefault) e.preventDefault();
  // 기존 참조가 살아있으면 focus
  if (window.__eventsWin && !window.__eventsWin.closed) {
    try {
      window.__eventsWin.focus();
      // 이미 events 페이지가 열려있으면 그대로, 다른 페이지면 다시 events로
      window.__eventsWin.location.href = 'events/';
      return false;
    } catch (_) { /* cross-origin 등 — fall through */ }
  }
  // 새로 열기 (같은 name으로 — 다른 곳에서 같은 name 열렸으면 그 탭 재사용)
  window.__eventsWin = window.open('events/', 'firesugi-events');
  if (window.__eventsWin) window.__eventsWin.focus();
  return false;
}
