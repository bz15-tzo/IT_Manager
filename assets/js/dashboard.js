(async () => {
  await initAuth();
  if (!requireAuth()) return;
  initNav();

  const userMenuBtn = document.getElementById('userAvatarBtn');
  const userDropdown = document.getElementById('userDropdown');
  userMenuBtn.addEventListener('click', () => userDropdown.classList.toggle('open'));
  document.addEventListener('click', (e) => {
    if (!userMenuBtn.contains(e.target) && !userDropdown.contains(e.target)) userDropdown.classList.remove('open');
  });

  loadStats();
})();

async function loadStats() {
  if (!sb) return;
  try {
    const [tickets, assets, stock, overdue, onboarding, employees] = await Promise.all([
      sb.from('tickets').select('id', { count: 'exact', head: true }).in('status', ['open', 'in_progress', 'pending']),
      sb.from('assets').select('id', { count: 'exact', head: true }).in('status', ['available', 'in_use']),
      sb.from('stock_items').select('id', { count: 'exact', head: true }).filter('quantity', 'lte', 'min_quantity'),
      sb.from('attributions').select('id', { count: 'exact', head: true }).eq('status', 'active').filter('expected_return_date', 'lt', new Date().toISOString().split('T')[0]),
      sb.from('onboarding_records').select('id', { count: 'exact', head: true }).in('status', ['pending', 'in_progress']),
      sb.from('employees').select('id', { count: 'exact', head: true }).eq('status', 'active')
    ]);

    document.getElementById('sOpenTickets').textContent = tickets.count || 0;
    document.getElementById('sAssets').textContent = assets.count || 0;
    document.getElementById('sStockAlerts').textContent = stock.count || 0;
    document.getElementById('sOverdue').textContent = overdue.count || 0;
    document.getElementById('sOnboarding').textContent = onboarding.count || 0;
    document.getElementById('sEmployees').textContent = employees.count || 0;

    loadRecentActivity();
  } catch (e) {
    console.error('Stats error:', e);
  }
}

async function loadRecentActivity() {
  if (!sb) return;
  const container = document.getElementById('recentActivity');
  try {
    const { data: recentTickets } = await sb.from('tickets')
      .select('id, title, status, created_at, created_by:employees!tickets_created_by_fkey(full_name)')
      .order('created_at', { ascending: false }).limit(5);

    if (!recentTickets || recentTickets.length === 0) {
      container.innerHTML = '<div class="empty-state"><i class="fas fa-inbox"></i><p>Aucune activité récente</p></div>';
      return;
    }

    container.innerHTML = recentTickets.map(t => `
      <div class="activity-item">
        <div class="activity-icon blue"><i class="fas fa-ticket-alt"></i></div>
        <span class="activity-text"><strong>${escapeHtml(t.title)}</strong> — ${t.status}</span>
        <span class="activity-time">${formatDateTime(t.created_at)}</span>
      </div>
    `).join('');
  } catch (e) {
    container.innerHTML = '<div class="empty-state"><i class="fas fa-inbox"></i><p>Aucune activité</p></div>';
  }
}
