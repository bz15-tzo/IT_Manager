let allTypes = [];
let allLocations = [];
let debounceTimer = null;

document.addEventListener('DOMContentLoaded', async () => {
    try {
        await initAuth();
        if (!requireAuth()) return;
        initNav();
        await initInventory();
    } catch (err) {
        console.error('Init error:', err);
        showToast('Erreur d\'initialisation', 'error');
    }
});

async function initInventory() {
    await Promise.all([loadAssetTypes(), loadLocations()]);
    await loadAssets();
    bindFilterEvents();
    bindModalEvents();
    bindFormEvents();
}

async function loadAssetTypes() {
    try {
        const { data, error } = await sb.from('asset_types').select('*').order('name');
        if (error) throw error;
        allTypes = data || [];
        const filterSelect = document.getElementById('typeFilter');
        const formSelect = document.getElementById('assetType');
        filterSelect.innerHTML = '<option value="">Tous les types</option>';
        formSelect.innerHTML = '';
        allTypes.forEach(t => {
            filterSelect.innerHTML += `<option value="${t.id}">${escapeHtml(t.icon || '')} ${escapeHtml(t.name)}</option>`;
            formSelect.innerHTML += `<option value="${t.id}">${escapeHtml(t.icon || '')} ${escapeHtml(t.name)}</option>`;
        });
    } catch (err) {
        console.error('loadAssetTypes:', err);
    }
}

async function loadLocations() {
    try {
        const { data, error } = await sb.from('asset_locations').select('*').order('name');
        if (error) throw error;
        allLocations = data || [];
        const formSelect = document.getElementById('assetLocation');
        formSelect.innerHTML = '<option value="">Aucun emplacement</option>';
        allLocations.forEach(l => {
            let label = l.name;
            if (l.building) label += ` - ${l.building}`;
            if (l.room) label += ` (${l.room})`;
            formSelect.innerHTML += `<option value="${l.id}">${escapeHtml(label)}</option>`;
        });
    } catch (err) {
        console.error('loadLocations:', err);
    }
}

async function loadAssets(filters = {}) {
    try {
        let query = sb.from('assets').select(`
            *,
            type:asset_types(id, name, icon),
            location:asset_locations(id, name, building, floor, room)
        `).order('created_at', { ascending: false });

        if (filters.search) {
            query = query.or(`name.ilike.%${filters.search}%,serial_number.ilike.%${filters.search}%,asset_tag.ilike.%${filters.search}%,brand.ilike.%${filters.search}%,model.ilike.%${filters.search}%`);
        }
        if (filters.type) {
            query = query.eq('type_id', filters.type);
        }
        if (filters.status) {
            query = query.eq('status', filters.status);
        }

        const { data, error } = await query;
        if (error) throw error;
        renderAssetsTable(data || []);
        updateStats(data || []);
    } catch (err) {
        console.error('loadAssets:', err);
        showToast('Erreur lors du chargement des assets', 'error');
    }
}

function renderAssetsTable(assets) {
    const tbody = document.getElementById('assetsTableBody');
    const emptyState = document.getElementById('emptyState');

    if (!assets.length) {
        tbody.innerHTML = '';
        emptyState.style.display = 'block';
        return;
    }

    emptyState.style.display = 'none';

    const statusLabels = {
        available: 'Disponible',
        in_use: 'En utilisation',
        repair: 'En réparation',
        retired: 'Retiré'
    };

    tbody.innerHTML = assets.map(a => {
        const typeName = a.type ? a.type.name : '-';
        const locationName = a.location ? a.location.name : '-';
        const warrantyInfo = getWarrantyStatus(a.warranty_end);
        const brandModel = [a.brand, a.model].filter(Boolean).join(' ') || '-';

        return `<tr>
            <td><span class="tag-display">${escapeHtml(a.asset_tag || '')}</span></td>
            <td>${escapeHtml(a.name || '')}</td>
            <td>${escapeHtml(typeName)}</td>
            <td>${escapeHtml(brandModel)}</td>
            <td>${escapeHtml(locationName)}</td>
            <td><span class="status-badge ${a.status}">${statusLabels[a.status] || a.status}</span></td>
            <td>${warrantyInfo.html}</td>
            <td>
                <button class="btn-sm" onclick="showAssetDetail('${a.id}')" title="Voir">👁</button>
                <button class="btn-sm" onclick="openEditAsset('${a.id}')" title="Modifier">✏️</button>
            </td>
        </tr>`;
    }).join('');
}

function getWarrantyStatus(warrantyEnd) {
    if (!warrantyEnd) return { html: '<span class="warranty-badge" style="background:#f3f4f6;color:#6b7280">N/A</span>', status: 'none' };

    const now = new Date();
    const end = new Date(warrantyEnd);
    const diffDays = Math.ceil((end - now) / (1000 * 60 * 60 * 24));

    if (diffDays < 0) {
        return { html: `<span class="warranty-badge expired">Expirée</span>`, status: 'expired' };
    } else if (diffDays <= 30) {
        return { html: `<span class="warranty-badge expiring_soon">Expire dans ${diffDays}j</span>`, status: 'expiring_soon' };
    } else {
        return { html: `<span class="warranty-badge active">Active</span>`, status: 'active' };
    }
}

function updateStats(assets) {
    document.getElementById('statTotal').textContent = assets.length;
    document.getElementById('statInUse').textContent = assets.filter(a => a.status === 'in_use').length;
    document.getElementById('statAvailable').textContent = assets.filter(a => a.status === 'available').length;
    document.getElementById('statRepair').textContent = assets.filter(a => a.status === 'repair').length;
}

async function showAssetDetail(id) {
    try {
        const { data: asset, error } = await sb.from('assets').select(`
            *,
            type:asset_types(id, name, icon),
            location:asset_locations(id, name, building, floor, room)
        `).eq('id', id).single();
        if (error) throw error;

        const { data: history } = await sb.from('asset_history').select(`
            *,
            performer:employees(full_name)
        `).eq('asset_id', id).order('created_at', { ascending: false });

        const statusLabels = {
            available: 'Disponible',
            in_use: 'En utilisation',
            repair: 'En réparation',
            retired: 'Retiré'
        };

        const typeName = asset.type ? asset.type.name : '-';
        const locationName = asset.location ? `${asset.location.name}${asset.location.building ? ' - ' + asset.location.building : ''}${asset.location.room ? ' (' + asset.location.room + ')' : ''}` : '-';
        const warrantyInfo = getWarrantyStatus(asset.warranty_end);
        const brandModel = [asset.brand, asset.model].filter(Boolean).join(' ') || '-';

        let html = `
            <div class="asset-detail">
                <div class="asset-detail-header">
                    <div>
                        <h3>${escapeHtml(asset.name)}</h3>
                        <span class="tag-display">${escapeHtml(asset.asset_tag || '')}</span>
                        <span class="status-badge ${asset.status}" style="margin-left:8px">${statusLabels[asset.status] || asset.status}</span>
                    </div>
                </div>
                <div class="asset-detail-info">
                    <div class="detail-item">
                        <label>Type</label>
                        <span>${escapeHtml(typeName)}</span>
                    </div>
                    <div class="detail-item">
                        <label>Marque / Modèle</label>
                        <span>${escapeHtml(brandModel)}</span>
                    </div>
                    <div class="detail-item">
                        <label>Numéro de série</label>
                        <span>${escapeHtml(asset.serial_number || '-')}</span>
                    </div>
                    <div class="detail-item">
                        <label>Emplacement</label>
                        <span>${escapeHtml(locationName)}</span>
                    </div>
                    <div class="detail-item">
                        <label>Date d'achat</label>
                        <span>${asset.purchase_date ? formatDate(asset.purchase_date) : '-'}</span>
                    </div>
                    <div class="detail-item">
                        <label>Garantie</label>
                        <span>${warrantyInfo.html} ${asset.warranty_end ? ' — ' + formatDate(asset.warranty_end) : ''}</span>
                    </div>
                    ${asset.notes ? `<div class="detail-item" style="grid-column:1/-1"><label>Notes</label><span>${escapeHtml(asset.notes)}</span></div>` : ''}
                </div>`;

        if (history && history.length) {
            html += `
                <div class="asset-detail-section">
                    <h4>Historique</h4>
                    <ul class="history-list">
                        ${history.map(h => `
                            <li class="history-item">
                                <div class="history-dot">●</div>
                                <div class="history-content">
                                    <div class="history-action">${escapeHtml(h.action)}</div>
                                    ${h.details ? `<div class="history-details">${escapeHtml(h.details)}</div>` : ''}
                                    <div class="history-meta">
                                        ${h.performer ? escapeHtml(h.performer.full_name) : 'Système'} — ${formatDate(h.created_at)}
                                    </div>
                                </div>
                            </li>
                        `).join('')}
                    </ul>
                </div>`;
        }

        html += '</div>';

        document.getElementById('detailModalTitle').textContent = asset.name;
        document.getElementById('detailModalBody').innerHTML = html;
        openModal('assetDetailModal');
    } catch (err) {
        console.error('showAssetDetail:', err);
        showToast('Erreur lors du chargement du détail', 'error');
    }
}

function openCreateAsset() {
    document.getElementById('formModalTitle').textContent = 'Nouvel asset';
    document.getElementById('assetForm').reset();
    document.getElementById('assetId').value = '';
    document.getElementById('assetTag').value = generateAssetTag();
    openModal('assetFormModal');
}

async function openEditAsset(id) {
    try {
        const { data: asset, error } = await sb.from('assets').select('*').eq('id', id).single();
        if (error) throw error;

        document.getElementById('formModalTitle').textContent = 'Modifier l\'asset';
        document.getElementById('assetId').value = asset.id;
        document.getElementById('assetName').value = asset.name || '';
        document.getElementById('assetTag').value = asset.asset_tag || '';
        document.getElementById('assetSerial').value = asset.serial_number || '';
        document.getElementById('assetType').value = asset.type_id || '';
        document.getElementById('assetBrand').value = asset.brand || '';
        document.getElementById('assetModel').value = asset.model || '';
        document.getElementById('assetPurchaseDate').value = asset.purchase_date || '';
        document.getElementById('assetWarrantyEnd').value = asset.warranty_end || '';
        document.getElementById('assetLocation').value = asset.location_id || '';
        document.getElementById('assetStatus').value = asset.status || 'available';
        document.getElementById('assetNotes').value = asset.notes || '';
        openModal('assetFormModal');
    } catch (err) {
        console.error('openEditAsset:', err);
        showToast('Erreur lors du chargement de l\'asset', 'error');
    }
}

async function saveAsset(data) {
    try {
        const id = document.getElementById('assetId').value;
        const isNew = !id;

        const payload = {
            name: data.name,
            serial_number: data.serial_number || null,
            asset_tag: data.asset_tag || null,
            type_id: data.type_id || null,
            brand: data.brand || null,
            model: data.model || null,
            purchase_date: data.purchase_date || null,
            warranty_end: data.warranty_end || null,
            location_id: data.location_id || null,
            status: data.status,
            notes: data.notes || null
        };

        let result;
        if (isNew) {
            result = await sb.from('assets').insert(payload).select().single();
        } else {
            result = await sb.from('assets').update(payload).eq('id', id).select().single();
        }

        if (result.error) throw result.error;

        const action = isNew ? 'Création' : 'Modification';
        const details = isNew ? `Asset créé avec le tag ${payload.asset_tag}` : `Asset modifié`;
        await sb.from('asset_history').insert({
            asset_id: result.data.id,
            action: action,
            details: details,
            performed_by: currentProfile?.id || null
        });

        closeAllModals();
        await loadAssets(getCurrentFilters());
        showToast(isNew ? 'Asset créé avec succès' : 'Asset mis à jour avec succès', 'success');
    } catch (err) {
        console.error('saveAsset:', err);
        showToast('Erreur lors de l\'enregistrement', 'error');
    }
}

async function loadAssetHistory(assetId) {
    try {
        const { data, error } = await sb.from('asset_history').select(`
            *,
            performer:employees(full_name)
        `).eq('asset_id', assetId).order('created_at', { ascending: false });
        if (error) throw error;

        if (!data || !data.length) {
            document.getElementById('historyModalBody').innerHTML = '<p style="text-align:center;color:var(--text-muted)">Aucun historique</p>';
            document.getElementById('historyModalTitle').textContent = 'Historique';
            openModal('historyModal');
            return;
        }

        const html = `
            <ul class="history-list">
                ${data.map(h => `
                    <li class="history-item">
                        <div class="history-dot">●</div>
                        <div class="history-content">
                            <div class="history-action">${escapeHtml(h.action)}</div>
                            ${h.details ? `<div class="history-details">${escapeHtml(h.details)}</div>` : ''}
                            <div class="history-meta">
                                ${h.performer ? escapeHtml(h.performer.full_name) : 'Système'} — ${formatDate(h.created_at)}
                            </div>
                        </div>
                    </li>
                `).join('')}
            </ul>`;

        document.getElementById('historyModalTitle').textContent = 'Historique';
        document.getElementById('historyModalBody').innerHTML = html;
        openModal('historyModal');
    } catch (err) {
        console.error('loadAssetHistory:', err);
        showToast('Erreur lors du chargement de l\'historique', 'error');
    }
}

function generateAssetTag() {
    const year = new Date().getFullYear();
    const rand = String(Math.floor(Math.random() * 9999) + 1).padStart(4, '0');
    return `IT-${year}-${rand}`;
}

function getCurrentFilters() {
    return {
        search: document.getElementById('searchInput').value.trim(),
        type: document.getElementById('typeFilter').value,
        status: document.getElementById('statusFilter').value
    };
}

function bindFilterEvents() {
    document.getElementById('searchInput').addEventListener('input', () => {
        clearTimeout(debounceTimer);
        debounceTimer = setTimeout(() => loadAssets(getCurrentFilters()), 300);
    });
    document.getElementById('typeFilter').addEventListener('change', () => loadAssets(getCurrentFilters()));
    document.getElementById('statusFilter').addEventListener('change', () => loadAssets(getCurrentFilters()));
    document.getElementById('newAssetBtn').addEventListener('click', openCreateAsset);
}

function bindModalEvents() {
    document.getElementById('closeDetailModal').addEventListener('click', () => closeModal('assetDetailModal'));
    document.getElementById('closeFormModal').addEventListener('click', () => closeModal('assetFormModal'));
    document.getElementById('closeHistoryModal').addEventListener('click', () => closeModal('historyModal'));
    document.getElementById('cancelFormBtn').addEventListener('click', () => closeModal('assetFormModal'));

    document.querySelectorAll('.modal-overlay').forEach(overlay => {
        overlay.addEventListener('click', closeAllModals);
    });

    document.addEventListener('keydown', e => {
        if (e.key === 'Escape') closeAllModals();
    });
}

function bindFormEvents() {
    document.getElementById('assetForm').addEventListener('submit', async (e) => {
        e.preventDefault();
        const data = {
            name: document.getElementById('assetName').value.trim(),
            serial_number: document.getElementById('assetSerial').value.trim(),
            asset_tag: document.getElementById('assetTag').value.trim(),
            type_id: document.getElementById('assetType').value || null,
            brand: document.getElementById('assetBrand').value.trim(),
            model: document.getElementById('assetModel').value.trim(),
            purchase_date: document.getElementById('assetPurchaseDate').value || null,
            warranty_end: document.getElementById('assetWarrantyEnd').value || null,
            location_id: document.getElementById('assetLocation').value || null,
            status: document.getElementById('assetStatus').value,
            notes: document.getElementById('assetNotes').value.trim()
        };
        await saveAsset(data);
    });
}

function openModal(id) {
    document.getElementById(id).classList.add('active');
}

function closeModal(id) {
    document.getElementById(id).classList.remove('active');
}

function closeAllModals() {
    document.querySelectorAll('.modal').forEach(m => m.classList.remove('active'));
}
