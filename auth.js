// ===== MEMBER SYSTEM (localStorage) =====
const AUTH_KEY = 'fireSugiUsers';
const ADMIN_PASSWORD = 'firesugi-admin-2026';  // 관리자 비밀번호 — 이 값 입력 시에만 관리자 권한 부여
const SESSION_KEY = 'fireSugiSession';
const LOG_KEY = 'fireSugiAccessLogs';
const ONLINE_KEY = 'fireSugiOnline';
const MAX_LOGS = 500;
const ONLINE_WINDOW_MS = 5 * 60 * 1000; // 최근 5분 = 온라인

function getUsers() {
  return JSON.parse(localStorage.getItem(AUTH_KEY) || '[]');
}
function saveUsers(users) {
  localStorage.setItem(AUTH_KEY, JSON.stringify(users));
}
function getCurrentUser() {
  return JSON.parse(localStorage.getItem(SESSION_KEY) || 'null');
}
function setCurrentUser(user) {
  localStorage.setItem(SESSION_KEY, JSON.stringify(user));
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
  document.getElementById('loginId').focus();
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
function doLogin() {
  const id = document.getElementById('loginId').value.trim();
  const pw = document.getElementById('loginPw').value;
  const errEl = document.getElementById('loginError');

  if (!id || !pw) { errEl.textContent = '아이디와 비밀번호를 입력하세요.'; return; }

  const users = getUsers();
  const user = users.find(u => u.id === id && u.pw === pw);
  if (!user) { errEl.textContent = '아이디 또는 비밀번호가 일치하지 않습니다.'; return; }
  if (user.banned) { errEl.textContent = '🚫 차단된 계정입니다. 관리자에게 문의하세요.'; return; }

  // 마지막 로그인 시간 갱신
  user.lastLogin = Date.now();
  saveUsers(users);

  errEl.textContent = '';
  setCurrentUser({ id: user.id, name: user.name || user.id, joinDate: user.joinDate, role: user.role || 'user' });
  logActivity('로그인', user.id);
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

  // 모든 신규 가입자는 자동으로 정회원(premium) 등급
  // (관리자가 되려면 가입 후 [관리자 인증] 버튼으로 비밀번호 입력 필요)
  const newUser = {
    id, pw, joinDate,
    role: 'user',
    tier: 'premium',  // ← 정회원 자동 부여
    banned: false,
    lastLogin: Date.now()
  };
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
  removeOnline(id);
  logActivity(`회원삭제: ${id}`, me.id);
  if (typeof renderMembers === 'function') renderMembers();
}

// ===== INIT =====
document.addEventListener('DOMContentLoaded', () => {
  // 기존 사용자 데이터 마이그레이션 — admin은 그대로, 일반회원은 자동 정회원 승급
  const users = getUsers();
  let dirty = false;
  users.forEach((u) => {
    if (u.role === undefined) { u.role = 'user'; dirty = true; }
    // 관리자가 아닌 모든 회원은 자동으로 정회원(premium) 등급
    if (u.role !== 'admin' && u.tier !== 'premium') {
      u.tier = 'premium';
      dirty = true;
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
