const Templates = {
  socialIcons: {
    linkedin: 'https://cdn-icons-png.flaticon.com/16/174/174857.png',
    facebook: 'https://cdn-icons-png.flaticon.com/16/733/733547.png',
    twitter: 'https://cdn-icons-png.flaticon.com/16/733/733579.png',
    instagram: 'https://cdn-icons-png.flaticon.com/16/2111/2111463.png',
  },

  getSocialHtml(links) {
    return Object.entries(links)
      .filter(([, url]) => url)
      .map(([platform, url]) =>
        `<a href="${url}" target="_blank" title="${platform}" style="display:inline-flex;width:26px;height:26px;align-items:center;justify-content:center;background:#f1f3f6;border-radius:50%;margin:0 3px;text-decoration:none;vertical-align:middle;border:1px solid #e7eaef">
          <img src="${this.socialIcons[platform] || ''}" alt="${platform}" style="width:14px;height:14px;border:none;display:block">
        </a>`
      )
      .join('');
  },

  getVCard(data) {
    return [
      'BEGIN:VCARD', 'VERSION:3.0',
      `FN:${data.firstName} ${data.lastName}`,
      `N:${data.lastName};${data.firstName};;;`,
      `ORG:${data.company || ''}`,
      `TITLE:${data.title || ''}`,
      data.email ? `EMAIL:${data.email}` : '',
      data.phone ? `TEL;TYPE=WORK,VOICE:${data.phone}` : '',
      data.mobile ? `TEL;TYPE=CELL:${data.mobile}` : '',
      data.address ? `ADR;TYPE=WORK:;;${data.address};;;;` : '',
      'END:VCARD'
    ].filter(Boolean).join('\n');
  },

  getQRCodeUrl(data) {
    const vcard = this.getVCard(data);
    return `https://api.qrserver.com/v1/create-qr-code/?size=80x80&data=${encodeURIComponent(vcard)}`;
  },

  getDynamicStatus() {
    const now = new Date();
    const day = now.getDay();
    const hours = now.getHours();
    if (day === 0 || day === 6) return '🟡 En ligne cette semaine';
    if (hours >= 9 && hours < 18) return '🟢 En ligne';
    return '🟡 Hors horaires de travail';
  },

  getFontFamily(font) {
    return font || 'Arial,Helvetica,sans-serif';
  },

  // Which optional elements each template displays
  templateFeatures: {
    classic: [],
    modern: ['photo', 'logo'],
    corporate: ['photo', 'logo', 'social', 'qr', 'status', 'banner'],
  },

  _has(tpl, feat) {
    const f = this.templateFeatures[tpl];
    return !!(f && f.indexOf(feat) !== -1);
  },

  // ---- SHARED PIECES ----
  _identity(data, nameSize = 16, showPhoto = true) {
    const namePart = `<span style="font-size:${nameSize}px;font-weight:800;color:#111827;letter-spacing:-.2px">${data.firstName} ${data.lastName}</span>`;
    const photoPart = (showPhoto && data.photoUrl)
      ? `<img src="${data.photoUrl}" alt="" style="width:50px;height:50px;border-radius:50%;object-fit:cover;display:block">`
      : '';
    return photoPart
      ? `<table cellpadding="0" cellspacing="0" border="0"><tr><td style="padding-right:12px;vertical-align:middle">${photoPart}</td><td style="vertical-align:middle">${namePart}</td></tr></table>`
      : namePart;
  },

  _roleLine(data, color, textTransform = 'uppercase') {
    const line = [data.title, data.company].filter(Boolean).join(', ');
    const dept = (data.department || '').trim();
    if (!line && !dept) return '';
    const full = dept ? (line ? line + ' · ' + dept : dept) : line;
    return `<div style="font-size:11px;font-weight:600;letter-spacing:1.6px;text-transform:${textTransform};color:${color};margin:20px 0 0 0">${full}</div>`;
  },

  _contactRows(data, color, labelWidth = 52) {
    const tel = [data.phone, data.phone2].filter(Boolean).join(' / ');
    const rows = [];
    const row = (label, val) =>
      `<div style="font-size:12px;line-height:1.7;color:#475569;padding:2.5px 0"><span style="color:#64748b;font-size:10px;font-weight:700;letter-spacing:1.1px;text-transform:uppercase;margin-right:8px;min-width:${labelWidth}px;display:inline-block">${label}</span>${val}</div>`;
    if (data.mobile && data.email) {
      rows.push(`<table cellpadding="0" cellspacing="0" border="0"><tr>
        <td style="font-size:12px;line-height:1.7;vertical-align:top;padding:2.5px 18px 2.5px 0;white-space:nowrap"><span style="color:#64748b;font-size:10px;font-weight:700;letter-spacing:1.1px;text-transform:uppercase;margin-right:8px;display:inline-block">Mobile</span>${data.mobile}</td>
        <td style="font-size:12px;line-height:1.7;vertical-align:top;padding:2.5px 0;white-space:nowrap"><span style="color:#64748b;font-size:10px;font-weight:700;letter-spacing:1.1px;text-transform:uppercase;margin-right:8px;display:inline-block">Email</span><a href="mailto:${data.email}" style="color:${color};text-decoration:none">${data.email}</a></td>
      </tr></table>`);
    } else {
      if (data.mobile) rows.push(row('Mobile', data.mobile));
      if (data.email) rows.push(row('Email', `<a href="mailto:${data.email}" style="color:${color};text-decoration:none">${data.email}</a>`));
    }
    if (tel) rows.push(row('Téléphone', `<span style="color:#374151">${tel}</span>`));
    if (data.address) rows.push(row('Adresse', `<span style="color:#4b5563">${data.address}</span>`));
    if (data.website) rows.push(row('Web', `<a href="${data.website}" style="color:${color};text-decoration:none" target="_blank">${data.website}</a>`));
    return rows.join('');
  },

  _bottomMarks(data, color, tpl) {
    const status = data.dynamicStatus ? this.getDynamicStatus() : '';
    const bottom = [];
    if (this._has(tpl, 'status') && status) bottom.push(`<td style="padding:0 12px 0 0;vertical-align:middle;white-space:nowrap"><span style="font-size:10px;color:#64748b">${status}</span></td>`);
    if (this._has(tpl, 'qr') && data.qrCode) bottom.push(`<td style="padding:0 8px 0 0;vertical-align:middle"><img src="${this.getQRCodeUrl(data)}" alt="QR" style="width:38px;height:38px;border:none;opacity:.85;display:block"></td>`);
    if (this._has(tpl, 'banner') && data.banner) bottom.push(`<td style="padding:0;vertical-align:middle"><span style="background:${hexToRgba(color,.08)};color:${color};padding:3px 12px;border-radius:20px;font-size:11px;font-weight:600;white-space:nowrap">${data.bannerLink ? `<a href="${data.bannerLink}" target="_blank" style="color:${color};text-decoration:none">${data.banner}</a>` : data.banner}</span></td>`);
    return bottom;
  },

  // ---- COMMON LAYOUT BUILDER ----
  _buildLayout(data, color, font, opts, tpl) {
    const ff = this.getFontFamily(font);
    const tel = [data.phone, data.phone2].filter(Boolean).join(' / ');
    const rLab = `color:#64748b;font-size:11px;padding-right:6px;white-space:nowrap`;
    const showLogo = this._has(tpl, 'logo') && data.logoUrl;
    const showSocial = this._has(tpl, 'social') && data.socialHtml;

    // Left column: logo then social icons
    const left = [];
    if (showLogo) {
      left.push(`<div style="margin-bottom:8px"><img src="${data.logoUrl}" alt="Logo" style="max-height:100px;max-width:180px;display:block"></div>`);
    }
    if (showSocial) {
      left.push(`<div>${data.socialHtml}</div>`);
    }
    const hasLeft = left.length > 0;

    // Right column: identity + contacts
    const right = [];
    right.push(`<div style="margin-bottom:20px">${this._identity(data, 16, this._has(tpl, 'photo'))}</div>`);
    const dept = (data.department || '').trim();
    if (data.title || data.company || dept) {
      const line = [data.title, data.company].filter(Boolean).join(', ');
      const full = dept ? (line ? line + ' · ' + dept : dept) : line;
      right.push(`<div style="font-size:12px;font-weight:600;letter-spacing:.4px;color:${color};margin:2px 0 10px 0;padding-bottom:8px;border-bottom:1px solid ${hexToRgba(color,.25)}">${full}</div>`);
    } else {
      right.push(`<div style="margin-bottom:6px"></div>`);
    }

    const addRow = (label, value) => {
      right.push(`<div style="font-size:12px;line-height:1.7;word-break:break-word;padding:2.5px 0"><span style="${rLab}">${label}</span>${value}</div>`);
    };
    if (data.mobile && data.email) {
      right.push(`<table cellpadding="0" cellspacing="0" border="0" width="100%"><tr>
        <td style="font-size:12px;line-height:1.7;vertical-align:top;padding:2.5px 10px 2.5px 0;white-space:nowrap"><span style="color:#64748b;font-size:11px;padding-right:4px">Mobile</span>${data.mobile}</td>
        <td style="font-size:12px;line-height:1.7;vertical-align:top;padding:2.5px 0;white-space:nowrap"><span style="color:#64748b;font-size:11px;padding-right:4px">Email</span><a href="mailto:${data.email}" style="color:${color};text-decoration:none">${data.email}</a></td>
      </tr></table>`);
    } else {
      if (data.mobile) right.push(`<div style="font-size:12px;line-height:1.7;white-space:nowrap;padding:2.5px 0"><span style="color:#64748b;font-size:11px;padding-right:4px">Mobile</span>${data.mobile}</div>`);
      if (data.email) right.push(`<div style="font-size:12px;line-height:1.7;white-space:nowrap;padding:2.5px 0"><span style="color:#64748b;font-size:11px;padding-right:4px">Email</span><a href="mailto:${data.email}" style="color:${color};text-decoration:none">${data.email}</a></div>`);
    }
    if (tel) addRow('Tel', tel);
    if (data.phone2 && !tel) addRow('Tel', data.phone2);
    if (data.address) addRow('Adresse', `<span style="color:#4b5563">${data.address}</span>`);
    if (data.website) addRow('Web', `<a href="${data.website}" style="color:${color};text-decoration:none" target="_blank">${data.website}</a>`);

    // Bottom marks (left to right) — table for html2canvas compatibility
    const bottom = this._bottomMarks(data, color, tpl);

    const wrap = opts.wrap || (s => s);
    const mainStyle = `font-family:${ff};font-size:13px;color:#333;${opts.tableStyle || ''}`;

    return wrap(`
      <table cellpadding="0" cellspacing="0" border="0" style="${mainStyle}">
        <tr>
          ${hasLeft ? `<td valign="top" style="${opts.leftStyle || 'padding-right:16px'}">${left.join('')}</td>` : ''}
          <td valign="top" style="${opts.rightStyle || ''}">
            ${right.join('')}
          </td>
        </tr>
        ${bottom.length ? `<tr><td colspan="${hasLeft ? 2 : 1}" style="${opts.bottomStyle || 'padding-top:6px'};border-top:1px solid #eee"><table cellpadding="0" cellspacing="0" border="0"><tr>${bottom.join('')}</tr></table></td></tr>` : ''}
      </table>
    `);
  },

  classic(data, color, font) {
    return this._buildLayout(data, color, font, {
      tableStyle: 'max-width:640px;border:1px solid #edf0f4;border-radius:10px;box-shadow:0 1px 3px rgba(16,24,40,.05)',
      leftStyle: 'padding:20px 12px 10px 24px',
      rightStyle: 'padding:20px 24px 10px',
      bottomStyle: 'padding:10px 24px 20px'
    }, 'classic');
  },

  modern(data, color, font) {
    const ff = this.getFontFamily(font);
    const logoHtml = this._has('modern', 'logo') && data.logoUrl
      ? `<div style="margin-bottom:14px"><img src="${data.logoUrl}" alt="Logo" style="max-height:100px;max-width:170px;display:block"></div>`
      : '';
    const role = this._roleLine(data, color);
    const contacts = this._contactRows(data, color);
    const gradH = hexToRgba(color, .28);
    return `
      <table cellpadding="0" cellspacing="0" border="0" style="max-width:620px;font-family:${ff};font-size:13px;color:#333;border:1px solid #edf0f6;border-radius:12px;overflow:hidden;box-shadow:0 1px 2px rgba(16,24,40,.04), 0 12px 32px rgba(16,24,40,.07)">
        <tr>
          <td style="width:5px;background:${color}"></td>
          <td style="padding:20px 22px 16px;vertical-align:top">
            ${logoHtml}
            ${this._identity(data, 17, this._has('modern', 'photo'))}
            ${role}
            <div style="padding:16px 0 14px"><div style="height:1px;background:${gradH}"></div></div>
            ${contacts}
          </td>
        </tr>
      </table>`;
  },

  corporate(data, color, font) {
    const ff = this.getFontFamily(font);
    const companyName = data.company || 'ENTREPRISE';
    const logoHtml = this._has('corporate', 'logo') && data.logoUrl
      ? `<img src="${data.logoUrl}" alt="Logo" style="max-height:100px;max-width:150px;display:block">`
      : '';
    const role = this._roleLine(data, color);
    const contacts = this._contactRows(data, color, 64);
    const bottom = this._bottomMarks(data, color, 'corporate');
    const socials = this._has('corporate', 'social') && data.socialHtml ? `<div style="margin-top:12px">${data.socialHtml}</div>` : '';
    const gradH = hexToRgba(color, .28);
    return `
      <table cellpadding="0" cellspacing="0" border="0" style="max-width:640px;font-family:${ff};font-size:13px;color:#333;border:1px solid #e4e9f0;border-radius:10px;overflow:hidden;box-shadow:0 1px 3px rgba(16,24,40,.05)">
        <tr>
          <td style="border-top:3px solid ${color};padding:16px 20px 14px">
            <table cellpadding="0" cellspacing="0" border="0"><tr>
              ${logoHtml ? `<td valign="middle" style="padding-right:16px">${logoHtml}</td>` : ''}
              <td valign="middle">
                <div style="font-size:17px;font-weight:800;color:${color};letter-spacing:.4px">${companyName}</div>
                <div style="font-size:10px;letter-spacing:3px;color:#8b95a3;margin-top:3px;text-transform:uppercase">${data.title || 'Signature'}</div>
              </td>
            </tr></table>
          </td>
        </tr>
        <tr>
          <td style="padding:4px 20px 18px">
            ${this._identity(data, 16, this._has('corporate', 'photo'))}
            ${role}
            <div style="padding:16px 0 14px"><div style="height:1px;background:${gradH}"></div></div>
            ${contacts}
            ${socials}
            ${bottom.length ? `<table cellpadding="0" cellspacing="0" border="0" style="width:100%;margin-top:16px;padding-top:12px;border-top:1px solid #f0f3f8"><tr>${bottom.join('')}</tr></table>` : ''}
          </td>
        </tr>
      </table>`;
  },

  render(data, templateName, color, font) {
    const fn = this[templateName] || this.classic;
    return fn.call(this, data, color, font);
  }
};

function hexToRgba(hex, a) {
  const r = parseInt(hex.slice(1,3), 16);
  const g = parseInt(hex.slice(3,5), 16);
  const b = parseInt(hex.slice(5,7), 16);
  return `rgba(${r},${g},${b},${a})`;
}