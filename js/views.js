/* Main screens: sign-in, Today, Board, List, Settings. */
(function () {
  const JH = window.JH;
  const { h, icon, toast, openDialog, confirmBox, label, statusLabel, sourceLabel } = JH.ui;
  const S = () => JH.store;
  const data = () => S().state.data;
  const lsGet = (k) => { try { return localStorage.getItem(k); } catch (e) { return null; } };
  const lsSet = (k, v) => { try { localStorage.setItem(k, v); } catch (e) {} };

  function busy(btn, on, text) {
    btn.disabled = on;
    if (on) { btn._html = btn.innerHTML; btn.replaceChildren(h('span', { class: 'spinner' }), ' ' + (text || 'Working')); }
    else if (btn._html != null) btn.innerHTML = btn._html;
  }
  function applyTheme() {
    const t = lsGet('jh.theme') || 'auto';
    if (t === 'auto') delete document.documentElement.dataset.theme; else document.documentElement.dataset.theme = t;
  }
  const brandMark = () => h('span', { class: 'brand-mark' }, icon('briefcase'));
  const appUrl = () => location.origin + location.pathname.replace(/index\.html$/, '');

  /* ---------- sign-in / setup ---------- */
  function signIn(msg) {
    const st = S().state;
    if (st.phase === 'loading' || st.phase === 'init') {
      return h('div', { class: 'setup' }, h('div', { class: 'setup-card card card-pad' }, h('div', { class: 'row' }, h('span', { class: 'spinner' }), 'Opening your Job Hunt Tracker folder in Google Drive…')));
    }
    if (!st.configured) {
      return h('div', { class: 'setup' }, h('div', { class: 'setup-card card card-pad' },
        brandMark(),
        h('h1', {}, 'One-time Google setup'),
        h('p', { class: 'lede' }, 'This copy of the app needs a Google Client ID before anyone can sign in. You only do this once. After that, everyone you share the link with just signs in with their own Google account.'),
        h('ol', { class: 'steps' },
          h('li', {}, h('span', {}, 'In ', h('b', {}, 'Google Cloud Console'), ', create a project and turn on the ', h('b', {}, 'Google Drive API'), ' (and the ', h('b', {}, 'Google Picker API'), ' if you want the Drive file picker).')),
          h('li', {}, h('span', {}, 'Set up the ', h('b', {}, 'OAuth consent screen'), ' as External, add the scope ', h('code', {}, 'drive.file'), ', then publish the app so anyone can sign in.')),
          h('li', {}, h('span', {}, 'Create an ', h('b', {}, 'OAuth client ID'), ' of type Web application and add this address under Authorised JavaScript origins:', h('code', { class: 'codeblock', style: 'margin-top:6px' }, location.origin))),
          h('li', {}, h('span', {}, 'Paste the Client ID into ', h('code', {}, 'config.js'), ' next to this page, save, and reload.'))),
        h('p', { class: 'muted small' }, 'The README in the project folder walks through each click, and covers hosting.')));
    }
    const btn = h('button', { class: 'btn primary', type: 'button', style: 'min-height:44px;padding:0 20px' }, 'Sign in with Google');
    const err = h('p', { class: 'small', style: 'color:var(--bad);margin-top:10px', role: 'alert' }, msg || '');
    btn.addEventListener('click', async () => {
      busy(btn, true, 'Waiting for Google');
      try { await S().signIn(); } catch (e) { busy(btn, false); err.textContent = e.message === 'popup_closed' ? 'The Google window was closed before sign-in finished.' : e.message; }
    });
    return h('div', { class: 'setup' }, h('div', { class: 'setup-card card card-pad' },
      brandMark(),
      h('h1', {}, 'Every application, in your own Google Drive'),
      h('p', { class: 'lede' }, 'Track job ads, interview dates, contacts and notes, and see how your CV matches each role. Your data lives in a folder called Job Hunt Tracker in your Google Drive, and only you can open it.'),
      h('ul', { class: 'small muted', style: 'margin:16px 0;padding-left:18px;display:grid;gap:4px' },
        h('li', {}, 'The app can only open files it creates or files you pick in Drive.'),
        h('li', {}, 'Nothing is stored on any other server.')),
      btn, err));
  }

  /* ---------- today ---------- */
  function agendaRow(j, when, sub, extra) {
    const row = h('div', { class: 'ag-row', role: 'button', tabindex: '0', onclick: () => JH.nav.openJob(j.id), onkeydown: (e) => { if (e.key === 'Enter' && e.target === row) JH.nav.openJob(j.id); } },
      h('div', { class: 'ag-when' }, when, sub && h('small', {}, sub)),
      h('div', { class: 'ag-main' }, h('div', { class: 't' }, j.title || 'Untitled role'), h('div', { class: 'c' }, j.company || 'Company not set')),
      JH.ui.statusPill(j.status),
      extra);
    return row;
  }
  function section(title, rows, emptyText) {
    return h('div', {},
      h('div', { class: 'section-title' }, h('h2', {}, title), rows.length ? h('span', { class: 'count' }, rows.length) : null),
      h('div', { class: 'card agenda' }, rows.length ? rows : h('div', { class: 'empty' }, emptyText)));
  }
  function today() {
    const jobs = data().jobs;
    const t = JH.todayISO();
    const active = jobs.filter(JH.ui.isActive);
    if (!jobs.length) {
      return h('div', { class: 'wrap' }, h('div', { class: 'card empty', style: 'padding:48px 16px' },
        h('b', { style: 'font-size:18px' }, 'Add your first job'),
        h('p', { style: 'margin:4px 0 16px' }, 'Paste a Seek or LinkedIn link to start. On Android, use Share from either app. On a computer, use the bookmarklet from Settings.'),
        h('button', { class: 'btn primary', type: 'button', onclick: () => JH.drawer.openAdd() }, icon('plus'), 'Add a job')));
    }
    const ivs = [];
    active.forEach((j) => (j.interviews || []).forEach((iv) => {
      if (iv.date && iv.outcome === 'pending' && new Date(iv.date).getTime() >= Date.now() - 2 * 3600 * 1000 && JH.daysBetween(t, JH.dateOf(iv.date)) <= 30) ivs.push({ j, iv });
    }));
    ivs.sort((a, b) => a.iv.date.localeCompare(b.iv.date));
    const follow = active.filter((j) => j.followUpDate && j.followUpDate <= t).sort((a, b) => a.followUpDate.localeCompare(b.followUpDate));
    const closing = active.filter((j) => j.status === 'saved' && j.deadline && JH.daysBetween(t, j.deadline) >= 0 && JH.daysBetween(t, j.deadline) <= 7).sort((a, b) => a.deadline.localeCompare(b.deadline));
    const quiet = active.filter((j) => j.status === 'applied' && j.appliedDate && JH.daysBetween(j.appliedDate, t) >= 10 && !j.followUpDate && !(j.interviews || []).length);
    const weekAgo = JH.addDays(t, -7);
    const stats = [
      [active.length, 'Active'], [jobs.filter((j) => j.status === 'interviewing').length, 'Interviewing'],
      [jobs.filter((j) => j.status === 'offer').length, 'Offers'], [jobs.filter((j) => j.appliedDate && j.appliedDate >= weekAgo).length, 'Applied this week'],
    ];
    return h('div', { class: 'wrap' },
      h('div', { class: 'page-head' }, h('div', {}, h('h1', {}, 'Today'), h('p', {}, new Date().toLocaleDateString('en-NZ', { weekday: 'long', day: 'numeric', month: 'long' })))),
      h('div', { class: 'stats' }, stats.map(([n, l]) => h('div', { class: 'card stat' }, h('b', {}, n), h('span', {}, l)))),
      section('Coming up', ivs.map(({ j, iv }) => agendaRow(j, JH.relDay(iv.date).replace(/^./, (c) => c.toUpperCase()), JH.fmtDateTime(iv.date).replace(/^\w+,\s*/, ''), h('span', { class: 'muted small' }, iv.stage))), 'No interviews in the next 30 days.'),
      section('Follow-ups due', follow.map((j) => agendaRow(j, JH.fmtDate(j.followUpDate), JH.relDay(j.followUpDate),
        h('div', { class: 'row' },
          h('button', { class: 'btn sm', type: 'button', onclick: (e) => { e.stopPropagation(); S().updateJob(j.id, (x) => { x.followUpDate = ''; S().logActivity(x, 'Follow-up done'); }); } }, icon('check'), 'Done'),
          h('button', { class: 'btn sm ghost', type: 'button', onclick: (e) => { e.stopPropagation(); S().updateJob(j.id, (x) => { x.followUpDate = JH.addDays(JH.todayISO(), 3); }); } }, 'In 3 days')))), 'Nothing to chase today.'),
      closing.length ? section('Closing this week', closing.map((j) => agendaRow(j, JH.fmtDate(j.deadline), JH.relDay(j.deadline))), '') : null,
      quiet.length ? section('Gone quiet', quiet.map((j) => agendaRow(j, 'Applied ' + JH.fmtDate(j.appliedDate), JH.relDay(j.appliedDate),
        h('button', { class: 'btn sm', type: 'button', onclick: (e) => { e.stopPropagation(); S().updateJob(j.id, (x) => { x.followUpDate = JH.todayISO(); }); } }, 'Plan a follow-up'))), '') : null);
  }

  /* ---------- board ---------- */
  function board() {
    const jobs = data().jobs;
    const showClosed = lsGet('jh.closed') === '1';
    const closedN = jobs.filter((j) => !JH.ui.isActive(j)).length;
    const cols = JH.STATUSES.filter((s) => showClosed || JH.ACTIVE_STATUSES.includes(s.id));
    const el = h('div', { class: 'board' }, cols.map((s) => {
      const list = jobs.filter((j) => j.status === s.id).sort((a, b) => (b.updatedAt || '').localeCompare(a.updatedAt || ''));
      const col = h('div', { class: 'col', dataset: { st: s.id } },
        h('div', { class: 'col-head' }, h('span', { class: 'pill', dataset: { st: s.id } }, s.label), h('span', { class: 'count' }, list.length)),
        h('div', { class: 'col-body' }, list.map((j) => JH.ui.jobCard(j, { onOpen: JH.nav.openJob, draggable: true }))));
      col.addEventListener('dragover', (e) => { e.preventDefault(); col.classList.add('over'); });
      col.addEventListener('dragleave', (e) => { if (!col.contains(e.relatedTarget)) col.classList.remove('over'); });
      col.addEventListener('drop', (e) => {
        e.preventDefault(); col.classList.remove('over');
        const id = e.dataTransfer.getData('text/plain');
        if (id) JH.ui.setStatus(id, s.id);
      });
      return col;
    }));
    return h('div', { class: 'wrap', style: 'max-width:none' },
      h('div', { class: 'page-head' }, h('div', {}, h('h1', {}, 'Board'), h('p', {}, 'Drag a card to a new stage, or open it to change the status.')),
        closedN ? h('button', { class: 'btn', type: 'button', onclick: () => { lsSet('jh.closed', showClosed ? '0' : '1'); JH.nav.render(); } }, showClosed ? 'Hide closed' : `Show closed (${closedN})`) : null),
      el);
  }

  /* ---------- list ---------- */
  const F = { q: '', status: 'active', source: '', sort: 'updated' };
  function list() {
    const body = h('div', {});
    const render = () => {
      const q = F.q.trim().toLowerCase();
      let rows = data().jobs.filter((j) => {
        if (F.status === 'active' && !JH.ui.isActive(j)) return false;
        if (F.status !== 'active' && F.status !== 'all' && j.status !== F.status) return false;
        if (F.source && j.source !== F.source) return false;
        if (!q) return true;
        return [j.title, j.company, j.notes, j.location, (j.techStack || []).join(' '), (j.contacts || []).map((c) => c.name).join(' ')].join(' ').toLowerCase().includes(q);
      });
      const by = { updated: (a, b) => (b.updatedAt || '').localeCompare(a.updatedAt || ''), added: (a, b) => (b.createdAt || '').localeCompare(a.createdAt || ''),
        match: (a, b) => ((b.match && b.match.score) || -1) - ((a.match && a.match.score) || -1), company: (a, b) => (a.company || '').localeCompare(b.company || '') };
      rows.sort(by[F.sort]);
      body.replaceChildren(rows.length ? h('div', { class: 'card', style: 'overflow:hidden' }, h('table', { class: 'jt' },
        h('thead', {}, h('tr', {}, ['Role', 'Status', 'Found on', 'Match', 'Next', 'Pay'].map((t) => h('th', {}, t)))),
        h('tbody', {}, rows.map((j) => {
          const nd = JH.ui.nextDate(j);
          const tr = h('tr', { tabindex: '0', onclick: () => JH.nav.openJob(j.id), onkeydown: (e) => { if (e.key === 'Enter') JH.nav.openJob(j.id); } },
            h('td', {}, h('div', { class: 't' }, j.title || 'Untitled role'), h('div', { class: 'c' }, j.company || 'Company not set')),
            h('td', {}, JH.ui.statusPill(j.status)),
            h('td', {}, sourceLabel(j.source)),
            h('td', {}, j.match ? h('span', { class: 'score-dot ' + JH.ui.scoreClass(j.match.score) }, j.match.score + '%') : ''),
            h('td', {}, nd ? h('span', { class: nd.cls }, `${nd.kind}: ${nd.text}`) : ''),
            h('td', {}, JH.salaryText(j)));
          return tr;
        })))) : h('div', { class: 'card empty' }, h('b', {}, 'No jobs match'), 'Change the filters or add a job.'));
    };
    const search = h('input', { type: 'search', placeholder: 'Search roles, companies, notes, people', value: F.q, 'aria-label': 'Search', oninput: (e) => { F.q = e.target.value; render(); } });
    const sel = (key, opts, aria) => h('select', { 'aria-label': aria, value: F[key], onchange: (e) => { F[key] = e.target.value; render(); } }, opts.map(([v, l]) => h('option', { value: v }, l)));
    render();
    return h('div', { class: 'wrap' },
      h('div', { class: 'page-head' }, h('div', {}, h('h1', {}, 'All jobs'))),
      h('div', { class: 'toolbar' }, search,
        sel('status', [['active', 'Active'], ['all', 'All statuses'], ...JH.STATUSES.map((s) => [s.id, s.label])], 'Status'),
        sel('source', [['', 'Any source'], ['seek', 'Seek'], ['linkedin', 'LinkedIn'], ['trademe', 'Trade Me Jobs'], ['other', 'Other']], 'Source'),
        sel('sort', [['updated', 'Recently updated'], ['added', 'Recently added'], ['match', 'Best CV match'], ['company', 'Company A to Z']], 'Sort')),
      body);
  }

  /* ---------- settings ---------- */
  const BOOKMARKLET = `
(function(){
var A='__APP__';
function t(n){return n?(n.innerText||n.textContent||'').trim():'';}
var q=function(s){return document.querySelector(s);};
var d={url:location.href,title:'',company:'',location:'',description:''};
try{document.querySelectorAll('script[type="application/ld+json"]').forEach(function(s){try{var j=JSON.parse(s.textContent);var all=(Array.isArray(j)?j:[j]).concat((j&&j['@graph'])||[]);all.forEach(function(o){if(o&&o['@type']==='JobPosting'){d.title=d.title||o.title||'';d.company=d.company||(o.hiringOrganization&&o.hiringOrganization.name)||'';var l=Array.isArray(o.jobLocation)?o.jobLocation[0]:o.jobLocation;if(l&&l.address){d.location=d.location||[l.address.addressLocality,l.address.addressRegion].filter(Boolean).join(', ');}if(o.description){var x=document.createElement('div');x.innerHTML=o.description;d.description=d.description||t(x);}}});}catch(e){}});}catch(e){}
var sel=String(getSelection()||'');
d.title=d.title||t(q('[data-automation="job-detail-title"]'))||t(q('.job-details-jobs-unified-top-card__job-title'))||t(q('.top-card-layout__title'))||t(q('h1'));
d.company=d.company||t(q('[data-automation="advertiser-name"]'))||t(q('.job-details-jobs-unified-top-card__company-name'))||t(q('.topcard__org-name-link'))||'';
if(sel.length>200){d.description=sel;}
d.description=d.description||t(q('[data-automation="jobAdDetails"]'))||t(q('#job-details'))||t(q('.show-more-less-html__markup'))||t(q('.jobs-description__content'))||'';
if(!d.description){d.description=(document.body.innerText||'');}
d.description=d.description.slice(0,12000);
window.open(A+'#/capture?d='+encodeURIComponent(JSON.stringify(d)),'_blank');
})();`;
  const bookmarkletHref = () => 'javascript:' + encodeURIComponent(BOOKMARKLET.replace('__APP__', appUrl()).replace(/\s*\n\s*/g, ' ').trim());

  async function readCv(textarea, btn) {
    const f = data().profile.cvFile;
    if (!f) return toast('Choose your CV from Drive first.', { kind: 'bad' });
    busy(btn, true, 'Reading your CV');
    try {
      const r = await S().readFile(f);
      let text = r.text;
      if (r.pdfBase64) {
        if (!S().getKey()) throw new Error('This CV is a PDF. Add your Claude API key below so Claude can read it, or paste the text instead.');
        text = await JH.ai.pdfToText(r.pdfBase64);
      }
      text = (text || '').trim();
      if (text.length < 50) throw new Error('Very little text came out of that file. Paste your CV text instead.');
      S().mutate((d) => { d.profile.cvText = text; d.profile.cvTextAt = new Date().toISOString(); }, { silent: true });
      textarea.value = text;
      toast('CV text loaded. Check it over.');
    } catch (e) { toast(e.message, { kind: 'bad' }); }
    busy(btn, false);
  }

  function settings() {
    const st = S().state;
    const p = data().profile;
    const wrap = h('div', { class: 'wrap', style: 'max-width:860px' }, h('div', { class: 'page-head' }, h('h1', {}, 'Settings')));

    /* Drive */
    wrap.append(h('section', { class: 'card settings-sec' },
      h('h2', {}, 'Google Drive'),
      h('div', { class: 'kv' },
        h('span', { class: 'muted' }, 'Signed in as'), h('span', {}, st.user ? `${st.user.name} (${st.user.email})` : ''),
        h('span', { class: 'muted' }, 'Stored in'), st.folderId ? h('a', { href: `https://drive.google.com/drive/folders/${st.folderId}`, target: '_blank', rel: 'noopener' }, `${S().FOLDER_NAME} folder`) : h('span', {}, 'Not connected yet'),
        h('span', { class: 'muted' }, 'Last saved'), h('span', {}, st.lastSaved ? new Date(st.lastSaved).toLocaleString('en-NZ') : 'Not yet')),
      h('div', { class: 'row' },
        h('button', { class: 'btn', type: 'button', onclick: async () => { try { await S().reconnect(); toast('Synced with Google Drive'); } catch (e) { toast(e.message, { kind: 'bad' }); } } }, icon('refresh'), 'Sync now'),
        h('button', { class: 'btn danger', type: 'button', onclick: async () => { if (await confirmBox('Sign out?', 'Your data stays safe in Google Drive. This only clears the copy kept on this device.', 'Sign out')) S().signOut(); } }, 'Sign out'))));

    /* CV */
    const cvText = h('textarea', { rows: 9, placeholder: 'Your CV text appears here once loaded from Drive. You can also paste it.', value: p.cvText || '', oninput: (e) => S().mutate((d) => { d.profile.cvText = e.target.value; d.profile.cvTextAt = new Date().toISOString(); }, { silent: true }) });
    const readBtn = h('button', { class: 'btn', type: 'button', disabled: !p.cvFile }, icon('refresh'), 'Read text from file');
    readBtn.addEventListener('click', () => readCv(cvText, readBtn));
    const cvName = h('span', {}, p.cvFile ? p.cvFile.name : 'No CV chosen yet');
    const letters = h('div', { class: 'stack', style: 'gap:8px' }, p.coverLetters.map((f) => h('div', { class: 'row between' },
      h('a', { href: S().fileUrl(f), target: '_blank', rel: 'noopener' }, f.name),
      h('button', { class: 'btn sm ghost danger', type: 'button', onclick: () => { S().mutate((d) => { d.profile.coverLetters = d.profile.coverLetters.filter((x) => x.id !== f.id); }); JH.nav.render(); } }, 'Remove'))));
    wrap.append(h('section', { class: 'card settings-sec' },
      h('h2', {}, 'Your CV and cover letters'),
      h('div', { class: 'kv' }, h('span', { class: 'muted' }, 'Default CV'), h('div', { class: 'row' }, cvName,
        h('button', { class: 'btn sm', type: 'button', onclick: async () => {
          try {
            const f = await JH.ui.chooseFile('cv');
            if (!f) return;
            S().mutate((d) => { d.profile.cvFile = f; });
            JH.nav.render();
            setTimeout(() => { const b = document.querySelector('[data-read-cv]'); if (b) b.click(); }, 50);
          } catch (e) { toast(e.message, { kind: 'bad' }); }
        } }, 'Choose from Drive'),
        p.cvFile && h('a', { class: 'btn sm ghost', href: S().fileUrl(p.cvFile), target: '_blank', rel: 'noopener' }, 'Open'))),
      h('label', { class: 'f' }, 'CV text used for matching', cvText,
        h('span', { class: 'small', style: 'font-weight:400' }, p.cvTextAt ? `Updated ${JH.fmtDate(JH.dateOf(p.cvTextAt))}. Claude compares this text with each ad, so edit it if anything was missed.` : 'Claude compares this text with each ad.')),
      h('div', { class: 'row' }, readBtn),
      h('h3', {}, 'Saved cover letters'),
      p.coverLetters.length ? letters : h('p', { class: 'muted small' }, 'Link cover letter templates from Drive, then pick one per job.'),
      h('div', {}, h('button', { class: 'btn sm', type: 'button', onclick: async () => {
        try { const f = await JH.ui.chooseFile('cover'); if (f) { S().mutate((d) => { d.profile.coverLetters.push(Object.assign({ id: JH.uid() }, f)); }); JH.nav.render(); } } catch (e) { toast(e.message, { kind: 'bad' }); }
      } }, icon('plus'), 'Add cover letter'))));
    readBtn.dataset.readCv = '1';

    /* AI */
    const key = h('input', { type: 'password', autocomplete: 'off', value: S().getKey(), placeholder: 'sk-ant-…', 'aria-label': 'Claude API key' });
    const viaDrive = h('input', { type: 'checkbox', checked: !!p.aiKeyInDrive });
    const model = h('select', { 'aria-label': 'Model', value: p.model || JH.ai.DEFAULT_MODEL, onchange: (e) => S().mutate((d) => { d.profile.model = e.target.value; }, { silent: true }) },
      JH.ai.MODELS.map((m) => h('option', { value: m }, m)));
    const saveKey = () => { S().setKey(key.value.trim(), viaDrive.checked); };
    key.addEventListener('change', saveKey); viaDrive.addEventListener('change', saveKey);
    const testBtn = h('button', { class: 'btn', type: 'button' }, 'Test key');
    testBtn.addEventListener('click', async () => {
      saveKey(); busy(testBtn, true, 'Testing');
      try { await JH.ai.test(); toast('The key works.'); } catch (e) { toast(e.message, { kind: 'bad' }); }
      busy(testBtn, false);
    });
    wrap.append(h('section', { class: 'card settings-sec' },
      h('h2', {}, 'AI for CV matching'),
      h('p', { class: 'muted small' }, 'CV matching and ad reading use your own Claude API key from console.anthropic.com, so usage is billed to your account. Your CV and ad text go from this browser straight to Anthropic and nowhere else.'),
      h('label', { class: 'f' }, 'Claude API key', key),
      h('label', { class: 'check' }, viaDrive, 'Also keep the key in my Drive data file so my other devices can use it'),
      h('p', { class: 'muted small' }, 'By default the key stays on this device only. If you share your Drive folder with anyone, leave this off.'),
      h('label', { class: 'f', style: 'max-width:280px' }, 'Model', model),
      h('div', {}, testBtn)));

    /* capture */
    const bm = h('a', { class: 'btn primary', href: bookmarkletHref(), onclick: (e) => { e.preventDefault(); toast('Drag this button to your bookmarks bar instead of clicking it.'); } }, icon('briefcase'), 'Save to Job Tracker');
    wrap.append(h('section', { class: 'card settings-sec' },
      h('h2', {}, 'Adding jobs from Seek and LinkedIn'),
      h('div', { class: 'stack' },
        h('div', {}, h('h3', {}, 'On Android'), h('p', { class: 'muted' }, 'Install this app on your phone (Chrome menu, then Install app). In the Seek or LinkedIn app, open an ad, tap Share, and choose Job Hunt Tracker. The link and title arrive ready to save.')),
        h('div', {}, h('h3', {}, 'On a computer'), h('p', { class: 'muted', style: 'margin-bottom:10px' }, 'Drag this button to your bookmarks bar. On a Seek or LinkedIn job page, click it to send the title, company and ad text here. Select the ad text first if the page layout confuses it.'), bm),
        h('p', { class: 'muted small' }, 'Seek and LinkedIn change their pages often, so capture is best effort. You can always paste the ad text yourself.'))));

    /* data */
    const theme = h('select', { 'aria-label': 'Theme', value: lsGet('jh.theme') || 'auto', onchange: (e) => { lsSet('jh.theme', e.target.value); applyTheme(); } },
      [['auto', 'Match my device'], ['light', 'Light'], ['dark', 'Dark']].map(([v, l]) => h('option', { value: v }, l)));
    const imp = h('input', { type: 'file', accept: 'application/json,.json', hidden: true, onchange: async (e) => {
      const f = e.target.files[0]; if (!f) return;
      try {
        const j = JSON.parse(await f.text());
        if (!Array.isArray(j.jobs)) throw new Error('This file is not a Job Hunt Tracker export.');
        S().mutate((d) => { Object.assign(d, JH.mergeData(d, j)); });
        toast(`Imported ${j.jobs.length} jobs`);
        JH.nav.render();
      } catch (err) { toast(err.message, { kind: 'bad' }); }
    } });
    wrap.append(h('section', { class: 'card settings-sec' },
      h('h2', {}, 'Data and appearance'),
      h('div', { class: 'row' },
        h('button', { class: 'btn', type: 'button', onclick: () => JH.ui.download('job-hunt-tracker.csv', JH.toCsv(data().jobs), 'text/csv') }, 'Export CSV'),
        h('button', { class: 'btn', type: 'button', onclick: () => { const c = JSON.parse(JSON.stringify(data())); c.profile.aiKey = ''; JH.ui.download('job-hunt-tracker.json', JSON.stringify(c, null, 2), 'application/json'); } }, 'Export backup (JSON)'),
        h('button', { class: 'btn', type: 'button', onclick: () => imp.click() }, 'Import backup'), imp),
      h('label', { class: 'f', style: 'max-width:280px' }, 'Theme', theme)));
    return wrap;
  }

  Object.assign(JH.ui.views, { signIn, today, board, list, settings });
  JH.ui.applyTheme = applyTheme;
  JH.ui.busy = busy;
})();
