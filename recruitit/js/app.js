// ============================================================
// OnboardIT - Logique applicative
// ============================================================

// ---------- Utilitaires ----------
const $ = (sel) => document.querySelector(sel);
const $$ = (sel) => document.querySelectorAll(sel);

function escapeHTML(str) {
  if (str === null || str === undefined) return "";
  return String(str)
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;").replace(/'/g, "&#039;");
}

function formatDate(d) {
  if (!d) return "—";
  const dt = new Date(d + (d.length === 10 ? "T00:00:00" : ""));
  if (isNaN(dt)) return d;
  return dt.toLocaleDateString("fr-FR", { day: "2-digit", month: "2-digit", year: "numeric" });
}

let toastTimer = null;
function toast(message, type = "") {
  const el = $("#toast");
  el.textContent = message;
  el.className = "toast " + type;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.add("hidden"), 3500);
}

function initials(name) {
  if (!name) return "?";
  return name.trim().split(/\s+/).slice(0, 2).map(w => w[0].toUpperCase()).join("");
}

function getStep(id) {
  const all = [...STEPS, ...OUTBOARDING_STEPS];
  return all.find(s => s.id === id) || STEPS[STEPS.length - 1];
}

function stepProgress(stepId) {
  const steps = [...STEPS, ...OUTBOARDING_STEPS];
  const idx = steps.findIndex(s => s.id === stepId);
  return Math.round((idx / (steps.length - 1)) * 100);
}

function getStepsForOnboarding(o) {
  return getStepsForCycle(o && o.cycle ? o.cycle : "onboarding");
}

// Une étape n'est "validée" que si TOUTES ses tâches sont terminées
function stepValidated(o) {
  const tasks = (state.tasks[o.id] || []).filter(t => t.step === o.step);
  return tasks.length === 0 || tasks.every(t => t.done);
}

function progressColor(p) {
  if (p >= 66) return "var(--success)";
  if (p >= 33) return "var(--warning)";
  return "var(--danger)";
}

// ---------- Helpers métier (statut, blocages) ----------
function getBlockerType(id) {
  return BLOCKER_TYPES.find(t => t.id === id) || BLOCKER_TYPES[BLOCKER_TYPES.length - 1];
}

function getFlowStatus(id) {
  return FLOW_STATUS[id] || FLOW_STATUS.en_cours;
}

function openBlockers(o) {
  return (state.blockers[o.id] || []).filter(b => b.status === "open");
}

function isPaused(o) {
  return o.flow_status === "en_pause";
}

function isClosed(o) {
  return o.step === "cloture" || o.step === "cloture_administrative" || o.flow_status === "cloture";
}

// ---------- État global ----------
const state = {
  session: null,
  profile: null,
  onboardings: [],
  tasks: {},            // onboardingId -> [tasks]
  documents: {},        // onboardingId -> [documents]
  blockers: {},         // onboardingId -> [blockers]
  listItems: { department: [], material: [] },  // valeurs ajoutées par l'admin
  currentView: "dashboard",
  currentCycle: "onboarding",  // "onboarding" | "outboarding"
  detailOnboardingId: null,
  taskDetails: {}        // détail des tâches en cours de chargement
};

// ---------- Auth : affichage ----------
function showAuthView() {
  $("#authView").classList.remove("hidden");
  $("#appView").classList.add("hidden");
}

function showAppView() {
  $("#authView").classList.add("hidden");
  $("#appView").classList.remove("hidden");
}

function renderUserInfo() {
  if (!state.profile) return;
  $("#userName").textContent = state.profile.full_name || "Utilisateur";
  $("#userAvatar").textContent = initials(state.profile.full_name || "U");
  const roleEl = $("#userRole");
  roleEl.textContent = state.profile.role || "—";
  roleEl.className = "user-role";
  switch (state.profile.role) {
    case "IT": roleEl.style.color = "#93c5fd"; break;
    case "RH": roleEl.style.color = "#f9a8d4"; break;
    case "MANAGER": roleEl.style.color = "#6ee7b7"; break;
    case "ADMIN": roleEl.style.color = "#c4b5fd"; break;
  }
}

function applyRolePermissions() {
  const role = state.profile && state.profile.role;
  // Seul RH crée un dossier de recrutement
  const canCreate = role === "RH";
  $("#openCreateModal").classList.toggle("hidden", !canCreate);
  if (!canCreate && $("#createModal")) $("#createModal").classList.add("hidden");
  const adminNav = $(".nav-item[data-view=admin]");
  if (adminNav) adminNav.classList.toggle("hidden", role !== "ADMIN");
}

function setupRefresh() {
  const btn = $("#refreshBtn");
  if (!btn) return;
  btn.addEventListener("click", async () => {
    btn.disabled = true;
    btn.classList.add("loading");
    try {
      await loadAll();
      await loadListItems();
      populateDepartmentSelects();
      populateMaterialLists();
      if (state.currentView === "dashboard") renderKanban();
      if (state.currentView === "list") renderTable();
      if (state.detailOnboardingId) renderDetail();
      toast("Données actualisées", "success");
    } catch (error) {
      toast(error.message || "Impossible d'actualiser.", "error");
    } finally {
      btn.classList.remove("loading");
      btn.disabled = false;
    }
  });
}

// ---------- Auth : actions ----------
function initAuthTabs() {
  $$(".auth-tab").forEach(btn => {
    btn.addEventListener("click", () => {
      $$(".auth-tab").forEach(b => b.classList.remove("active"));
      btn.classList.add("active");
      const tab = btn.dataset.tab;
      $("#loginForm").classList.toggle("hidden", tab !== "login");
      $("#signupForm").classList.toggle("hidden", tab !== "signup");
      $("#loginError").classList.add("hidden");
      $("#signupError").classList.add("hidden");
    });
  });
}

function setupAuthForms() {
  $("#loginForm").addEventListener("submit", async (e) => {
    e.preventDefault();
    const err = $("#loginError");
    err.classList.add("hidden");
    try {
      await api.signIn($("#loginEmail").value.trim(), $("#loginPassword").value);
      toast("Bienvenue !", "success");
    } catch (error) {
      err.textContent = error.message || "Connexion impossible.";
      err.classList.remove("hidden");
    }
  });

  $("#signupForm").addEventListener("submit", async (e) => {
    e.preventDefault();
    const err = $("#signupError");
    err.classList.add("hidden");
    const email = $("#signupEmail").value.trim();
    const password = $("#signupPassword").value;
    const fullName = $("#signupName").value.trim();
    const role = $("#signupRole").value;
    try {
      await api.signUp(email, password, fullName, role);
      toast("Compte créé. Vérifiez votre email si la confirmation est activée.", "success");
      $("#signupForm").reset();
    } catch (error) {
      err.textContent = error.message || "Inscription impossible.";
      err.classList.remove("hidden");
    }
  });

  $("#logoutBtn").addEventListener("click", async () => {
    await api.signOut();
    state.session = null;
    state.profile = null;
    showAuthView();
  });
}

// ---------- Navigation ----------
function setupNavigation() {
  $$(".nav-item").forEach(item => {
    item.addEventListener("click", () => {
      $$(".nav-item").forEach(i => i.classList.remove("active"));
      item.classList.add("active");
      switchView(item.dataset.view);
    });
  });
}

function switchView(view) {
  state.currentView = view;
  // Bascule le cycle selon la vue sélectionnée
  if (view === "outboard") {
    state.currentCycle = "outboarding";
    view = "dashboard"; // affiche le kanban filtré outboarding
  } else if (view === "dashboard") {
    state.currentCycle = "onboarding";
  }
  // "list", "about", "admin" : on garde le cycle courant (pas de reset)
  $$(".view").forEach(v => v.classList.add("hidden"));
  const el = $("#view-" + view);
  if (el) el.classList.remove("hidden");

  if (view === "dashboard") renderKanban();
  if (view === "list") renderTable();
  if (view === "about") renderAbout();
  if (view === "admin") renderAdmin();
}

// ---------- Chargement des données ----------
async function loadAll() {
  state.onboardings = await api.listOnboardings();
  // Charge les tâches des dossiers visibles
  const ids = state.onboardings.map(o => o.id);
  const { data: allTasks, error } = await recruititClient
    .from("tasks")
    .select("*")
    .in("onboarding_id", ids.length ? ids : [null]);
  if (!error) {
    state.tasks = {};
    allTasks.forEach(t => {
      if (!state.tasks[t.onboarding_id]) state.tasks[t.onboarding_id] = [];
      state.tasks[t.onboarding_id].push(t);
    });
    // Trie les tâches de chaque dossier
    Object.values(state.tasks).forEach(list => list.sort((a, b) =>
      (a.created_at || "").localeCompare(b.created_at || "")));
  }
  // Charge les blocages / incidents (tolérant : table absente si business.sql non exécuté)
  const { data: allBlockers, error: blockersError } = await recruititClient
    .from("blockers")
    .select("*")
    .in("onboarding_id", ids.length ? ids : [null]);
  if (!blockersError) {
    state.blockers = {};
    (allBlockers || []).forEach(b => {
      if (!state.blockers[b.onboarding_id]) state.blockers[b.onboarding_id] = [];
      state.blockers[b.onboarding_id].push(b);
    });
    Object.values(state.blockers).forEach(list => list.sort((a, b) =>
      (a.created_at || "").localeCompare(b.created_at || "")));
  }
}

// ---------- Listes administrables (départements, matériel) ----------
async function loadListItems() {
  try {
    const [depts, mats] = await Promise.all([
      api.listListItems("department"),
      api.listListItems("material")
    ]);
    state.listItems.department = depts || [];
    state.listItems.material = mats || [];
  } catch (e) {
    // Table list_items absente (roles.sql non exécuté) : listes par défaut
    state.listItems = { department: [], material: [] };
  }
}

function allDepartments() {
  const seen = new Set();
  const defaults = DEPARTMENTS.map(v => ({ value: v }));
  const db = (state.listItems.department || []).map(i => ({ value: i.value }));
  return defaults.concat(db).filter(x => { if (seen.has(x.value)) return false; seen.add(x.value); return true; });
}

function allMaterials() {
  const seen = new Set();
  const defaults = MATERIAL_ITEMS.map(m => ({ id: m.id, label: m.label, icon: m.icon }));
  const db = (state.listItems.material || []).map(i => ({ id: i.value.toUpperCase().replace(/\s+/g, "_"), label: i.value, icon: "📦" }));
  return defaults.concat(db).filter(x => { if (seen.has(x.id)) return false; seen.add(x.id); return true; });
}

function materialFromDb(str) {
  return (str || "").split(",").map(s => s.trim()).filter(Boolean);
}

function materialLabels(str) {
  return materialFromDb(str).map(id => {
    const m = MATERIAL_ITEMS.find(x => x.id === id);
    return m ? m.label : id;
  });
}

function materialChips(str) {
  const selected = materialFromDb(str);
  if (!selected.length) return `<span style="color:var(--text-muted)">Aucun matériel demandé</span>`;
  return selected.map(id => {
    const m = MATERIAL_ITEMS.find(x => x.id === id);
    return `<span class="chip">${m ? m.icon + " " + m.label : "📦 " + id}</span>`;
  }).join("");
}

function populateDepartmentSelects() {
  const opts = ['<option value="">— Choisir —</option>'].concat(
    allDepartments().map(d => `<option value="${escapeHTML(d.value)}">${escapeHTML(d.value)}</option>`)
  ).join("");
  ["#fDepartment", "#efDepartment"].forEach(sel => {
    const el = $(sel);
    if (el) el.innerHTML = opts;
  });
}

function populateMaterialLists(selectedIds) {
  selectedIds = selectedIds || [];
  const html = allMaterials().map(m => `
    <label class="material-opt ${selectedIds.includes(m.id) ? "checked" : ""}">
      <input type="checkbox" value="${m.id}" ${selectedIds.includes(m.id) ? "checked" : ""}>
      <span>${m.icon}</span>
      <span>${escapeHTML(m.label)}</span>
    </label>`).join("");
  ["#fMaterialList", "#efMaterialList"].forEach(sel => {
    const el = $(sel);
    if (el) el.innerHTML = html;
  });
}

function selectedMaterials(containerId) {
  return Array.from($$(containerId + " input:checked")).map(cb => cb.value);
}

// ---------- Statistiques du tableau de bord ----------
function renderStats() {
  const all = state.onboardings.filter(o => (o.cycle || "onboarding") === state.currentCycle);
  const paused = all.filter(o => isPaused(o)).length;
  const closed = all.filter(o => isClosed(o)).length;
  const blockedIds = new Set();
  all.forEach(o => { if (openBlockers(o).length) blockedIds.add(o.id); });
  const isOut = state.currentCycle === "outboarding";
  const stats = [
    { icon: isOut ? "📤" : "📋", label: isOut ? "Outboardings" : "Dossiers",  value: all.length, cls: "", ic: "ic-total" },
    { icon: "🔄", label: "En cours",  value: Math.max(0, all.length - paused - closed), cls: "", ic: "ic-active" },
    { icon: "⏸", label: "En pause",  value: paused, cls: "warn", ic: "ic-paused" },
    { icon: "⚠️", label: "Bloqués",  value: blockedIds.size, cls: "danger", ic: "ic-blocked" }
  ];
  $("#dashStats").innerHTML = stats.map(s => `
    <div class="stat-card ${s.cls}">
      <div class="stat-icon ${s.ic}">${s.icon}</div>
      <div>
        <div class="stat-value">${s.value}</div>
        <div class="stat-label">${s.label}</div>
      </div>
    </div>`).join("");
}

// ---------- Kanban ----------
function renderKanban() {
  renderStats();
  const kanban = $("#kanban");
  const steps = getStepsForCycle(state.currentCycle);
  const cycleItems = state.onboardings.filter(o => (o.cycle || "onboarding") === state.currentCycle);
  kanban.innerHTML = steps.map(step => {
    const cards = cycleItems
      .filter(o => o.step === step.id)
      .map(o => kanbanCard(o))
      .join("");
  return `
    <div class="kanban-col" data-step="${step.id}">
      <div class="kanban-col-header" style="color:${step.color};border-top:3px solid ${step.color}">
        <span>${step.icon}</span>
        <span>${step.label}</span>
        <span class="count">${cycleItems.filter(o => o.step === step.id).length}</span>
      </div>
        <div class="kanban-cards">
          ${cards || '<div class="empty-state" style="padding:20px">Aucun dossier</div>'}
        </div>
      </div>`;
  }).join("");
}

function kanbanCard(o) {
  const progress = stepProgress(o.step);
  const prio = o.priority || "normale";
  const paused = isPaused(o);
  const nBlock = openBlockers(o).length;
  const step = getStep(o.step);
  const isOut = o.cycle === "outboarding";
  const badges = [
    paused ? `<span class="badge badge-pause">⏸ ${getFlowStatus("en_pause").label}</span>` : "",
    nBlock ? `<span class="badge badge-block">⚠ ${nBlock} blocage${nBlock > 1 ? "s" : ""}</span>` : ""
  ].filter(Boolean).join("");
  const dateLabel = isOut ? formatDate(o.departure_date) : formatDate(o.start_date);
  const dateIcon = isOut ? "📅" : "📅";
  return `
    <div class="card pri-${prio} ${paused ? "paused" : ""} ${nBlock ? "blocked" : ""}" data-id="${o.id}">
      ${badges ? `<div class="card-badges">${badges}</div>` : ""}
      <h4>${escapeHTML(o.candidate_first_name)} ${escapeHTML(o.candidate_last_name)}</h4>
      <div class="card-meta">
        <span>💼 ${escapeHTML(o.position)}</span>
        <span class="sep">·</span>
        <span>${dateIcon} ${dateLabel}</span>
      </div>
      <div class="progress-bar"><div style="width:${progress}%;background:${progressColor(progress)}"></div></div>
      <div class="card-footer">
        <span class="card-step">${step.icon} ${step.label}</span>
        <span class="card-open">Ouvrir →</span>
      </div>
    </div>`;
}

// Ouverture d'un dossier depuis le tableau de bord (délégation de clic)
function setupKanban() {
  $("#kanban").addEventListener("click", (e) => {
    const card = e.target.closest(".card[data-id]");
    if (card) openDetail(card.dataset.id);
  });
}

// ---------- Liste ----------
function renderTable() {
  const tbody = $("#tableBody");
  const search = ($("#searchInput").value || "").toLowerCase().trim();
  const filter = $("#filterStep").value;
  const role = state.profile && state.profile.role;
  const canEdit = role === "RH"; // Seul RH modifie / supprime les dossiers
  const isOut = state.currentCycle === "outboarding";
  const dateColHeader = $("#dateColHeader");
  if (dateColHeader) dateColHeader.textContent = isOut ? "Date de départ" : "Date d'intégration";
  const listTitle = $("#listTitle");
  const listSubtitle = $("#listSubtitle");
  if (listTitle) listTitle.textContent = isOut ? "Dossiers d'outboarding" : "Dossiers de recrutement";
  if (listSubtitle) listSubtitle.textContent = isOut ? "Tous les dossiers de départ" : "Tous les dossiers d'onboarding";

  const rows = state.onboardings
    .filter(o => {
      if ((o.cycle || "onboarding") !== state.currentCycle) return false;
      const okFilter = !filter || o.step === filter;
      const hay = `${o.candidate_first_name} ${o.candidate_last_name} ${o.position} ${o.department}`.toLowerCase();
      return okFilter && (!search || hay.includes(search));
    })
    .map(o => {
      const step = getStep(o.step);
      const tasks = state.tasks[o.id] || [];
      const doneTasks = tasks.filter(t => t.done).length;
      const progress = tasks.length ? Math.round((doneTasks / tasks.length) * 100) : stepProgress(o.step);
      const prio = o.priority || "normale";
      const nBlock = openBlockers(o).length;
      const statusPill = isPaused(o) ? `<span class="pill pill-pause">⏸ En pause</span>`
        : isClosed(o) ? `<span class="pill pill-closed">✅ Clôturé</span>`
        : nBlock ? `<span class="pill pill-blocked">⚠️ ${nBlock} blocage${nBlock > 1 ? "s" : ""}</span>`
        : `<span class="pill pill-running">🔄 En cours</span>`;
      const dateDisplay = isOut ? formatDate(o.departure_date) : formatDate(o.start_date);
      return `
        <tr data-id="${o.id}">
          <td>
            <div class="cell-main">${escapeHTML(o.candidate_first_name)} ${escapeHTML(o.candidate_last_name)}</div>
            <div class="cell-sub">${escapeHTML(o.candidate_email)}</div>
          </td>
          <td>${escapeHTML(o.position)}</td>
          <td>${escapeHTML(o.department)}</td>
          <td>${dateDisplay}</td>
          <td><span class="pill pill-step" style="background:${step.color}">${step.icon} ${step.label}</span></td>
          <td>${statusPill}</td>
          <td><span class="pill pill-pri-${prio}">${prio}</span></td>
          <td style="min-width:130px">
            <div class="progress-wrap">
              <div class="progress-bar"><div style="width:${progress}%;background:${progressColor(progress)}"></div></div>
              <span class="progress-text">${progress}%</span>
            </div>
          </td>
          <td>
            <div class="row-actions">
              <button class="btn btn-primary btn-sm row-open">Ouvrir</button>
              ${canEdit ? `<button class="btn btn-ghost btn-sm row-edit" title="Modifier">✏️</button>` : ""}
              ${canEdit ? `<button class="btn btn-danger btn-sm row-delete" title="Supprimer">🗑</button>` : ""}
            </div>
          </td>
        </tr>`;
    }).join("");

  tbody.innerHTML = rows || `<tr><td colspan="9"><div class="empty-state">Aucun dossier trouvé</div></td></tr>`;
}

function setupListTools() {
  $("#searchInput").addEventListener("input", renderTable);
  $("#filterStep").addEventListener("change", renderTable);
  $("#tableBody").addEventListener("click", (e) => {
    const btnDelete = e.target.closest(".row-delete");
    const btnEdit = e.target.closest(".row-edit");
    const tr = e.target.closest("tr[data-id]");
    if (!tr) return;
    const o = state.onboardings.find(x => x.id === tr.dataset.id);
    if (!o) return;
    if (btnDelete) {
      e.stopPropagation();
      btnDelete.disabled = true;
      btnDelete.textContent = "…";
      deleteOnboarding(o).finally(() => {
        btnDelete.disabled = false;
        btnDelete.textContent = "🗑";
      });
      return;
    }
    if (btnEdit) {
      e.stopPropagation();
      openEditModal(o);
      return;
    }
    openDetail(tr.dataset.id);
  });
  $("#exportExcelBtn").addEventListener("click", exportExcel);
  $("#exportPdfBtn").addEventListener("click", exportPdf);
}

// ---------- Export Excel ----------
function exportExcel() {
  if (typeof XLSX === "undefined") {
    toast("La bibliothèque Excel n'est pas chargée (connexion Internet requise).", "error");
    return;
  }
  const rows = state.onboardings.filter(o => (o.cycle || "onboarding") === state.currentCycle).map(o => {
    const blockers = openBlockers(o);
    const isOut = o.cycle === "outboarding";
    return {
      "Candidat": `${o.candidate_first_name} ${o.candidate_last_name}`,
      "Email": o.candidate_email,
      "Poste": o.position,
      "Département": o.department,
      "Manager": o.manager_name,
      [isOut ? "Date de départ" : "Date d'intégration"]: isOut ? o.departure_date : o.start_date,
      "Cycle": isOut ? "Outboarding" : "Onboarding",
      "Étape": getStep(o.step).label,
      "Statut": isPaused(o) ? "En pause" : isClosed(o) ? "Clôturé" : blockers.length ? "Bloqué" : "En cours",
      "Blocages": blockers.map(b => getBlockerType(b.type).label).join(", "),
      "Matériel": materialLabels(o.material).join(", "),
      "Priorité": o.priority,
      "Contact RH": o.hr_contact,
      "Créé le": String(o.created_at).slice(0, 10)
    };
  });
  const ws = XLSX.utils.json_to_sheet(rows);
  const isOut = state.currentCycle === "outboarding";
  const sheetName = isOut ? "Outboardings" : "Recrutements";
  const fileName = isOut ? "Outboardings" : "OnboardIT";
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, sheetName);
  XLSX.writeFile(wb, `${fileName}_${new Date().toISOString().slice(0, 10)}.xlsx`);
  toast("Export Excel téléchargé", "success");
}

// ---------- Export PDF (tous les dossiers) ----------
function exportPdf() {
  if (typeof window.jspdf === "undefined" || !window.jspdf.jsPDF) {
    toast("La bibliothèque PDF n'est pas chargée (connexion Internet requise).", "error");
    return;
  }
  const { jsPDF } = window.jspdf;
  const doc = new jsPDF({ orientation: "landscape" });
  const isOut = state.currentCycle === "outboarding";
  const items = state.onboardings.filter(o => (o.cycle || "onboarding") === state.currentCycle);
  doc.setFontSize(16);
  doc.text(isOut ? "OnboardIT - Suivi des outboardings" : "OnboardIT - Suivi des recrutements", 14, 16);
  doc.setFontSize(10);
  doc.setTextColor(100);
  doc.text(`Généré le ${new Date().toLocaleDateString("fr-FR")} - ${items.length} dossier(s)`, 14, 22);
  doc.setTextColor(0);

  const dateHeader = isOut ? "Départ" : "Intégration";
  const body = items.map(o => [
    `${o.candidate_first_name} ${o.candidate_last_name}`,
    o.position,
    o.department || "",
    isOut ? (o.departure_date || "") : (o.start_date || ""),
    getStep(o.step).label,
    isPaused(o) ? "En pause" : isClosed(o) ? "Clôturé" : openBlockers(o).length ? "Bloqué" : "En cours",
    o.priority || "normale"
  ]);
  doc.autoTable({
    head: [["Candidat", "Poste", "Département", dateHeader, "Étape", "Statut", "Priorité"]],
    body,
    startY: 28,
    styles: { fontSize: 8 },
    headStyles: { fillColor: [37, 99, 235] }
  });
  const fileName = isOut ? "Outboardings" : "OnboardIT";
  doc.save(`${fileName}_${new Date().toISOString().slice(0, 10)}.pdf`);
  toast("Export PDF téléchargé", "success");
}

// ---------- Export PDF (un dossier) ----------
function exportSinglePdf(o) {
  if (typeof window.jspdf === "undefined" || !window.jspdf.jsPDF) {
    toast("La bibliothèque PDF n'est pas chargée (connexion Internet requise).", "error");
    return;
  }
  const { jsPDF } = window.jspdf;
  const doc = new jsPDF();
  const name = `${o.candidate_first_name} ${o.candidate_last_name}`;
  const isOut = o.cycle === "outboarding";
  const steps = getStepsForOnboarding(o);

  doc.setFontSize(16);
  doc.text(isOut ? "OnboardIT - Dossier d'outboarding" : "OnboardIT - Dossier d'intégration", 14, 16);
  doc.setFontSize(10);
  doc.setTextColor(100);
  doc.text(`Généré le ${new Date().toLocaleDateString("fr-FR")}`, 14, 22);
  doc.setTextColor(0);

  doc.setFontSize(13);
  doc.text(name, 14, 34);
  doc.setFontSize(10);
  doc.text(`Poste : ${o.position}`, 14, 41);
  if (o.department) doc.text(`Département : ${o.department}`, 14, 46);
  if (o.manager_name) doc.text(`Manager : ${o.manager_name}`, 14, 51);
  doc.text(`Email : ${o.candidate_email}`, 14, 56);
  if (isOut) {
    doc.text(`Date de départ : ${formatDate(o.departure_date)}`, 14, 61);
    if (o.departure_reason) doc.text(`Raison du départ : ${o.departure_reason}`, 14, 66);
  } else {
    doc.text(`Date d'intégration : ${formatDate(o.start_date)}`, 14, 61);
  }
  doc.text(`Priorité : ${o.priority || "normale"}`, 14, 71);
  doc.text(`Matériel : ${o.material ? materialLabels(o.material).join(", ") : "—"}`, 14, 76);
  const fs = getFlowStatus(isPaused(o) ? "en_pause" : isClosed(o) ? "cloture" : "en_cours");
  doc.text(`Statut : ${fs.icon} ${fs.label}${isPaused(o) && o.pause_reason ? " - " + o.pause_reason : ""}`, 14, 81);

  let y = 89;
  doc.setFontSize(12);
  doc.text("Étapes du flux", 14, y);
  y += 5;
  const stepRows = steps.map(s => {
    const idx = steps.findIndex(x => x.id === o.step);
    const status = s.id === o.step ? "En cours" : (steps.indexOf(s) < idx ? "Terminée" : "À venir");
    return [s.label, status];
  });
  doc.autoTable({
    head: [["Étape", "Statut"]],
    body: stepRows,
    startY: y + 3,
    styles: { fontSize: 8 },
    headStyles: { fillColor: [37, 99, 235] }
  });

  y = doc.lastAutoTable.finalY + 12;
  doc.setFontSize(12);
  doc.text("Tâches", 14, y);
  const tasks = state.tasks[o.id] || [];
  const taskRows = tasks.map(t => [t.title, getStep(t.step).label, t.assignee_role || "IT", t.done ? "Oui" : "Non"]);
  doc.autoTable({
    head: [["Tâche", "Étape", "Responsable", "Fait"]],
    body: taskRows,
    startY: y + 3,
    styles: { fontSize: 8 },
    headStyles: { fillColor: [37, 99, 235] }
  });

  // Blocages / incidents
  const blockers = state.blockers[o.id] || [];
  if (blockers.length) {
    y = doc.lastAutoTable.finalY + 12;
    doc.setFontSize(12);
    doc.text("Blocages & incidents", 14, y);
    const blockerRows = blockers.map(b => [
      getBlockerType(b.type).label,
      b.step ? getStep(b.step).label : "Tout le flux",
      b.status === "open" ? "Ouvert" : "Résolu",
      b.description || ""
    ]);
    doc.autoTable({
      head: [["Type", "Étape", "Statut", "Description"]],
      body: blockerRows,
      startY: y + 3,
      styles: { fontSize: 8 },
      headStyles: { fillColor: [220, 38, 38] }
    });
  }

  doc.save(`OnboardIT_${name.replace(/\s+/g, "_")}_${new Date().toISOString().slice(0, 10)}.pdf`);
  toast("Export PDF téléchargé", "success");
}

// ---------- Modal création ----------
function setupCreateModal() {
  const modal = $("#createModal");
  $("#openCreateModal").addEventListener("click", () => {
    if (state.profile && state.profile.role !== "RH") return;
    $("#createForm").reset();
    populateMaterialLists();
    populateDepartureReasons();
    populateLinkedOnboardings();
    toggleOutboardFields();
    $("#createError").classList.add("hidden");
    modal.classList.remove("hidden");
  });
  $$("[data-close-modal]").forEach(el => {
    el.addEventListener("click", () => {
      modal.classList.add("hidden");
      $("#detailModal").classList.add("hidden");
    });
  });
  // Afficher / masquer les champs outboarding selon le cycle sélectionné
  const fCycle = $("#fCycle");
  if (fCycle) fCycle.addEventListener("change", toggleOutboardFields);

  $("#createForm").addEventListener("submit", async (e) => {
    e.preventDefault();
    const err = $("#createError");
    err.classList.add("hidden");
    const cycle = ($("#fCycle").value || "onboarding");
    const payload = {
      candidate_first_name: $("#fFirstName").value.trim(),
      candidate_last_name: $("#fLastName").value.trim(),
      candidate_email: $("#fEmail").value.trim(),
      position: $("#fPosition").value.trim(),
      department: $("#fDepartment").value.trim(),
      priority: $("#fPriority").value,
      manager_name: $("#fManager").value.trim(),
      material: selectedMaterials("#fMaterialList").join(","),
      hr_contact: state.profile.full_name,
      cycle
    };
    if (cycle === "outboarding") {
      payload.departure_date = $("#fDepartureDate").value || null;
      payload.departure_reason = ($("#fDepartureReason").value || "").trim();
      const linked = $("#fLinkedOnboarding").value;
      if (linked) payload.linked_onboarding_id = linked;
    } else {
      payload.start_date = $("#fStartDate").value || null;
    }
    try {
      const onboarding = await api.createOnboarding(payload);
      // Crée les tâches types de chaque étape selon le cycle
      const taskDefs = getTasksForCycle(cycle);
      const taskList = [];
      for (const stepId of Object.keys(taskDefs)) {
        taskDefs[stepId].forEach(t => {
          taskList.push({
            onboarding_id: onboarding.id,
            step: stepId,
            title: t.title,
            assignee_role: t.assignee_role
          });
        });
      }
      await api.createTasks(taskList);
      modal.classList.add("hidden");
      const msg = cycle === "outboarding"
        ? "Dossier d'outboarding créé. L'équipe est notifiée du départ."
        : "Dossier créé. L'équipe IT est notifiée du besoin.";
      toast(msg, "success");
      await loadAll();
      renderKanban();
    } catch (error) {
      err.textContent = error.message || "Erreur lors de la création.";
      err.classList.remove("hidden");
    }
  });
}

function toggleOutboardFields() {
  const isOut = ($("#fCycle").value || "onboarding") === "outboarding";
  const el = $(".outboard-fields");
  if (el) el.classList.toggle("hidden", !isOut);
  const startField = $("#fStartDateField");
  if (startField) startField.classList.toggle("hidden", isOut);
}

function populateDepartureReasons() {
  const sel = $("#fDepartureReason");
  if (!sel) return;
  sel.innerHTML = '<option value="">— Choisir —</option>' +
    DEPARTURE_REASONS.map(r => `<option value="${escapeHTML(r)}">${escapeHTML(r)}</option>`).join("");
}

function populateLinkedOnboardings() {
  const sel = $("#fLinkedOnboarding");
  if (!sel) return;
  const opts = ['<option value="">— Aucun lien —</option>']
    .concat(state.onboardings
      .filter(o => (o.cycle || "onboarding") === "onboarding")
      .map(o => `<option value="${o.id}">${escapeHTML(o.candidate_first_name)} ${escapeHTML(o.candidate_last_name)} — ${escapeHTML(o.position)}</option>`)
    ).join("");
  sel.innerHTML = opts;
}

// ---------- Modal modification ----------
function openEditModal(o) {
  $("#editModal").classList.remove("hidden");
  $("#editTitle").textContent = `Modifier le dossier : ${o.candidate_first_name} ${o.candidate_last_name}`;
  $("#efFirstName").value = o.candidate_first_name || "";
  $("#efLastName").value = o.candidate_last_name || "";
  $("#efEmail").value = o.candidate_email || "";
  $("#efPosition").value = o.position || "";
  populateDepartmentSelects();
  populateMaterialLists(materialFromDb(o.material));
  $("#efDepartment").value = o.department || "";
  $("#efStartDate").value = o.start_date ? String(o.start_date).slice(0, 10) : "";
  $("#efPriority").value = o.priority || "normale";
  $("#efManager").value = o.manager_name || "";
  $("#efNotes").value = o.notes || "";
  $("#editError").classList.add("hidden");
}

function setupEditModal() {
  const modal = $("#editModal");
  $$("[data-close-edit]").forEach(el => el.addEventListener("click", () => modal.classList.add("hidden")));
  $("#editForm").addEventListener("submit", async (e) => {
    e.preventDefault();
    const err = $("#editError");
    err.classList.add("hidden");
    const o = state.onboardings.find(x => x.id === state.detailOnboardingId);
    if (!o) return;
    const payload = {
      candidate_first_name: $("#efFirstName").value.trim(),
      candidate_last_name: $("#efLastName").value.trim(),
      candidate_email: $("#efEmail").value.trim(),
      position: $("#efPosition").value.trim(),
      department: $("#efDepartment").value.trim(),
      start_date: $("#efStartDate").value || null,
      priority: $("#efPriority").value,
      manager_name: $("#efManager").value.trim(),
      notes: $("#efNotes").value.trim(),
      material: selectedMaterials("#efMaterialList").join(",")
    };
    try {
      await api.updateOnboarding(o.id, payload);
      modal.classList.add("hidden");
      toast("Dossier modifié.", "success");
      await loadAll();
      renderDetail();
      renderKanban();
      if (state.currentView === "list") renderTable();
    } catch (error) {
      err.textContent = error.message || "Erreur lors de la modification.";
      err.classList.remove("hidden");
    }
  });
}

// ---------- Modal détail ----------
function openDetail(id) {
  state.detailOnboardingId = id;
  $("#detailModal").classList.remove("hidden");
  renderDetail();
}

async function renderDetail() {
  const o = state.onboardings.find(x => x.id === state.detailOnboardingId);
  if (!o) return;
  const cycle = o.cycle || "onboarding";
  const steps = getStepsForCycle(cycle);
  const step = getStep(o.step);
  const role = state.profile && state.profile.role;
  const isIT = role === "IT";
  const isRH = role === "RH";
  const canAdvanceStep = isIT;                 // IT seul fait avancer le flux (sauf la clôture)
  const canClose = isRH;                       // RH seul clôture le dossier
  const canManageBlocker = isIT || isRH;       // IT / RH : gérer les blocages
  const canPauseResume = isRH;                 // RH seul : suspendre / reprendre le flux
  const canEdit = isRH;                        // RH seul : modifier le dossier
  const canDelete = isRH;                      // RH seul : supprimer le dossier

  const isOut = cycle === "outboarding";
  $("#detailTitle").textContent = `${isOut ? "Outboarding" : "Dossier"} : ${o.candidate_first_name} ${o.candidate_last_name}`;

  const currentIdx = steps.findIndex(s => s.id === o.step);
  const closed = isClosed(o);
  const paused = isPaused(o);
  const validated = stepValidated(o);
  const lastStepId = steps[steps.length - 1].id;
  const isClotureStep = steps[steps.length - 1].id === o.step;
  const stepNav = steps.map((s, idx) => {
    const isCurrent = s.id === o.step;
    const isPast = idx < currentIdx;
    const isNext = idx === currentIdx + 1;
    const isLastStep = idx === steps.length - 1;
    // Pas d'avancement tant que le flux est en pause ou que les tâches de
    // l'étape courante ne sont pas toutes validées. IT avance les étapes,
    // RH est le SEUL à clôturer le dossier.
    const canClick = !closed && !paused && validated && (isLastStep
      ? (canClose && currentIdx === steps.length - 2)
      : (canAdvanceStep && isNext));
    const cls = isCurrent ? "current" : isPast ? "done" : (isLastStep ? "closed" : "");
    return `<button class="step-btn ${cls} ${canClick ? "clickable" : ""}" data-step-target="${s.id}" ${canClick ? "" : "disabled"} title="${validated ? "" : "Validez toutes les tâches de l'étape courante avant d'avancer"}">
      ${s.icon} ${s.label}</button>`;
  }).join("");

  // Bouton de confirmation pour passer à l'étape suivante une fois les
  // tâches de l'étape courante toutes validées (IT), ou pour clôturer (RH).
  const nextStep = currentIdx < steps.length - 1 ? steps[currentIdx + 1] : null;
  const canGoNext = !!nextStep && !closed && !paused && (nextStep.id === lastStepId ? canClose : canAdvanceStep);

  // Le volet "Besoin RH" est réservé au RH (onboarding) ; le volet
  // "Déclaration du départ" est réservé au RH (outboarding).
  const firstStepId = steps[0].id;
  const stepLocked = o.step === firstStepId && role !== "RH";

  const tasksForStep = (state.tasks[o.id] || []).filter(t => t.step === o.step);
  const taskHtml = tasksForStep.length
    ? tasksForStep.map(t => taskItemHtml(t, role)).join("")
    : `<div class="empty-state">Aucune tâche pour cette étape</div>`;

  const flowStatus = getFlowStatus(paused ? "en_pause" : closed ? "cloture" : "en_cours");

  // Champs détail grid adaptés au cycle
  const detailGridFields = isOut
    ? `<div><div class="dg-label">Email</div><div class="dg-value">${escapeHTML(o.candidate_email)}</div></div>
       <div><div class="dg-label">Date de départ</div><div class="dg-value">${formatDate(o.departure_date)}</div></div>
       <div><div class="dg-label">Raison du départ</div><div class="dg-value">${escapeHTML(o.departure_reason) || "—"}</div></div>
       <div><div class="dg-label">Manager</div><div class="dg-value">${escapeHTML(o.manager_name) || "—"}</div></div>
       <div><div class="dg-label">Priorité</div><div class="dg-value"><span class="pill pill-pri-${o.priority || "normale"}">${o.priority || "normale"}</span></div></div>
       <div><div class="dg-label">Contact RH</div><div class="dg-value">${escapeHTML(o.hr_contact) || "—"}</div></div>
       ${o.linked_onboarding_id ? `<div><div class="dg-label">Dossier lié</div><div class="dg-value">🔗 ${(() => { const lo = state.onboardings.find(x => x.id === o.linked_onboarding_id); return lo ? escapeHTML(lo.candidate_first_name) + " " + escapeHTML(lo.candidate_last_name) : "—"; })()}</div></div>` : ""}
       <div><div class="dg-label">Créé le</div><div class="dg-value">${formatDate(String(o.created_at).slice(0, 10))}</div></div>`
    : `<div><div class="dg-label">Email</div><div class="dg-value">${escapeHTML(o.candidate_email)}</div></div>
       <div><div class="dg-label">Date d'intégration</div><div class="dg-value">${formatDate(o.start_date)}</div></div>
       <div><div class="dg-label">Manager</div><div class="dg-value">${escapeHTML(o.manager_name) || "—"}</div></div>
       <div><div class="dg-label">Priorité</div><div class="dg-value"><span class="pill pill-pri-${o.priority || "normale"}">${o.priority || "normale"}</span></div></div>
       <div><div class="dg-label">Contact RH</div><div class="dg-value">${escapeHTML(o.hr_contact) || "—"}</div></div>
       <div><div class="dg-label">Créé le</div><div class="dg-value">${formatDate(String(o.created_at).slice(0, 10))}</div></div>`;

  $("#detailContent").innerHTML = `
    <div class="detail-top">
      <div class="detail-avatar">${initials(o.candidate_first_name + " " + o.candidate_last_name)}</div>
      <div>
        <h3>${escapeHTML(o.candidate_first_name)} ${escapeHTML(o.candidate_last_name)}</h3>
        <div class="detail-sub">${escapeHTML(o.position)} ${o.department ? "· " + escapeHTML(o.department) : ""} ${isOut ? "· 📤 Outboarding" : ""}</div>
      </div>
      <div style="margin-left:auto;display:flex;align-items:center;gap:10px;flex-wrap:wrap">
        <button class="btn btn-ghost btn-sm" id="detailExportPdfBtn">📄 Exporter PDF</button>
        ${canEdit ? `<button class="btn btn-ghost btn-sm" id="editOnboardingBtn">✏️ Modifier</button>` : ""}
        ${canDelete ? `<button class="btn btn-danger btn-sm" id="deleteOnboardingBtn">🗑 Supprimer</button>` : ""}
        ${canPauseResume && !closed ? (paused
          ? `<button class="btn btn-primary btn-sm" id="resumeFlowBtn">▶ Reprendre</button>`
          : `<button class="btn btn-ghost btn-sm" id="pauseFlowBtn">⏸ Suspendre</button>`) : ""}
        <span class="pill" style="background:${flowStatus.color};color:#fff">${flowStatus.icon} ${flowStatus.label}</span>
        <span class="pill pill-step" style="background:${step.color}">${step.icon} ${step.label}</span>
      </div>
    </div>

    ${paused ? `
      <div class="pause-banner">
        <strong>⏸ Flux suspendu</strong>
        <span>${escapeHTML(o.pause_reason || "Aucun motif précisé.")}</span>
      </div>` : ""}

    <div class="detail-grid">
      ${detailGridFields}
    </div>

    <div class="tasks-section">
      <h4>📦 Matériel nécessaire</h4>
      <div class="material-chips">${materialChips(o.material)}</div>
    </div>

    ${o.notes ? `<div style="background:#fffbeb;border:1px solid #fde68a;border-radius:10px;padding:12px;margin-bottom:16px">
      <strong style="font-size:12px;color:#92400e">📝 Notes :</strong><div style="font-size:13px;margin-top:4px">${escapeHTML(o.notes)}</div>
    </div>` : ""}

    <div class="step-nav">${stepNav}</div>

      <div class="tasks-section ${stepLocked ? "step-locked" : ""}">
      <h4>${step.icon} Tâches - ${step.label} ${stepLocked ? `<span class="pill pill-rh" style="float:right">🔒 Réservé au RH</span>` : ""}</h4>
      <div id="stepTasks">${taskHtml}</div>
      ${!stepLocked && !closed && role !== "ADMIN" ? `
        <form class="task-form" id="addTaskForm">
          <input type="text" id="addTaskInput" placeholder="Ajouter une tâche pour cette étape (assignée à ${role})...">
          <button class="btn btn-primary btn-sm" type="submit">Ajouter</button>
        </form>` : ""}
    </div>

    ${canGoNext ? `
      <div class="advance-row">
        <button class="btn btn-primary advance-step" id="advanceStepBtn" ${validated ? "" : "disabled"}>
          ${nextStep.id === lastStepId ? "✅ Clôturer le dossier" : `➡️ Passer à l'étape suivante : ${nextStep.label}`}
        </button>
        ${!validated ? `<div class="advance-hint">⚠️ Validez toutes les tâches de cette étape pour débloquer le passage à l'étape suivante.</div>` : ""}
      </div>` : ""}

    ${blockersSectionHtml(o, canManageBlocker)}

    <div class="tasks-section">
      <h4>📎 Documents du dossier</h4>
      <div id="docList">Chargement...</div>
      <form class="task-form" id="uploadForm">
        <input type="file" id="fileInput" multiple>
        <button class="btn btn-primary btn-sm" type="submit">Ajouter</button>
      </form>
    </div>`;

  // Événements
  const exportPdfBtn = $("#detailExportPdfBtn");
  if (exportPdfBtn) exportPdfBtn.addEventListener("click", () => exportSinglePdf(o));

  // Modifier (RH)
  const editBtn = $("#editOnboardingBtn");
  if (editBtn) editBtn.addEventListener("click", () => openEditModal(o));

  // Supprimer (RH seul) : irréversible, supprime aussi tâches / documents / blocages
  const deleteBtn = $("#deleteOnboardingBtn");
  if (deleteBtn) {
    deleteBtn.addEventListener("click", async () => {
      const btn = deleteBtn;
      btn.disabled = true;
      btn.textContent = "Suppression...";
      try {
        const ok = await deleteOnboarding(o);
        if (!ok) {
          btn.disabled = false;
          btn.textContent = "🗑 Supprimer";
        }
      } catch (_) {
        btn.disabled = false;
        btn.textContent = "🗑 Supprimer";
      }
    });
  }
  setupUploadForm();
  loadDocuments(o);
  $$(".step-btn.clickable").forEach(btn => {
    btn.addEventListener("click", () => moveStep(o, btn.dataset.stepTarget));
  });
  const advanceBtn = $("#advanceStepBtn");
  if (advanceBtn) {
    advanceBtn.addEventListener("click", () => moveStep(o, nextStep.id));
  }
  $$(".task-checkbox").forEach(cb => {
    cb.addEventListener("change", async () => {
      const task = state.tasks[o.id].find(t => t.id === cb.dataset.taskId);
      if (!task) return;
      // Confirmation demandée avant de valider une tâche
      if (cb.checked && !confirm("Avez-vous terminé la tâche ?")) {
        cb.checked = false;
        return;
      }
      try {
        await api.updateTask(task.id, { done: cb.checked });
        task.done = cb.checked;
        renderDetail();
      } catch (error) {
        toast(error.message || "Erreur", "error");
      }
    });
  });
  $$(".task-delete").forEach(btn => {
    btn.addEventListener("click", async () => {
      if (!confirm("Supprimer cette tâche ?")) return;
      try {
        await api.deleteTask(btn.dataset.taskId);
        state.tasks[o.id] = state.tasks[o.id].filter(t => t.id !== btn.dataset.taskId);
        renderDetail();
        toast("Tâche supprimée", "success");
      } catch (error) {
        toast(error.message || "Erreur", "error");
      }
    });
  });
  const addForm = $("#addTaskForm");
  if (addForm) {
    addForm.addEventListener("submit", async (e) => {
      e.preventDefault();
      const title = $("#addTaskInput").value.trim();
      if (!title) return;
      try {
        await api.createTasks([{
          onboarding_id: o.id,
          step: o.step,
          title,
          assignee_role: role
        }]);
        $("#addTaskInput").value = "";
        await refreshTasks(o.id);
        renderDetail();
        toast("Tâche ajoutée", "success");
      } catch (error) {
        toast(error.message || "Erreur", "error");
      }
    });
  }

  // Suspendre / reprendre le flux
  const pauseBtn = $("#pauseFlowBtn");
  if (pauseBtn) {
    pauseBtn.addEventListener("click", async () => {
      const reason = prompt("Motif de la suspension du flux (ex : employé absent le jour J, matériel en attente d'achat) :", "");
      if (reason === null) return;
      try {
        await api.updateOnboarding(o.id, { flow_status: "en_pause", pause_reason: reason.trim() });
        toast("Flux suspendu. Reprenez-le dès que le blocage est levé.", "success");
        await loadAll();
        renderDetail();
        renderKanban();
      } catch (error) {
        toast(error.message || "Impossible de suspendre le flux.", "error");
      }
    });
  }
  const resumeBtn = $("#resumeFlowBtn");
  if (resumeBtn) {
    resumeBtn.addEventListener("click", async () => {
      if (!confirm("Reprendre le flux ? Le dossier redeviendra actif.")) return;
      try {
        await api.updateOnboarding(o.id, { flow_status: "en_cours", pause_reason: "" });
        toast("Flux repris.", "success");
        await loadAll();
        renderDetail();
        renderKanban();
      } catch (error) {
        toast(error.message || "Impossible de reprendre le flux.", "error");
      }
    });
  }

  // Ajout d'un blocage / incident
  const blockerForm = $("#addBlockerForm");
  if (blockerForm) {
    blockerForm.addEventListener("submit", async (e) => {
      e.preventDefault();
      const type = $("#blockerType").value;
      const desc = $("#blockerDesc").value.trim();
      if (!type) {
        toast("Choisissez un type de blocage.", "error");
        return;
      }
      if (!desc) {
        toast("Décrivez le blocage.", "error");
        return;
      }
      try {
        await api.createBlocker({
          onboarding_id: o.id,
          type,
          step: $("#blockerStep").value || null,
          description: desc
        });
        toast("Blocage enregistré. L'équipe est alertée.", "success");
        await loadAll();
        renderDetail();
        renderKanban();
      } catch (error) {
        toast(error.message || "Impossible d'enregistrer le blocage.", "error");
      }
    });
  }

  // Résoudre / supprimer un blocage
  $$(".blocker-resolve").forEach(btn => {
    btn.addEventListener("click", async () => {
      const note = prompt("Note de résolution (optionnel) :", "");
      if (note === null) return;
      try {
        await api.resolveBlocker(btn.dataset.blockerId, note.trim());
        toast("Blocage résolu.", "success");
        await loadAll();
        renderDetail();
        renderKanban();
      } catch (error) {
        toast(error.message || "Impossible de résoudre le blocage.", "error");
      }
    });
  });
  $$(".blocker-delete").forEach(btn => {
    btn.addEventListener("click", async () => {
      if (!confirm("Supprimer ce blocage ?")) return;
      try {
        await api.deleteBlocker(btn.dataset.blockerId);
        toast("Blocage supprimé.", "success");
        await loadAll();
        renderDetail();
        renderKanban();
      } catch (error) {
        toast(error.message || "Impossible de supprimer le blocage.", "error");
      }
    });
  });
}

function taskItemHtml(t, role) {
  const due = t.due_date ? formatDate(t.due_date) : "";
  const overdue = t.due_date && t.due_date < new Date().toISOString().slice(0, 10) && !t.done;
  // Chaque rôle ne gère que SES tâches : cocher / supprimer est réservé
  // au rôle assigné (assignee_role).
  const canManage = role === t.assignee_role;
  return `
    <div class="task-item ${t.done ? "done" : ""}">
      <input type="checkbox" class="task-checkbox" data-task-id="${t.id}" ${t.done ? "checked" : ""} ${canManage ? "" : "disabled"}>
      <div style="flex:1">
        <div class="task-title">${escapeHTML(t.title)}</div>
        ${t.description ? `<div class="task-desc">${escapeHTML(t.description)}</div>` : ""}
        <div class="task-meta">
          <span class="pill ${t.assignee_role === "IT" ? "pill-it" : t.assignee_role === "RH" ? "pill-rh" : "pill-manager"}">${t.assignee_role || "IT"}</span>
          ${due ? `<span class="task-due ${overdue ? "overdue" : ""}">📅 ${due}</span>` : ""}
        </div>
      </div>
      ${canManage ? `<button class="btn btn-danger btn-sm task-delete" data-task-id="${t.id}">✕</button>` : ""}
    </div>`;
}

// ---------- Blocages / incidents ----------
function blockerItemHtml(b, canManage) {
  const t = getBlockerType(b.type);
  const isOpen = b.status === "open";
  const stepLabel = b.step ? getStep(b.step).label : "Tout le flux";
  return `
    <div class="blocker-item ${isOpen ? "open" : "resolved"}">
      <div class="blocker-main">
        <span class="pill ${isOpen ? "pill-blocked" : "pill-closed"}">${t.icon} ${t.label}</span>
        <span class="pill" style="background:#e2e8f0;color:#475569">${b.step ? getStep(b.step).icon + " " : "⚡ "}${stepLabel}</span>
        <span class="blocker-desc">${escapeHTML(b.description) || "—"}</span>
      </div>
      <div class="blocker-meta">
        <span>Ajouté le ${formatDate(String(b.created_at).slice(0, 10))}</span>
        ${isOpen
          ? (canManage
              ? `<button class="btn btn-ghost btn-sm blocker-resolve" data-blocker-id="${b.id}">✓ Résoudre</button>`
              : `<span class="pill pill-blocked">Ouvert</span>`)
          : `<span>Résolu le ${b.resolved_at ? formatDate(String(b.resolved_at).slice(0, 10)) : "—"}${b.resolved_note ? " : " + escapeHTML(b.resolved_note) : ""}</span>`}
        ${canManage ? `<button class="btn btn-danger btn-sm blocker-delete" data-blocker-id="${b.id}">✕</button>` : ""}
      </div>
    </div>`;
}

function blockersSectionHtml(o, canManage) {
  const blockers = state.blockers[o.id] || [];
  const open = blockers.filter(b => b.status === "open");
  const steps = getStepsForOnboarding(o);
  return `
    <div class="tasks-section">
      <h4>📌 Blocages & incidents ${open.length ? `<span class="pill pill-blocked">${open.length} ouvert(s)</span>` : ""}</h4>
      <div id="blockerList">${blockers.length ? blockers.map(b => blockerItemHtml(b, canManage)).join("") : `<div class="empty-state" style="padding:14px">Aucun blocage — le flux se déroule normalement</div>`}</div>
      ${canManage ? `
        <form class="blocker-form" id="addBlockerForm">
          <select id="blockerType">
            <option value="">Type de blocage…</option>
            ${BLOCKER_TYPES.map(t => `<option value="${t.id}">${t.icon} ${t.label}</option>`).join("")}
          </select>
          <select id="blockerStep">
            <option value="">Tout le flux</option>
            ${steps.map(s => `<option value="${s.id}">${s.icon} ${s.label}</option>`).join("")}
          </select>
          <input type="text" id="blockerDesc" placeholder="Ex : PC portable en attente de livraison…">
          <button class="btn btn-primary btn-sm" type="submit">Ajouter</button>
        </form>` : ""}
    </div>`;
}

async function moveStep(o, targetStepId) {
  const role = state.profile && state.profile.role;
  const steps = getStepsForOnboarding(o);
  const lastStepId = steps[steps.length - 1].id;
  const isCloture = targetStepId === lastStepId;
  // La clôture du dossier est réservée au RH ; les autres étapes à l'IT.
  if (isCloture ? role !== "RH" : role !== "IT") {
    toast(isCloture
      ? "Seul le rôle RH peut clôturer le dossier."
      : "Seul le rôle IT peut faire avancer les étapes du flux.", "error");
    return;
  }
  if (isPaused(o)) {
    toast("Impossible d'avancer : le flux est en pause. Reprenez-le d'abord.", "error");
    return;
  }
  const currentLabel = getStep(o.step).label;
  const nextLabel = getStep(targetStepId).label;
  // Validation obligatoire : on ne passe à l'étape suivante que lorsque
  // TOUTES les tâches de l'étape courante sont validées.
  const pending = (state.tasks[o.id] || []).filter(t => t.step === o.step && !t.done);
  if (pending.length) {
    toast(
      `L'étape « ${currentLabel} » n'est pas encore validée : ${pending.length} tâche(s) en attente.\n\n`
      + pending.slice(0, 8).map(t => "   • " + t.title).join("\n")
      + (pending.length > 8 ? "\n   …" : "")
      + `\n\nValidez toutes les tâches avant de passer à « ${nextLabel} ».`,
      "error"
    );
    return;
  }
  // Confirmation du passage d'étape une fois toutes les tâches clôturées
  if (!confirm(`Vous êtes sûr de clôturer l'étape « ${currentLabel} » ? Vous n'avez oublié aucune tâche.`)) return;
  try {
    await api.updateOnboarding(o.id, { step: targetStepId });
    o.step = targetStepId;
    toast(`Étape passée à : ${getStep(targetStepId).label}`, "success");
    renderDetail();
    renderKanban();
  } catch (error) {
    toast(error.message || "Impossible de changer d'étape.", "error");
  }
}

// Suppression partagée (bouton du détail ou ligne de la liste) : retourne
// false si l'utilisateur a annulé la confirmation, sinon true (ou rejette en cas d'erreur).
async function deleteOnboarding(o) {
  const name = `${o.candidate_first_name} ${o.candidate_last_name}`;
  if (!confirm(`Supprimer définitivement le dossier de ${name} ?\n\nCette action est IRREVERSIBLE : les tâches, documents et blocages associés seront aussi supprimés.`)) return false;
  try {
    // Nettoyage best-effort des fichiers uploadés (bucket "documents")
    try {
      const docs = await api.listDocuments(o.id);
      const marker = "object/public/documents/";
      for (const d of docs) {
        const idx = d.file_url.indexOf(marker);
        if (idx !== -1) {
          try { await recruititClient.storage.from("documents").remove([d.file_url.slice(idx + marker.length)]); } catch (_) {}
        }
      }
    } catch (_) {}
    await api.deleteOnboarding(o.id);
    toast("Dossier supprimé.", "success");
    await loadAll();
    renderKanban();
    if (state.currentView === "list") renderTable();
    if (state.detailOnboardingId === o.id) {
      $("#detailModal").classList.add("hidden");
      state.detailOnboardingId = null;
    }
    return true;
  } catch (error) {
    toast(error.message || "Impossible de supprimer le dossier.", "error");
    throw error;
  }
}

async function refreshTasks(onboardingId) {
  const tasks = await api.listTasks(onboardingId);
  state.tasks[onboardingId] = tasks;
}

// ---------- Documents ----------
async function loadDocuments(o) {
  const container = $("#docList");
  try {
    state.documents[o.id] = await api.listDocuments(o.id);
  } catch (error) {
    container.innerHTML = `<div class="empty-state">Impossible de charger les documents</div>`;
    return;
  }
  const docs = state.documents[o.id] || [];
  const canDelete = state.profile && (state.profile.role === "IT" || state.profile.role === "RH");
  if (!docs.length) {
    container.innerHTML = `<div class="empty-state" style="padding:14px">Aucun document</div>`;
  } else {
    container.innerHTML = docs.map(d => {
      const ext = (d.file_type || (d.name.split(".").pop() || "")).toLowerCase();
      const icon = /pdf/.test(ext) ? "📕" : /image|png|jpg|jpeg|gif|webp/.test(ext) ? "🖼️" : /excel|xls|xlsx|csv/.test(ext) ? "📊" : /word|doc|docx/.test(ext) ? "📝" : "📎";
      return `
        <div class="doc-item">
          <span class="doc-icon">${icon}</span>
          <div class="doc-info">
            <div class="doc-name">${escapeHTML(d.name)}</div>
            <div class="doc-date">Ajouté le ${formatDate(String(d.created_at).slice(0, 10))}</div>
          </div>
          <a class="btn btn-ghost btn-sm" href="${escapeHTML(d.file_url)}" target="_blank" rel="noopener">Ouvrir</a>
          ${canDelete ? `<button class="btn btn-danger btn-sm doc-delete" data-doc-id="${d.id}">✕</button>` : ""}
        </div>`;
    }).join("");
    $$(".doc-delete").forEach(btn => {
      btn.addEventListener("click", async () => {
        const doc = state.documents[o.id].find(d => d.id === btn.dataset.docId);
        if (!doc) return;
        if (!confirm(`Supprimer "${doc.name}" ?`)) return;
        try {
          await api.deleteDocument(doc);
          state.documents[o.id] = state.documents[o.id].filter(d => d.id !== doc.id);
          loadDocuments(o);
          toast("Document supprimé", "success");
        } catch (error) {
          toast(error.message || "Erreur lors de la suppression.", "error");
        }
      });
    });
  }
}

function setupUploadForm() {
  const form = $("#uploadForm");
  if (!form) return;
  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    const input = $("#fileInput");
    const files = input.files;
    if (!files || !files.length) return;
    const o = state.onboardings.find(x => x.id === state.detailOnboardingId);
    if (!o) return;
    const btn = form.querySelector("button[type=submit]");
    btn.disabled = true;
    btn.textContent = "Upload...";
    try {
      for (const file of files) {
        await api.uploadDocument(file, o.id);
      }
      input.value = "";
      toast(`${files.length} document(s) ajouté(s)`, "success");
      await loadDocuments(o);
    } catch (error) {
      toast(error.message || "Erreur lors de l'upload.", "error");
    } finally {
      btn.disabled = false;
      btn.textContent = "Ajouter";
    }
  });
}

// ---------- À propos ----------
function renderAbout() {
  $("#aboutSteps").innerHTML = STEPS.map(s => `<li>${s.icon} <strong>${s.label}</strong></li>`).join("");
  const outEl = $("#aboutOutSteps");
  if (outEl) outEl.innerHTML = OUTBOARDING_STEPS.map(s => `<li>${s.icon} <strong>${s.label}</strong></li>`).join("");
}

// ---------- Vue Admin (listes départements / matériel) ----------
function renderAdmin() {
  $("#adminDepartmentsList").innerHTML = adminItemsHtml(state.listItems.department || [], "department");
  $("#adminMaterialsList").innerHTML = adminItemsHtml(state.listItems.material || [], "material");
}

function adminItemsHtml(items, category) {
  if (!items.length) return `<div class="empty-state" style="padding:12px">Aucune valeur ajoutée (liste par défaut utilisée)</div>`;
  return items.map(i => `
    <div class="admin-list-item">
      <span>${escapeHTML(i.value)}</span>
      <button class="btn btn-danger btn-sm admin-remove" data-id="${i.id}" title="Retirer">✕</button>
    </div>`).join("");
}

function setupAdmin() {
  $("#adminAddDeptForm").addEventListener("submit", async (e) => {
    e.preventDefault();
    await addAdminListItem("department", $("#adminDeptInput"));
  });
  $("#adminAddMatForm").addEventListener("submit", async (e) => {
    e.preventDefault();
    await addAdminListItem("material", $("#adminMatInput"));
  });
  $("#adminDepartmentsList").addEventListener("click", onRemoveAdminItem);
  $("#adminMaterialsList").addEventListener("click", onRemoveAdminItem);
}

async function addAdminListItem(category, input) {
  const value = input.value.trim();
  if (!value) {
    toast("Saisissez une valeur.", "error");
    return;
  }
  try {
    await api.createListItem(category, value);
    input.value = "";
    await refreshAdminLists();
    toast("Valeur ajoutée à la liste.", "success");
  } catch (error) {
    toast(error.message || "Impossible d'ajouter la valeur.", "error");
  }
}

async function onRemoveAdminItem(e) {
  const btn = e.target.closest(".admin-remove");
  if (!btn) return;
  if (!confirm("Retirer cette valeur de la liste ?")) return;
  try {
    await api.deleteListItem(btn.dataset.id);
    await refreshAdminLists();
    toast("Valeur retirée de la liste.", "success");
  } catch (error) {
    toast(error.message || "Impossible de retirer la valeur.", "error");
  }
}

async function refreshAdminLists() {
  await loadListItems();
  renderAdmin();
  populateDepartmentSelects();
  populateMaterialLists();
}

// ---------- Realtime ----------
function setupRealtime() {
  api.subscribeOnboardings(async (payload) => {
    await loadAll();
    if (state.currentView === "dashboard") renderKanban();
    if (state.currentView === "list") renderTable();
    if (state.detailOnboardingId) renderDetail();
  });
  api.subscribeTasks(async (payload) => {
    if (state.detailOnboardingId) {
      await refreshTasks(state.detailOnboardingId);
      renderDetail();
    }
  });
  api.subscribeBlockers(async () => {
    await loadAll();
    if (state.currentView === "dashboard") renderKanban();
    if (state.currentView === "list") renderTable();
    if (state.detailOnboardingId) renderDetail();
  });
}

// ---------- Initialisation ----------
async function init() {
  // Garde-fou : si le client Supabase n'est pas initialisé
  // (config manquante ou CDN indisponible), on affiche l'erreur
  // au lieu de rester sur une page blanche.
  if (!recruititClient || !api.getSession) {
    const errEl = $("#initError");
    if (errEl) {
      errEl.textContent = supabaseInitError || "Erreur d'initialisation de l'application.";
      errEl.classList.remove("hidden");
    }
    showAuthView();
    window.__recruititInitDone = true;
    return;
  }

  initAuthTabs();
  setupAuthForms();
  setupNavigation();
  setupRefresh();
  setupListTools();
  setupKanban();
  setupCreateModal();
  setupEditModal();
  setupAdmin();
  setupRealtime();
  renderAbout();
  populateDepartmentSelects();
  populateMaterialLists();

  // Remplit le filtre des étapes (onboarding + outboarding)
  const filterStep = $("#filterStep");
  filterStep.innerHTML = '<option value="">Toutes les étapes</option>';
  [...STEPS, ...OUTBOARDING_STEPS].forEach(s => {
    const opt = document.createElement("option");
    opt.value = s.id;
    opt.textContent = `${s.icon} ${s.label}`;
    filterStep.appendChild(opt);
  });

  api.onAuthChange(async (event, session) => {
    state.session = session;
    if (session) {
      try {
        state.profile = await api.getProfile(session.user.id);
        showAppView();
        renderUserInfo();
        applyRolePermissions();
        await loadAll();
        await loadListItems();
        populateDepartmentSelects();
        populateMaterialLists();
        switchView("dashboard");
      } catch (error) {
        console.error(error);
        const errEl = $("#initError");
        if (errEl) {
          errEl.textContent = "Erreur de chargement du profil : " + (error.message || error);
          errEl.classList.remove("hidden");
        }
        showAuthView();
      }
    } else {
      showAuthView();
    }
  });

  const { data } = await api.getSession();
  if (data && data.session) {
    state.session = data.session;
    state.profile = await api.getProfile(data.session.user.id);
    showAppView();
    renderUserInfo();
    applyRolePermissions();
    await loadAll();
    await loadListItems();
    populateDepartmentSelects();
    populateMaterialLists();
    switchView("dashboard");
  } else {
    // Aucune session active : on affiche TOUJOURS l'écran de connexion.
    showAuthView();
  }
  window.__recruititInitDone = true;
}

document.addEventListener("DOMContentLoaded", init);
