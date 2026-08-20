let selectedTemplateId = null;
let currentSignatureHTML = '';
let employeeData = {};

document.addEventListener('DOMContentLoaded', async () => {
  await initAuth();
  if (!requireAuth()) return;
  await initNav();
  await initSignatures();
});

async function initSignatures() {
  await loadEmployeeData();
  await loadTemplates();
  await loadSavedSignatures();
  setupFormListeners();
}

async function loadEmployeeData() {
  try {
    const { data, error } = await sb
      .from('employees')
      .select('full_name, department, phone, role, email')
      .eq('user_id', currentUser.id)
      .single();

    if (error) throw error;

    if (data) {
      employeeData = data;
      if (data.full_name) document.getElementById('sigFullName').value = data.full_name;
      if (data.role) document.getElementById('sigPosition').value = data.role;
      if (data.department) document.getElementById('sigDepartment').value = data.department;
      if (data.phone) document.getElementById('sigPhone').value = data.phone;
      if (data.email) document.getElementById('sigEmail').value = data.email;
    }
  } catch (err) {
    if (err.code !== 'PGRST116') {
      showToast('Erreur lors du chargement des données employé', 'error');
    }
  }
}

async function loadTemplates() {
  try {
    const { data, error } = await sb
      .from('signature_templates')
      .select('*')
      .order('name');

    if (error) throw error;

    const container = document.getElementById('templateCards');
    container.innerHTML = '';

    if (!data || data.length === 0) {
      renderBuiltInTemplates(container);
      return;
    }

    data.forEach(template => {
      container.appendChild(createTemplateCard(template.id, template.name, template.preview_url));
    });
  } catch (err) {
    renderBuiltInTemplates(document.getElementById('templateCards'));
  }
}

function renderBuiltInTemplates(container) {
  const builtIn = [
    { id: 'professionnel', name: 'Professionnel', desc: 'Tableau structuré, formel' },
    { id: 'minimaliste', name: 'Minimaliste', desc: 'Simple et épuré' },
    { id: 'colore', name: 'Coloré', desc: 'Avec bordure colorée' }
  ];

  builtIn.forEach(t => {
    container.appendChild(createTemplateCard(t.id, t.name, t.desc));
  });
}

function createTemplateCard(id, name, desc) {
  const card = document.createElement('div');
  card.className = 'template-card';
  card.dataset.template = id;
  card.innerHTML = `<div class="template-name">${escapeHtml(name)}</div><div class="template-desc">${escapeHtml(desc)}</div>`;
  card.addEventListener('click', () => selectTemplate(id));
  return card;
}

function selectTemplate(templateId) {
  selectedTemplateId = templateId;
  document.querySelectorAll('.template-card').forEach(card => {
    card.classList.toggle('selected', card.dataset.template === templateId);
  });
  generateSignature();
}

function setupFormListeners() {
  const fields = ['sigFullName', 'sigPosition', 'sigDepartment', 'sigPhone', 'sigMobile', 'sigEmail', 'sigWebsite'];
  fields.forEach(id => {
    document.getElementById(id).addEventListener('input', () => {
      if (selectedTemplateId) generateSignature();
    });
  });
}

function getFormFields() {
  return {
    full_name: document.getElementById('sigFullName').value.trim(),
    position: document.getElementById('sigPosition').value.trim(),
    department: document.getElementById('sigDepartment').value.trim(),
    phone: document.getElementById('sigPhone').value.trim(),
    mobile: document.getElementById('sigMobile').value.trim(),
    email: document.getElementById('sigEmail').value.trim(),
    website: document.getElementById('sigWebsite').value.trim()
  };
}

function generateSignature() {
  if (!selectedTemplateId) {
    showToast('Veuillez sélectionner un modèle', 'error');
    return;
  }

  const fields = getFormFields();

  if (!fields.full_name && !fields.email) {
    showToast('Veuillez remplir au moins le nom ou l\'email', 'error');
    return;
  }

  const html = getTemplateHTML(selectedTemplateId, fields);
  currentSignatureHTML = html;
  previewSignature(html);
  document.getElementById('codeOutput').value = html;
}

function getTemplateHTML(templateId, fields) {
  const name = escapeHtml(fields.full_name || 'Nom Prénom');
  const position = escapeHtml(fields.position || '');
  const department = escapeHtml(fields.department || '');
  const phone = escapeHtml(fields.phone || '');
  const mobile = escapeHtml(fields.mobile || '');
  const email = escapeHtml(fields.email || '');
  const website = escapeHtml(fields.website || '');

  if (templateId === 'professionnel') {
    return `<table cellpadding="0" cellspacing="0" border="0" style="font-family: Arial, Helvetica, sans-serif; font-size: 14px; color: #333333; line-height: 1.5;">
  <tr>
    <td style="padding-right: 16px; border-right: 3px solid #1e40af; vertical-align: top;">
      <div style="width: 60px; height: 60px; background: #e0e7ff; border-radius: 50%; text-align: center; line-height: 60px; color: #1e40af; font-size: 22px; font-weight: bold;">${name.charAt(0).toUpperCase()}</div>
    </td>
    <td style="padding-left: 16px; vertical-align: top;">
      <div style="font-size: 18px; font-weight: bold; color: #1e293b; margin-bottom: 2px;">${name}</div>
      ${position ? `<div style="font-size: 13px; color: #475569; margin-bottom: 6px;">${position}${department ? ' — ' + department : ''}</div>` : ''}
      <table cellpadding="0" cellspacing="0" border="0" style="font-size: 12px; color: #64748b; margin-top: 8px;">
        ${phone ? `<tr><td style="padding: 2px 8px 2px 0;">📞</td><td style="padding: 2px 0;">${phone}</td></tr>` : ''}
        ${mobile ? `<tr><td style="padding: 2px 8px 2px 0;">📱</td><td style="padding: 2px 0;">${mobile}</td></tr>` : ''}
        ${email ? `<tr><td style="padding: 2px 8px 2px 0;">✉️</td><td style="padding: 2px 0;"><a href="mailto:${email}" style="color: #1e40af; text-decoration: none;">${email}</a></td></tr>` : ''}
        ${website ? `<tr><td style="padding: 2px 8px 2px 0;">🌐</td><td style="padding: 2px 0;"><a href="${website}" style="color: #1e40af; text-decoration: none;" target="_blank">${website.replace(/^https?:\/\//, '')}</a></td></tr>` : ''}
      </table>
    </td>
  </tr>
</table>`;
  }

  if (templateId === 'minimaliste') {
    return `<div style="font-family: 'Helvetica Neue', Arial, sans-serif; font-size: 14px; color: #333333; line-height: 1.6;">
  <div style="font-size: 16px; font-weight: 600; color: #111827; margin-bottom: 2px;">${name}</div>
  ${position ? `<div style="font-size: 13px; color: #6b7280; margin-bottom: 8px;">${position}</div>` : '<div style="margin-bottom: 8px;"></div>'}
  <div style="font-size: 12px; color: #9ca3af;">
    ${[email ? `<a href="mailto:${email}" style="color: #6b7280; text-decoration: none;">${email}</a>` : '',
       phone ? `<span>${phone}</span>` : '',
       mobile ? `<span>${mobile}</span>` : ''].filter(Boolean).join(' &nbsp;|&nbsp; ')}
  </div>
  ${website ? `<div style="margin-top: 4px;"><a href="${website}" style="color: #6b7280; text-decoration: none; font-size: 12px;" target="_blank">${website.replace(/^https?:\/\//, '')}</a></div>` : ''}
</div>`;
  }

  if (templateId === 'colore') {
    return `<table cellpadding="0" cellspacing="0" border="0" style="font-family: Arial, Helvetica, sans-serif; font-size: 14px; color: #333333;">
  <tr>
    <td style="width: 4px; background: linear-gradient(180deg, #e11d48, #f59e0b); border-radius: 2px;"></td>
    <td style="padding: 0 0 0 16px; vertical-align: top;">
      <div style="font-size: 17px; font-weight: bold; color: #1e293b; margin-bottom: 2px;">${name}</div>
      ${position ? `<div style="font-size: 13px; color: #e11d48; font-weight: 500; margin-bottom: 4px;">${position}</div>` : ''}
      ${department ? `<div style="font-size: 12px; color: #94a3b8; margin-bottom: 10px;">${department}</div>` : ''}
      <table cellpadding="0" cellspacing="0" border="0" style="font-size: 12px; color: #475569;">
        ${phone ? `<tr><td style="padding: 3px 10px 3px 0; color: #e11d48;">☎</td><td style="padding: 3px 0;">${phone}</td></tr>` : ''}
        ${mobile ? `<tr><td style="padding: 3px 10px 3px 0; color: #e11d48;">✆</td><td style="padding: 3px 0;">${mobile}</td></tr>` : ''}
        ${email ? `<tr><td style="padding: 3px 10px 3px 0; color: #e11d48;">✉</td><td style="padding: 3px 0;"><a href="mailto:${email}" style="color: #e11d48; text-decoration: none;">${email}</a></td></tr>` : ''}
        ${website ? `<tr><td style="padding: 3px 10px 3px 0; color: #e11d48;">🔗</td><td style="padding: 3px 0;"><a href="${website}" style="color: #e11d48; text-decoration: none;" target="_blank">${website.replace(/^https?:\/\//, '')}</a></td></tr>` : ''}
      </table>
      <div style="margin-top: 10px; padding-top: 8px; border-top: 1px solid #f1f5f9;">
        <a href="#" style="display: inline-block; width: 24px; height: 24px; background: #e2e8f0; border-radius: 50%; text-align: center; line-height: 24px; font-size: 12px; color: #475569; text-decoration: none; margin-right: 6px;">in</a>
        <a href="#" style="display: inline-block; width: 24px; height: 24px; background: #e2e8f0; border-radius: 50%; text-align: center; line-height: 24px; font-size: 12px; color: #475569; text-decoration: none; margin-right: 6px;">X</a>
        <a href="#" style="display: inline-block; width: 24px; height: 24px; background: #e2e8f0; border-radius: 50%; text-align: center; line-height: 24px; font-size: 12px; color: #475569; text-decoration: none;">fb</a>
      </div>
    </td>
  </tr>
</table>`;
  }

  return '<p style="color: #94a3b8;">Modèle inconnu.</p>';
}

function previewSignature(html) {
  const frame = document.getElementById('previewFrame');
  frame.innerHTML = html;
}

function copyHTML() {
  if (!currentSignatureHTML) {
    showToast('Générez d\'abord une signature', 'error');
    return;
  }
  navigator.clipboard.writeText(currentSignatureHTML).then(() => {
    showToast('HTML copié dans le presse-papier');
  }).catch(() => {
    showToast('Erreur lors de la copie', 'error');
  });
}

function copyText() {
  if (!currentSignatureHTML) {
    showToast('Générez d\'abord une signature', 'error');
    return;
  }
  const temp = document.createElement('div');
  temp.innerHTML = currentSignatureHTML;
  const text = temp.textContent || temp.innerText || '';
  navigator.clipboard.writeText(text).then(() => {
    showToast('Texte copié dans le presse-papier');
  }).catch(() => {
    showToast('Erreur lors de la copie', 'error');
  });
}

async function saveSignature() {
  if (!currentSignatureHTML) {
    showToast('Générez d\'abord une signature', 'error');
    return;
  }

  const fields = getFormFields();
  const sigName = fields.full_name || 'Signature';

  try {
    const { error } = await sb
      .from('user_signatures')
      .insert({
        user_id: currentUser.id,
        template_id: selectedTemplateId,
        fields_json: fields,
        generated_html: currentSignatureHTML
      });

    if (error) throw error;

    showToast('Signature sauvegardée');
    await loadSavedSignatures();
  } catch (err) {
    showToast('Erreur lors de la sauvegarde', 'error');
  }
}

async function loadSavedSignatures() {
  try {
    const { data, error } = await sb
      .from('user_signatures')
      .select('*')
      .eq('user_id', currentUser.id)
      .order('created_at', { ascending: false });

    if (error) throw error;

    const container = document.getElementById('savedSignaturesList');

    if (!data || data.length === 0) {
      container.innerHTML = '<p class="empty-state">Aucune signature sauvegardée.</p>';
      return;
    }

    container.innerHTML = '';
    data.forEach(sig => {
      const fields = sig.fields_json || {};
      const item = document.createElement('div');
      item.className = 'saved-sig-item';
      item.innerHTML = `
        <div class="saved-sig-info">
          <span class="saved-sig-name">${escapeHtml(fields.full_name || 'Signature')}</span>
          <span class="saved-sig-date">${formatDate(sig.created_at)} — ${escapeHtml(sig.template_id || 'Modèle')}</span>
        </div>
        <div class="saved-sig-actions">
          <button class="btn btn-secondary" onclick="previewSignature('${sig.generated_html.replace(/'/g, "\\'").replace(/\n/g, "\\n")}')">Voir</button>
          <button class="btn btn-danger" onclick="deleteSignature('${sig.id}')">Supprimer</button>
        </div>
      `;
      container.appendChild(item);
    });
  } catch (err) {
    showToast('Erreur lors du chargement des signatures', 'error');
  }
}

async function deleteSignature(id) {
  if (!confirm('Supprimer cette signature ?')) return;

  try {
    const { error } = await sb
      .from('user_signatures')
      .delete()
      .eq('id', id);

    if (error) throw error;

    showToast('Signature supprimée');
    await loadSavedSignatures();
  } catch (err) {
    showToast('Erreur lors de la suppression', 'error');
  }
}
