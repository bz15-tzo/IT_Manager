let currentPassword = '';

const CHARS_UPPER = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
const CHARS_LOWER = 'abcdefghijklmnopqrstuvwxyz';
const CHARS_DIGITS = '0123456789';
const CHARS_SYMBOLS = '!@#$%^&*()-_=+[]{}|;:,.<>?/~`';
const AMBIGUOUS = '0Oo1lI';

function getCharPool(options) {
  let pool = '';
  if (options.uppercase) pool += CHARS_UPPER;
  if (options.lowercase) pool += CHARS_LOWER;
  if (options.digits) pool += CHARS_DIGITS;
  if (options.symbols) pool += CHARS_SYMBOLS;
  if (options.excludeAmbiguous) {
    pool = pool.split('').filter(c => !AMBIGUOUS.includes(c)).join('');
  }
  return pool;
}

function generatePassword(options) {
  const pool = getCharPool(options);
  if (!pool) return '';
  const len = Math.max(8, Math.min(128, options.length || 20));
  const array = new Uint32Array(len);
  crypto.getRandomValues(array);
  let pwd = '';
  for (let i = 0; i < len; i++) {
    pwd += pool[array[i] % pool.length];
  }
  return pwd;
}

function calculateStrength(password) {
  if (!password) return { score: 0, label: '—', color: '#64748b', entropy: 0, crackTime: '—' };

  let poolSize = 0;
  if (/[a-z]/.test(password)) poolSize += 26;
  if (/[A-Z]/.test(password)) poolSize += 26;
  if (/[0-9]/.test(password)) poolSize += 10;
  if (/[^a-zA-Z0-9]/.test(password)) poolSize += 32;
  if (poolSize === 0) poolSize = 26;

  const entropy = Math.round(password.length * Math.log2(poolSize));
  const guessesPerSec = 1e10;
  const totalCombos = Math.pow(poolSize, password.length);
  const seconds = totalCombos / guessesPerSec / 2;

  let crackTime;
  if (seconds < 1) crackTime = 'instant';
  else if (seconds < 60) crackTime = Math.round(seconds) + 's';
  else if (seconds < 3600) crackTime = Math.round(seconds / 60) + 'min';
  else if (seconds < 86400) crackTime = Math.round(seconds / 3600) + 'h';
  else if (seconds < 31536000) crackTime = Math.round(seconds / 86400) + 'j';
  else if (seconds < 31536000 * 1000) crackTime = Math.round(seconds / 31536000) + ' ans';
  else if (seconds < 31536000 * 1e6) crackTime = Math.round(seconds / 31536000 / 1000) + 'k ans';
  else if (seconds < 31536000 * 1e9) crackTime = Math.round(seconds / 31536000 / 1e6) + 'M ans';
  else crackTime = '∞';

  let score = 0;
  if (entropy >= 128) score = 4;
  else if (entropy >= 80) score = 3;
  else if (entropy >= 50) score = 2;
  else if (entropy >= 25) score = 1;

  const labels = ['Faible', 'Moyen', 'Fort', 'Très fort', 'Excellent'];
  const colors = ['#ef4444', '#f97316', '#eab308', '#22c55e', '#10b981'];

  return {
    score,
    label: labels[score],
    color: colors[score],
    entropy,
    crackTime
  };
}

function displayPassword(pwd) {
  const el = document.getElementById('pwdDisplay');
  const bar = document.getElementById('strengthBar');
  const labelEl = document.getElementById('strengthLabel');
  const entropyEl = document.getElementById('entropyInfo');

  el.textContent = pwd || '—';

  const s = calculateStrength(pwd);
  bar.style.width = ((s.score + 1) / 5 * 100) + '%';
  bar.style.background = s.color;
  labelEl.textContent = s.label;
  labelEl.style.color = s.color;
  entropyEl.textContent = s.entropy > 0 ? `${s.entropy} bits · temps estimé : ${s.crackTime}` : '';
}

function copyPassword(pwd) {
  if (!pwd) return;
  navigator.clipboard.writeText(pwd).then(() => {
    showToast('Mot de passe copié', 'success');
  }).catch(() => {
    const t = document.createElement('textarea');
    t.value = pwd;
    t.style.position = 'fixed';
    t.style.opacity = '0';
    document.body.appendChild(t);
    t.select();
    document.execCommand('copy');
    document.body.removeChild(t);
    showToast('Mot de passe copié', 'success');
  });
}

function getOptions() {
  return {
    length: parseInt(document.getElementById('pwdLength').value, 10),
    uppercase: document.getElementById('chkUpper').checked,
    lowercase: document.getElementById('chkLower').checked,
    digits: document.getElementById('chkDigits').checked,
    symbols: document.getElementById('chkSymbols').checked,
    excludeAmbiguous: document.getElementById('chkAmbiguous').checked
  };
}

function generateAndDisplay() {
  const opts = getOptions();
  if (!opts.uppercase && !opts.lowercase && !opts.digits && !opts.symbols) {
    showToast('Sélectionnez au moins un type de caractère', 'error');
    return;
  }
  currentPassword = generatePassword(opts);
  displayPassword(currentPassword);
}

function addToHistory(pwd) {
  if (!pwd) return;
  let history = JSON.parse(localStorage.getItem('pwd_history') || '[]');
  history = history.filter(h => h.password !== pwd);
  history.unshift({ password: pwd, time: Date.now() });
  if (history.length > 10) history = history.slice(0, 10);
  localStorage.setItem('pwd_history', JSON.stringify(history));
  loadHistory();
}

function loadHistory() {
  const list = document.getElementById('historyList');
  const emptyEl = document.getElementById('historyEmpty');
  const history = JSON.parse(localStorage.getItem('pwd_history') || '[]');

  list.innerHTML = '';
  if (history.length === 0) {
    list.innerHTML = `<div class="empty-state" id="historyEmpty"><i class="fas fa-history"></i><p>Aucun mot de passe dans l'historique</p></div>`;
    return;
  }

  history.forEach((item, index) => {
    const div = document.createElement('div');
    div.className = 'history-item';
    div.innerHTML = `
      <span class="history-item-pwd">${escapeHtml(item.password)}</span>
      <div class="history-item-actions">
        <button class="btn btn-ghost btn-sm" onclick="copyPassword('${escapeHtml(item.password).replace(/'/g, "\\'")}')"><i class="fas fa-copy"></i></button>
        <button class="btn btn-ghost btn-sm" onclick="removeFromHistory(${index})"><i class="fas fa-trash"></i></button>
      </div>
    `;
    list.appendChild(div);
  });
}

function removeFromHistory(index) {
  let history = JSON.parse(localStorage.getItem('pwd_history') || '[]');
  history.splice(index, 1);
  localStorage.setItem('pwd_history', JSON.stringify(history));
  loadHistory();
  showToast('Entrée supprimée', 'info');
}

function clearHistory() {
  if (!confirm('Effacer tout l\'historique ?')) return;
  localStorage.removeItem('pwd_history');
  loadHistory();
  showToast('Historique effacé', 'success');
}

(function () {
  document.addEventListener('DOMContentLoaded', async () => {
    await initAuth();
    if (!requireAuth()) return;
    initNav();

    const userMenuBtn = document.getElementById('userAvatarBtn');
    const userDropdown = document.getElementById('userDropdown');
    if (userMenuBtn && userDropdown) {
      userMenuBtn.addEventListener('click', () => userDropdown.classList.toggle('open'));
      document.addEventListener('click', (e) => {
        if (!userMenuBtn.contains(e.target) && !userDropdown.contains(e.target)) userDropdown.classList.remove('open');
      });
    }

    const slider = document.getElementById('pwdLength');
    const lengthVal = document.getElementById('lengthValue');
    slider.addEventListener('input', () => {
      lengthVal.textContent = slider.value;
    });

    document.getElementById('generateBtn').addEventListener('click', () => {
      generateAndDisplay();
      addToHistory(currentPassword);
    });

    generateAndDisplay();
    addToHistory(currentPassword);
    loadHistory();
  });
})();
