let allEmployees = [];
let allProcesses = [];
let allHSEItems = [];
let currentRecordId = null;

document.addEventListener('DOMContentLoaded', async () => {
  try {
    await initAuth();
    if (!requireAuth()) return;
    initNav();
    initUserMenu();
    await initOnboarding();
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

async function initOnboarding() {
  await loadEmployees();
  await Promise.all([loadProcesses(), loadHSEChecklist()]);
  updateStats();
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

async function loadEmployees() {
  if (!sb) return;
  try {
    const { data, error } = await sb.from('employees').select('*').eq('status', 'active').order('full_name');
    if (error) throw error;
    allEmployees = data || [];
    const opts = allEmployees.map(e => `<option value="${e.id}">${escapeHtml(e.full_name)} — ${escapeHtml(e.department || '')}</option>`).join('');
    const empSel = document.getElementById('processEmployee');
    const assignSel = document.getElementById('addTaskAssigned');
    if (empSel) empSel.innerHTML = '<option value="">Sélectionner un employé</option>' + opts;
    if (assignSel) assignSel.innerHTML = '<option value="">Non assigné</option>' + opts;
  } catch (e) {
    console.error('loadEmployees:', e);
    showToast('Erreur lors du chargement des employés', 'error');
  }
}

async function loadProcesses(filters = {}) {
  if (!sb) return;
  try {
    let query = sb.from('onboarding_records').select(`
      *,
      employee:employees!onboarding_records_employee_id_fkey(id, full_name, department)
    `).order('start_date', { ascending: false });

    const { data, error } = await query;
    if (error) throw error;

    let items = data || [];

    if (filters.type) {
      items = items.filter(r => r.type === filters.type);
    }
    if (filters.status) {
      items = items.filter(r => r.status === filters.status);
    }

    allProcesses = items;

    for (const record of allProcesses) {
      record.progress = await calculateProgress(record.id);
    }

    renderProcessCards(allProcesses);
    updateStats();
  } catch (e) {
    console.error('loadProcesses:', e);
    showToast('Erreur lors du chargement des processus', 'error');
  }
}

function renderProcessCards(records) {
  const container = document.getElementById('processCards');
  const empty = document.getElementById('processEmptyState');

  if (!records.length) {
    container.innerHTML = '';
    empty.style.display = 'block';
    return;
  }

  empty.style.display = 'none';

  const statusLabels = {
    pending: 'En attente',
    in_progress: 'En cours',
    completed: 'Terminé'
  };

  container.innerHTML = records.map(r => {
    const progress = r.progress || 0;
    return `
      <div class="process-card type-${r.type}" onclick="showProcessDetail('${r.id}')">
        <div class="process-card-header">
          <span class="process-card-name">${escapeHtml(r.employee?.full_name || '—')}</span>
          <div class="process-card-badges">
            <span class="type-badge ${r.type}">${r.type === 'inboarding' ? 'Entrée' : 'Sortie'}</span>
            <span class="status-badge ${r.status}">${statusLabels[r.status] || r.status}</span>
          </div>
        </div>
        <div class="process-card-meta">
          <span><i class="fas fa-calendar-alt"></i> ${formatDate(r.start_date)}</span>
          ${r.completion_date ? `<span><i class="fas fa-check-circle"></i> ${formatDate(r.completion_date)}</span>` : ''}
        </div>
        <div class="progress-bar"><div class="progress-fill" style="width:${progress}%"></div></div>
        <div class="progress-label">${progress}% complété</div>
      </div>`;
  }).join('');
}

async function calculateProgress(recordId) {
  if (!sb) return 0;
  try {
    const { data: tasks, error } = await sb.from('onboarding_tasks').select('status').eq('record_id', recordId);
    if (error) throw error;
    if (!tasks || !tasks.length) return 0;
    const done = tasks.filter(t => t.status === 'done').length;
    return Math.round((done / tasks.length) * 100);
  } catch (e) {
    console.error('calculateProgress:', e);
    return 0;
  }
}

async function showProcessDetail(recordId) {
  if (!sb) return;
  currentRecordId = recordId;
  try {
    const { data: record, error } = await sb.from('onboarding_records').select(`
      *,
      employee:employees!onboarding_records_employee_id_fkey(id, full_name, department),
      creator:employees!onboarding_records_created_by_fkey(full_name)
    `).eq('id', recordId).single();
    if (error) throw error;

    const statusLabels = {
      pending: 'En attente',
      in_progress: 'En cours',
      completed: 'Terminé'
    };

    const progress = await calculateProgress(recordId);

    document.getElementById('detailHeader').innerHTML = `
      <h2>${escapeHtml(record.employee?.full_name || '—')}</h2>
      <div class="detail-meta">
        <span class="detail-meta-item"><span class="type-badge ${record.type}">${record.type === 'inboarding' ? 'Entrée' : 'Sortie'}</span></span>
        <span class="detail-meta-item"><span class="status-badge ${record.status}">${statusLabels[record.status] || record.status}</span></span>
        <span class="detail-meta-item"><i class="fas fa-calendar-alt"></i> Début: ${formatDate(record.start_date)}</span>
        ${record.completion_date ? `<span class="detail-meta-item"><i class="fas fa-check-circle"></i> Fin: ${formatDate(record.completion_date)}</span>` : ''}
        ${record.creator ? `<span class="detail-meta-item"><i class="fas fa-user"></i> Créé par ${escapeHtml(record.creator.full_name)}</span>` : ''}
      </div>`;

    document.getElementById('detailProgress').innerHTML = `
      <h3>Progression</h3>
      <div class="progress-bar" style="margin-bottom:6px"><div class="progress-fill" style="width:${progress}%"></div></div>
      <div class="progress-label">${progress}% complété</div>`;

    await loadTasks(recordId);

    const actionsEl = document.getElementById('detailActions');
    if (record.status !== 'completed' && progress === 100) {
      actionsEl.innerHTML = `<button class="btn btn-secondary" onclick="completeProcess('${recordId}')"><i class="fas fa-check-double"></i> Marquer terminé</button>`;
    } else {
      actionsEl.innerHTML = '';
    }

    document.getElementById('processListView').style.display = 'none';
    document.getElementById('processDetailView').style.display = 'block';
  } catch (e) {
    console.error('showProcessDetail:', e);
    showToast('Erreur lors du chargement du détail', 'error');
  }
}

function backToProcessList() {
  document.getElementById('processListView').style.display = 'block';
  document.getElementById('processDetailView').style.display = 'none';
  currentRecordId = null;
  loadProcesses(getFilters());
}

async function loadTasks(recordId) {
  if (!sb) return;
  try {
    const { data: tasks, error } = await sb.from('onboarding_tasks').select(`
      *,
      assignee:employees!onboarding_tasks_assigned_to_fkey(full_name)
    `).eq('record_id', recordId);
    if (error) throw error;

    const container = document.getElementById('taskList');

    if (!tasks || !tasks.length) {
      container.innerHTML = '<div class="empty-state"><i class="fas fa-tasks"></i><p>Aucune tâche</p></div>';
      return;
    }

    container.innerHTML = tasks.map(t => {
      const isDone = t.status === 'done';
      return `
        <div class="task-item ${isDone ? 'done' : ''}">
          <button class="task-checkbox ${isDone ? 'checked' : ''}" onclick="toggleTaskStatus('${t.id}', '${t.status}')">
            ${isDone ? '<i class="fas fa-check"></i>' : ''}
          </button>
          <div class="task-info">
            <div class="task-name ${isDone ? 'done' : ''}">${escapeHtml(t.task_name)}</div>
            <div class="task-details">
              <span class="task-category ${t.category}">${t.category}</span>
              ${t.assignee ? `<span class="task-assignee"><i class="fas fa-user"></i> ${escapeHtml(t.assignee.full_name)}</span>` : ''}
              ${t.completed_at ? `<span class="task-date"><i class="fas fa-clock"></i> ${formatDateTime(t.completed_at)}</span>` : ''}
            </div>
          </div>
        </div>`;
    }).join('');
  } catch (e) {
    console.error('loadTasks:', e);
    showToast('Erreur lors du chargement des tâches', 'error');
  }
}

async function toggleTaskStatus(taskId, currentStatus) {
  if (!sb) return;
  const newStatus = currentStatus === 'done' ? 'pending' : 'done';
  const completedAt = newStatus === 'done' ? new Date().toISOString() : null;
  try {
    const { error } = await sb.from('onboarding_tasks').update({
      status: newStatus,
      completed_at: completedAt
    }).eq('id', taskId);
    if (error) throw error;
    if (currentRecordId) {
      await loadTasks(currentRecordId);
      const progress = await calculateProgress(currentRecordId);
      document.getElementById('detailProgress').innerHTML = `
        <h3>Progression</h3>
        <div class="progress-bar" style="margin-bottom:6px"><div class="progress-fill" style="width:${progress}%"></div></div>
        <div class="progress-label">${progress}% complété</div>`;

      const actionsEl = document.getElementById('detailActions');
      if (progress === 100) {
        actionsEl.innerHTML = `<button class="btn btn-secondary" onclick="completeProcess('${currentRecordId}')"><i class="fas fa-check-double"></i> Marquer terminé</button>`;
      } else {
        actionsEl.innerHTML = '';
      }
    }
  } catch (e) {
    console.error('toggleTaskStatus:', e);
    showToast('Erreur lors de la mise à jour', 'error');
  }
}

function openAddTask() {
  document.getElementById('addTaskForm').reset();
  document.getElementById('addTaskRecordId').value = currentRecordId;
  openModal('addTaskModal');
}

async function submitAddTask(e) {
  e.preventDefault();
  if (!sb) return;
  try {
    const recordId = document.getElementById('addTaskRecordId').value;
    const taskName = document.getElementById('addTaskName').value.trim();
    const category = document.getElementById('addTaskCategory').value;
    const assignedTo = document.getElementById('addTaskAssigned').value || null;

    if (!taskName) {
      showToast('Veuillez entrer un nom de tâche', 'error');
      return;
    }

    const { error } = await sb.from('onboarding_tasks').insert({
      record_id: recordId,
      task_name: taskName,
      category: category,
      assigned_to: assignedTo,
      status: 'pending'
    });
    if (error) throw error;

    await sb.from('onboarding_records').update({ status: 'in_progress' }).eq('id', recordId).eq('status', 'pending');

    closeModal('addTaskModal');
    showToast('Tâche ajoutée', 'success');
    await showProcessDetail(recordId);
  } catch (e) {
    console.error('submitAddTask:', e);
    showToast('Erreur lors de l\'ajout', 'error');
  }
}

async function completeProcess(recordId) {
  if (!sb) return;
  try {
    const { error } = await sb.from('onboarding_records').update({
      status: 'completed',
      completion_date: new Date().toISOString().split('T')[0]
    }).eq('id', recordId);
    if (error) throw error;
    showToast('Processus terminé avec succès', 'success');
    await showProcessDetail(recordId);
  } catch (e) {
    console.error('completeProcess:', e);
    showToast('Erreur lors de la finalisation', 'error');
  }
}

function openCreateProcess() {
  document.getElementById('createProcessForm').reset();
  document.getElementById('processStartDate').value = new Date().toISOString().split('T')[0];
  openModal('createProcessModal');
}

async function submitCreateProcess(e) {
  e.preventDefault();
  if (!sb) return;
  try {
    const employeeId = document.getElementById('processEmployee').value;
    const type = document.getElementById('processType').value;
    const startDate = document.getElementById('processStartDate').value || new Date().toISOString().split('T')[0];

    if (!employeeId) {
      showToast('Veuillez sélectionner un employé', 'error');
      return;
    }

    const { data: record, error: recError } = await sb.from('onboarding_records').insert({
      employee_id: employeeId,
      type: type,
      status: 'pending',
      start_date: startDate,
      created_by: currentProfile?.id || null
    }).select().single();
    if (recError) throw recError;

    const defaultTasks = await getDefaultTasks(type);
    if (defaultTasks.length) {
      const { error: taskError } = await sb.from('onboarding_tasks').insert(defaultTasks.map(t => ({
        record_id: record.id,
        task_name: t.task_name,
        category: t.category,
        assigned_to: null,
        status: 'pending'
      })));
      if (taskError) throw taskError;
    }

    closeModal('createProcessModal');
    showToast('Processus créé avec succès', 'success');
    await loadProcesses(getFilters());
  } catch (e) {
    console.error('submitCreateProcess:', e);
    showToast('Erreur lors de la création', 'error');
  }
}

async function getDefaultTasks(type) {
  const tasks = [];

  if (type === 'inboarding') {
    tasks.push(
      { task_name: 'Créer compte email', category: 'IT' },
      { task_name: 'Attribuer ordinateur', category: 'IT' },
      { task_name: 'Configurer accès réseau', category: 'IT' },
      { task_name: 'Remettre équipements', category: 'IT' },
      { task_name: 'Préparer bureau', category: 'Admin' },
      { task_name: 'Remettre badge', category: 'Admin' },
      { task_name: 'Contrat de travail', category: 'HR' },
      { task_name: 'Dossier médical', category: 'HR' }
    );

    if (sb) {
      try {
        const { data: hseItems, error } = await sb.from('hse_checklist').select('name');
        if (!error && hseItems) {
          hseItems.forEach(item => {
            tasks.push({ task_name: item.name, category: 'HSE' });
          });
        }
      } catch (e) {
        console.error('getDefaultTasks hse:', e);
      }
    }
  } else {
    tasks.push(
      { task_name: 'Récupérer ordinateur', category: 'IT' },
      { task_name: 'Désactiver compte email', category: 'IT' },
      { task_name: 'Révoquer accès réseau', category: 'IT' },
      { task_name: 'Induction de sortie', category: 'HSE' },
      { task_name: 'Récupérer badge', category: 'Admin' },
      { task_name: 'Clé de bureau', category: 'Admin' },
      { task_name: 'Letter de démission', category: 'HR' },
      { task_name: 'Solde de tout compte', category: 'HR' }
    );
  }

  return tasks;
}

function getFilters() {
  return {
    type: document.getElementById('filterType').value,
    status: document.getElementById('filterStatus').value
  };
}

function applyFilters() {
  loadProcesses(getFilters());
}

function updateStats() {
  const inProgress = allProcesses.filter(r => r.status === 'in_progress').length;
  const pending = allProcesses.filter(r => r.status === 'pending').length;

  const now = new Date();
  const currentMonth = now.getMonth();
  const currentYear = now.getFullYear();
  const completedMonth = allProcesses.filter(r => {
    if (r.status !== 'completed' || !r.completion_date) return false;
    const d = new Date(r.completion_date);
    return d.getMonth() === currentMonth && d.getFullYear() === currentYear;
  }).length;

  const hseValidations = allProcesses.reduce((count, r) => {
    return count + (r.progress === 100 ? 1 : 0);
  }, 0);

  document.getElementById('sInProgress').textContent = inProgress;
  document.getElementById('sCompletedMonth').textContent = completedMonth;
  document.getElementById('sPending').textContent = pending;
  document.getElementById('sHSEValidations').textContent = hseValidations;
}

function switchTab(name) {
  document.querySelectorAll('.tab-btn').forEach(btn => btn.classList.remove('active'));
  document.querySelectorAll('.tab-panel').forEach(panel => panel.classList.remove('active'));

  const tabMap = { processus: 0, hse: 1 };
  const tabs = document.querySelectorAll('.tab-btn');
  if (tabs[tabMap[name]]) tabs[tabMap[name]].classList.add('active');
  document.getElementById('panel-' + name).classList.add('active');

  if (name === 'hse') loadHSEChecklist();
}

async function loadHSEChecklist() {
  if (!sb) return;
  try {
    const { data, error } = await sb.from('hse_checklist').select('*').order('name');
    if (error) throw error;
    allHSEItems = data || [];
    renderHSETable(allHSEItems);
  } catch (e) {
    console.error('loadHSEChecklist:', e);
    showToast('Erreur lors du chargement de la checklist HSE', 'error');
  }
}

function renderHSETable(items) {
  const tbody = document.getElementById('hseTableBody');
  const empty = document.getElementById('hseEmptyState');

  if (!items.length) {
    tbody.innerHTML = '';
    empty.style.display = 'block';
    return;
  }

  empty.style.display = 'none';

  const categoryLabels = {
    safety: 'Sécurité',
    environment: 'Environnement',
    health: 'Santé'
  };

  tbody.innerHTML = items.map(item => `
    <tr>
      <td><strong style="color:var(--text)">${escapeHtml(item.name)}</strong></td>
      <td>${escapeHtml(item.description || '—')}</td>
      <td><span class="hse-category ${item.category}">${categoryLabels[item.category] || item.category}</span></td>
      <td><span class="hse-mandatory ${item.is_mandatory ? 'yes' : 'no'}">${item.is_mandatory ? 'Oui' : 'Non'}</span></td>
      <td>
        <div class="action-btns">
          <button class="btn btn-ghost btn-sm" onclick="editHSE('${item.id}')" title="Modifier"><i class="fas fa-edit"></i></button>
          <button class="btn btn-ghost btn-sm" onclick="deleteHSE('${item.id}')" title="Supprimer"><i class="fas fa-trash"></i></button>
        </div>
      </td>
    </tr>`).join('');
}

function openAddHSE() {
  document.getElementById('hseFormTitle').textContent = 'Nouvel élément HSE';
  document.getElementById('hseForm').reset();
  document.getElementById('hseId').value = '';
  openModal('hseFormModal');
}

function editHSE(id) {
  const item = allHSEItems.find(i => i.id === id);
  if (!item) return;
  document.getElementById('hseFormTitle').textContent = 'Modifier l\'élément HSE';
  document.getElementById('hseId').value = item.id;
  document.getElementById('hseName').value = item.name || '';
  document.getElementById('hseDescription').value = item.description || '';
  document.getElementById('hseCategory').value = item.category || 'safety';
  document.getElementById('hseMandatory').value = item.is_mandatory ? 'true' : 'false';
  openModal('hseFormModal');
}

async function submitHSE(e) {
  e.preventDefault();
  if (!sb) return;
  try {
    const id = document.getElementById('hseId').value;
    const payload = {
      name: document.getElementById('hseName').value.trim(),
      description: document.getElementById('hseDescription').value.trim() || null,
      category: document.getElementById('hseCategory').value,
      is_mandatory: document.getElementById('hseMandatory').value === 'true'
    };

    let result;
    if (id) {
      result = await sb.from('hse_checklist').update(payload).eq('id', id);
    } else {
      result = await sb.from('hse_checklist').insert(payload);
    }
    if (result.error) throw result.error;

    closeModal('hseFormModal');
    showToast(id ? 'Élément HSE mis à jour' : 'Élément HSE créé', 'success');
    await loadHSEChecklist();
  } catch (e) {
    console.error('submitHSE:', e);
    showToast('Erreur lors de l\'enregistrement', 'error');
  }
}

async function deleteHSE(id) {
  if (!sb) return;
  if (!confirm('Supprimer cet élément HSE ?')) return;
  try {
    const { error } = await sb.from('hse_checklist').delete().eq('id', id);
    if (error) throw error;
    showToast('Élément HSE supprimé', 'success');
    await loadHSEChecklist();
  } catch (e) {
    console.error('deleteHSE:', e);
    showToast('Erreur lors de la suppression', 'error');
  }
}

function openModal(id) {
  document.getElementById(id).classList.add('open');
}

function closeModal(id) {
  document.getElementById(id).classList.remove('open');
  const form = document.getElementById(id).querySelector('form');
  if (form) form.reset();
}
