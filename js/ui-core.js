/* Small DOM toolkit, shared components and actions used by every view. */
(function () {
  const JH = window.JH;
  const store = () => JH.store;

  function h(tag, props, ...kids) {
    const el = document.createElement(tag);
    let deferredValue;
    for (const [k, v] of Object.entries(props || {})) {
      if (v == null || v === false) continue;
      if (k === 'class') el.className = v;
      else if (k === 'style') el.style.cssText = v;
      else if (k === 'dataset') Object.assign(el.dataset, v);
      else if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2).toLowerCase(), v);
      else if (k === 'value') deferredValue = v;
      else if (['checked', 'disabled', 'selected', 'hidden', 'draggable', 'open'].includes(k)) el[k] = !!v;
      else el.setAttribute(k, v === true ? '' : v);
    }
    const add = (c) => {
      if (c == null || c === false) return;
      if (Array.isArray(c)) return c.forEach(add);
      el.appendChild(c instanceof Node ? c : document.createTextNode(String(c)));
    };
    kids.forEach(add);
    if (deferredValue !== undefined) el.value = deferredValue;
    return el;
  }

  const ICONS = {
    plus: '<path d="M12 5v14M5 12h14"/>',
    x: '<path d="M6 6l12 12M18 6L6 18"/>',
    link: '<path d="M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1"/><path d="M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1"/>',
    trash: '<path d="M4 7h16M10 11v6M14 11v6M6 7l1 12a2 2 0 0 0 2 2h6a2 2 0 0 0 2-2l1-12M9 7V4h6v3"/>',
    check: '<path d="M5 12.5l4.5 4.5L19 7.5"/>',
    spark: '<path d="M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8z"/><path d="M19 16l.7 2 2 .7-2 .7-.7 2-.7-2-2-.7 2-.7z"/>',
    refresh: '<path d="M20 11a8 8 0 0 0-14.5-4M4 13a8 8 0 0 0 14.5 4"/><path d="M5 3v4h4M19 21v-4h-4"/>',
    mail: '<rect x="3" y="5" width="18" height="14" rx="2"/><path d="M3 7l9 6 9-6"/>',
    phone: '<path d="M5 4h4l2 5-2.5 1.5a11 11 0 0 0 5 5L15 13l5 2v4a2 2 0 0 1-2 2A16 16 0 0 1 3 6a2 2 0 0 1 2-2z"/>',
    external: '<path d="M14 4h6v6M20 4l-9 9M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5"/>',
    briefcase: '<rect x="3" y="7" width="18" height="13" rx="2"/><path d="M9 7V5a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2M3 13h18"/>',
    folder: '<path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/>',
  };
  function icon(name) {
    const s = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    s.setAttribute('viewBox', '0 0 24 24');
    s.setAttribute('fill', 'none');
    s.setAttribute('stroke', 'currentColor');
    s.setAttribute('stroke-width', '2');
    s.setAttribute('stroke-linecap', 'round');
    s.setAttribute('stroke-linejoin', 'round');
    s.setAttribute('aria-hidden', 'true');
    s.innerHTML = ICONS[name] || '';
    return s;
  }

  /* ---------- toast ---------- */
  function toast(msg, o = {}) {
    let box = document.querySelector('.toasts');
    if (!box) { box = h('div', { class: 'toasts', role: 'status', 'aria-live': 'polite' }); document.body.appendChild(box); }
    const t = h('div', { class: 'toast' + (o.kind === 'bad' ? ' bad' : '') }, h('span', {}, msg));
    if (o.action) t.appendChild(h('button', { onclick: () => { o.action.fn(); t.remove(); } }, o.action.label));
    box.appendChild(t);
    setTimeout(() => t.remove(), o.ms || (o.kind === 'bad' ? 7000 : 4000));
  }

  /* ---------- dialog ---------- */
  function openDialog({ title, body, actions = [], wide }) {
    const dlg = h('dialog', wide ? { style: 'width:min(720px,calc(100vw - 24px))' } : {});
    const close = () => { dlg.close(); dlg.remove(); };
    const foot = h('div', { class: 'dlg-foot' });
    actions.forEach((a) => {
      const b = h('button', { class: 'btn ' + (a.kind || ''), type: 'button' }, a.label);
      b.addEventListener('click', async () => {
        if (a.onClick) {
          b.disabled = true;
          let keep = false;
          try { keep = (await a.onClick(close)) === false; } finally { b.disabled = false; }
          if (keep) return;
        }
        if (!a.keepOpen) close();
      });
      foot.appendChild(b);
    });
    dlg.append(h('div', { class: 'dlg-head' }, h('h2', {}, title)), h('div', { class: 'dlg-body' }, body), foot);
    dlg.addEventListener('close', () => dlg.remove());
    document.body.appendChild(dlg);
    dlg.showModal();
    const first = dlg.querySelector('input,textarea,select');
    if (first && !matchMedia('(hover: none)').matches) first.focus();
    return { dlg, close };
  }
  function confirmBox(title, text, okLabel = 'Delete', danger = true) {
    return new Promise((resolve) => {
      let answered = false;
      const d = openDialog({
        title,
        body: h('p', { class: 'muted' }, text),
        actions: [
          { label: 'Cancel', onClick: () => { answered = true; resolve(false); } },
          { label: okLabel, kind: danger ? 'primary' : 'accent', onClick: () => { answered = true; resolve(true); } },
        ],
      });
      d.dlg.addEventListener('close', () => { if (!answered) resolve(false); });
    });
  }

  /* ---------- derived job info ---------- */
  const isActive = (j) => JH.ACTIVE_STATUSES.includes(j.status);
  const statusLabel = (id) => (JH.STATUSES.find((s) => s.id === id) || {}).label || id;
  const label = (list, v) => ((list.find((x) => x[0] === v) || [])[1]) || '';
  const sourceLabel = (s) => ({ seek: 'Seek', linkedin: 'LinkedIn', trademe: 'Trade Me Jobs', other: 'Other' }[s] || '');

  function upcomingInterview(j) {
    const now = Date.now() - 2 * 3600 * 1000;
    return (j.interviews || [])
      .filter((i) => i.date && new Date(i.date).getTime() >= now && i.outcome === 'pending')
      .sort((a, b) => a.date.localeCompare(b.date))[0] || null;
  }
  /* The one date that matters most for this job right now. */
  function nextDate(j) {
    if (!isActive(j)) return null;
    const today = JH.todayISO();
    const iv = upcomingInterview(j);
    if (iv) return { kind: 'Interview', text: JH.fmtDateTime(iv.date), cls: 'due' };
    if (j.followUpDate) {
      const late = j.followUpDate < today;
      return { kind: 'Follow up', text: (late ? 'overdue, ' : '') + JH.fmtDate(j.followUpDate), cls: late ? 'late' : j.followUpDate === today ? 'due' : '' };
    }
    if (j.deadline && j.status === 'saved') {
      const n = JH.daysBetween(today, j.deadline);
      return { kind: 'Closes', text: JH.fmtDate(j.deadline), cls: n < 0 ? 'late' : n <= 3 ? 'due' : '' };
    }
    return null;
  }
  const scoreClass = (n) => (n >= 75 ? 'sc-hi' : n >= 50 ? 'sc-mid' : 'sc-lo');

  function trackFor(j) {
    let on = JH.PIPELINE.indexOf(j.status) + 1;
    const closed = on === 0;
    if (closed) on = 1 + (j.appliedDate ? 1 : 0) + ((j.interviews || []).length ? 2 : 0);
    return h('div', { class: 'track' + (closed ? ' closed' : ''), 'aria-hidden': 'true', dataset: { st: j.status } },
      [0, 1, 2, 3, 4].map((i) => h('i', { class: i < on ? 'on' : '' })));
  }
  function statusPill(status) {
    return h('span', { class: 'pill', dataset: { st: status } }, statusLabel(status));
  }

  /* ---------- actions ---------- */
  function setStatus(id, status, opts = {}) {
    const j = store().getJob(id);
    if (!j || j.status === status) return;
    const today = JH.todayISO();
    store().updateJob(id, (job) => {
      const from = job.status;
      job.status = status;
      store().logActivity(job, `Moved from ${statusLabel(from)} to ${statusLabel(status)}`);
      if (status === 'applied') {
        if (!job.appliedDate) job.appliedDate = today;
        if (!job.followUpDate) job.followUpDate = JH.addDays(today, 7);
      }
      if (!isActive(job)) job.followUpDate = '';
    }, opts);
  }
  function nextStatus(j) {
    const i = JH.PIPELINE.indexOf(j.status);
    return i >= 0 && i < JH.PIPELINE.length - 1 ? JH.PIPELINE[i + 1] : null;
  }

  /* ---------- Drive file chooser (picker, with a paste-a-link fallback) ---------- */
  function chooseFile(kind) {
    return store().pickFile(kind).catch((e) => {
      if (e.code !== 'NO_PICKER') throw e;
      return new Promise((resolve) => {
        const link = h('input', { type: 'url', placeholder: 'https://drive.google.com/file/d/…' });
        const name = h('input', { type: 'text', placeholder: kind === 'cover' ? 'Cover letter' : 'My CV' });
        let done = false;
        const d = openDialog({
          title: kind === 'cover' ? 'Link a cover letter' : 'Link your CV',
          body: h('div', { class: 'stack' },
            h('p', { class: 'muted small' }, 'Paste the share link of the file in your Google Drive. The in-app Drive picker is not switched on for this copy of the app, so the app can store the link but cannot read the file itself.'),
            h('label', { class: 'f' }, 'Drive link', link),
            h('label', { class: 'f' }, 'Name', name)),
          actions: [
            { label: 'Cancel', onClick: () => { done = true; resolve(null); } },
            { label: 'Save link', kind: 'primary', onClick: () => {
              const f = store().fileFromLink(link.value, name.value.trim());
              if (!f) { toast("That doesn't look like a Google Drive link.", { kind: 'bad' }); return false; }
              done = true; resolve(f);
            } },
          ],
        });
        d.dlg.addEventListener('close', () => { if (!done) resolve(null); });
      });
    });
  }

  function download(name, text, mime) {
    const a = h('a', { href: URL.createObjectURL(new Blob([text], { type: mime })), download: name });
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  }

  /* ---------- the job card used on the board ---------- */
  function jobCard(j, { onOpen, draggable }) {
    const nd = nextDate(j);
    const next = nextStatus(j);
    const card = h('div', { class: 'jcard', role: 'button', tabindex: '0', dataset: { st: j.status, id: j.id }, draggable: !!draggable,
      onclick: () => onOpen(j.id),
      onkeydown: (e) => { if ((e.key === 'Enter' || e.key === ' ') && e.target === card) { e.preventDefault(); onOpen(j.id); } },
    },
      h('div', { class: 't' }, j.title || 'Untitled role'),
      h('div', { class: 'c' }, j.company || 'Company not set'),
      trackFor(j),
      h('div', { class: 'jmeta' },
        nd && h('span', { class: nd.cls }, h('b', {}, nd.kind), ' ', nd.text),
        j.match && h('span', { class: 'score-dot ' + scoreClass(j.match.score), title: 'CV match' }, j.match.score + '%'),
        j.source && h('span', {}, sourceLabel(j.source)),
        JH.salaryText(j) && h('span', {}, JH.salaryText(j)),
        j.workMode && h('span', {}, label(JH.WORK_MODES, j.workMode))),
      next && h('button', { class: 'btn sm ghost adv', type: 'button', onclick: (e) => { e.stopPropagation(); setStatus(j.id, next); } }, `Move to ${statusLabel(next)}`));
    if (draggable) {
      card.addEventListener('dragstart', (e) => { e.dataTransfer.setData('text/plain', j.id); e.dataTransfer.effectAllowed = 'move'; card.classList.add('dragging'); });
      card.addEventListener('dragend', () => card.classList.remove('dragging'));
    }
    return card;
  }

  JH.ui = { h, icon, toast, openDialog, confirmBox, isActive, statusLabel, label, sourceLabel, upcomingInterview, nextDate, scoreClass, trackFor, statusPill, setStatus, nextStatus, chooseFile, download, jobCard, views: {} };
})();
