let allEmployees = [];
let allEquipment = [];
let allConsumables = [];
let equipmentDebounce = null;
let consumableDebounce = null;

document.addEventListener('DOMContentLoaded', async () => {
  try {
    await initAuth();
    if (!requireAuth()) return;
    initNav();
    initUserMenu();
    await initEquipment();
  } catch (err) {
    console.error('Init error:', err);
    showToast('Erreur d\'initialisation', 'error');
  }
});

function initUserMenu() {
  const btn = document.getElementById('userAvatarBtn');
  const dd = document.getElementById('userDropdown');
  if (btn && dd) {
    btn.addEventListener('click', () => dd.classList.toggle('open'));
    document.addEventListener('click', (e) => {
      if (!btn.contains(e.target) && !dd.contains(e.target)) dd.classList.remove('open');
    });
  }
}

async function initEquipment() {
  await loadEmployees();
  await Promise.all([loadEquipment(), loadConsumables()]);
  bindFilterEvents();
  bindModalEvents();
}

async function loadEmployees() {
  if (!sb) return;
  try {
    const { data, error } = await sb.from('employees').select('*').eq('status', 'active').order('full_name');
    if (error) throw error;
    allEmployees = data || [];
    const opts = allEmployees.map(e => `<option value="${e.id}">${escapeHtml(e.full_name)} — ${escapeHtml(e.department || '')}</option>`).join('');
    const assignSel = document.getElementById('assignEmployee');
    const useSel = document.getElementById('useEmployee');
    if (assignSel) assignSel.innerHTML = '<option value="">Sélectionner un employé</option>' + opts;
    if (useSel) useSel.innerHTML = '<option value="">Sélectionner un employé</option>' + opts;
  } catch (e) {
    console.error('loadEmployees:', e);
    showToast('Erreur lors du chargement des employés', 'error');
  }
}

async function loadEquipment(filters = {}) {
  if (!sb) return;
  try {
    const { data: equipment, error: eqError } = await sb.from('equipment').select('*').order('name');
    if (eqError) throw eqError;

    const { data: activeAttr, error: attrError } = await sb.from('attributions').select(`
      *,
      employee:employees!attributions_employee_id_fkey(id, full_name)
    `).eq('status', 'active');
    if (attrError) throw attrError;

    const attrMap = {};
    (activeAttr || []).forEach(a => {
      attrMap[a.equipment_id] = a;
    });

    let items = (equipment || []).map(eq => ({
      ...eq,
      current_assignment: attrMap[eq.id] || null
    }));

    if (filters.search) {
      const s = filters.search.toLowerCase();
      items = items.filter(eq =>
        (eq.name || '').toLowerCase().includes(s) ||
        (eq.serial_number || '').toLowerCase().includes(s) ||
        (eq.category || '').toLowerCase().includes(s)
      );
    }
    if (filters.status) {
      items = items.filter(eq => eq.status === filters.status);
    }

    allEquipment = items;
    renderEquipmentTable(items);
    updateStats(equipment || []);
  } catch (e) {
    console.error('loadEquipment:', e);
    showToast('Erreur lors du chargement des équipements', 'error');
  }
}

function renderEquipmentTable(items) {
  const tbody = document.getElementById('equipmentTableBody');
  const empty = document.getElementById('equipmentEmptyState');

  if (!items.length) {
    tbody.innerHTML = '';
    empty.style.display = 'block';
    return;
  }

  empty.style.display = 'none';

  const statusLabels = {
    available: 'Disponible',
    attributed: 'Attribué',
    returned: 'Retourné',
    maintenance: 'Maintenance'
  };

  tbody.innerHTML = items.map(eq => {
    const assignee = eq.current_assignment?.employee?.full_name || '—';
    const isOverdue = eq.current_assignment && eq.current_assignment.expected_return_date && new Date(eq.current_assignment.expected_return_date) < new Date();
    return `
      <tr class="${isOverdue ? 'overdue-row' : ''}">
        <td><strong style="color:var(--text)">${escapeHtml(eq.name)}</strong></td>
        <td>${escapeHtml(eq.serial_number || '—')}</td>
        <td>${escapeHtml(eq.category || '—')}</td>
        <td><span class="badge eq-${eq.status}">${statusLabels[eq.status] || eq.status}</span></td>
        <td>${escapeHtml(assignee)}</td>
        <td>
          <div class="action-btns">
            <button class="btn btn-ghost btn-sm" onclick="showEquipmentDetail('${eq.id}')" title="Historique"><i class="fas fa-history"></i></button>
            ${eq.status === 'available' ? `<button class="btn btn-ghost btn-sm" onclick="openAssignModal('${eq.id}')" title="Attribuer"><i class="fas fa-handshake"></i></button>` : ''}
            ${eq.status === 'attributed' && eq.current_assignment ? `<button class="btn btn-ghost btn-sm" onclick="openReturnModal('${eq.current_assignment.id}', '${escapeHtml(eq.name)}')" title="Retourner"><i class="fas fa-undo"></i></button>` : ''}
          </div>
        </td>
      </tr>`;
  }).join('');
}

function updateStats(equipment) {
  const overdueCount = allEquipment.filter(eq =>
    eq.current_assignment &&
    eq.current_assignment.expected_return_date &&
    new Date(eq.current_assignment.expected_return_date) < new Date()
  ).length;

  document.getElementById('sTotal').textContent = equipment.length;
  document.getElementById('sAttributed').textContent = equipment.filter(e => e.status === 'attributed').length;
  document.getElementById('sAvailable').textContent = equipment.filter(e => e.status === 'available').length;
  document.getElementById('sOverdue').textContent = overdueCount;
}

async function showEquipmentDetail(id) {
  if (!sb) return;
  try {
    const { data: eq, error: eqError } = await sb.from('equipment').select('*').eq('id', id).single();
    if (eqError) throw eqError;

    const { data: attributions, error: attrError } = await sb.from('attributions').select(`
      *,
      employee:employees!attributions_employee_id_fkey(full_name),
      assigner:employees!attributions_assigned_by_fkey(full_name)
    `).eq('equipment_id', id).order('assigned_date', { ascending: false });
    if (attrError) throw attrError;

    const statusLabels = {
      available: 'Disponible',
      attributed: 'Attribué',
      returned: 'Retourné',
      maintenance: 'Maintenance'
    };

    const attrStatusLabels = {
      active: 'Active',
      returned: 'Retournée',
      overdue: 'En retard'
    };

    let html = `
      <div class="detail-grid">
        <div class="detail-item">
          <label>Nom</label>
          <span>${escapeHtml(eq.name)}</span>
        </div>
        <div class="detail-item">
          <label>Numéro de série</label>
          <span>${escapeHtml(eq.serial_number || '—')}</span>
        </div>
        <div class="detail-item">
          <label>Catégorie</label>
          <span>${escapeHtml(eq.category || '—')}</span>
        </div>
        <div class="detail-item">
          <label>Statut</label>
          <span><span class="badge eq-${eq.status}">${statusLabels[eq.status] || eq.status}</span></span>
        </div>
      </div>`;

    if (attributions && attributions.length) {
      html += `
        <div class="detail-section">
          <h4>Historique d'attribution</h4>
          <ul class="attr-history-list">
            ${attributions.map(a => `
              <li class="attr-history-item">
                <div class="attr-history-dot">●</div>
                <div class="attr-history-content">
                  <div class="attr-action">
                    ${escapeHtml(a.employee?.full_name || '—')}
                    <span class="badge attr-${a.status}" style="margin-left:8px">${attrStatusLabels[a.status] || a.status}</span>
                  </div>
                  <div class="attr-details">
                    Assigné le ${formatDate(a.assigned_date)}${a.expected_return_date ? ' — Retour prévu le ' + formatDate(a.expected_return_date) : ''}${a.actual_return_date ? ' — Retour effectif le ' + formatDate(a.actual_return_date) : ''}
                  </div>
                  ${a.condition_notes ? `<div class="attr-details">${escapeHtml(a.condition_notes)}</div>` : ''}
                  <div class="attr-meta">
                    ${a.assigner ? 'Par ' + escapeHtml(a.assigner.full_name) : ''}
                  </div>
                </div>
              </li>
            `).join('')}
          </ul>
        </div>`;
    } else {
      html += `<div class="detail-section"><p style="color:var(--text-muted)">Aucune attribution enregistrée</p></div>`;
    }

    document.getElementById('detailModalTitle').textContent = eq.name;
    document.getElementById('detailModalBody').innerHTML = html;
    openModal('equipmentDetailModal');
  } catch (e) {
    console.error('showEquipmentDetail:', e);
    showToast('Erreur lors du chargement du détail', 'error');
  }
}

function openAssignModal(equipmentId) {
  document.getElementById('assignForm').reset();
  const eqSel = document.getElementById('assignEquipment');
  eqSel.innerHTML = allEquipment
    .filter(e => e.status === 'available')
    .map(e => `<option value="${e.id}">${escapeHtml(e.name)}${e.serial_number ? ' — ' + escapeHtml(e.serial_number) : ''}</option>`)
    .join('');

  if (equipmentId) {
    eqSel.value = equipmentId;
  }

  if (!eqSel.value && allEquipment.filter(e => e.status === 'available').length > 0) {
    eqSel.value = allEquipment.filter(e => e.status === 'available')[0].id;
  }

  openModal('assignModal');
}

async function submitAssign(e) {
  e.preventDefault();
  if (!sb) return;
  try {
    const equipmentId = document.getElementById('assignEquipment').value;
    const employeeId = document.getElementById('assignEmployee').value;
    const returnDate = document.getElementById('assignReturnDate').value || null;
    const notes = document.getElementById('assignNotes').value.trim() || '';

    if (!equipmentId || !employeeId) {
      showToast('Veuillez remplir tous les champs requis', 'error');
      return;
    }

    const { error: attrError } = await sb.from('attributions').insert({
      equipment_id: equipmentId,
      employee_id: employeeId,
      assigned_by: currentProfile?.id || null,
      assigned_date: new Date().toISOString().split('T')[0],
      expected_return_date: returnDate || null,
      condition_notes: notes,
      status: 'active'
    });
    if (attrError) throw attrError;

    const { error: eqError } = await sb.from('equipment').update({ status: 'attributed' }).eq('id', equipmentId);
    if (eqError) throw eqError;

    closeModal('assignModal');
    showToast('Équipement attribué avec succès', 'success');
    await loadEquipment(getEquipmentFilters());
  } catch (e) {
    console.error('submitAssign:', e);
    showToast('Erreur lors de l\'attribution', 'error');
  }
}

function openReturnModal(attributionId, equipmentName) {
  document.getElementById('returnForm').reset();
  document.getElementById('returnAttributionId').value = attributionId;
  document.getElementById('returnEquipmentInfo').textContent = 'Équipement : ' + equipmentName;
  openModal('returnModal');
}

async function submitReturn(e) {
  e.preventDefault();
  if (!sb) return;
  try {
    const attributionId = document.getElementById('returnAttributionId').value;
    const conditionNotes = document.getElementById('returnCondition').value.trim() || '';

    const { data: attr, error: fetchError } = await sb.from('attributions').select('equipment_id').eq('id', attributionId).single();
    if (fetchError) throw fetchError;

    const { error: updAttr } = await sb.from('attributions').update({
      actual_return_date: new Date().toISOString().split('T')[0],
      condition_notes: conditionNotes,
      status: 'returned'
    }).eq('id', attributionId);
    if (updAttr) throw updAttr;

    const { error: updEq } = await sb.from('equipment').update({ status: 'available' }).eq('id', attr.equipment_id);
    if (updEq) throw updEq;

    closeModal('returnModal');
    showToast('Retour enregistré avec succès', 'success');
    await loadEquipment(getEquipmentFilters());
  } catch (e) {
    console.error('submitReturn:', e);
    showToast('Erreur lors du retour', 'error');
  }
}

async function loadConsumables(filters = {}) {
  if (!sb) return;
  try {
    let query = sb.from('consumables').select('*').order('name');

    const { data, error } = await query;
    if (error) throw error;

    let items = data || [];

    if (filters.search) {
      const s = filters.search.toLowerCase();
      items = items.filter(c =>
        (c.name || '').toLowerCase().includes(s) ||
        (c.reference || '').toLowerCase().includes(s)
      );
    }

    allConsumables = items;
    renderConsumablesTable(items);
  } catch (e) {
    console.error('loadConsumables:', e);
    showToast('Erreur lors du chargement des consommables', 'error');
  }
}

function renderConsumablesTable(items) {
  const tbody = document.getElementById('consumablesTableBody');
  const empty = document.getElementById('consumablesEmptyState');

  if (!items.length) {
    tbody.innerHTML = '';
    empty.style.display = 'block';
    return;
  }

  empty.style.display = 'none';

  tbody.innerHTML = items.map(c => {
    const isLow = c.quantity <= c.min_quantity;
    return `
      <tr class="${isLow ? 'consumable-alert' : ''}">
        <td><strong style="color:var(--text)">${escapeHtml(c.name)}</strong></td>
        <td>${escapeHtml(c.reference || '—')}</td>
        <td><span class="${isLow ? 'quantity-low' : ''}">${c.quantity}${isLow ? ' <i class="fas fa-exclamation-triangle" style="font-size:0.7rem"></i>' : ''}</span></td>
        <td>${escapeHtml(c.unit || '—')}</td>
        <td>
          <div class="action-btns">
            <button class="btn btn-ghost btn-sm" onclick="openUseConsumable('${c.id}')" title="Utiliser"><i class="fas fa-minus-circle"></i></button>
            <button class="btn btn-ghost btn-sm" onclick="openEditConsumable('${c.id}')" title="Modifier"><i class="fas fa-edit"></i></button>
          </div>
        </td>
      </tr>`;
  }).join('');
}

function openUseConsumable(id) {
  const c = allConsumables.find(x => x.id === id);
  if (!c) return;
  document.getElementById('consUseForm').reset();
  document.getElementById('useConsumableId').value = id;
  document.getElementById('useConsumableInfo').textContent = c.name + (c.reference ? ' — ' + c.reference : '') + ' | Stock: ' + c.quantity + ' ' + (c.unit || '');
  document.getElementById('useQuantity').max = c.quantity;
  openModal('consumableUseModal');
}

async function submitConsumableUse(e) {
  e.preventDefault();
  if (!sb) return;
  try {
    const consumableId = document.getElementById('useConsumableId').value;
    const employeeId = document.getElementById('useEmployee').value;
    const quantity = parseInt(document.getElementById('useQuantity').value) || 1;
    const notes = document.getElementById('useNotes').value.trim() || '';

    if (!employeeId) {
      showToast('Veuillez sélectionner un employé', 'error');
      return;
    }

    const c = allConsumables.find(x => x.id === consumableId);
    if (c && quantity > c.quantity) {
      showToast('Quantité insuffisante en stock', 'error');
      return;
    }

    const { error: usageError } = await sb.from('consumable_usages').insert({
      consumable_id: consumableId,
      employee_id: employeeId,
      quantity: quantity,
      notes: notes
    });
    if (usageError) throw usageError;

    const newQty = Math.max(0, (c ? c.quantity : 0) - quantity);
    const { error: updError } = await sb.from('consumables').update({ quantity: newQty }).eq('id', consumableId);
    if (updError) throw updError;

    closeModal('consumableUseModal');
    showToast('Utilisation enregistrée', 'success');
    await loadConsumables(getConsumableFilters());
  } catch (e) {
    console.error('submitConsumableUse:', e);
    showToast('Erreur lors de l\'enregistrement', 'error');
  }
}

function openCreateConsumable() {
  document.getElementById('consFormTitle').textContent = 'Nouveau consommable';
  document.getElementById('consForm').reset();
  document.getElementById('consId').value = '';
  document.getElementById('consUnit').value = 'pcs';
  document.getElementById('consMinQuantity').value = '5';
  openModal('consumableFormModal');
}

async function openEditConsumable(id) {
  const c = allConsumables.find(x => x.id === id);
  if (!c) return;
  document.getElementById('consFormTitle').textContent = 'Modifier le consommable';
  document.getElementById('consId').value = c.id;
  document.getElementById('consName').value = c.name || '';
  document.getElementById('consReference').value = c.reference || '';
  document.getElementById('consQuantity').value = c.quantity || 0;
  document.getElementById('consMinQuantity').value = c.min_quantity || 5;
  document.getElementById('consUnit').value = c.unit || 'pcs';
  openModal('consumableFormModal');
}

async function submitConsumable(e) {
  e.preventDefault();
  if (!sb) return;
  try {
    const id = document.getElementById('consId').value;
    const payload = {
      name: document.getElementById('consName').value.trim(),
      reference: document.getElementById('consReference').value.trim() || null,
      quantity: parseInt(document.getElementById('consQuantity').value) || 0,
      min_quantity: parseInt(document.getElementById('consMinQuantity').value) || 5,
      unit: document.getElementById('consUnit').value.trim() || 'pcs'
    };

    let result;
    if (id) {
      result = await sb.from('consumables').update(payload).eq('id', id);
    } else {
      result = await sb.from('consumables').insert(payload);
    }
    if (result.error) throw result.error;

    closeModal('consumableFormModal');
    showToast(id ? 'Consommable mis à jour' : 'Consommable créé avec succès', 'success');
    await loadConsumables(getConsumableFilters());
  } catch (e) {
    console.error('submitConsumable:', e);
    showToast('Erreur lors de l\'enregistrement', 'error');
  }
}

function switchTab(tabName) {
  document.querySelectorAll('.tab-btn').forEach(btn => btn.classList.remove('active'));
  document.querySelectorAll('.tab-panel').forEach(panel => panel.classList.remove('active'));

  const tabMap = { attributions: 0, consommables: 1 };
  const tabs = document.querySelectorAll('.tab-btn');
  if (tabs[tabMap[tabName]]) tabs[tabMap[tabName]].classList.add('active');
  document.getElementById('panel-' + tabName).classList.add('active');
}

function getEquipmentFilters() {
  return {
    search: document.getElementById('attrSearch').value.trim(),
    status: document.getElementById('attrStatusFilter').value
  };
}

function getConsumableFilters() {
  return {
    search: document.getElementById('consSearch').value.trim()
  };
}

function bindFilterEvents() {
  document.getElementById('attrSearch').addEventListener('input', () => {
    clearTimeout(equipmentDebounce);
    equipmentDebounce = setTimeout(() => loadEquipment(getEquipmentFilters()), 300);
  });
  document.getElementById('attrStatusFilter').addEventListener('change', () => loadEquipment(getEquipmentFilters()));

  document.getElementById('consSearch').addEventListener('input', () => {
    clearTimeout(consumableDebounce);
    consumableDebounce = setTimeout(() => loadConsumables(getConsumableFilters()), 300);
  });
}

function bindModalEvents() {
  document.querySelectorAll('.modal-overlay').forEach(overlay => {
    overlay.addEventListener('click', () => {
      overlay.classList.remove('open');
      const form = overlay.querySelector('form');
      if (form) form.reset();
    });
  });

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      document.querySelectorAll('.modal-overlay.open').forEach(m => {
        m.classList.remove('open');
        const form = m.querySelector('form');
        if (form) form.reset();
      });
    }
  });
}

function openModal(id) {
  document.getElementById(id).classList.add('open');
}

function closeModal(id) {
  document.getElementById(id).classList.remove('open');
  const form = document.getElementById(id).querySelector('form');
  if (form) form.reset();
}
