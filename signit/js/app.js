(function () {
  'use strict';

  const $ = (s, c) => (c || document).querySelector(s);
  const $$ = (s, c) => [...(c || document).querySelectorAll(s)];

  // États initiaux masqués pour l'animation d'entrée (retirés au démarrage)
  if (!window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
    document.documentElement.classList.add('preload');
  }

  // --- Default images ---
  function createDefaultLogo() {
    return 'data:image/svg+xml,' + encodeURIComponent(
      '<svg xmlns="http://www.w3.org/2000/svg" width="160" height="50" viewBox="0 0 160 50">' +
      '<rect width="160" height="50" rx="8" fill="#1a73e8"/>' +
      '<rect x="10" y="10" width="30" height="30" rx="4" fill="rgba(255,255,255,.18)"/>' +
      '<text x="17" y="31" font-family="Arial,sans-serif" font-size="15" font-weight="bold" fill="#fff">TI</text>' +
      '<text x="46" y="21" font-family="Arial,sans-serif" font-size="11" font-weight="bold" fill="#fff">TechInnov</text>' +
      '<text x="46" y="33" font-family="Arial,sans-serif" font-size="7.5" fill="rgba(255,255,255,.6)">Solutions &amp; Consulting</text>' +
      '</svg>'
    );
  }

  function getInitials(str) {
    return str.split(/\s+/).map(w => w[0]).filter(Boolean).slice(0, 2).join('').toUpperCase() || '?';
  }

  function generateAvatar(name, color) {
    const initials = getInitials(name || '?');
    return 'data:image/svg+xml,' + encodeURIComponent(
      '<svg xmlns="http://www.w3.org/2000/svg" width="80" height="80" viewBox="0 0 80 80">' +
      '<circle cx="40" cy="40" r="40" fill="' + color + '"/>' +
      '<text x="40" y="40" font-family="Arial,sans-serif" font-size="30" font-weight="bold" fill="#fff" text-anchor="middle" dominant-baseline="central">' + initials + '</text>' +
      '</svg>'
    );
  }

  function hslToHex(h, s, l) {
    s /= 100; l /= 100;
    const a = s * Math.min(l, 1 - l);
    const f = n => {
      const k = (n + h / 30) % 12;
      return Math.round(255 * (l - a * Math.max(Math.min(k - 3, 9 - k, 1), -1)));
    };
    return '#' + [0,8,4].map(n => f(n).toString(16).padStart(2, '0')).join('');
  }
  function hexToHsl(hex) {
    let r=0,g=0,b=0;
    hex = hex.replace('#','');
    if (hex.length===3) hex=hex[0]+hex[0]+hex[1]+hex[1]+hex[2]+hex[2];
    r=parseInt(hex[0]+hex[1],16)/255; g=parseInt(hex[2]+hex[3],16)/255; b=parseInt(hex[4]+hex[5],16)/255;
    const mx=Math.max(r,g,b), mn=Math.min(r,g,b);
    let h=0,s=0,l=(mx+mn)/2;
    if (mx!==mn) {
      const d=mx-mn;
      s=l>0.5?d/(2-mx-mn):d/(mx+mn);
      if (mx===r) h=(g-b)/d+(g<b?6:0);
      else if (mx===g) h=(b-r)/d+2;
      else h=(r-g)/d+4;
      h/=6;
    }
    return { h: Math.round(h*360), s: Math.round(s*100), l: Math.round(l*100) };
  }

  // --- State ---
  let logoDataUrl = createDefaultLogo();
  let photoDataUrl = null;
  let history = JSON.parse(localStorage.getItem('sigHistory') || '[]');
  let team = JSON.parse(localStorage.getItem('sigTeam') || '[]');

  // --- DOM refs ---
  const form = $('#signatureForm');
  const preview = $('#signaturePreview');
  const templateSel = $('#template');
  const colorInput = $('#color');
  const fontFamily = $('#fontFamily');

  // --- Helpers ---
  function getFormData() {
    const fn = $('#firstName').value.trim();
    const ln = $('#lastName').value.trim();
    const fullName = (fn + ' ' + ln).trim();
    const color = colorInput.value;
    return {
      firstName: fn,
      lastName: ln,
      title: $('#title').value.trim(),
      company: $('#company').value.trim(),
      email: $('#email').value.trim(),
      phone: $('#phone').value.trim(),
      phone2: $('#phone2').value.trim(),
      mobile: $('#mobile').value.trim(),
      website: $('#website').value.trim(),
      address: $('#address').value.trim(),
      logoUrl: logoDataUrl || createDefaultLogo(),
      photoUrl: photoDataUrl || generateAvatar(fullName || '?', color),
      department: $('#department').value,
      fontFamily: fontFamily.value,
      qrCode: $('#qrCode').value === '1',
      dynamicStatus: $('#dynamicStatus').value === '1',
      banner: $('#banner').value.trim(),
      bannerLink: $('#bannerLink').value.trim(),
      socialHtml: Templates.getSocialHtml({
        linkedin: $('#linkedin').value.trim(),
        facebook: $('#facebook').value.trim(),
        twitter: $('#twitter').value.trim(),
        instagram: $('#instagram').value.trim(),
      }),
    };
  }

  function renderPreview(data, template, color, font) {
    if (!data.firstName && !data.lastName && !data.email) {
      preview.innerHTML = '<div style="color:#94a3b8;font-size:14px;text-align:center;padding:20px">Remplissez le formulaire pour voir l\'aperçu ✏️</div>';
      fitPreview();
      return;
    }
    preview.innerHTML = Templates.render(data, template, color, font);
    fitPreview();
    if (document.fonts && document.fonts.ready) document.fonts.ready.then(fitPreview);
    const imgs = preview.querySelectorAll('img');
    if (imgs.length) {
      let loaded = 0;
      imgs.forEach(img => {
        if (img.complete) loaded++;
        else img.addEventListener('load', () => { loaded++; if (loaded >= imgs.length) fitPreview(); }, { once: true });
      });
      if (loaded >= imgs.length) fitPreview();
    }
  }

  // Scale the signature preview to fit the container (mobile / narrow columns)
  function fitPreview() {
    if (!preview || !preview.innerHTML.trim()) return;
    const child = preview.querySelector('.sig-scaler > table, .sig-scaler > div');
    let scaler = preview.querySelector('.sig-scaler');
    if (!child && !scaler) {
      const first = preview.firstElementChild;
      if (!first || (first.offsetWidth || 0) <= 0) return;
      scaler = document.createElement('div');
      scaler.className = 'sig-scaler';
      scaler.appendChild(first);
      preview.appendChild(scaler);
    }
    if (!scaler) return;
    const el = scaler.firstElementChild;
    if (!el) return;
    const naturalW = el.offsetWidth;
    const naturalH = el.offsetHeight;
    const cs = getComputedStyle(preview);
    const padX = (parseFloat(cs.paddingLeft) || 0) + (parseFloat(cs.paddingRight) || 0);
    const containerW = preview.clientWidth - padX;
    if (!naturalW || !naturalH || containerW <= 0) return;
    const scale = Math.min(1, containerW / naturalW);
    if (scale < 1) {
      el.style.transform = `scale(${scale})`;
      el.style.transformOrigin = 'top left';
      scaler.style.width = `${Math.round(naturalW * scale)}px`;
      scaler.style.height = `${Math.round(naturalH * scale)}px`;
      preview.style.alignItems = 'flex-start';
    } else {
      el.style.transform = '';
      scaler.style.width = 'auto';
      scaler.style.height = 'auto';
      preview.style.alignItems = '';
    }
  }

  // Reset preview scaling before capture so exports keep full size
  function resetPreviewScale() {
    const scaler = preview.querySelector('.sig-scaler');
    if (!scaler) return;
    const el = scaler.firstElementChild;
    if (el) el.style.transform = '';
    const w = el ? el.offsetWidth : scaler.offsetWidth;
    const h = el ? el.offsetHeight : scaler.offsetHeight;
    scaler.style.width = `${w}px`;
    scaler.style.height = `${h}px`;
    preview.style.width = `${w}px`;
    preview.style.maxWidth = 'none';
    preview.style.alignItems = 'flex-start';
  }
  function restorePreviewScale() {
    preview.style.width = '';
    preview.style.maxWidth = '';
    fitPreview();
  }

  function generateFileName(ext) {
    return `${$('#firstName').value || 'signature'}_${$('#lastName').value || 'email'}.${ext}`;
  }

  // --- Google Fonts ---
  function loadGoogleFont(font) {
    const link = $('#googleFont');
    if (!font) { link.href = ''; return; }
    const name = font.replace(/\s+/g, '+');
    link.href = `https://fonts.googleapis.com/css2?family=${name}:wght@400;600;700&display=swap`;
  }

  // --- Loading state ---
  function withLoading(btn, fn) {
    return async (...args) => {
      const orig = btn.textContent;
      btn.disabled = true;
      btn.innerHTML = '<span style="display:inline-block;width:14px;height:14px;border:2px solid currentColor;border-top-color:transparent;border-radius:50%;animation:spin .6s linear infinite;margin-right:4px"></span>...';
      try { await fn(...args); } catch (e) { console.error(e); showToast('Erreur: ' + e.message); }
      btn.disabled = false;
      btn.textContent = orig;
    };
  }

  // Add spinner keyframes once
  if (!document.getElementById('spinKeyframes')) {
    const s = document.createElement('style');
    s.id = 'spinKeyframes';
    s.textContent = '@keyframes spin { to { transform: rotate(360deg); } }';
    document.head.appendChild(s);
  }

  // --- Export ---
  function getSignatureElement() {
    const scaler = preview.querySelector('.sig-scaler');
    return scaler ? scaler.firstElementChild : null;
  }

  function captureSignatureCanvas() {
    const el = getSignatureElement();
    if (!el) return Promise.resolve(null);
    resetPreviewScale();
    return new Promise((resolve, reject) => {
      requestAnimationFrame(() => requestAnimationFrame(() => {
        const w = el.offsetWidth;
        const scale = Math.min(4, Math.max(2, 1600 / w));
        html2canvas(el, { scale, useCORS: true, allowTaint: false, backgroundColor: '#ffffff', logging: false })
          .then(cv => { restorePreviewScale(); resolve(cv); })
          .catch(e => { restorePreviewScale(); reject(e); });
      }));
    });
  }

  function downloadCanvas(canvas, type) {
    if (type === 'png') canvas.toBlob(b => downloadBlob(b, generateFileName('png')), 'image/png');
    else if (type === 'jpg') canvas.toBlob(b => downloadBlob(b, generateFileName('jpg')), 'image/jpeg', 0.95);
    else if (type === 'pdf') {
      const imgData = canvas.toDataURL('image/png');
      const { jsPDF } = window.jspdf;
      const pdf = new jsPDF('l', 'mm', 'a4');
      const m = 8;
      const pw = pdf.internal.pageSize.getWidth() - m * 2;
      const ph = pdf.internal.pageSize.getHeight() - m * 2;
      const r = canvas.width / canvas.height;
      const iw = r > pw / ph ? pw : ph * r;
      const ih = r > pw / ph ? pw / r : ph;
      pdf.addImage(imgData, 'PNG', m, m, iw, ih);
      pdf.save(generateFileName('pdf'));
    }
  }

  async function exportAs(type) {
    const canvas = await captureSignatureCanvas();
    if (!canvas) return;
    downloadCanvas(canvas, type);
    showToast(`Exporté en ${type.toUpperCase()} ✓`);
  }

  function downloadBlob(blob, filename) {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = filename;
    document.body.appendChild(a); a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  async function exportAllFormats() {
    const canvas = await captureSignatureCanvas();
    if (!canvas) return;
    downloadCanvas(canvas, 'png');
    downloadCanvas(canvas, 'jpg');
    downloadCanvas(canvas, 'pdf');
    showToast('Tous les formats exportés ✓');
  }

  function copyHtmlToClipboard() {
    const html = preview.innerHTML;
    if (!html) return;
    navigator.clipboard.writeText(html).then(() => showToast('HTML copié !')).catch(() => {
      const ta = document.createElement('textarea');
      ta.value = html; document.body.appendChild(ta);
      ta.select(); document.execCommand('copy');
      document.body.removeChild(ta);
      showToast('HTML copié !');
    });
  }

  // --- Dark Mode ---
  function setDarkMode(on) {
    document.body.classList.toggle('dark', on);
    const toggle = $('#darkModeToggle');
    if (toggle) toggle.checked = on;
    localStorage.setItem('sigDarkMode', on ? '1' : '0');
  }

  // --- Theme switcher (3 thèmes : font + logo + palette) ---
  const THEME_FAVICONS = { signature: 'assets/logo.svg', elegance: 'assets/logo-elegance.svg', minimal: 'assets/logo-minimal.svg', soleil: 'assets/logo-soleil.svg', nature: 'assets/logo-nature.svg' };
  function applyTheme(name) {
    if (!THEME_FAVICONS[name]) name = 'signature';
    document.documentElement.setAttribute('data-theme', name);
    localStorage.setItem('sigTheme', name);
    const icon = document.querySelector('link[rel="icon"]');
    if (icon) icon.href = THEME_FAVICONS[name];
    $$('.theme-option').forEach(o => o.classList.toggle('active', o.dataset.theme === name));
    setTimeout(fitPreview, 60);
  }

  // --- Animation d'entrée (3 variantes : A Tranquille, B Encre, C Vivante) ---
  const ANIM_EASE = 'cubic-bezier(.22,.61,.36,1)';
  const ANIM_DRAW = 'cubic-bezier(.5,0,.2,1)';
  let animRunning = [];
  let drawnMarks = [];

  function animStop() {
    animRunning.forEach(a => { try { a.cancel(); } catch (e) { /* noop */ } });
    animRunning = [];
    drawnMarks.forEach(p => { p.style.strokeDasharray = ''; p.style.strokeDashoffset = ''; });
    drawnMarks = [];
  }

  function animFx(el, kfs, opts) {
    if (!el) return null;
    const a = el.animate(kfs, Object.assign({ fill: 'both', easing: ANIM_EASE }, opts));
    animRunning.push(a);
    return a;
  }

  const fadeUp = (el, d, del) => animFx(el, [{ opacity: 0, transform: 'translateY(16px)' }, { opacity: 1, transform: 'translateY(0)' }], { duration: d, delay: del });
  const fadeUpSmall = (el, d, del) => animFx(el, [{ opacity: 0, transform: 'translateY(8px)' }, { opacity: 1, transform: 'translateY(0)' }], { duration: d, delay: del });
  const fadeDown = (el, d, del) => animFx(el, [{ opacity: 0, transform: 'translateY(-12px)' }, { opacity: 1, transform: 'translateY(0)' }], { duration: d, delay: del });
  const fadeIn = (el, d, del) => animFx(el, [{ opacity: 0 }, { opacity: 1 }], { duration: d, delay: del });
  const scaleIn = (el, d, del) => animFx(el, [{ opacity: 0, transform: 'scale(.985)' }, { opacity: 1, transform: 'scale(1)' }], { duration: d, delay: del });

  function getLogoMarkPaths() {
    const marks = $$('.logo-mark').filter(m => getComputedStyle(m).display !== 'none');
    if (!marks.length) return [];
    return [...marks[0].querySelectorAll('path, circle, rect, line, ellipse, polyline, polygon')];
  }

  function drawMarks(dur, delay) {
    getLogoMarkPaths().forEach((p, i) => {
      try { p.setAttribute('pathLength', 1); } catch (e) { /* noop */ }
      p.style.strokeDasharray = '1';
      p.style.strokeDashoffset = '1';
      drawnMarks.push(p);
      animFx(p, [{ strokeDashoffset: 1 }, { strokeDashoffset: 0 }], { duration: dur, delay: delay + i * 90, easing: ANIM_DRAW });
    });
  }

  function entranceFields() { return $$('#signatureForm .form-group'); }
  function entranceHeaders() { return $$('#single .card-header'); }

  function entranceA() {
    fadeDown($('.navbar'), 420, 0);
    fadeIn($('.brand'), 300, 120);
    fadeIn($('.nav-links'), 320, 160);
    fadeIn($('.nav-controls'), 320, 200);
    fadeUp($('#single .form-card'), 480, 180);
    fadeUp($('#single .preview-card'), 480, 280);
    entranceHeaders().forEach((h, i) => fadeUp(h, 340, 360 + i * 100));
    entranceFields().forEach((f, i) => fadeUpSmall(f, 300, Math.min(400 + i * 40, 920)));
    fadeUp($('#single .form-actions'), 320, 760);
    fadeUp($('#single .export-actions'), 300, 480);
    scaleIn($('#signaturePreview'), 400, 520);
  }

  function entranceB() {
    fadeDown($('.navbar'), 400, 120);
    drawMarks(620, 80);
    fadeIn($('.brand'), 300, 480);
    animFx($('.logo'), [{ opacity: 0, transform: 'translateX(-8px)' }, { opacity: 1, transform: 'translateX(0)' }], { duration: 420, delay: 520 });
    fadeIn($('.nav-links'), 320, 560);
    fadeIn($('.nav-controls'), 320, 600);
    animFx($('.ink-ripple'), [{ opacity: .5, transform: 'scale(.4)' }, { opacity: 0, transform: 'scale(2.2)' }], { duration: 900, delay: 200 });
    fadeUp($('#single .form-card'), 520, 680);
    fadeUp($('#single .preview-card'), 520, 780);
    entranceHeaders().forEach((h, i) => fadeUp(h, 360, 800 + i * 100));
    entranceFields().forEach((f, i) => fadeUpSmall(f, 300, Math.min(880 + i * 40, 1300)));
    fadeUp($('#single .form-actions'), 320, 1160);
    fadeUp($('#single .export-actions'), 300, 920);
    scaleIn($('#signaturePreview'), 420, 950);
  }

  function entranceC() {
    fadeDown($('.navbar'), 420, 0);
    drawMarks(380, 80);
    animFx($('.logo'), [{ opacity: 0, transform: 'translateX(-8px)' }, { opacity: 1, transform: 'translateX(0)' }], { duration: 320, delay: 300 });
    fadeIn($('.nav-links'), 300, 320);
    fadeIn($('.nav-controls'), 300, 360);
    animFx($('.ink-ripple'), [{ opacity: .55, transform: 'scale(.4)' }, { opacity: 0, transform: 'scale(2.4)' }], { duration: 1000, delay: 120 });
    fadeUp($('#single .form-card'), 520, 300);
    fadeUp($('#single .preview-card'), 520, 380);
    animFx($('#single .preview-card'), [{ boxShadow: '0 0 0 0 rgba(37,99,235,0)' }, { boxShadow: '0 14px 34px -12px rgba(37,99,235,.4)' }], { duration: 900, delay: 520, fill: 'backwards' });
    entranceHeaders().forEach((h, i) => fadeUp(h, 340, 460 + i * 100));
    entranceFields().forEach((f, i) => fadeUpSmall(f, 300, Math.min(520 + i * 40, 1150)));
    fadeUp($('#single .form-actions'), 320, 820);
    fadeUp($('#single .export-actions'), 300, 560);
    scaleIn($('#signaturePreview'), 420, 620);
    animFx($('.anim-underline'), [{ transform: 'scaleX(0)' }, { transform: 'scaleX(1)' }], { duration: 520, delay: 1240 });
  }

  const ENTRANCES = { A: entranceA, B: entranceB, C: entranceC };

  function playEntrance(name) {
    document.documentElement.classList.remove('preload');
    animStop();
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    if (ENTRANCES[name]) ENTRANCES[name]();
  }

  // --- Team Management ---
  function saveTeam() {
    localStorage.setItem('sigTeam', JSON.stringify(team));
    renderTeam();
    renderDirectory();
  }

  function addToTeam(data) {
    const entry = { ...data, _template: templateSel.value, _color: colorInput.value, _font: fontFamily.value };
    const exists = team.findIndex(m => m.email === data.email);
    if (exists >= 0) { team[exists] = entry; showToast('Membre mis à jour'); }
    else { team.push(entry); showToast('Membre ajouté à l\'équipe'); }
    saveTeam();
  }

  function deleteFromTeam(idx) {
    team.splice(idx, 1);
    saveTeam();
  }

  function renderTeam() {
    const list = $('#teamList');
    if (!team.length) {
      list.innerHTML = '<p class="text-muted">Aucun membre trouvé.</p>';
      return;
    }
    list.innerHTML = team.map((m, i) => {
      return `
      <div class="team-item" data-idx="${i}">
        <div class="team-item-info">
          <strong>${m.firstName} ${m.lastName}</strong>
          <span class="text-muted">${m.title || ''}${m.department ? ' · ' + m.department : ''}</span>
          <span class="text-muted">${m.email}</span>
        </div>
        <div class="team-item-actions">
          <button class="btn btn-xs btn-outline team-load">Charger</button>
          <button class="btn btn-xs btn-outline team-delete">Suppr.</button>
        </div>
      </div>`;
    }).join('');

    list.querySelectorAll('.team-load').forEach(btn => {
      btn.addEventListener('click', () => {
        const idx = parseInt(btn.closest('.team-item').dataset.idx);
        const m = team[idx];
        if (!m) return;
        ['firstName','lastName','title','company','email','phone','phone2','mobile','website','address','linkedin','facebook','twitter','instagram'].forEach(k => {
          const el = document.getElementById(k);
          if (el) el.value = m[k] || '';
        });
        if (m.department) $('#department').value = m.department;
        showToast('Chargé dans le formulaire');
        switchTab('single');
      });
    });
    list.querySelectorAll('.team-delete').forEach(btn => {
      btn.addEventListener('click', () => {
        const idx = parseInt(btn.closest('.team-item').dataset.idx);
        deleteFromTeam(idx);
      });
    });
  }

  // --- Directory ---
  function renderDirectory() {
    const list = $('#directoryList');
    if (!team.length) {
      list.innerHTML = '<p class="text-muted">Ajoutez des membres dans l\'onglet Équipe.</p>';
      return;
    }
    list.innerHTML = team.map((m, i) => {
      const t = m._template || 'classic';
      const c = m._color || '#1a73e8';
      const f = m._font || '';
      const html = Templates.render(m, t, c, f);
      const templateLabel = { classic:'Classique', modern:'Moderne', corporate:'Corporate' }[t] || t;
      return `
      <div class="directory-item">
        <div class="directory-meta">
          <strong>${m.firstName} ${m.lastName}</strong>
          <span class="text-muted">${m.title || ''}${m.department ? ' · ' + m.department : ''}</span>
          <span class="text-muted">${m.email}</span>
          <span class="badge" style="background:${c};color:#fff;font-size:11px;padding:1px 8px;border-radius:3px">${templateLabel}</span>
        </div>
        <div class="directory-preview">${html}</div>
        <button class="btn btn-xs btn-primary copy-dir-html" data-idx="${i}">Copier HTML</button>
      </div>`;
    }).join('');

    $$('.copy-dir-html').forEach(btn => {
      btn.addEventListener('click', () => {
        const m = team[parseInt(btn.dataset.idx)];
        if (!m) return;
        const t = m._template || 'classic';
        const c = m._color || '#1a73e8';
        const f = m._font || '';
        const html = Templates.render(m, t, c, f);
        navigator.clipboard.writeText(html).then(() => showToast('HTML copié !'));
      });
    });
  }

  // --- History ---
  function addToHistory(data, template, color, font) {
    const entry = { data: { ...data }, template, color, font, date: new Date().toISOString() };
    history.unshift(entry);
    if (history.length > 20) history.pop();
    localStorage.setItem('sigHistory', JSON.stringify(history));
    renderHistory();
  }

  function renderHistory() {
    const list = $('#historyList');
    if (!history.length) {
      list.innerHTML = '<p class="text-muted">Aucune signature pour le moment.</p>';
      return;
    }
    list.innerHTML = history.map((entry, i) => {
      const templateLabel = { classic:'Classique', modern:'Moderne', corporate:'Corporate' }[entry.template] || entry.template;
      return `
      <div class="history-item" data-idx="${i}">
        <div class="history-meta">
          <strong>${entry.data.firstName} ${entry.data.lastName}</strong>
          <span class="text-muted">${entry.data.title || ''}${entry.data.department ? ' · ' + entry.data.department : ''}</span>
          <span class="text-muted">${entry.data.email}</span>
          <span class="text-muted">${new Date(entry.date).toLocaleDateString()}</span>
          <span class="badge" style="background:${entry.color};color:#fff">${templateLabel}</span>
        </div>
        <div class="history-preview">${Templates.render(entry.data, entry.template, entry.color, entry.font)}</div>
        <button class="btn btn-xs btn-outline restore-history">Restaurer</button>
      </div>`;
    }).join('');

    $$('.restore-history').forEach(btn => {
      btn.addEventListener('click', () => {
        const idx = parseInt(btn.closest('.history-item').dataset.idx);
        const entry = history[idx];
        if (!entry) return;
        Object.entries(entry.data).forEach(([k, v]) => {
          const el = document.getElementById(k);
          if (el && typeof v === 'string') el.value = v;
        });
        templateSel.value = entry.template;
        colorInput.value = entry.color;
        fontFamily.value = entry.font || '';
        logoDataUrl = entry.data.logoUrl || null;
        photoDataUrl = entry.data.photoUrl || null;
        loadGoogleFont(fontFamily.value);
        renderPreview(entry.data, entry.template, entry.color, entry.font);
        showToast('Signature restaurée !');
        switchTab('single');
      });
    });
  }

  // --- Toast ---
  function showToast(msg) {
    let toast = $('#toast');
    if (!toast) { toast = document.createElement('div'); toast.id = 'toast'; document.body.appendChild(toast); }
    toast.textContent = msg;
    toast.className = 'toast show';
    clearTimeout(toast._timer);
    toast._timer = setTimeout(() => { toast.className = 'toast'; }, 2500);
  }

  // --- Navigation ---
  function switchTab(name) {
    const map = { single: 'Signature', team: 'Équipe', directory: 'Annuaire', history: 'Historique' };
    $$('.nav-links a').forEach(l => l.classList.toggle('active', l.getAttribute('href') === '#' + name));
    $$('.section').forEach(s => s.classList.toggle('active', s.id === name));
    if (name === 'team') renderTeam();
    if (name === 'directory') renderDirectory();
    if (name === 'history') renderHistory();
  }

  // --- Bulk CSV Export for Team ---
  function exportTeamCsv() {
    if (!team.length) { showToast('Aucun membre dans l\'équipe'); return; }
    const headers = ['firstName','lastName','title','company','email','phone','phone2','mobile','website','address','department','linkedin','facebook','twitter','instagram'];
    const rows = team.map(m => headers.map(h => `"${(m[h] || '').replace(/"/g, '""')}"`).join(','));
    const csv = [headers.join(','), ...rows].join('\n');
    downloadBlob(new Blob([csv], { type: 'text/csv;charset=utf-8;' }), 'equipe_signatures.csv');
  }

  async function captureTeamCanvases() {
    const canvases = [];
    for (const m of team) {
      const div = document.createElement('div');
      div.innerHTML = Templates.render(m, m._template || 'classic', m._color || '#1a73e8', m._font || '');
      div.style.position = 'absolute'; div.style.left = '-9999px'; div.style.top = '0';
      document.body.appendChild(div);
      const canvas = await html2canvas(div, { scale: 2, useCORS: true, allowTaint: false, backgroundColor: '#ffffff', logging: false });
      document.body.removeChild(div);
      canvases.push(canvas);
    }
    return canvases;
  }

  async function exportTeamPdf() {
    if (!team.length) { showToast('Aucun membre dans l\'équipe'); return; }
    const canvases = await captureTeamCanvases();
    const { jsPDF } = window.jspdf;
    const pdf = new jsPDF('l', 'mm', 'a4');
    canvases.forEach((canvas, i) => {
      if (i > 0) pdf.addPage();
      const imgData = canvas.toDataURL('image/png');
      const w = 190; const h = (canvas.height / canvas.width) * w;
      pdf.addImage(imgData, 'PNG', 10, 10, w, h);
    });
    pdf.save('annuaire_equipe.pdf');
    showToast(`PDF généré : ${team.length} membre(s)`);
  }

  async function exportTeamImage(format) {
    if (!team.length) { showToast('Aucun membre dans l\'équipe'); return; }
    const canvases = await captureTeamCanvases();
    const gap = 40;
    const maxW = Math.max(...canvases.map(c => c.width));
    const totalH = canvases.reduce((s, c) => s + c.height, 0) + gap * (canvases.length - 1);
    const out = document.createElement('canvas');
    out.width = maxW;
    out.height = totalH;
    const ctx = out.getContext('2d');
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, out.width, out.height);
    let y = 0;
    for (const c of canvases) {
      ctx.drawImage(c, Math.round((maxW - c.width) / 2), y);
      y += c.height + gap;
    }
    const ext = format === 'png' ? 'png' : 'jpg';
    const q = format === 'png' ? undefined : 0.95;
    out.toBlob(b => downloadBlob(b, `annuaire_equipe.${ext}`), `image/${format === 'png' ? 'png' : 'jpeg'}`, q);
    showToast(`Image ${format.toUpperCase()} générée : ${team.length} membre(s)`);
  }

  // --- Init ---
  function init() {
    // Navigation
    $$('.nav-links a').forEach(link => {
      link.addEventListener('click', e => {
        e.preventDefault();
        switchTab(link.getAttribute('href').replace('#', ''));
      });
    });

    // Brand / logo → back to home (signature tab)
    const brand = document.querySelector('.brand');
    if (brand) brand.addEventListener('click', e => {
      e.preventDefault();
      switchTab('single');
      window.scrollTo({ top: 0, behavior: 'smooth' });
    });

    // Back to top
    const backToTop = $('#backToTop');
    let scrollQueued = false;
    window.addEventListener('scroll', () => {
      if (scrollQueued) return;
      scrollQueued = true;
      requestAnimationFrame(() => {
        backToTop.classList.toggle('show', window.scrollY > 300);
        scrollQueued = false;
      });
    }, { passive: true });
    backToTop.addEventListener('click', () => window.scrollTo({ top: 0, behavior: 'smooth' }));

    // Form submit
    form.addEventListener('submit', e => {
      e.preventDefault();
      const data = getFormData();
      const template = templateSel.value;
      const color = colorInput.value;
      const font = fontFamily.value;
      renderPreview(data, template, color, font);
      addToHistory(data, template, color, font);
    });

    // Live preview
    let debounceTimer;
    const schedulePreview = () => {
      clearTimeout(debounceTimer);
      debounceTimer = setTimeout(() => {
        try {
          const data = getFormData();
          renderPreview(data, templateSel.value, colorInput.value, fontFamily.value);
        } catch (e) {
          console.error('Preview error:', e);
          showToast('Erreur de rendu: ' + e.message);
        }
      }, 300);
    };
    form.addEventListener('input', schedulePreview);
    form.addEventListener('change', schedulePreview);
    // Direct listeners for key controls
    templateSel.addEventListener('change', schedulePreview);
    colorInput.addEventListener('change', schedulePreview);
    fontFamily.addEventListener('change', schedulePreview);

    // Google Font
    fontFamily.addEventListener('change', () => loadGoogleFont(fontFamily.value));

    // Color dropdown
    const cpDropdown = $('#cpDropdown');
    const cpTrigger = $('#cpTrigger');
    const cpMenu = $('#cpMenu');
    const cpDot = $('#cpDot');
    const cpLabel = $('#cpLabel');
    const colorNames = { '#1a73e8':'Bleu','#dc2626':'Rouge','#16a34a':'Vert','#0d9488':'Teal','#7c3aed':'Violet','#ea580c':'Orange','#be185d':'Rose','#1e293b':'Foncé' };

    function setColorFromPicker(val) {
      colorInput.value = val;
      cpDot.style.background = val;
      cpLabel.textContent = colorNames[val.toLowerCase()] || val;
      $$('.cp-option').forEach(o => o.classList.toggle('active', o.dataset.color?.toLowerCase() === val.toLowerCase()));
    }

    cpTrigger.addEventListener('click', e => {
      e.stopPropagation();
      cpDropdown.classList.toggle('open');
    });

    cpMenu.addEventListener('click', e => {
      const opt = e.target.closest('.cp-option');
      if (!opt) return;
      if (opt.id === 'cpCustom') { colorInput.click(); cpDropdown.classList.remove('open'); return; }
      setColorFromPicker(opt.dataset.color);
      schedulePreview();
      cpDropdown.classList.remove('open');
    });

    document.addEventListener('click', () => cpDropdown.classList.remove('open'));

    colorInput.addEventListener('input', () => {
      setColorFromPicker(colorInput.value);
      schedulePreview();
    });

    setColorFromPicker(colorInput.value);



    // Logo upload
    $('#logo').addEventListener('change', e => {
      const file = e.target.files[0];
      if (!file) { logoDataUrl = null; schedulePreview(); return; }
      const reader = new FileReader();
      reader.onload = ev => { logoDataUrl = ev.target.result; schedulePreview(); };
      reader.readAsDataURL(file);
    });

    // Photo upload
    $('#photo').addEventListener('change', e => {
      const file = e.target.files[0];
      if (!file) { photoDataUrl = null; schedulePreview(); return; }
      const reader = new FileReader();
      reader.onload = ev => { photoDataUrl = ev.target.result; schedulePreview(); };
      reader.readAsDataURL(file);
    });

    // Export with loading state
    $$('[data-export]').forEach(btn => btn.addEventListener('click', withLoading(btn, () => exportAs(btn.dataset.export))));
    $('#downloadAllBtn').addEventListener('click', withLoading($('#downloadAllBtn'), exportAllFormats));
    $('#copyHtmlBtn').addEventListener('click', copyHtmlToClipboard);

    // Team
    $('#saveToTeamBtn').addEventListener('click', () => addToTeam(getFormData()));

    $('#exportTeamCsvBtn').addEventListener('click', exportTeamCsv);
    $('#exportTeamPdfBtn').addEventListener('click', withLoading($('#exportTeamPdfBtn'), exportTeamPdf));
    $('#exportTeamPngBtn').addEventListener('click', withLoading($('#exportTeamPngBtn'), () => exportTeamImage('png')));
    $('#exportTeamJpgBtn').addEventListener('click', withLoading($('#exportTeamJpgBtn'), () => exportTeamImage('jpg')));
    $('#clearTeamBtn').addEventListener('click', () => { if (confirm('Effacer toute l\'équipe ?')) { team = []; saveTeam(); } });
    $('#importTeamBtn').addEventListener('click', () => $('#teamCsvImport').click());
    $('#teamCsvImport').addEventListener('change', e => {
      const file = e.target.files[0];
      if (!file) return;
      Papa.parse(file, { header: true, skipEmptyLines: true, complete: r => {
        if (r.data && r.data.length) {
          r.data.forEach(row => {
            const m = {
              firstName: row.firstName || '', lastName: row.lastName || '',
              title: row.title || '', company: row.company || '',
              email: row.email || '', phone: row.phone || '',
              phone2: row.phone2 || '', mobile: row.mobile || '',
              website: row.website || '', address: row.address || '',
              department: row.department || '',
              linkedin: row.linkedin || '', facebook: row.facebook || '',
              twitter: row.twitter || '', instagram: row.instagram || '',
              logoUrl: null, photoUrl: null, socialHtml: '',
            };
            if (m.firstName || m.lastName || m.email) team.push(m);
          });
          saveTeam();
          showToast(`${r.data.length} membre(s) importé(s)`);
        }
      }});
    });

    // Dark mode (sauvegardé entre les visites)
    const darkOn = localStorage.getItem('sigDarkMode') === '1';
    document.body.classList.toggle('dark', darkOn);
    $('#darkModeToggle').checked = darkOn;
    $('#darkModeToggle').addEventListener('change', e => setDarkMode(e.target.checked));

    // Thème d'apparence (3 choix)
    $$('.theme-option').forEach(opt => opt.addEventListener('click', () => {
      applyTheme(opt.dataset.theme);
      $('#themeSwitcher').classList.remove('open');
    }));
    $('#themeToggle').addEventListener('click', e => {
      e.stopPropagation();
      $('#themeSwitcher').classList.toggle('open');
    });
    document.addEventListener('click', () => { $('#themeSwitcher').classList.remove('open'); $('#animSwitcher').classList.remove('open'); });
    applyTheme(localStorage.getItem('sigTheme') || 'signature');

    // Animation d'entrée (3 variantes : A, B, C)
    const savedAnim = ['A', 'B', 'C'].includes(localStorage.getItem('sigAnim')) ? localStorage.getItem('sigAnim') : 'B';
    $$('.anim-option').forEach(o => o.classList.toggle('active', o.dataset.anim === savedAnim));
    $('#animToggle').addEventListener('click', e => {
      e.stopPropagation();
      $('#animSwitcher').classList.toggle('open');
    });
    $$('.anim-option').forEach(o => o.addEventListener('click', () => {
      const v = o.dataset.anim;
      localStorage.setItem('sigAnim', v);
      $$('.anim-option').forEach(x => x.classList.toggle('active', x === o));
      $('#animSwitcher').classList.remove('open');
      playEntrance(v);
    }));
    playEntrance(savedAnim);

    // History
    $('#clearHistoryBtn').addEventListener('click', () => { history = []; localStorage.removeItem('sigHistory'); renderHistory(); showToast('Historique effacé'); });

    // Initial render
    const data = getFormData();
    renderPreview(data, templateSel.value, colorInput.value, fontFamily.value);
    renderHistory();

    // Re-fit preview on resize / orientation change
    let resizeTimer;
    window.addEventListener('resize', () => { clearTimeout(resizeTimer); resizeTimer = setTimeout(fitPreview, 150); });
    window.addEventListener('orientationchange', () => setTimeout(fitPreview, 350));
  }

  // Expose for inline onclick
  window.deleteFromTeam = deleteFromTeam;
  window.showToast = showToast;

  // --- AI Assistant ---
  const aiKnowledge = [
    {
      keywords: ['bonjour','salut','hello','coucou','hey','hi'],
      reply: 'Bonjour ! 🙋‍♂️ Je suis l\'assistante **SignIT**. Je peux vous guider sur la création, la gestion et l\'export de signatures email. Que voulez-vous savoir ?'
    },
    {
      keywords: ['merci','merci beaucoup','thanks','thank'],
      reply: 'Avec plaisir ! 😊 N\'hésitez pas si vous avez d\'autres questions sur SignIT.'
    },
    {
      keywords: ['aide','aider','help','peux','possible','fonctionne','comment'],
      reply: 'Je peux vous aider sur tous les aspects de **SignIT** :\n\n• ✍️ **Créer** une signature (formulaire, champs)\n• 🎨 **Templates** (Classique, Moderne, Corporate)\n• 🎯 **Couleur** et **police**\n• 👥 **Gestion d\'équipe** et annuaire\n• 📤 **Export** (PNG, JPG, PDF, HTML)\n• 🔄 **Statut dynamique** et QR code\n• 📂 **Import/Export CSV**\n• 📋 **Historique**\n\nCliquez sur un sujet ou posez votre question !'
    },
    {
      keywords: ['créer','creer','signature','nouvelle','formulaire','champ','field'],
      reply: 'Pour créer une signature :\n\n1️⃣ Remplissez les champs dans l\'onglet **Signature** : Prénom, Nom, Email (obligatoires) + Titre, Société, Téléphone, Adresse (optionnels)\n2️⃣ Ajoutez votre **logo** (upload) ou une **photo**\n3️⃣ Choisissez un **template**, une **couleur**, une **police**\n4️⃣ Ajoutez les **réseaux sociaux** (LinkedIn, Facebook, Twitter, Instagram)\n5️⃣ Activez le **QR code** ou le **statut dynamique** si besoin\n6️⃣ Cliquez sur **Ajouter à l\'équipe** pour sauvegarder\n7️⃣ Utilisez les boutons **PNG/JPG/PDF** pour exporter\n\nL\'aperçu se met à jour automatiquement en temps réel !'
    },
    {
      keywords: ['template','modèle','modele','classique','moderne','corporate','theme','thème','design','style'],
      reply: 'SignIT propose **3 templates** hiérarchisés :\n\n**Classique** 📄 — Contenu minimal : identité, fonction et coordonnées uniquement (pas de logo, photo, réseaux sociaux, QR, statut ni bannière).\n\n**Moderne** 🎨 — Reprend le classique **+ logo d\'entreprise + photo** à gauche du nom. Carte épurée avec barre de dégradé.\n\n**Corporate** 🏢 — Tout ce que contient le moderne **+ icônes réseaux sociaux + QR code (vCard) + signature dynamique + bannière**. Bandeau entreprise avec liseré couleur.\n\nPour changer : utilisez le menu déroulant **Template** dans le formulaire. L\'aperçu se met à jour instantanément.'
    },
    {
      keywords: ['couleur','color','couleurs','palette','teinte','nuance','personnalisée'],
      reply: 'Pour choisir la couleur de votre signature :\n\nCliquez sur le bouton déroulant **Couleur** dans le formulaire.\n\n• 8 couleurs **prédéfinies** : Bleu, Rouge, Vert, Teal, Violet, Orange, Rose, Foncé\n• Cliquez sur **Personnalisée…** pour ouvrir le sélecteur natif et choisir n\'importe quelle couleur\n\nLa couleur s\'applique aux accents du template (bordures, titres, badges).'
    },
    {
      keywords: ['police','font','google','inter','roboto','open sans','lato','montserrat','poppins','raleway','texte','ecriture','écriture','caractère','caractere'],
      reply: 'SignIT supporte plusieurs **polices** :\n\n• **Arial** (police par défaut, universelle)\n• **Google Fonts** : Roboto, Open Sans, Lato, Montserrat, Poppins, Raleway\n\nPour changer : utilisez le menu **Police** dans le formulaire. Les polices Google sont chargées automatiquement depuis Google Fonts.\n\n💡 Les polices Google améliorent le rendu mais peuvent ne pas s\'afficher dans tous les clients email.'
    },
    {
      keywords: ['photo','avatar','image','logo','upload','telecharger','télécharger','logo','personnel'],
      reply: 'Vous pouvez ajouter des images à votre signature :\n\n**Logo** 🏢 — Cliquez sur "Choisir un fichier" dans la section Logo pour uploader le logo de votre entreprise. Taille recommandée : 160×50px.\n\n**Photo** 👤 — Cliquez sur "Choisir un fichier" dans la section Photo pour ajouter votre photo. Taille recommandée : 80×80px.\n\n💡 Sans upload, SignIT génère automatiquement un logo et un avatar par défaut avec vos initiales.'
    },
    {
      keywords: ['reseau','réseau','sociaux','social','linkedin','facebook','twitter','instagram','icone','lien','url'],
      reply: 'Pour ajouter vos **réseaux sociaux** :\n\nDans le formulaire, remplissez les champs **LinkedIn**, **Facebook**, **Twitter/X**, **Instagram** avec l\'URL complète de votre profil.\n\nLes icônes des réseaux renseignés apparaîtront automatiquement dans la signature, dans la colonne de gauche.\n\n💡 Ne remplissez que ceux que vous voulez afficher — les champs vides sont ignorés.'
    },
    {
      keywords: ['qr','code qr','qrcode','qr code','scan'],
      reply: 'Le **QR code** génère automatiquement un code QR vers votre site web.\n\n1️⃣ Activez l\'option **QR Code** dans le formulaire (Oui)\n2️⃣ Le QR code apparaît en bas de la signature\n3️⃣ Il redirige vers l\'URL renseignée dans le champ **Site web**\n\n💡 Très utile pour les signatures modernes et le marketing digital !'
    },
    {
      keywords: ['statut','statut dynamique','en ligne','hors ligne','disponible','status','presence','présence','horaire','heure'],
      reply: 'Le **statut dynamique** affiche votre disponibilité en temps réel :\n\n🟢 **En ligne** — Pendant les heures de bureau (lundi-vendredi, 9h-18h)\n🟡 **Hors horaires** — En soirée, nuit, ou week-end\n\nPour l\'activer : mettez l\'option **Statut dynamique** sur Oui dans le formulaire.\n\n💡 Le statut se met à jour automatiquement selon l\'heure et le jour de la consultation.'
    },
    {
      keywords: ['banniere','bannière','banner','pub','promotion','offre'],
      reply: 'La **bannière** permet d\'ajouter un message promotionnel en bas de la signature :\n\n1️⃣ Champ **Bannière** : tapez votre message (ex: "🚀 Nouvelle offre découverte !")\n2️⃣ Champ **Lien bannière** : URL de destination (optionnel)\n\nLa bannière s\'affiche en bas de la signature avec un fond coloré.'
    },
    {
      keywords: ['equipe','équipe','team','membre','collaborateur','employé','employe','collègue','collegue','gestion'],
      reply: 'La **Gestion d\'équipe** vous permet de centraliser les signatures :\n\n**Ajouter un membre** 🤝 : Créez une signature puis cliquez "Ajouter à l\'équipe"\n**Gérer** 📋 : Onglet **Équipe** → voir, charger, supprimer les membres\n**Charger** ↩️ : Charge les données d\'un membre dans le formulaire pour modification\n**Supprimer** 🗑️ : Retire un membre de l\'équipe\n\n💡 Chaque membre conserve son template, sa couleur et sa police personnalisés.'
    },
    {
      keywords: ['import','csv','importer','fichier','upload csv','bulk','masse'],
      reply: 'Pour **importer** des membres en masse via un fichier CSV :\n\n1️⃣ Préparez un fichier CSV avec les colonnes :\n   `firstName, lastName, email, title, company, phone, department, linkedin, facebook, twitter, instagram`\n2️⃣ Allez dans l\'onglet **Équipe**\n3️⃣ Cliquez sur **Importer CSV**\n4️⃣ Sélectionnez votre fichier\n\n💡 Le prénom, nom ou email sont obligatoires pour chaque ligne.'
    },
    {
      keywords: ['export','exporter','png','jpg','pdf','telecharger','télécharger','image','format'],
      reply: 'Plusieurs options d\'**export** :\n\n📸 **PNG** — Image transparente, idéale pour le web\n🖼️ **JPG** — Image compressée, plus légère\n📄 **PDF** — Document vectoriel, parfait pour l\'impression\n🎯 **Tout** — Exporte les 3 formats en un clic\n📋 **Copier HTML** — Copie le code HTML brut dans le presse-papier\n\n💡 Pour l\'équipe : **Export PDF** génère un document avec toutes les signatures ; **Export CSV** télécharge les données.'
    },
    {
      keywords: ['html','code html','copier','presse papier','presse-papier','clipboard'],
      reply: 'Pour **copier le code HTML** de votre signature :\n\n• Cliquez sur le bouton **📋** (Copier HTML) dans l\'onglet Signature\n• Le code est copié dans le presse-papier\n• Collez-le dans votre client email (Gmail, Outlook, etc.)\n\n💡 Pour les membres de l\'équipe, utilisez le bouton **Copier HTML** dans l\'annuaire.'
    },
    {
      keywords: ['annuaire','repertoire','répertoire','directory','tous','toutes','liste'],
      reply: 'L\'**Annuaire** affiche tous les membres de l\'équipe avec leur signature :\n\n• Chaque membre est présenté dans une carte avec nom, titre, email\n• La signature complète est affichée avec son template/couleur\n• Cliquez sur **Copier HTML** pour récupérer le code de chaque membre\n\n💡 Les signatures sont triées par ordre d\'ajout dans l\'équipe.'
    },
    {
      keywords: ['historique','history','restaurer','derniere','dernière','précédente','precedente','sauvegarde'],
      reply: 'L\'**Historique** conserve vos 20 dernières signatures :\n\n• Chaque entrée montre le nom, la date et un aperçu\n• Cliquez sur **Restaurer** pour recharger la signature dans le formulaire\n• Vous pouvez **Effacer** tout l\'historique\n\n💡 L\'historique est sauvegardé automatiquement dans votre navigateur.'
    },
    {
      keywords: ['mode nuit','dark','sombre','thème','theme','dark mode','mode sombre'],
      reply: 'Le **mode sombre** adapte l\'interface pour un confort visuel optimal :\n\n• Cliquez sur le bouton 🌙/☀️ dans la barre de navigation\n• Le mode choisi est sauvegardé pour vos prochaines visites\n\n💡 Idéal pour travailler le soir ou dans un environnement peu éclairé.'
    },
    {
      keywords: ['ne marche','pas','bug','probleme','problème','erreur','fonctionne pas','rien','vide','blanc'],
      reply: 'Quelques vérifications rapides si vous rencontrez un problème :\n\n1️⃣ **Aperçu vide** ? Remplissez au moins le prénom, nom ou email\n2️⃣ **Export bloqué** ? Assurez-vous qu\'un aperçu est visible\n3️⃣ **Team non sauvegardée** ? Vérifiez votre connexion (localStorage)\n4️⃣ **Police qui change pas** ? Certains clients email ne supportent pas les Google Fonts\n\nSi le problème persiste, décrivez-le moi en détail !'
    },
  ];

  function aiFindBestReply(msg) {
    const lower = msg.toLowerCase().trim();
    // Exact keyword match first
    for (const item of aiKnowledge) {
      if (item.keywords.includes(lower)) return item.reply;
    }
    // Find topic with most keyword matches
    let best = null, bestScore = 0;
    for (const item of aiKnowledge) {
      const score = item.keywords.filter(k => lower.includes(k)).length;
      if (score > bestScore) { bestScore = score; best = item.reply; }
    }
    if (best && bestScore > 0) return best;
    // Greeting fallback
    if (lower.length < 3) return 'Bonjour ! 🙋‍♂️ Posez-moi une question sur SignIT (création, template, export, équipe…) ou cliquez sur un sujet ci-dessous.';
    return 'Je n\'ai pas trouvé de réponse spécifique à votre question. 🤔\n\nVoici ce que je peux vous expliquer :\n• ✍️ Créer une signature\n• 🎨 Templates et personnalisation\n• 👥 Gestion d\'équipe\n• 📤 Export PNG/JPG/PDF\n• 🔄 Statut dynamique et QR code\n• 📂 Import CSV\n\nCliquez sur un sujet ou reformulez votre question !';
  }

  function aiSend(msg) {
    const msgs = $('#aiMessages');
    const userDiv = document.createElement('div');
    userDiv.className = 'ai-msg ai-msg-user';
    userDiv.textContent = msg;
    msgs.appendChild(userDiv);

    setTimeout(() => {
      const reply = aiFindBestReply(msg);
      const botDiv = document.createElement('div');
      botDiv.className = 'ai-msg ai-msg-bot';
      botDiv.innerHTML = reply.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>').replace(/\n/g, '<br>');
      msgs.appendChild(botDiv);
      msgs.scrollTop = msgs.scrollHeight;
    }, 400);
  }

  function initAssistant() {
    const fab = $('#aiFab');
    const panel = $('#aiAssistant');
    const close = $('#aiClose');
    const chips = $$('.ai-chip');
    const aiInput = $('#aiInput');
    const aiSendBtn = $('#aiSendBtn');
    fab.addEventListener('click', () => panel.classList.add('open'));
    close.addEventListener('click', () => panel.classList.remove('open'));
    chips.forEach(chip => {
      chip.addEventListener('click', () => {
        panel.classList.add('open');
        aiSend(chip.textContent.trim());
      });
    });
    function sendInput() {
      const text = aiInput.value.trim();
      if (!text) return;
      aiInput.value = '';
      aiSend(text);
    }
    aiSendBtn.addEventListener('click', sendInput);
    aiInput.addEventListener('keydown', e => { if (e.key === 'Enter') sendInput(); });
    aiInput.addEventListener('focus', () => panel.classList.add('open'));
  }

  document.addEventListener('DOMContentLoaded', () => {
    init();
    setTimeout(initAssistant, 100);
  });
})();