let currentUser = null;
let currentProfile = null;

async function waitForSession(retries = 15, delay = 300) {
  if (!sb) return null;
  for (let i = 0; i < retries; i++) {
    const { data: { session } } = await sb.auth.getSession();
    if (session && session.user) return session;
    await new Promise(r => setTimeout(r, delay));
  }
  return null;
}

async function initAuth() {
  if (!sb) return false;
  const session = await waitForSession();
  if (session) {
    currentUser = session.user;
    await loadProfile();
  }
  return !!currentUser;
}

async function loadProfile() {
  if (!sb || !currentUser) return;
  try {
    const { data } = await sb.from('employees').select('*').eq('user_id', currentUser.id).maybeSingle();
    currentProfile = data;
  } catch (e) {
    console.error('loadProfile error:', e);
  }
  updateAuthUI();
}

function updateAuthUI() {
  const loggedOut = document.getElementById('authLoggedOut');
  const loggedIn = document.getElementById('authLoggedIn');
  const sidebarUser = document.getElementById('sidebarUser');
  if (!currentUser) {
    if (loggedOut) loggedOut.style.display = '';
    if (loggedIn) loggedIn.style.display = 'none';
    return;
  }
  if (loggedOut) loggedOut.style.display = 'none';
  if (loggedIn) loggedIn.style.display = '';
  const name = currentProfile?.full_name || currentUser.email;
  const initial = (name.charAt(0) || 'U').toUpperCase();
  const avatarEl = document.getElementById('navUserAvatar');
  const nameEl = document.getElementById('dropdownName');
  const emailEl = document.getElementById('dropdownEmail');
  if (avatarEl) avatarEl.textContent = initial;
  if (nameEl) nameEl.textContent = name;
  if (emailEl) emailEl.textContent = currentUser.email;
  if (sidebarUser) {
    sidebarUser.querySelector('.su-avatar').textContent = initial;
    sidebarUser.querySelector('.su-name').textContent = name;
    sidebarUser.querySelector('.su-role').textContent = currentProfile?.role || 'user';
  }
}

async function doLogin(email, password) {
  const { data, error } = await sb.auth.signInWithPassword({ email, password });
  if (error) throw error;
  currentUser = data.user;
}

async function doRegister(email, password, fullName) {
  const { data, error } = await sb.auth.signUp({ email, password, options: { data: { full_name: fullName } } });
  if (error) throw error;
  if (data.user && !data.session) return { needsConfirmation: true };
  return { needsConfirmation: false };
}

async function doLogout() {
  if (sb) await sb.auth.signOut();
  currentUser = null;
  currentProfile = null;
  window.location.href = 'login.html';
}

function requireAuth() {
  if (!currentUser) { window.location.href = 'login.html'; return false; }
  return true;
}

function isAdmin() { return currentProfile?.role === 'admin'; }
function isTech() { return currentProfile?.role === 'tech' || currentProfile?.role === 'admin'; }
