let allCategories = [];
let allEmployees = [];
let currentTicket = null;

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

  await initTickets();
})();

async function initTickets() {
  await Promise.all([loadCategories(), loadEmployees()]);
  document.getElementById('filterStatus').addEventListener('change', loadTicketsWithFilters);
  document.getElementById('filterPriority').addEventListener('change', loadTicketsWithFilters);
  let debounceTimer;
  document.getElementById('filterSearch').addEventListener('input', () => {
    clearTimeout(debounceTimer);
    debounceTimer = setTimeout(loadTicketsWithFilters, 300);
  });
  await loadTicketsWithFilters();
}

async function loadCategories() {
  if (!sb) return;
  try {
    const { data, error } = await sb.from('ticket_categories').select('*').order('name');
    if (error) throw error;
    allCategories = data || [];
    populateCategorySelects();
  } catch (e) {
    console.error('loadCategories error:', e);
  }
}

async function loadEmployees() {
  if (!sb) return;
  try {
    const { data, error } = await sb.from('employees').select('id, full_name, department').eq('status', 'active').order('full_name');
    if (error) throw error;
    allEmployees = data || [];
    populateAssignSelects();
  } catch (e) {
    console.error('loadEmployees error:', e);
  }
}

function populateCategorySelects() {
  const createSelect = document.getElementById('createCategory');
  if (createSelect) {
    createSelect.innerHTML = allCategories.map(c => `<option value="${c.id}">${escapeHtml(c.name)}</option>`).join('');
  }
}

function populateAssignSelects() {
  const assignSelect = document.getElementById('assignSelect');
  if (assignSelect) {
    assignSelect.innerHTML = '<option value="">Non assigné</option>' + allEmployees.map(e => `<option value="${e.id}">${escapeHtml(e.full_name)}</option>`).join('');
  }
}

async function loadTicketsWithFilters() {
  const status = document.getElementById('filterStatus').value;
  const priority = document.getElementById('filterPriority').value;
  const search = document.getElementById('filterSearch').value.trim();
  await loadTickets({ status, priority, search });
}

async function loadTickets(filters = {}) {
  if (!sb) return;
  try {
    let query = sb.from('tickets').select(`
      id, title, description, priority, status, created_at, updated_at, resolved_at,
      category:ticket_categories(id, name, icon, color),
      creator:employees!tickets_created_by_fkey(id, full_name),
      assignee:employees!tickets_assigned_to_fkey(id, full_name)
    `);

    if (filters.status) query = query.eq('status', filters.status);
    if (filters.priority) query = query.eq('priority', filters.priority);
    if (filters.search) query = query.ilike('title', `%${filters.search}%`);

    query = query.order('created_at', { ascending: false });

    const { data, error } = await query;
    if (error) throw error;

    renderTicketsTable(data || []);
    document.getElementById('ticketsFooter').textContent = `${(data || []).length} ticket(s)`;
  } catch (e) {
    console.error('loadTickets error:', e);
    showToast('Erreur lors du chargement des tickets', 'error');
  }
}

function renderTicketsTable(tickets) {
  const tbody = document.getElementById('ticketsTableBody');
  if (!tickets.length) {
    tbody.innerHTML = '<tr><td colspan="7" class="empty-state"><i class="fas fa-ticket-alt"></i><p>Aucun ticket trouvé</p></td></tr>';
    return;
  }
  tbody.innerHTML = tickets.map(t => `
    <tr>
      <td><strong style="color:var(--text);cursor:pointer" onclick="showTicketDetail('${t.id}')">${escapeHtml(t.title)}</strong></td>
      <td>${t.category ? escapeHtml(t.category.name) : '—'}</td>
      <td><span class="badge priority-${t.priority}">${priorityLabel(t.priority)}</span></td>
      <td><span class="badge status-${t.status}">${statusLabel(t.status)}</span></td>
      <td>${t.assignee ? escapeHtml(t.assignee.full_name) : '<span style="color:var(--text-muted)">—</span>'}</td>
      <td>${formatDate(t.created_at)}</td>
      <td><button class="btn btn-ghost btn-sm" onclick="showTicketDetail('${t.id}')"><i class="fas fa-eye"></i></button></td>
    </tr>
  `).join('');
}

async function showTicketDetail(ticketId) {
  if (!sb) return;
  try {
    const { data: ticket, error } = await sb.from('tickets').select(`
      id, title, description, priority, status, created_at, updated_at, resolved_at,
      category:ticket_categories(id, name),
      creator:employees!tickets_created_by_fkey(id, full_name),
      assignee:employees!tickets_assigned_to_fkey(id, full_name)
    `).eq('id', ticketId).single();
    if (error) throw error;

    currentTicket = ticket;

    document.getElementById('detailTitle').textContent = ticket.title;
    document.getElementById('detailPriorityBadge').innerHTML = `<span class="badge priority-${ticket.priority}">${priorityLabel(ticket.priority)}</span>`;
    document.getElementById('detailStatusBadge').innerHTML = `<span class="badge status-${ticket.status}">${statusLabel(ticket.status)}</span>`;
    document.getElementById('detailCategory').textContent = ticket.category ? ticket.category.name : '—';
    document.getElementById('detailCreatedBy').textContent = ticket.creator ? ticket.creator.full_name : '—';
    document.getElementById('detailAssignedTo').textContent = ticket.assignee ? ticket.assignee.full_name : 'Non assigné';
    document.getElementById('detailCreatedAt').textContent = formatDateTime(ticket.created_at);
    document.getElementById('detailResolvedAt').textContent = ticket.resolved_at ? formatDateTime(ticket.resolved_at) : '—';
    document.getElementById('detailDescription').textContent = ticket.description || 'Aucune description';

    if (document.getElementById('assignSelect')) {
      document.getElementById('assignSelect').value = ticket.assignee ? ticket.assignee.id : '';
    }

    renderStatusButtons(ticket.status);
    document.getElementById('ticketsListView').style.display = 'none';
    document.getElementById('ticketDetailView').style.display = '';
    await loadComments(ticketId);
  } catch (e) {
    console.error('showTicketDetail error:', e);
    showToast('Erreur lors du chargement du ticket', 'error');
  }
}

function renderStatusButtons(currentStatus) {
  const group = document.getElementById('statusBtnGroup');
  const statuses = [
    { value: 'open', label: 'Ouvert', icon: 'fa-folder-open' },
    { value: 'in_progress', label: 'En cours', icon: 'fa-spinner' },
    { value: 'pending', label: 'En attente', icon: 'fa-clock' },
    { value: 'resolved', label: 'Résolu', icon: 'fa-check-circle' },
    { value: 'closed', label: 'Fermé', icon: 'fa-times-circle' }
  ];
  group.innerHTML = statuses.map(s => `
    <button class="btn btn-sm ${s.value === currentStatus ? 'active-status btn-primary' : 'btn-outline'}"
      onclick="changeTicketStatus('${currentTicket.id}', '${s.value}')">
      <i class="fas ${s.icon}"></i> ${s.label}
    </button>
  `).join('');
}

function backToList() {
  document.getElementById('ticketDetailView').style.display = 'none';
  document.getElementById('ticketsListView').style.display = '';
  currentTicket = null;
  loadTicketsWithFilters();
}

async function changeTicketStatus(ticketId, newStatus) {
  if (!sb) return;
  try {
    const update = { status: newStatus, updated_at: new Date().toISOString() };
    if (newStatus === 'resolved' || newStatus === 'closed') update.resolved_at = new Date().toISOString();
    const { error } = await sb.from('tickets').update(update).eq('id', ticketId);
    if (error) throw error;
    showToast('Statut mis à jour', 'success');
    await showTicketDetail(ticketId);
  } catch (e) {
    console.error('changeTicketStatus error:', e);
    showToast('Erreur lors de la mise à jour du statut', 'error');
  }
}

async function assignTicketFromDetail() {
  if (!sb || !currentTicket) return;
  const employeeId = document.getElementById('assignSelect').value || null;
  try {
    const { error } = await sb.from('tickets').update({ assigned_to: employeeId, updated_at: new Date().toISOString() }).eq('id', currentTicket.id);
    if (error) throw error;
    showToast('Ticket assigné', 'success');
    await showTicketDetail(currentTicket.id);
  } catch (e) {
    console.error('assignTicket error:', e);
    showToast('Erreur lors de l\'assignation', 'error');
  }
}

async function assignTicket(ticketId, employeeId) {
  if (!sb) return;
  try {
    const { error } = await sb.from('tickets').update({ assigned_to: employeeId || null, updated_at: new Date().toISOString() }).eq('id', ticketId);
    if (error) throw error;
    showToast('Ticket assigné', 'success');
  } catch (e) {
    console.error('assignTicket error:', e);
    showToast('Erreur lors de l\'assignation', 'error');
  }
}

async function submitComment() {
  if (!sb || !currentTicket) return;
  const input = document.getElementById('commentInput');
  const content = input.value.trim();
  if (!content) return;
  await addComment(currentTicket.id, content);
  input.value = '';
}

async function addComment(ticketId, content) {
  if (!sb) return;
  try {
    const employeeId = currentProfile ? currentProfile.id : null;
    const { error } = await sb.from('ticket_comments').insert({
      ticket_id: ticketId,
      author_id: employeeId,
      content: content
    });
    if (error) throw error;
    await loadComments(ticketId);
  } catch (e) {
    console.error('addComment error:', e);
    showToast('Erreur lors de l\'ajout du commentaire', 'error');
  }
}

async function loadComments(ticketId) {
  if (!sb) return;
  const container = document.getElementById('commentsList');
  try {
    const { data, error } = await sb.from('ticket_comments')
      .select('id, content, created_at, author:employees!ticket_comments_author_id_fkey(id, full_name)')
      .eq('ticket_id', ticketId)
      .order('created_at', { ascending: true });
    if (error) throw error;

    if (!data || !data.length) {
      container.innerHTML = '<div class="empty-comments">Aucun commentaire</div>';
      return;
    }

    container.innerHTML = data.map(c => {
      const name = c.author ? c.author.full_name : 'Utilisateur';
      const initial = (name.charAt(0) || 'U').toUpperCase();
      return `
        <div class="comment-item">
          <div class="comment-avatar">${initial}</div>
          <div class="comment-body">
            <div class="comment-header">
              <span class="comment-author">${escapeHtml(name)}</span>
              <span class="comment-date">${formatDateTime(c.created_at)}</span>
            </div>
            <div class="comment-content">${escapeHtml(c.content)}</div>
          </div>
        </div>
      `;
    }).join('');
    container.scrollTop = container.scrollHeight;
  } catch (e) {
    console.error('loadComments error:', e);
    container.innerHTML = '<div class="empty-comments">Erreur de chargement</div>';
  }
}

function openCreateModal() {
  document.getElementById('createModal').classList.add('open');
}

function closeCreateModal() {
  document.getElementById('createModal').classList.remove('open');
  document.getElementById('createForm').reset();
}

async function submitCreate(e) {
  e.preventDefault();
  if (!sb) return;
  try {
    const title = document.getElementById('createTitle').value.trim();
    const description = document.getElementById('createDescription').value.trim();
    const category_id = document.getElementById('createCategory').value || null;
    const priority = document.getElementById('createPriority').value;

    const employeeId = currentProfile ? currentProfile.id : null;

    const { error } = await sb.from('tickets').insert({
      title,
      description,
      category_id,
      priority,
      status: 'open',
      created_by: employeeId
    });
    if (error) throw error;

    closeCreateModal();
    showToast('Ticket créé avec succès', 'success');
    await loadTicketsWithFilters();
  } catch (e) {
    console.error('submitCreate error:', e);
    showToast('Erreur lors de la création du ticket', 'error');
  }
}

function priorityLabel(p) {
  const map = { low: 'Basse', medium: 'Moyenne', high: 'Haute', critical: 'Critique' };
  return map[p] || p;
}

function statusLabel(s) {
  const map = { open: 'Ouvert', in_progress: 'En cours', pending: 'En attente', resolved: 'Résolu', closed: 'Fermé' };
  return map[s] || s;
}
