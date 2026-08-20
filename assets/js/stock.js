let stockCategories = [];
let stockLocations = [];

(async () => {
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

  await initStock();
})();

async function initStock() {
  await Promise.all([loadCategories(), loadLocations()]);
  setupFilterListeners();
  await loadItems();
  await loadStats();
}

async function loadCategories() {
  if (!sb) return;
  try {
    const { data, error } = await sb.from('stock_categories').select('*').order('name');
    if (error) throw error;
    stockCategories = data || [];
    populateCategorySelects();
  } catch (e) {
    console.error('loadCategories error:', e);
  }
}

async function loadLocations() {
  if (!sb) return;
  try {
    const { data, error } = await sb.from('stock_locations').select('*').order('name');
    if (error) throw error;
    stockLocations = data || [];
    populateLocationSelects();
  } catch (e) {
    console.error('loadLocations error:', e);
  }
}

function populateCategorySelects() {
  const options = stockCategories.map(c => `<option value="${c.id}">${escapeHtml(c.name)}</option>`).join('');
  document.getElementById('filterCategory').innerHTML = '<option value="">Toutes les catégories</option>' + options;
  document.getElementById('itemCategory').innerHTML = '<option value="">—</option>' + options;
}

function populateLocationSelects() {
  const options = stockLocations.map(l => `<option value="${l.id}">${escapeHtml(l.name)}${l.shelf ? ' — ' + escapeHtml(l.shelf) : ''}</option>`).join('');
  document.getElementById('filterLocation').innerHTML = '<option value="">Tous les emplacements</option>' + options;
  document.getElementById('itemLocation').innerHTML = '<option value="">—</option>' + options;
  document.getElementById('movementFrom').innerHTML = '<option value="">—</option>' + options;
  document.getElementById('movementTo').innerHTML = '<option value="">—</option>' + options;
}

function populateItemSelect(items) {
  document.getElementById('movementItem').innerHTML = items.map(i => `<option value="${i.id}">${escapeHtml(i.name)} (${i.reference || '—'})</option>`).join('');
  document.getElementById('auditItem').innerHTML = items.map(i => `<option value="${i.id}">${escapeHtml(i.name)} (${i.reference || '—'})</option>`).join('');
}

function setupFilterListeners() {
  let debounceTimer;
  document.getElementById('filterSearch').addEventListener('input', () => {
    clearTimeout(debounceTimer);
    debounceTimer = setTimeout(loadItems, 300);
  });
  document.getElementById('filterCategory').addEventListener('change', loadItems);
  document.getElementById('filterLocation').addEventListener('change', loadItems);
  document.getElementById('filterZone').addEventListener('change', loadItems);
}

async function loadItems() {
  if (!sb) return;
  try {
    const search = document.getElementById('filterSearch').value.trim();
    const categoryId = document.getElementById('filterCategory').value;
    const locationId = document.getElementById('filterLocation').value;
    const zone = document.getElementById('filterZone').value;

    let query = sb.from('stock_items').select(`
      *,
      category:stock_categories(id, name, color),
      location:stock_locations(id, name, shelf, position, zone_5s)
    `);

    if (search) {
      query = query.or(`name.ilike.%${search}%,reference.ilike.%${search}%`);
    }
    if (categoryId) {
      query = query.eq('category_id', categoryId);
    }
    if (locationId) {
      query = query.eq('location_id', locationId);
    }
    if (zone) {
      query = query.eq('location.zone_5s', zone);
    }

    query = query.order('name');

    const { data, error } = await query;
    if (error) throw error;

    populateItemSelect(data || []);
    renderItemsTable(data || []);
  } catch (e) {
    console.error('loadItems error:', e);
    showToast('Erreur lors du chargement des articles', 'error');
  }
}

async function loadStats() {
  if (!sb) return;
  try {
    const { data: items, error: itemsError } = await sb.from('stock_items').select('quantity, min_quantity, unit_cost');
    if (itemsError) throw itemsError;

    const allItems = items || [];
    const totalItems = allItems.length;
    const lowStock = allItems.filter(i => i.quantity <= i.min_quantity).length;
    const totalValue = allItems.reduce((sum, i) => sum + (i.quantity * (i.unit_cost || 0)), 0);

    const { count: auditCount, error: auditError } = await sb.from('stock_audits').select('*', { count: 'exact', head: true }).eq('status_5s', 'pending');
    if (auditError) throw auditError;

    document.getElementById('sTotalItems').textContent = totalItems;
    document.getElementById('sLowStock').textContent = lowStock;
    document.getElementById('sInAudit').textContent = auditCount || 0;
    document.getElementById('sTotalValue').textContent = totalValue.toLocaleString('fr-FR', { style: 'currency', currency: 'EUR' });
  } catch (e) {
    console.error('loadStats error:', e);
  }
}

function renderItemsTable(items) {
  const tbody = document.getElementById('itemsTableBody');
  if (!items.length) {
    tbody.innerHTML = '<tr><td colspan="8" class="empty-state"><i class="fas fa-box"></i><p>Aucun article trouvé</p></td></tr>';
    return;
  }
  tbody.innerHTML = items.map(item => {
    const isLow = item.quantity <= item.min_quantity;
    const cat = item.category;
    const loc = item.location;
    const zone = loc?.zone_5s || '';
    return `
      <tr class="${isLow ? 'stock-alert' : ''}">
        <td><strong style="color:var(--text)">${escapeHtml(item.name)}</strong></td>
        <td>${escapeHtml(item.reference || '—')}</td>
        <td>${cat ? `<span class="category-badge" style="background:${cat.color || 'var(--badge-bg)'}20;color:${cat.color || 'var(--primary)'}">${escapeHtml(cat.name)}</span>` : '—'}</td>
        <td><span class="${isLow ? 'quantity-low' : ''}">${item.quantity}${isLow ? ' <i class="fas fa-exclamation-triangle" style="font-size:0.7rem"></i>' : ''}</span></td>
        <td>${loc ? escapeHtml(loc.name) : '—'}</td>
        <td>${zone ? `<span class="zone-badge zone-${zone}">${zone}</span>` : '—'}</td>
        <td>${item.unit_cost ? Number(item.unit_cost).toLocaleString('fr-FR', { style: 'currency', currency: 'EUR' }) : '—'}</td>
        <td>
          <div class="action-btns">
            <button class="btn btn-ghost btn-sm" onclick="openEditItem('${item.id}')" title="Modifier"><i class="fas fa-edit"></i></button>
            <button class="btn btn-ghost btn-sm" onclick="openRecordMovement('${item.id}')" title="Mouvement"><i class="fas fa-exchange-alt"></i></button>
            <button class="btn btn-ghost btn-sm" onclick="openStartAudit('${item.id}')" title="Audit 5S"><i class="fas fa-clipboard-check"></i></button>
          </div>
        </td>
      </tr>`;
  }).join('');
}

async function loadMovements() {
  if (!sb) return;
  try {
    const { data, error } = await sb.from('stock_movements').select(`
      *,
      item:stock_items(id, name, reference),
      from_loc:stock_locations!stock_movements_from_location_fkey(id, name),
      to_loc:stock_locations!stock_movements_to_location_fkey(id, name),
      performer:employees(id, full_name)
    `).order('created_at', { ascending: false }).limit(100);
    if (error) throw error;
    renderMovementsTable(data || []);
  } catch (e) {
    console.error('loadMovements error:', e);
    showToast('Erreur lors du chargement des mouvements', 'error');
  }
}

function renderMovementsTable(movements) {
  const tbody = document.getElementById('movementsTableBody');
  if (!movements.length) {
    tbody.innerHTML = '<tr><td colspan="8" class="empty-state"><i class="fas fa-exchange-alt"></i><p>Aucun mouvement enregistré</p></td></tr>';
    return;
  }
  const typeLabels = { in: 'Entrée', out: 'Sortie', transfer: 'Transfert', adjust: 'Ajustement' };
  tbody.innerHTML = movements.map(m => `
    <tr>
      <td><strong style="color:var(--text)">${escapeHtml(m.item?.name || '—')}</strong></td>
      <td><span class="badge movement-${m.type}">${typeLabels[m.type] || m.type}</span></td>
      <td>${m.quantity}</td>
      <td>${m.from_loc ? escapeHtml(m.from_loc.name) : '—'}</td>
      <td>${m.to_loc ? escapeHtml(m.to_loc.name) : '—'}</td>
      <td>${escapeHtml(m.reason || '—')}</td>
      <td>${formatDate(m.created_at)}</td>
      <td>${escapeHtml(m.performer?.full_name || '—')}</td>
    </tr>
  `).join('');
}

async function loadAudits() {
  if (!sb) return;
  try {
    const { data, error } = await sb.from('stock_audits').select(`
      *,
      item:stock_items(id, name, reference),
      auditor:employees(id, full_name)
    `).order('audit_date', { ascending: false }).limit(100);
    if (error) throw error;
    renderAuditsTable(data || []);
  } catch (e) {
    console.error('loadAudits error:', e);
    showToast('Erreur lors du chargement des audits', 'error');
  }
}

function renderAuditsTable(audits) {
  const tbody = document.getElementById('auditsTableBody');
  if (!audits.length) {
    tbody.innerHTML = '<tr><td colspan="6" class="empty-state"><i class="fas fa-clipboard-check"></i><p>Aucun audit enregistré</p></td></tr>';
    return;
  }
  const statusLabels = { pending: 'En attente', pass: 'Conforme', fail: 'Non conforme' };
  tbody.innerHTML = audits.map(a => `
    <tr>
      <td><strong style="color:var(--text)">${escapeHtml(a.item?.name || '—')}</strong></td>
      <td>${formatDate(a.audit_date)}</td>
      <td><span class="badge audit-${a.status_5s}">${statusLabels[a.status_5s] || a.status_5s}</span></td>
      <td>${escapeHtml(a.notes || '—')}</td>
      <td>${escapeHtml(a.auditor?.full_name || '—')}</td>
      <td>
        ${a.status_5s === 'pending' ? `<button class="btn btn-ghost btn-sm" onclick="openAuditResult('${a.id}', '${a.item_id}')" title="Enregistrer le résultat"><i class="fas fa-pen"></i></button>` : ''}
      </td>
    </tr>
  `).join('');
}

function openCreateItem() {
  document.getElementById('itemModalTitle').textContent = 'Nouvel article';
  document.getElementById('itemForm').reset();
  document.getElementById('itemId').value = '';
  document.getElementById('itemModal').classList.add('open');
}

async function openEditItem(id) {
  if (!sb) return;
  try {
    const { data, error } = await sb.from('stock_items').select('*').eq('id', id).single();
    if (error) throw error;
    document.getElementById('itemModalTitle').textContent = 'Modifier l\'article';
    document.getElementById('itemId').value = data.id;
    document.getElementById('itemName').value = data.name;
    document.getElementById('itemReference').value = data.reference || '';
    document.getElementById('itemCategory').value = data.category_id || '';
    document.getElementById('itemLocation').value = data.location_id || '';
    document.getElementById('itemQuantity').value = data.quantity;
    document.getElementById('itemMinQuantity').value = data.min_quantity;
    document.getElementById('itemUnitCost').value = data.unit_cost || '';
    document.getElementById('itemModal').classList.add('open');
  } catch (e) {
    console.error('openEditItem error:', e);
    showToast('Erreur lors du chargement de l\'article', 'error');
  }
}

async function submitItem(e) {
  e.preventDefault();
  if (!sb) return;
  try {
    const id = document.getElementById('itemId').value;
    const payload = {
      name: document.getElementById('itemName').value.trim(),
      reference: document.getElementById('itemReference').value.trim() || null,
      category_id: document.getElementById('itemCategory').value || null,
      location_id: document.getElementById('itemLocation').value || null,
      quantity: parseInt(document.getElementById('itemQuantity').value) || 0,
      min_quantity: parseInt(document.getElementById('itemMinQuantity').value) || 0,
      unit_cost: parseFloat(document.getElementById('itemUnitCost').value) || 0
    };

    let result;
    if (id) {
      result = await sb.from('stock_items').update(payload).eq('id', id);
    } else {
      result = await sb.from('stock_items').insert(payload);
    }
    if (result.error) throw result.error;

    closeModal('itemModal');
    showToast(id ? 'Article mis à jour' : 'Article créé avec succès', 'success');
    await loadItems();
    await loadStats();
  } catch (e) {
    console.error('submitItem error:', e);
    showToast('Erreur lors de l\'enregistrement', 'error');
  }
}

function openRecordMovement(itemId) {
  document.getElementById('movementForm').reset();
  if (itemId) {
    document.getElementById('movementItem').value = itemId;
  }
  document.getElementById('movementModal').classList.add('open');
}

async function submitMovement(e) {
  e.preventDefault();
  if (!sb) return;
  try {
    const itemId = document.getElementById('movementItem').value;
    const type = document.getElementById('movementType').value;
    const quantity = parseInt(document.getElementById('movementQuantity').value);
    const fromLocation = document.getElementById('movementFrom').value || null;
    const toLocation = document.getElementById('movementTo').value || null;
    const reason = document.getElementById('movementReason').value.trim() || null;

    const { error: movError } = await sb.from('stock_movements').insert({
      item_id: itemId,
      type,
      quantity,
      from_location: fromLocation,
      to_location: toLocation,
      reason,
      performed_by: currentProfile?.id || null
    });
    if (movError) throw movError;

    const { data: item, error: fetchError } = await sb.from('stock_items').select('quantity, location_id').eq('id', itemId).single();
    if (fetchError) throw fetchError;

    let newQuantity = item.quantity;
    let newLocation = item.location_id;

    if (type === 'in') {
      newQuantity = item.quantity + quantity;
    } else if (type === 'out') {
      newQuantity = Math.max(0, item.quantity - quantity);
    } else if (type === 'adjust') {
      newQuantity = quantity;
    } else if (type === 'transfer') {
      newQuantity = item.quantity;
      newLocation = toLocation || item.location_id;
    }

    const updatePayload = { quantity: newQuantity };
    if (type === 'transfer') {
      updatePayload.location_id = newLocation;
    }

    const { error: updError } = await sb.from('stock_items').update(updatePayload).eq('id', itemId);
    if (updError) throw updError;

    closeModal('movementModal');
    showToast('Mouvement enregistré', 'success');
    await loadItems();
    await loadStats();
  } catch (e) {
    console.error('submitMovement error:', e);
    showToast('Erreur lors de l\'enregistrement du mouvement', 'error');
  }
}

function openStartAudit(itemId) {
  document.getElementById('auditForm').reset();
  document.getElementById('auditStatus').value = 'pending';
  if (itemId) {
    document.getElementById('auditItem').value = itemId;
  }
  document.getElementById('auditModal').classList.add('open');
}

function openAuditResult(auditId, itemId) {
  document.getElementById('auditForm').reset();
  document.getElementById('auditItem').value = itemId;
  document.getElementById('auditItem').disabled = true;
  document.getElementById('auditModal').classList.add('open');
  document.getElementById('auditForm').dataset.editId = auditId;
}

async function submitAudit(e) {
  e.preventDefault();
  if (!sb) return;
  try {
    const editId = e.target.dataset.editId;
    const itemId = document.getElementById('auditItem').value;
    const status_5s = document.getElementById('auditStatus').value;
    const notes = document.getElementById('auditNotes').value.trim() || null;

    if (editId) {
      const { error } = await sb.from('stock_audits').update({
        status_5s,
        notes
      }).eq('id', editId);
      if (error) throw error;
    } else {
      const { error } = await sb.from('stock_audits').insert({
        item_id: itemId,
        audit_date: new Date().toISOString().split('T')[0],
        status_5s,
        notes,
        auditor_id: currentProfile?.id || null
      });
      if (error) throw error;
    }

    delete e.target.dataset.editId;
    document.getElementById('auditItem').disabled = false;
    closeModal('auditModal');
    showToast('Audit enregistré', 'success');
    await loadAudits();
    await loadStats();
  } catch (e) {
    console.error('submitAudit error:', e);
    showToast('Erreur lors de l\'enregistrement de l\'audit', 'error');
  }
}

function switchTab(tabName) {
  document.querySelectorAll('.tab-btn').forEach(btn => btn.classList.remove('active'));
  document.querySelectorAll('.tab-panel').forEach(panel => panel.classList.remove('active'));

  const tabMap = { articles: 0, mouvements: 1, audits: 2 };
  const tabs = document.querySelectorAll('.tab-btn');
  if (tabs[tabMap[tabName]]) tabs[tabMap[tabName]].classList.add('active');
  document.getElementById('panel-' + tabName).classList.add('active');

  if (tabName === 'mouvements') {
    loadMovements();
  } else if (tabName === 'audits') {
    loadAudits();
  }
}

function closeModal(modalId) {
  document.getElementById(modalId).classList.remove('open');
  const form = document.getElementById(modalId).querySelector('form');
  if (form) {
    form.reset();
    delete form.dataset.editId;
  }
  const auditItem = document.getElementById('auditItem');
  if (auditItem) auditItem.disabled = false;
}
