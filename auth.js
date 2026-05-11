// ===== MEMBER SYSTEM (localStorage) =====
const AUTH_KEY = 'fireSugiUsers';
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

  // 첫 가입자(봇 계정 제외) 또는 id === 'admin' 이면 관리자
  const realUserCount = users.filter(u => !u.id.toLowerCase().includes('bot')).length;
  const role = (realUserCount === 0 || id.toLowerCase() === 'admin') ? 'admin' : 'user';
  const newUser = { id, pw, joinDate, role, banned: false, lastLogin: Date.now() };
  users.push(newUser);
  saveUsers(users);

  errEl.textContent = '';
  hideSignupModal();
  setCurrentUser({ id, joinDate, role });
  logActivity('회원가입' + (role === 'admin' ? ' (관리자)' : ''), id);
  pingOnline();
  updateAuthUI();
  refreshMembersIfVisible();
  alert(role === 'admin'
    ? '🎉 회원가입 완료! 관리자 권한이 부여되었습니다.'
    : '🎉 회원가입이 완료되었습니다!');
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
  // 기존 사용자 데이터 마이그레이션 (role/banned 필드 보강)
  const users = getUsers();
  let dirty = false;
  users.forEach((u) => {
    if (u.role === undefined) {
      u.role = (u.id.toLowerCase() === 'admin') ? 'admin' : 'user';
      dirty = true;
    }
    if (u.banned === undefined) { u.banned = false; dirty = true; }
  });
  // 관리자가 없는데 실제 회원(봇 제외)이 있으면 → 첫 실제 회원을 자동 승급
  const realUsers = users.filter(u => !u.id.toLowerCase().includes('bot'));
  const hasAdmin = users.some(u => u.role === 'admin');
  if (!hasAdmin && realUsers.length > 0) {
    realUsers[0].role = 'admin';
    console.log('🛡 관리자 자동 승급:', realUsers[0].id);
    dirty = true;
  }
  if (dirty) saveUsers(users);

  updateAuthUI();
  // 페이지 진입 로그 (로그인 상태에서만)
  if (getCurrentUser()) {
    logActivity('페이지 접속');
    pingOnline();
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
