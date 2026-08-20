let _vaultKey = null;
let _vaultTimeout = null;
let _vaultCategories = [];
let _vaultCurrentEntry = null;
let _vaultViewPasswordVisible = false;
let _vaultIsNewSetup = false;

const VAULT_AUTO_LOCK_MS = 5 * 60 * 1000;
const PBKDF2_ITERATIONS = 100000;

function bufferToBase64(buffer) {
  const bytes = new Uint8Array(buffer);
  let binary = '';
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

function base64ToBuffer(base64) {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes.buffer;
}

function generateSalt() {
  return crypto.getRandomValues(new Uint8Array(16));
}

async function deriveKey(masterPassword, salt) {
  const encoder = new TextEncoder();
  const passwordBuffer = encoder.encode(masterPassword);
  const keyMaterial = await crypto.subtle.importKey(
    'raw', passwordBuffer, 'PBKDF2', false, ['deriveKey']
  );
  return crypto.subtle.deriveKey(
    { name: 'PBKDF2', salt, iterations: PBKDF2_ITERATIONS, hash: 'SHA-256' },
    keyMaterial,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt']
  );
}

async function encrypt(data, key) {
  const encoder = new TextEncoder();
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ciphertext = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv },
    key,
    encoder.encode(data)
  );
  return {
    ciphertext: bufferToBase64(ciphertext),
    iv: bufferToBase64(iv)
  };
}

async function decrypt(encryptedData, iv, key) {
  const decoder = new TextDecoder();
  const ciphertextBuffer = base64ToBuffer(encryptedData);
  const ivBuffer = base64ToBuffer(iv);
  const decrypted = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv: new Uint8Array(ivBuffer) },
    key,
    ciphertextBuffer
  );
  return decoder.decode(decrypted);
}

function isVaultLocked() {
  return _vaultKey === null;
}

function showLockScreen() {
  const salt = localStorage.getItem('vault_salt');
  if (!salt) {
    document.getElementById('lockTitle').textContent = 'Créer un mot de passe maître';
    document.getElementById('lockSubtitle').textContent = 'Définissez un mot de passe maître pour sécuriser votre coffre-fort';
    document.getElementById('confirmPasswordGroup').style.display = '';
    document.getElementById('lockBtnText').textContent = 'Créer et déverrouiller';
    document.getElementById('lockBtn').querySelector('i').className = 'fas fa-lock';
    _vaultIsNewSetup = true;
  } else {
    document.getElementById('lockTitle').textContent = 'Déverrouiller le coffre-fort';
    document.getElementById('lockSubtitle').textContent = 'Entrez le mot de passe maître pour accéder à vos données';
    document.getElementById('confirmPasswordGroup').style.display = 'none';
    document.getElementById('lockBtnText').textContent = 'Déverrouiller';
    document.getElementById('lockBtn').querySelector('i').className = 'fas fa-lock';
    _vaultIsNewSetup = false;
  }
  document.getElementById('lockError').style.display = 'none';
  document.getElementById('lockForm').reset();
  document.getElementById('lockScreen').style.display = '';
  document.getElementById('vaultMain').style.display = 'none';
}

function showVaultMain() {
  document.getElementById('lockScreen').style.display = 'none';
  document.getElementById('vaultMain').style.display = '';
}

async function initVault() {
  showLockScreen();
  await loadVaultCategories();
  setupVaultActivityListeners();
}

async function handleLockSubmit(e) {
  e.preventDefault();
  const password = document.getElementById('masterPasswordInput').value;
  const errorEl = document.getElementById('lockError');
  errorEl.style.display = 'none';

  if (!password) {
    errorEl.textContent = 'Veuillez entrer un mot de passe';
    errorEl.style.display = '';
    return;
  }

  if (_vaultIsNewSetup) {
    const confirm = document.getElementById('confirmPasswordInput').value;
    if (password !== confirm) {
      errorEl.textContent = 'Les mots de passe ne correspondent pas';
      errorEl.style.display = '';
      return;
    }
    if (password.length < 6) {
      errorEl.textContent = 'Le mot de passe doit contenir au moins 6 caractères';
      errorEl.style.display = '';
      return;
    }
    await setMasterPassword(password);
  } else {
    await unlockVault(password);
  }
}

async function setMasterPassword(password) {
  const errorEl = document.getElementById('lockError');
  try {
    const salt = generateSalt();
    const saltBase64 = bufferToBase64(salt);
    localStorage.setItem('vault_salt', saltBase64);
    _vaultKey = await deriveKey(password, salt);
    showVaultMain();
    resetAutoLock();
    await loadEntries();
    showToast('Coffre-fort créé et déverrouillé', 'success');
  } catch (e) {
    console.error('setMasterPassword error:', e);
    errorEl.textContent = 'Erreur lors de la création du mot de passe maître';
    errorEl.style.display = '';
  }
}

async function unlockVault(masterPassword) {
  const errorEl = document.getElementById('lockError');
  try {
    const saltBase64 = localStorage.getItem('vault_salt');
    const salt = new Uint8Array(base64ToBuffer(saltBase64));
    const key = await deriveKey(masterPassword, salt);

    const testQuery = await sb.from('vault_entries').select('id').limit(1);
    if (testQuery.error) {
      throw new Error('query_failed');
    }

    _vaultKey = key;
    showVaultMain();
    resetAutoLock();
    await loadEntries();
    showToast('Coffre-fort déverrouillé', 'success');
  } catch (e) {
    console.error('unlockVault error:', e);
    _vaultKey = null;
    if (e.message === 'query_failed') {
      errorEl.textContent = 'Erreur de connexion à la base de données';
    } else {
      errorEl.textContent = 'Mot de passe maître incorrect';
    }
    errorEl.style.display = '';
  }
}

function lockVault() {
  _vaultKey = null;
  _vaultCurrentEntry = null;
  if (_vaultTimeout) {
    clearTimeout(_vaultTimeout);
    _vaultTimeout = null;
  }
  showLockScreen();
  showToast('Coffre-fort verrouillé', 'info');
}

function resetAutoLock() {
  if (_vaultTimeout) clearTimeout(_vaultTimeout);
  _vaultTimeout = setTimeout(() => {
    if (!isVaultLocked()) {
      lockVault();
      showToast('Coffre-fort verrouillé automatiquement', 'info');
    }
  }, VAULT_AUTO_LOCK_MS);
}

function setupVaultActivityListeners() {
  ['mousemove', 'keydown', 'click', 'scroll', 'touchstart'].forEach(event => {
    document.addEventListener(event, () => {
      if (!isVaultLocked()) {
        resetAutoLock();
      }
    }, { passive: true });
  });
}

async function loadVaultCategories() {
  if (!sb) return;
  try {
    const { data, error } = await sb.from('vault_categories').select('*').order('name');
    if (error) throw error;
    _vaultCategories = data || [];
    renderCategoryTabs();
    populateCategorySelects();
  } catch (e) {
    console.error('loadVaultCategories error:', e);
    _vaultCategories = [
      { id: 'servers', name: 'Serveurs', icon: 'fa-server' },
      { id: 'network', name: 'Réseau', icon: 'fa-network-wired' },
      { id: 'cloud', name: 'Cloud', icon: 'fa-cloud' },
      { id: 'wifi', name: 'WiFi', icon: 'fa-wifi' },
      { id: 'apps', name: 'Applications', icon: 'fa-laptop-code' },
      { id: 'other', name: 'Autre', icon: 'fa-ellipsis-h' }
    ];
    renderCategoryTabs();
    populateCategorySelects();
  }
}

function renderCategoryTabs() {
  const container = document.getElementById('categoryTabs');
  container.innerHTML = `<button class="category-tab active" data-category="" onclick="filterByCategory('')"><i class="fas fa-th"></i> Toutes</button>`;
  _vaultCategories.forEach(cat => {
    container.innerHTML += `<button class="category-tab" data-category="${cat.id}" onclick="filterByCategory('${escapeHtml(cat.id)}')"><i class="fas ${cat.icon || 'fa-folder'}"></i> ${escapeHtml(cat.name)}</button>`;
  });
}

function populateCategorySelects() {
  const filterSelect = document.getElementById('vaultCategoryFilter');
  const entrySelect = document.getElementById('entryCategory');
  const options = _vaultCategories.map(c => `<option value="${c.id}">${escapeHtml(c.name)}</option>`).join('');
  if (filterSelect) filterSelect.innerHTML = '<option value="">Toutes les catégories</option>' + options;
  if (entrySelect) entrySelect.innerHTML = '<option value="">Aucune</option>' + options;
}

let _vaultCurrentCategory = '';
let _vaultSearchQuery = '';

function filterByCategory(categoryId) {
  _vaultCurrentCategory = categoryId;
  document.querySelectorAll('.category-tab').forEach(tab => {
    tab.classList.toggle('active', tab.dataset.category === categoryId);
  });
  loadEntries();
}

async function loadEntries() {
  if (!sb || isVaultLocked()) return;
  try {
    let query = sb.from('vault_entries').select('id, category_id, encrypted_data, iv, created_by, created_at, updated_at');
    if (_vaultCurrentCategory) query = query.eq('category_id', _vaultCurrentCategory);
    query = query.order('created_at', { ascending: false });
    const { data, error } = await query;
    if (error) throw error;

    const entries = data || [];
    const decryptedEntries = [];
    for (const entry of entries) {
      try {
        const raw = await decrypt(entry.encrypted_data, entry.iv, _vaultKey);
        let fields;
        try {
          fields = JSON.parse(raw);
        } catch (e) {
          fields = { title: raw, username: '', password: '', url: '', notes: '' };
        }
        const title = fields.title || '';
        const searchMatch = !_vaultSearchQuery || title.toLowerCase().includes(_vaultSearchQuery);
        if (searchMatch) {
          decryptedEntries.push({ ...entry, fields });
        }
      } catch (e) {
        decryptedEntries.push({ ...entry, fields: { title: '⚠ Déchiffrement impossible', username: '', password: '', url: '', notes: '' }, decryptError: true });
      }
    }

    renderEntries(decryptedEntries);
    document.getElementById('entryCount').textContent = `${decryptedEntries.length} entrée(s)`;
  } catch (e) {
    console.error('loadEntries error:', e);
    showToast('Erreur lors du chargement des entrées', 'error');
  }
}

function renderEntries(entries) {
  const grid = document.getElementById('entriesGrid');
  if (!entries.length) {
    grid.innerHTML = `<div class="empty-state"><i class="fas fa-shield-alt"></i><p>Aucune entrée trouvée</p></div>`;
    return;
  }
  grid.innerHTML = entries.map(entry => {
    const cat = _vaultCategories.find(c => c.id === entry.category_id);
    const catName = cat ? escapeHtml(cat.name) : '';
    const catIcon = cat ? cat.icon : 'fa-folder';
    return `
      <div class="entry-card" onclick="viewEntry('${entry.id}')">
        <div class="entry-card-header">
          <div class="entry-card-title">${escapeHtml(entry.fields.title)}</div>
          <div class="entry-card-icon"><i class="fas ${catIcon}"></i></div>
        </div>
        ${entry.fields.username ? `<div class="entry-card-username"><i class="fas fa-user"></i> ${escapeHtml(entry.fields.username)}</div>` : ''}
        <div class="entry-card-footer">
          <span class="entry-card-category">${catName}</span>
          <span class="entry-card-date">${formatDate(entry.created_at)}</span>
        </div>
      </div>
    `;
  }).join('');
}

async function viewEntry(id) {
  if (isVaultLocked()) return;
  try {
    const { data, error } = await sb.from('vault_entries').select('*').eq('id', id).single();
    if (error) throw error;

    const raw = await decrypt(data.encrypted_data, data.iv, _vaultKey);
    let fields;
    try {
      fields = JSON.parse(raw);
    } catch (e) {
      fields = { title: raw, username: '', password: '', url: '', notes: '' };
    }

    _vaultCurrentEntry = { ...data, fields };
    _vaultViewPasswordVisible = false;

    const cat = _vaultCategories.find(c => c.id === data.category_id);
    const catName = cat ? escapeHtml(cat.name) : '—';

    document.getElementById('viewEntryTitle').textContent = fields.title || '';
    document.getElementById('viewTitle').textContent = fields.title || '—';
    document.getElementById('viewUsername').textContent = fields.username || '—';
    document.getElementById('viewPassword').textContent = '••••••••';
    document.getElementById('viewPassword').className = 'view-field password-masked';
    document.getElementById('viewUrl').textContent = fields.url || '—';
    document.getElementById('viewUrlCopy').style.display = fields.url ? '' : 'none';
    document.getElementById('viewCategory').textContent = catName;
    document.getElementById('viewNotes').textContent = fields.notes || '—';
    document.getElementById('viewMetaInfo').textContent = `Créé le ${formatDate(data.created_at)} · Mis à jour le ${formatDate(data.updated_at)}`;

    document.getElementById('viewPasswordToggleIcon').className = 'fas fa-eye';
    document.getElementById('viewEntryModal').classList.add('open');
  } catch (e) {
    console.error('viewEntry error:', e);
    showToast('Erreur lors du chargement de l\'entrée', 'error');
  }
}

function closeViewEntryModal() {
  document.getElementById('viewEntryModal').classList.remove('open');
  _vaultCurrentEntry = null;
  _vaultViewPasswordVisible = false;
}

function toggleViewPassword() {
  if (!_vaultCurrentEntry) return;
  _vaultViewPasswordVisible = !_vaultViewPasswordVisible;
  const el = document.getElementById('viewPassword');
  const icon = document.getElementById('viewPasswordToggleIcon');
  if (_vaultViewPasswordVisible) {
    el.textContent = _vaultCurrentEntry.fields.password || '—';
    el.className = 'view-field';
    icon.className = 'fas fa-eye-slash';
  } else {
    el.textContent = '••••••••';
    el.className = 'view-field password-masked';
    icon.className = 'fas fa-eye';
  }
}

function copyField(field) {
  if (!_vaultCurrentEntry) return;
  const text = _vaultCurrentEntry.fields[field];
  if (!text) {
    showToast('Aucune donnée à copier', 'error');
    return;
  }
  copyToClipboard(text);
}

async function copyToClipboard(text) {
  try {
    await navigator.clipboard.writeText(text);
    showToast('Copié dans le presse-papier', 'success');
  } catch (e) {
    const textarea = document.createElement('textarea');
    textarea.value = text;
    textarea.style.position = 'fixed';
    textarea.style.opacity = '0';
    document.body.appendChild(textarea);
    textarea.select();
    document.execCommand('copy');
    document.body.removeChild(textarea);
    showToast('Copié dans le presse-papier', 'success');
  }
}

function openEntryModal(entryId) {
  document.getElementById('entryForm').reset();
  document.getElementById('entryPasswordToggleIcon').className = 'fas fa-eye';
  document.getElementById('entryPassword').type = 'password';

  if (entryId && _vaultCurrentEntry && _vaultCurrentEntry.id === entryId) {
    document.getElementById('entryModalTitle').textContent = 'Modifier l\'entrée';
    document.getElementById('entryId').value = _vaultCurrentEntry.id;
    document.getElementById('entryTitle').value = _vaultCurrentEntry.fields.title || '';
    document.getElementById('entryCategory').value = _vaultCurrentEntry.category_id || '';
    document.getElementById('entryUsername').value = _vaultCurrentEntry.fields.username || '';
    document.getElementById('entryPassword').value = _vaultCurrentEntry.fields.password || '';
    document.getElementById('entryUrl').value = _vaultCurrentEntry.fields.url || '';
    document.getElementById('entryNotes').value = _vaultCurrentEntry.fields.notes || '';
  } else {
    document.getElementById('entryModalTitle').textContent = 'Nouvelle entrée';
    document.getElementById('entryId').value = '';
    if (_vaultCurrentCategory) {
      document.getElementById('entryCategory').value = _vaultCurrentCategory;
    }
  }

  document.getElementById('entryModal').classList.add('open');
}

function closeEntryModal() {
  document.getElementById('entryModal').classList.remove('open');
}

function openEditFromView() {
  if (!_vaultCurrentEntry) return;
  const entryId = _vaultCurrentEntry.id;
  closeViewEntryModal();
  setTimeout(() => openEntryModal(entryId), 100);
}

async function submitEntry(e) {
  e.preventDefault();
  if (!sb || isVaultLocked()) return;

  const id = document.getElementById('entryId').value;
  const title = document.getElementById('entryTitle').value.trim();
  const category_id = document.getElementById('entryCategory').value || null;
  const username = document.getElementById('entryUsername').value.trim();
  const password = document.getElementById('entryPassword').value;
  const url = document.getElementById('entryUrl').value.trim();
  const notes = document.getElementById('entryNotes').value.trim();

  if (!title) {
    showToast('Le titre est requis', 'error');
    return;
  }

  try {
    const payload = { title, username, password, url, notes };
    const enc = await encrypt(JSON.stringify(payload), _vaultKey);

    const now = new Date().toISOString();
    const employeeId = currentProfile ? currentProfile.id : null;

    const dbPayload = {
      category_id,
      encrypted_data: enc.ciphertext,
      iv: enc.iv,
      updated_at: now
    };

    if (id) {
      const { error } = await sb.from('vault_entries').update(dbPayload).eq('id', id);
      if (error) throw error;
      showToast('Entrée mise à jour', 'success');
    } else {
      dbPayload.created_by = employeeId;
      dbPayload.created_at = now;
      const { error } = await sb.from('vault_entries').insert(dbPayload);
      if (error) throw error;
      showToast('Entrée créée', 'success');
    }

    closeEntryModal();
    await loadEntries();
  } catch (e) {
    console.error('submitEntry error:', e);
    showToast('Erreur lors de l\'enregistrement', 'error');
  }
}

async function deleteCurrentEntry() {
  if (!_vaultCurrentEntry) return;
  if (!confirm('Êtes-vous sûr de vouloir supprimer cette entrée ? Cette action est irréversible.')) return;
  try {
    const { error } = await sb.from('vault_entries').delete().eq('id', _vaultCurrentEntry.id);
    if (error) throw error;
    closeViewEntryModal();
    showToast('Entrée supprimée', 'success');
    await loadEntries();
  } catch (e) {
    console.error('deleteEntry error:', e);
    showToast('Erreur lors de la suppression', 'error');
  }
}

function toggleMasterPassword() {
  const input = document.getElementById('masterPasswordInput');
  const icon = document.getElementById('masterPasswordToggleIcon');
  if (input.type === 'password') {
    input.type = 'text';
    icon.className = 'fas fa-eye-slash';
  } else {
    input.type = 'password';
    icon.className = 'fas fa-eye';
  }
}

function toggleConfirmPassword() {
  const input = document.getElementById('confirmPasswordInput');
  const icon = document.getElementById('confirmPasswordToggleIcon');
  if (input.type === 'password') {
    input.type = 'text';
    icon.className = 'fas fa-eye-slash';
  } else {
    input.type = 'password';
    icon.className = 'fas fa-eye';
  }
}

function toggleEntryPassword() {
  const input = document.getElementById('entryPassword');
  const icon = document.getElementById('entryPasswordToggleIcon');
  if (input.type === 'password') {
    input.type = 'text';
    icon.className = 'fas fa-eye-slash';
  } else {
    input.type = 'password';
    icon.className = 'fas fa-eye';
  }
}

function generatePasswordInline(length) {
  length = length || 20;
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789!@#$%^&*()-_=+[]{}|;:,.<>?';
  const array = new Uint32Array(length);
  crypto.getRandomValues(array);
  let password = '';
  for (let i = 0; i < length; i++) {
    password += chars[array[i] % chars.length];
  }
  document.getElementById('entryPassword').value = password;
  document.getElementById('entryPassword').type = 'text';
  document.getElementById('entryPasswordToggleIcon').className = 'fas fa-eye-slash';
  showToast('Mot de passe généré', 'success');
}

(function () {
  let debounceTimer;

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

    const searchInput = document.getElementById('vaultSearch');
    if (searchInput) {
      searchInput.addEventListener('input', () => {
        clearTimeout(debounceTimer);
        debounceTimer = setTimeout(() => {
          _vaultSearchQuery = searchInput.value.trim().toLowerCase();
          loadEntries();
        }, 300);
      });
    }

    const categoryFilter = document.getElementById('vaultCategoryFilter');
    if (categoryFilter) {
      categoryFilter.addEventListener('change', () => {
        filterByCategory(categoryFilter.value);
      });
    }

    await initVault();
  });
})();
