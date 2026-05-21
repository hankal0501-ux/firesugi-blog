// ===== ADMIN-ONLY MODE (회원 ID 시스템 폐지 — 단일 관리자 비밀번호만) =====
// 일반 방문자는 로그인 없이 콘텐츠 열람. 이 PW는 10X 발송·선정기준 편집 등 관리 기능 전용.
const AUTH_KEY = 'fireSugiUsers';
const ADMIN_PASSWORD = 'firesugi-admin-2026';
const SITE_OWNER_ID = 'admin';  // 합성 관리자 ID — 회원 시스템 폐지로 의미만 유지
const SESSION_KEY = 'fireSugiSession';

// 관리자 모드 진입 — 단일 비밀번호 검증
function showAdminModal() {
  const m = document.getElementById('adminModal');
  if (m) m.style.display = 'flex';
  const inp = document.getElementById('adminPw');
  if (inp) { inp.value = ''; setTimeout(() => inp.focus(), 50); }
  const err = document.getElementById('adminError');
  if (err) err.textContent = '';
}
function hideAdminModal() {
  const m = document.getElementById('adminModal');
  if (m) m.style.display = 'none';
}
function doAdminLogin() {
  const pw = (document.getElementById('adminPw') || {}).value || '';
  const err = document.getElementById('adminError');
  if (pw !== ADMIN_PASSWORD) {
    if (err) err.textContent = '❌ 비밀번호가 일치하지 않습니다.';
    return;
  }
  // 합성 관리자 사용자 등록 — 기존 isAdmin/getCurrentUser 체인이 그대로 동작하도록
  const adminUser = { id: SITE_OWNER_ID, role: 'admin', joinDate: new Date().toISOString().slice(0,10), lastLogin: Date.now() };
  const users = JSON.parse(localStorage.getItem(AUTH_KEY) || '[]');
  const idx = users.findIndex(u => u.id === SITE_OWNER_ID);
  if (idx >= 0) users[idx] = { ...users[idx], ...adminUser };
  else users.push(adminUser);
  localStorage.setItem(AUTH_KEY, JSON.stringify(users));
  localStorage.setItem(SESSION_KEY, JSON.stringify(adminUser));
  hideAdminModal();
  if (typeof updateAuthUI === 'function') updateAuthUI();
  if (typeof logActivity === 'function') logActivity('🛡 관리자 모드 진입', SITE_OWNER_ID);
  alert('✅ 관리자 모드 진입 완료. 페이지가 자동 새로고침됩니다.');
  location.reload();
}
function exitAdminMode() {
  localStorage.removeItem(SESSION_KEY);
  sessionStorage.removeItem(SESSION_KEY);
  if (typeof logActivity === 'function') logActivity('관리자 모드 종료', SITE_OWNER_ID);
  location.reload();
}
// 하위 호환 — 기존 코드의 showLoginModal/showSignupModal/logout 호출은 관리자 모달로 대체
function showLoginModal() { showAdminModal(); }
function hideLoginModal() { hideAdminModal(); }
function showSignupModal() { showAdminModal(); }
function hideSignupModal() { hideAdminModal(); }
function logout() { exitAdminMode(); }
function doLogin() { doAdminLogin(); }
function doSignup() { showAdminModal(); }
const LOG_KEY = 'fireSugiAccessLogs';
const ONLINE_KEY = 'fireSugiOnline';
const MAX_LOGS = 500;
const ONLINE_WINDOW_MS = 5 * 60 * 1000; // 최근 5분 = 온라인

function getUsers() {
  return JSON.parse(localStorage.getItem(AUTH_KEY) || '[]');
}
function saveUsers(users) {
  localStorage.setItem(AUTH_KEY, JSON.stringify(users));
  // Firestore 동기화 (자동·비동기, 실패해도 진행)
  if (typeof fbPushAllUsers === 'function') {
    fbPushAllUsers(users).catch(() => {});
  }
}
function getCurrentUser() {
  // localStorage(기억하기 ON) 우선, 없으면 sessionStorage(기억하기 OFF)
  const stored = localStorage.getItem(SESSION_KEY) || sessionStorage.getItem(SESSION_KEY);
  return JSON.parse(stored || 'null');
}
function setCurrentUser(user) {
  // 기존 저장 위치(local 또는 session) 그대로 갱신
  if (localStorage.getItem(SESSION_KEY)) {
    localStorage.setItem(SESSION_KEY, JSON.stringify(user));
  } else if (sessionStorage.getItem(SESSION_KEY)) {
    sessionStorage.setItem(SESSION_KEY, JSON.stringify(user));
  } else {
    // 신규 — 기본은 localStorage(기억하기 ON)
    localStorage.setItem(SESSION_KEY, JSON.stringify(user));
  }
}
function isAdmin(user) {
  const u = user || getCurrentUser();
  if (!u) return false;
  const dbUser = getUsers().find(x => x.id === u.id);
  return !!(dbUser && dbUser.role === 'admin');
}

// 등급 (관리자 > 정회원 > 일반)
const TIER_META = {
  admin:   { icon: '👑', label: '관리자', short: 'ADMIN',   cssClass: 'tier-admin' },
  premium: { icon: '💎', label: '정회원', short: 'PREMIUM', cssClass: 'tier-premium' },
  user:    { icon: '👤', label: '일반',   short: 'USER',    cssClass: 'tier-user' }
};
function getTier(user) {
  const u = user || getCurrentUser();
  if (!u) return 'user';
  const db = getUsers().find(x => x.id === u.id);
  if (!db) return 'user';
  if (db.role === 'admin') return 'admin';
  if (db.tier === 'premium') return 'premium';
  return 'user';
}
function adminSetTier(id, newTier) {
  if (!isAdmin()) return alert('관리자만 가능합니다.');
  const me = getCurrentUser();
  if (me && me.id === id && newTier !== 'admin') return alert('본인 등급은 변경할 수 없습니다.');
  if (!['admin', 'premium', 'user'].includes(newTier)) return;
  const users = getUsers();
  const u = users.find(x => x.id === id);
  if (!u) return;
  if (newTier === 'admin') {
    u.role = 'admin';
    delete u.tier;
  } else {
    u.role = 'user';
    if (newTier === 'premium') u.tier = 'premium';
    else delete u.tier;
  }
  saveUsers(users);
  logActivity(`등급변경: ${id} → ${TIER_META[newTier].label}`, me.id);
  if (typeof renderMembers === 'function') renderMembers();
  if (typeof renderMyArea === 'function') renderMyArea();
  // 본인 등급이 바뀌면 헤더도 갱신
  if (me && me.id === id) updateAuthUI();
}
function logout() {
  const u = getCurrentUser();
  if (u) logActivity('로그아웃', u.id);
  localStorage.removeItem(SESSION_KEY);
  sessionStorage.removeItem(SESSION_KEY);
  // 기억하기 ID는 유지 (다음 로그인 시 자동 채움)
  removeOnline(u && u.id);
  updateAuthUI();
  renderBoard();
  refreshMembersIfVisible();
}

// 통합 회원 탭이 화면에 있으면 새로 렌더 (관리자 권한 변경 시 액션 컬럼 토글)
function refreshMembersIfVisible() {
  if (typeof renderMembers === 'function' && document.getElementById('memberBody')) renderMembers();
  if (typeof renderMyArea === 'function' && document.getElementById('miMyArea')) renderMyArea();
}

// ===== NEIGHBOR (이웃) SYSTEM =====
const NEIGHBORS_KEY = 'fireSugiNeighbors';

function getAllNeighbors() {
  return JSON.parse(localStorage.getItem(NEIGHBORS_KEY) || '{}');
}
function saveAllNeighbors(map) {
  localStorage.setItem(NEIGHBORS_KEY, JSON.stringify(map));
}
function getMyNeighbors() {
  const me = getCurrentUser();
  if (!me) return [];
  return getAllNeighbors()[me.id] || [];
}
function isNeighbor(targetId) {
  return getMyNeighbors().includes(targetId);
}
// 팔로워(나를 이웃으로 추가한 사람) / 팔로잉(내가 추가한 사람)
function getNeighborStats(userId) {
  const map = getAllNeighbors();
  let followers = 0;
  Object.entries(map).forEach(([k, list]) => {
    if (k !== userId && list.includes(userId)) followers++;
  });
  return {
    following: (map[userId] || []).length,
    followers
  };
}
function toggleNeighbor(targetId) {
  const me = getCurrentUser();
  if (!me) { alert('로그인이 필요합니다.'); showLoginModal(); return false; }
  if (me.id === targetId) { alert('본인은 이웃으로 추가할 수 없습니다.'); return false; }
  const target = getUsers().find(u => u.id === targetId);
  if (!target) { alert('존재하지 않는 사용자입니다.'); return false; }

  const map = getAllNeighbors();
  if (!map[me.id]) map[me.id] = [];
  const idx = map[me.id].indexOf(targetId);
  let added;
  if (idx >= 0) {
    map[me.id].splice(idx, 1);
    added = false;
  } else {
    map[me.id].push(targetId);
    added = true;
  }
  saveAllNeighbors(map);
  logActivity((added ? '이웃추가' : '이웃해제') + ': ' + targetId, me.id);

  // UI 갱신
  if (typeof renderMembers === 'function') renderMembers();
  if (typeof renderMyArea === 'function') renderMyArea();
  if (typeof renderNeighborFeed === 'function') renderNeighborFeed();
  if (typeof renderBoard === 'function') renderBoard();

  return added;
}

// ===== 관리자 데이터 백업·복원 (기기간 수동 동기화) =====
function exportAllData() {
  if (!isAdmin()) return alert('관리자만 사용할 수 있습니다.');
  const data = {
    exportedAt: new Date().toISOString(),
    exportedBy: getCurrentUser()?.id || 'unknown',
    version: 1,
    users:      JSON.parse(localStorage.getItem('fireSugiUsers') || '[]'),
    posts:      JSON.parse(localStorage.getItem('fireSugiBoardPosts') || '[]'),
    accessLogs: JSON.parse(localStorage.getItem('fireSugiAccessLogs') || '[]'),
    onlineMap:  JSON.parse(localStorage.getItem('fireSugiOnline') || '{}'),
    anonVisits: JSON.parse(localStorage.getItem('fireSugiAnonVisits') || '[]'),
    neighbors:  JSON.parse(localStorage.getItem('fireSugiNeighbors') || '{}'),
    progClicks: JSON.parse(localStorage.getItem('fireSugiProgramClicks') || '{}'),
    // 스크린샷도 백업 (모든 프로그램 키)
    screenshots: Object.fromEntries(
      Object.keys(localStorage)
        .filter(k => k.startsWith('fireSugiShots_'))
        .map(k => [k, JSON.parse(localStorage.getItem(k))])
    )
  };
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  const dateStr = new Date().toISOString().slice(0, 10);
  a.href = url;
  a.download = `firesugi-backup-${dateStr}.json`;
  document.body.appendChild(a); a.click();
  setTimeout(() => { document.body.removeChild(a); URL.revokeObjectURL(url); }, 100);
  alert(`✅ 백업 완료!\n\n회원 ${data.users.length}명 · 게시글 ${data.posts.length}건 · 로그 ${data.accessLogs.length}건\n\n다른 기기에서 [📥 가져오기]로 복원할 수 있습니다.`);
}

function importAllData() {
  if (!isAdmin()) return alert('관리자만 사용할 수 있습니다.');
  const input = document.createElement('input');
  input.type = 'file'; input.accept = 'application/json,.json';
  input.onchange = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    try {
      const text = await file.text();
      const data = JSON.parse(text);
      if (!data || !data.version) {
        return alert('⚠️ 올바른 백업 파일이 아닙니다.');
      }
      if (!confirm(`📥 백업 가져오기\n\n원본: ${data.exportedBy} (${new Date(data.exportedAt).toLocaleString('ko')})\n회원: ${(data.users||[]).length}명\n게시글: ${(data.posts||[]).length}건\n\n현재 데이터에 [병합]합니다 (덮어쓰기 X, 중복은 자동 제거).\n계속하시겠습니까?`)) return;

      // 병합: 기존 + 신규 (중복 ID·게시글ID는 신규 우선)
      mergeArray('fireSugiUsers', data.users || [], 'id');
      mergeArray('fireSugiBoardPosts', data.posts || [], 'id');
      mergeArray('fireSugiAccessLogs', data.accessLogs || [], 'ts');
      mergeArray('fireSugiAnonVisits', data.anonVisits || [], 'ts');
      mergeObject('fireSugiOnline', data.onlineMap || {});
      mergeObject('fireSugiNeighbors', data.neighbors || {});
      mergeObject('fireSugiProgramClicks', data.progClicks || {});
      // 스크린샷 병합
      Object.entries(data.screenshots || {}).forEach(([k, v]) => {
        if (v) localStorage.setItem(k, JSON.stringify(v));
      });

      logActivity('데이터 가져오기: ' + file.name);
      alert(`✅ 가져오기 완료!\n\n페이지 새로고침합니다.`);
      setTimeout(() => location.reload(), 800);
    } catch (err) {
      alert('❌ 가져오기 실패: ' + err.message);
    }
  };
  input.click();
}

// 배열 병합 — key로 중복 제거 (신규 우선)
function mergeArray(storageKey, newArr, idField) {
  const existing = JSON.parse(localStorage.getItem(storageKey) || '[]');
  const map = new Map();
  existing.forEach(item => map.set(item[idField], item));
  newArr.forEach(item => map.set(item[idField], item));  // 신규가 덮어씀
  const merged = Array.from(map.values());
  localStorage.setItem(storageKey, JSON.stringify(merged));
}
function mergeObject(storageKey, newObj) {
  const existing = JSON.parse(localStorage.getItem(storageKey) || '{}');
  const merged = { ...existing, ...newObj };
  localStorage.setItem(storageKey, JSON.stringify(merged));
}

// ===== 익명 방문(비로그인) 추적 =====
const ANON_VISITS_KEY = 'fireSugiAnonVisits';
const ANON_ID_KEY = 'fireSugiAnonId';

function getAnonId() {
  let id = localStorage.getItem(ANON_ID_KEY);
  if (!id) {
    id = 'anon_' + Math.random().toString(36).substring(2, 10);
    localStorage.setItem(ANON_ID_KEY, id);
  }
  return id;
}
function getAnonVisits() {
  return JSON.parse(localStorage.getItem(ANON_VISITS_KEY) || '[]');
}
function trackAnonVisit() {
  if (getCurrentUser()) return; // 로그인된 경우는 기존 logActivity로 기록됨
  const anonId = getAnonId();
  const visits = getAnonVisits();
  // 같은 anonId가 1시간 이내 방문 기록 있으면 스킵 (중복 방지)
  const lastSame = visits.filter(v => v.anonId === anonId).pop();
  if (lastSame && Date.now() - lastSame.ts < 60 * 60 * 1000) return;
  visits.push({ ts: Date.now(), anonId, ua: getBrowserName() });
  // 최대 500개 유지
  if (visits.length > 500) visits.splice(0, visits.length - 500);
  localStorage.setItem(ANON_VISITS_KEY, JSON.stringify(visits));
}

// ===== ACCESS LOG =====
function getLogs() {
  return JSON.parse(localStorage.getItem(LOG_KEY) || '[]');
}
function saveLogs(logs) {
  localStorage.setItem(LOG_KEY, JSON.stringify(logs.slice(-MAX_LOGS)));
}
function logActivity(action, userId) {
  const id = userId || (getCurrentUser() && getCurrentUser().id) || '익명';
  const logs = getLogs();
  logs.push({
    ts: Date.now(),
    id,
    action,
    ua: getBrowserName()
  });
  saveLogs(logs);
}
function getBrowserName() {
  const ua = navigator.userAgent;
  if (/Edg\//.test(ua)) return 'Edge';
  if (/Chrome\//.test(ua)) return 'Chrome';
  if (/Firefox\//.test(ua)) return 'Firefox';
  if (/Safari\//.test(ua)) return 'Safari';
  return 'Unknown';
}

// ===== ONLINE TRACKING =====
function getOnline() {
  return JSON.parse(localStorage.getItem(ONLINE_KEY) || '{}');
}
function saveOnline(map) {
  localStorage.setItem(ONLINE_KEY, JSON.stringify(map));
}
function pingOnline() {
  const u = getCurrentUser();
  if (!u) return;
  const map = getOnline();
  map[u.id] = Date.now();
  saveOnline(map);
}
function removeOnline(id) {
  if (!id) return;
  const map = getOnline();
  delete map[id];
  saveOnline(map);
}
function getOnlineUsers() {
  const now = Date.now();
  const map = getOnline();
  return Object.entries(map)
    .filter(([_, ts]) => now - ts < ONLINE_WINDOW_MS)
    .map(([id, ts]) => ({ id, lastSeen: ts }));
}

// ===== UI UPDATE =====
function updateAuthUI() {
  const user = getCurrentUser();
  const loginBtn = document.getElementById('authLoginBtn');
  const userInfo = document.getElementById('authUserInfo');
  const userName = document.getElementById('authUserName');
  const tierPill = document.getElementById('authTierPill');
  const adminLinks = document.querySelectorAll('.admin-only');

  if (user) {
    loginBtn.style.display = 'none';
    userInfo.style.display = 'flex';
    const tier = getTier(user);
    const meta = TIER_META[tier];
    if (tierPill) {
      tierPill.className = 'tier-pill ' + meta.cssClass;
      tierPill.textContent = meta.icon + ' ' + meta.label;
    }
    if (userName) userName.textContent = user.id;
  } else {
    loginBtn.style.display = 'inline-flex';
    userInfo.style.display = 'none';
  }
  adminLinks.forEach(el => {
    el.style.display = isAdmin(user) ? '' : 'none';
  });
}

// ===== MODALS =====
function showLoginModal() {
  document.getElementById('loginModal').style.display = 'flex';
  document.body.style.overflow = 'hidden';
  // 기억된 ID가 있으면 자동 채움 → 포커스는 비밀번호 칸으로
  const rememberedId = localStorage.getItem(REMEMBER_KEY);
  const idInput = document.getElementById('loginId');
  const pwInput = document.getElementById('loginPw');
  if (rememberedId && idInput && !idInput.value) {
    idInput.value = rememberedId;
    pwInput && pwInput.focus();
  } else {
    idInput && idInput.focus();
  }
}
function hideLoginModal() {
  document.getElementById('loginModal').style.display = 'none';
  document.body.style.overflow = '';
}
function showSignupModal() {
  hideLoginModal();
  document.getElementById('signupModal').style.display = 'flex';
  document.body.style.overflow = 'hidden';
  document.getElementById('signupId').focus();
}
function hideSignupModal() {
  document.getElementById('signupModal').style.display = 'none';
  document.body.style.overflow = '';
}

// ===== LOGIN =====
const REMEMBER_KEY = 'fireSugiRememberId';

function doLogin() {
  const id = document.getElementById('loginId').value.trim();
  const pw = document.getElementById('loginPw').value;
  const remember = document.getElementById('loginRemember')?.checked !== false;  // 기본 ON
  const errEl = document.getElementById('loginError');

  if (!id || !pw) { errEl.textContent = '아이디와 비밀번호를 입력하세요.'; return; }

  const users = getUsers();
  const user = users.find(u => u.id === id && u.pw === pw);
  if (!user) { errEl.textContent = '아이디 또는 비밀번호가 일치하지 않습니다.'; return; }
  if (user.banned) { errEl.textContent = '🚫 차단된 계정입니다. 관리자에게 문의하세요.'; return; }

  // 마지막 로그인 시간 갱신
  user.lastLogin = Date.now();
  saveUsers(users);

  // 기억하기: ON → localStorage(영구), OFF → sessionStorage(세션 종료 시 자동 로그아웃)
  const sessionData = { id: user.id, name: user.name || user.id, joinDate: user.joinDate, role: user.role || 'user', tier: user.tier };
  if (remember) {
    localStorage.setItem(SESSION_KEY, JSON.stringify(sessionData));
    localStorage.setItem(REMEMBER_KEY, user.id);  // 다음번 ID 자동 채움용
    sessionStorage.removeItem(SESSION_KEY);
  } else {
    sessionStorage.setItem(SESSION_KEY, JSON.stringify(sessionData));
    localStorage.removeItem(SESSION_KEY);
    localStorage.removeItem(REMEMBER_KEY);
  }

  errEl.textContent = '';
  logActivity('로그인' + (remember ? ' (기억하기)' : ''), user.id);
  pingOnline();
  hideLoginModal();
  updateAuthUI();
  renderBoard();
  refreshMembersIfVisible();
}

// ===== SIGNUP =====
function doSignup() {
  const id = document.getElementById('signupId').value.trim();
  const pw = document.getElementById('signupPw').value;
  const pw2 = document.getElementById('signupPw2').value;
  const agree = document.getElementById('signupAgree').checked;
  const errEl = document.getElementById('signupError');

  if (!id || id.length < 3) { errEl.textContent = '아이디는 3자 이상이어야 합니다.'; return; }
  if (!pw || pw.length < 4) { errEl.textContent = '비밀번호는 4자 이상이어야 합니다.'; return; }
  if (pw !== pw2) { errEl.textContent = '비밀번호가 일치하지 않습니다.'; return; }
  if (!agree) { errEl.textContent = '이용약관에 동의해주세요.'; return; }

  const users = getUsers();
  if (users.find(u => u.id === id)) { errEl.textContent = '이미 사용 중인 아이디입니다.'; return; }

  const now = new Date();
  const joinDate = `${now.getFullYear()}.${String(now.getMonth()+1).padStart(2,'0')}.${String(now.getDate()).padStart(2,'0')}`;

  // hankal0501만 admin, 나머지 전원 정회원(premium)
  const isOwner = id.toLowerCase() === SITE_OWNER_ID.toLowerCase();
  const newUser = isOwner
    ? { id, pw, joinDate, role: 'admin', banned: false, lastLogin: Date.now() }
    : { id, pw, joinDate, role: 'user', tier: 'premium', banned: false, lastLogin: Date.now() };
  users.push(newUser);
  saveUsers(users);

  errEl.textContent = '';
  hideSignupModal();
  setCurrentUser({ id, joinDate, role: 'user', tier: 'premium' });
  logActivity('회원가입 (정회원)', id);
  pingOnline();
  updateAuthUI();
  refreshMembersIfVisible();
  alert('🎉 회원가입 완료! 자동으로 💎 정회원 등급이 부여되었습니다.\n\n프로그램 접속·기록 다운로드 등 모든 회원 기능을 이용하실 수 있습니다.');
}

// 관리자 비밀번호 인증 — 로그인된 사용자가 비번 입력 시 관리자 승급
function tryAdminAuthorize() {
  const me = getCurrentUser();
  if (!me) {
    alert('🔑 관리자 인증은 로그인 후 가능합니다.');
    showLoginModal();
    return;
  }
  if (isAdmin()) {
    alert('이미 관리자입니다. 👑');
    return;
  }
  const pw = prompt('🔑 관리자 비밀번호를 입력하세요:');
  if (pw === null || pw === '') return;
  if (pw !== ADMIN_PASSWORD) {
    alert('❌ 비밀번호가 일치하지 않습니다.');
    logActivity('관리자 인증 실패', me.id);
    return;
  }
  const users = getUsers();
  const u = users.find(x => x.id === me.id);
  if (!u) return alert('회원 정보를 찾을 수 없습니다.');
  u.role = 'admin';
  delete u.tier;  // admin이 되면 tier 무의미
  saveUsers(users);
  setCurrentUser({ ...me, role: 'admin' });
  logActivity('🛡 관리자 인증 성공', me.id);
  updateAuthUI();
  refreshMembersIfVisible();
  alert('✅ 관리자 인증 완료!\n\n잠시 후 페이지가 새로고침됩니다.');
  setTimeout(() => location.reload(), 1500);
}

// ===== ADMIN ACTIONS =====
function adminToggleRole(id) {
  if (!isAdmin()) return alert('관리자만 가능합니다.');
  const me = getCurrentUser();
  if (me && me.id === id) return alert('본인의 권한은 변경할 수 없습니다.');
  const users = getUsers();
  const u = users.find(x => x.id === id);
  if (!u) return;
  u.role = u.role === 'admin' ? 'user' : 'admin';
  saveUsers(users);
  logActivity(`권한변경: ${id} → ${u.role}`, me.id);
  if (typeof renderMembers === 'function') renderMembers();
}
function adminToggleBan(id) {
  if (!isAdmin()) return alert('관리자만 가능합니다.');
  const me = getCurrentUser();
  if (me && me.id === id) return alert('본인은 차단할 수 없습니다.');
  const users = getUsers();
  const u = users.find(x => x.id === id);
  if (!u) return;
  u.banned = !u.banned;
  saveUsers(users);
  logActivity(`${u.banned ? '차단' : '차단해제'}: ${id}`, me.id);
  if (typeof renderMembers === 'function') renderMembers();
}
function adminDeleteUser(id) {
  if (!isAdmin()) return alert('관리자만 가능합니다.');
  const me = getCurrentUser();
  if (me && me.id === id) return alert('본인 계정은 삭제할 수 없습니다.');
  if (!confirm(`정말 "${id}" 회원을 삭제하시겠습니까?`)) return;
  let users = getUsers();
  users = users.filter(x => x.id !== id);
  saveUsers(users);
  // Firestore에서도 영구 삭제
  if (typeof fbDeleteUser === 'function') fbDeleteUser(id).catch(() => {});
  removeOnline(id);
  logActivity(`회원삭제: ${id}`, me.id);
  if (typeof renderMembers === 'function') renderMembers();
}

// ===== INIT =====
document.addEventListener('DOMContentLoaded', () => {
  // 기존 사용자 마이그레이션 — hankal0501만 admin, 나머지 전원 정회원 강제
  const users = getUsers();
  let dirty = false;
  users.forEach((u) => {
    const isOwner = u.id && u.id.toLowerCase() === SITE_OWNER_ID.toLowerCase();
    if (isOwner) {
      if (u.role !== 'admin') { u.role = 'admin'; dirty = true; }
      if (u.tier) { delete u.tier; dirty = true; }
    } else {
      if (u.role === 'admin') { u.role = 'user'; dirty = true; }  // 다른 관리자는 강등
      if (u.role === undefined) { u.role = 'user'; dirty = true; }
      if (u.tier !== 'premium') { u.tier = 'premium'; dirty = true; }
    }
    if (u.banned === undefined) { u.banned = false; dirty = true; }
  });
  if (dirty) saveUsers(users);

  // 현재 로그인한 사용자가 DB에 없으면 자동 등록 (회원목록에 본인이 안 보이는 문제 해결)
  const me = getCurrentUser();
  if (me && !users.find(u => u.id === me.id)) {
    const now = new Date();
    const joinDate = me.joinDate || `${now.getFullYear()}.${String(now.getMonth()+1).padStart(2,'0')}.${String(now.getDate()).padStart(2,'0')}`;
    const isOwner = me.id.toLowerCase() === SITE_OWNER_ID.toLowerCase();
    users.push({
      id: me.id,
      pw: '__auto_restored_' + Date.now(),  // 임시 PW (사용자가 재설정 필요)
      joinDate,
      role: isOwner ? 'admin' : 'user',
      banned: false,
      lastLogin: Date.now()
    });
    saveUsers(users);
    console.log('🛡 누락된 본인 계정 자동 복구:', me.id);
  }

  updateAuthUI();
  // 페이지 진입 로그
  if (getCurrentUser()) {
    logActivity('페이지 접속');
    pingOnline();
  } else {
    trackAnonVisit();  // 비로그인 — 익명 방문 추적
  }
  // 30초마다 온라인 핑 + 상황판 갱신
  setInterval(() => {
    pingOnline();
    if (document.getElementById('tab-dashboard')?.classList.contains('active')) {
      if (typeof renderDashboard === 'function') renderDashboard();
    }
  }, 30000);

  document.getElementById('loginPw')?.addEventListener('keydown', e => {
    if (e.key === 'Enter') doLogin();
  });
  document.getElementById('signupPw2')?.addEventListener('keydown', e => {
    if (e.key === 'Enter') doSignup();
  });
});
