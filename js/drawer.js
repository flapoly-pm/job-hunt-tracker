/* The job detail panel (tabs: overview, CV match, contacts, interviews, notes & files) and the add-job dialog. */
(function () {
  const JH = window.JH;
  const { h, icon, toast, openDialog, confirmBox, label, statusLabel, sourceLabel } = JH.ui;
  const S = () => JH.store;

  let root = null, bodyEl = null, tabsEl = null, jobId = null, tab = 'overview', headRefs = null;
  const getJob = () => S().getJob(jobId);
  const upd = (fn, silent = true) => S().updateJob(jobId, fn, { silent });
  const profile = () => S().state.data.profile;

  const busy = (btn, on, text) => {
    btn.disabled = on;
    if (on) { btn._html = btn.innerHTML; btn.replaceChildren(h('span', { class: 'spinner' }), ' ' + (text || 'Working')); }
    else if (btn._html != null) btn.innerHTML = btn._html;
  };

  /* ---------- AI result -> job (only fills blanks) ---------- */
  function applyExtract(j, r) {
    const set = (k, v) => { if (v && !j[k]) j[k] = v; };
    set('title', r.title); set('company', r.company); set('location', r.location);
    set('workMode', r.workMode); set('employment', r.employment); set('seniority', r.seniority); set('visaNotes', r.visaNotes);
    set('deadline', /^\d{4}-\d{2}-\d{2}$/.test(r.deadline || '') ? r.deadline : '');
    if (r.salaryMin && !j.salaryMin) j.salaryMin = r.salaryMin;
    if (r.salaryMax && !j.salaryMax) j.salaryMax = r.salaryMax;
    if (r.salaryMin || r.salaryMax) { if (r.salaryCurrency) j.salaryCurrency = r.salaryCurrency; if (r.salaryPeriod) j.salaryPeriod = r.salaryPeriod; }
    j.techStack = j.techStack || [];
    const have = new Set(j.techStack.map((x) => x.toLowerCase()));
    (r.techStack || []).forEach((t) => { if (t && !have.has(t.toLowerCase())) { j.techStack.push(t); have.add(t.toLowerCase()); } });
    (r.contactsMentioned || []).forEach((c) => {
      if (c.name && !j.contacts.some((x) => x.name.toLowerCase() === c.name.toLowerCase())) {
        j.contacts.push(JH.newContact({ name: c.name, role: c.role || '', email: c.email || '', phone: c.phone || '', type: 'other' }));
      }
    });
    S().logActivity(j, 'Details read from the ad with AI');
  }

  /* ---------- small field builders ---------- */
  function input(job, key, text, o = {}) {
    return h('label', { class: 'f' + (o.wide ? ' wide' : '') }, text,
      h('input', { type: o.type || 'text', value: job[key] == null ? '' : job[key], placeholder: o.ph || '', inputmode: o.inputmode,
        oninput: (e) => upd((j) => { j[key] = e.target.value; }),
        onchange: o.onchange }));
  }
  function select(job, key, text, opts, o = {}) {
    return h('label', { class: 'f' }, text,
      h('select', { value: job[key] || '', onchange: (e) => upd((j) => { j[key] = e.target.value; }, !o.loud) }, opts.map(([v, l]) => h('option', { value: v }, l))));
  }

  /* ---------- shell ---------- */
  function show(id, startTab) {
    if (jobId === id && root) return;
    hide();
    if (!S().getJob(id)) return;
    jobId = id; tab = startTab || 'overview';
    const job = getJob();
    const title = h('input', { class: 'tt', type: 'text', value: job.title, placeholder: 'Job title', 'aria-label': 'Job title', oninput: (e) => upd((j) => { j.title = e.target.value; }) });
    const company = h('input', { class: 'cc', type: 'text', value: job.company, placeholder: 'Company', 'aria-label': 'Company', oninput: (e) => upd((j) => { j.company = e.target.value; }) });
    const status = h('select', { 'aria-label': 'Status', value: job.status, onchange: (e) => { JH.ui.setStatus(jobId, e.target.value, { silent: true }); renderBody(); } },
      JH.STATUSES.map((s) => h('option', { value: s.id }, s.label)));
    const linkBtn = h('a', { class: 'btn sm', target: '_blank', rel: 'noopener', href: job.url || '#', hidden: !job.url }, icon('external'), 'Open ad');
    headRefs = { title, company, status, linkBtn };
    tabsEl = h('div', { class: 'tabs', role: 'tablist' });
    bodyEl = h('div', { class: 'd-body', role: 'tabpanel' });
    const panel = h('aside', { class: 'drawer', role: 'dialog', 'aria-label': 'Job details' },
      h('div', { class: 'd-head' },
        h('div', { class: 'd-top' },
          h('div', { class: 'd-title' }, title, company),
          h('button', { class: 'btn ghost icon-btn', type: 'button', 'aria-label': 'Close', onclick: () => JH.nav.closeJob() }, icon('x'))),
        h('div', { class: 'd-actions' }, status, linkBtn,
          h('button', { class: 'btn sm ghost danger', type: 'button', onclick: removeJob }, icon('trash'), 'Delete')),
        tabsEl),
      bodyEl);
    root = h('div', { class: 'drawer-root' }, h('div', { class: 'scrim', onclick: () => JH.nav.closeJob() }), panel);
    document.body.appendChild(root);
    document.addEventListener('keydown', onKey);
    renderTabs(); renderBody();
  }
  function onKey(e) { if (e.key === 'Escape' && root && !document.querySelector('dialog[open]')) JH.nav.closeJob(); }
  function hide() {
    if (root) { root.remove(); document.removeEventListener('keydown', onKey); }
    root = bodyEl = tabsEl = headRefs = null; jobId = null;
  }
  const isOpen = () => !!root;
  const hasFocus = () => root && root.contains(document.activeElement) && /INPUT|TEXTAREA|SELECT/.test(document.activeElement.tagName);
  function refresh() {
    if (!root) return;
    const job = getJob();
    if (!job) return JH.nav.closeJob();
    headRefs.title.value = job.title; headRefs.company.value = job.company; headRefs.status.value = job.status;
    headRefs.linkBtn.hidden = !job.url; headRefs.linkBtn.href = job.url || '#';
    renderTabs(); renderBody();
  }
  const TABS = [['overview', 'Overview'], ['match', 'CV match'], ['contacts', 'Contacts'], ['interviews', 'Interviews'], ['notes', 'Notes and files']];
  function renderTabs() {
    const job = getJob();
    const count = { contacts: job.contacts.length, interviews: job.interviews.length };
    tabsEl.replaceChildren(...TABS.map(([id, text]) =>
      h('button', { type: 'button', role: 'tab', 'aria-selected': String(tab === id), onclick: () => { tab = id; renderTabs(); renderBody(); } },
        text, count[id] ? h('span', { class: 'n' }, count[id]) : null)));
  }
  function renderBody() {
    if (!bodyEl) return;
    const job = getJob();
    const fn = { overview, match, contacts, interviews, notes }[tab];
    bodyEl.replaceChildren(fn(job));
    bodyEl.scrollTop = 0;
  }
  async function removeJob() {
    const job = getJob();
    if (await confirmBox('Delete this job?', `${job.title || 'This job'} at ${job.company || 'this company'} and its contacts, interviews and notes will be removed.`, 'Delete job')) {
      S().removeJob(jobId);
      JH.nav.closeJob();
      toast('Job deleted');
    }
  }

  /* ---------- overview ---------- */
  function overview(job) {
    const aiBtn = h('button', { class: 'btn accent', type: 'button' }, icon('spark'), 'Fill in details with AI');
    aiBtn.addEventListener('click', async () => {
      const j = getJob();
      if ((j.description || '').trim().length < 60) return toast('Paste the job ad text first.', { kind: 'bad' });
      busy(aiBtn, true, 'Reading the ad');
      try {
        const r = await JH.ai.extractJob(j.description);
        S().updateJob(jobId, (x) => applyExtract(x, r));
        toast('Details filled in from the ad. Check them over.');
        refresh();
      } catch (e) { toast(e.message, { kind: 'bad' }); busy(aiBtn, false); }
    });
    const stack = h('input', { type: 'text', value: (job.techStack || []).join(', '), placeholder: 'Jira, SQL, Figma, Python',
      onchange: (e) => {
        const seen = new Set();
        const list = e.target.value.split(',').map((x) => x.trim()).filter((x) => x && !seen.has(x.toLowerCase()) && seen.add(x.toLowerCase()));
        upd((j) => { j.techStack = list; });
        e.target.value = list.join(', ');
      } });
    const urlIn = h('input', { type: 'url', value: job.url || '', placeholder: 'https://www.seek.co.nz/job/…',
      oninput: (e) => upd((j) => { j.url = e.target.value; }),
      onchange: (e) => {
        const c = JH.canonicalUrl(e.target.value.trim());
        e.target.value = c;
        upd((j) => { j.url = c; if (!j.source) j.source = JH.detectSource(c); });
        headRefs.linkBtn.hidden = !c; headRefs.linkBtn.href = c || '#';
        refresh();
      } });
    return h('div', { class: 'stack' },
      h('div', { class: 'grid two' },
        h('label', { class: 'f wide' }, 'Link to the ad', urlIn),
        select(job, 'source', 'Found on', [['', 'Not set'], ['seek', 'Seek'], ['linkedin', 'LinkedIn'], ['trademe', 'Trade Me Jobs'], ['other', 'Other']]),
        input(job, 'location', 'Location', { ph: 'Auckland CBD' }),
        select(job, 'workMode', 'Work mode', JH.WORK_MODES),
        select(job, 'employment', 'Employment', JH.EMPLOYMENT),
        input(job, 'seniority', 'Seniority', { ph: 'Senior, Lead, Head of' }),
        h('label', { class: 'f' }, 'Tech stack and tools', stack)),
      h('div', {},
        h('h3', { style: 'margin-bottom:8px' }, 'Pay'),
        h('div', { class: 'grid' },
          input(job, 'salaryMin', 'From', { type: 'number', inputmode: 'numeric' }),
          input(job, 'salaryMax', 'To', { type: 'number', inputmode: 'numeric' }),
          input(job, 'salaryCurrency', 'Currency', { ph: 'NZD' }),
          select(job, 'salaryPeriod', 'Period', JH.SALARY_PERIODS))),
      h('div', { class: 'grid two' },
        input(job, 'visaNotes', 'Visa, residency or clearance requirements', { wide: true, ph: 'NZ residents only, security clearance needed' }),
        input(job, 'appliedDate', 'Date applied', { type: 'date' }),
        input(job, 'followUpDate', 'Follow up on', { type: 'date' }),
        input(job, 'deadline', 'Applications close', { type: 'date' })),
      h('div', { class: 'stack' },
        h('div', { class: 'row between' },
          h('h3', {}, 'Job ad text'),
          aiBtn),
        h('textarea', { rows: 10, placeholder: 'Paste the full ad here. CV matching and AI fill-in read this text.', value: job.description || '',
          oninput: (e) => upd((j) => { j.description = e.target.value; }) }),
        !S().getKey() && h('p', { class: 'muted small' }, 'To use AI fill-in and CV matching, add your Claude API key in Settings.')));
  }

  /* ---------- CV match ---------- */
  function notice(title, text, action) {
    return h('div', { class: 'card card-pad' }, h('b', {}, title), h('p', { class: 'muted', style: 'margin:4px 0 10px' }, text), action);
  }
  const sevText = { high: 'Must-have gap', medium: 'Worth addressing', low: 'Minor' };
  function match(job) {
    const cv = (profile().cvText || '').trim();
    const hasAd = (job.description || '').trim().length >= 60;
    const wrap = h('div', { class: 'stack' });
    if (!cv) wrap.append(notice('Add your CV first', 'Choose your CV from Drive or paste its text in Settings. Claude compares that text with each ad.', h('button', { class: 'btn', type: 'button', onclick: () => JH.nav.go('settings') }, 'Open settings')));
    if (!hasAd) wrap.append(notice('Paste the job ad text first', 'The Overview tab has a box for the ad. The more of the ad you paste, the better the match.', h('button', { class: 'btn', type: 'button', onclick: () => { tab = 'overview'; renderTabs(); renderBody(); } }, 'Go to Overview')));
    const m = job.match;
    const run = h('button', { class: 'btn accent', type: 'button', disabled: !cv || !hasAd }, icon('spark'), m ? 'Analyse again' : 'Analyse CV match');
    run.addEventListener('click', async () => {
      const j = getJob();
      busy(run, true, 'Comparing your CV with the ad');
      try {
        const res = await JH.ai.matchCv(profile().cvText, j);
        S().updateJob(jobId, (x) => { x.match = res; S().logActivity(x, `CV match analysed: ${res.score}%`); });
        refresh();
      } catch (e) { toast(e.message, { kind: 'bad' }); busy(run, false); }
    });
    if (!m) {
      wrap.append(h('div', { class: 'row' }, run));
      return wrap;
    }
    const stale = [];
    if (m.cvHash !== JH.hash(cv)) stale.push('Your CV has changed since this analysis.');
    if (m.adHash !== JH.hash(JH.ai.adTextOf(job))) stale.push('The ad details have changed since this analysis.');
    if (stale.length) wrap.append(h('div', { class: 'banner' }, h('span', {}, stale.join(' ')), run));
    const ring = h('div', { class: 'ring ' + JH.ui.scoreClass(m.score), style: `--p:${m.score}` }, h('span', {}, m.score));
    wrap.append(
      h('div', { class: 'match-head' }, ring,
        h('div', { style: 'flex:1;min-width:200px' },
          h('h2', {}, m.verdict),
          h('p', { class: 'muted small', style: 'margin-top:4px' }, `Analysed ${JH.fmtDate(JH.dateOf(m.analysedAt))} with ${m.model || 'Claude'}`)),
        !stale.length && run),
      m.positioning && h('p', {}, m.positioning),
      h('div', { class: 'stack' },
        h('h3', {}, `Where you stand out (${(m.strengths || []).length})`),
        (m.strengths || []).map((s) => h('div', { class: 'item ok' }, h('div', { class: 'p' }, s.point), h('div', { class: 'e' }, s.evidence)))),
      h('div', { class: 'stack' },
        h('h3', {}, `Gaps to close or prepare for (${(m.gaps || []).length})`),
        (m.gaps || []).map((g) => h('div', { class: 'item ' + g.severity }, h('div', { class: 'p' }, g.point, h('span', { class: 'sev' }, sevText[g.severity] || '')), h('div', { class: 'e' }, g.suggestion)))),
      h('div', { class: 'stack' },
        h('h3', {}, 'Keywords'),
        h('div', { class: 'chips' }, (m.keywordsMatched || []).map((k) => h('span', { class: 'chip ok' }, k)), (m.keywordsMissing || []).map((k) => h('span', { class: 'chip gap' }, k)))),
      job.description && h('div', { class: 'stack' },
        h('h3', {}, 'The ad, highlighted'),
        h('div', { class: 'legend' }, h('span', {}, h('mark', { class: 'm-ok' }, 'Green'), ' is in your CV'), h('span', {}, h('mark', { class: 'm-gap' }, 'Amber'), ' is missing from your CV')),
        h('div', { class: 'ad-text' }, JH.segmentText(job.description,
          [...(m.keywordsMatched || []).map((term) => ({ term, kind: 'ok' })), ...(m.keywordsMissing || []).map((term) => ({ term, kind: 'gap' }))])
          .map((s) => (s.kind ? h('mark', { class: 'm-' + s.kind }, s.t) : s.t)))));
    return wrap;
  }

  /* ---------- contacts ---------- */
  function contactDialog(contactId) {
    const job = getJob();
    const c = contactId ? job.contacts.find((x) => x.id === contactId) : JH.newContact();
    const f = {};
    const fld = (key, text, o = {}) => (f[key] = h('input', { type: o.type || 'text', value: c[key] || '', placeholder: o.ph || '' }), h('label', { class: 'f' + (o.wide ? ' wide' : '') }, text, f[key]));
    f.type = h('select', { value: c.type }, JH.CONTACT_TYPES.map(([v, l]) => h('option', { value: v }, l)));
    f.notes = h('textarea', { rows: 3, value: c.notes || '', placeholder: 'How you were introduced, what they said, what to ask next' });
    openDialog({
      title: contactId ? 'Edit contact' : 'Add contact',
      body: h('div', { class: 'grid two' },
        fld('name', 'Name', { wide: true }), fld('role', 'Job title', { ph: 'Senior Technical Recruiter' }),
        h('label', { class: 'f' }, 'Their part in this job', f.type),
        fld('org', 'Company or agency'), fld('email', 'Email', { type: 'email' }), fld('phone', 'Phone', { type: 'tel' }),
        fld('linkedin', 'LinkedIn profile', { type: 'url' }), fld('lastContact', 'Last contact', { type: 'date' }),
        h('label', { class: 'f wide' }, 'Notes', f.notes)),
      actions: [
        { label: 'Cancel' },
        { label: 'Save contact', kind: 'primary', onClick: () => {
          const name = f.name.value.trim();
          if (!name) { toast('Enter a name for this contact.', { kind: 'bad' }); return false; }
          const next = Object.assign({}, c, { name, role: f.role.value.trim(), type: f.type.value, org: f.org.value.trim(), email: f.email.value.trim(), phone: f.phone.value.trim(), linkedin: f.linkedin.value.trim(), lastContact: f.lastContact.value, notes: f.notes.value });
          S().updateJob(jobId, (j) => {
            const i = j.contacts.findIndex((x) => x.id === next.id);
            if (i >= 0) j.contacts[i] = next; else { j.contacts.push(next); S().logActivity(j, `Added contact ${name}`); }
          });
          refresh();
        } },
      ],
    });
  }
  function contacts(job) {
    const list = job.contacts.map((c) => {
      const links = [];
      if (c.email) links.push(h('a', { class: 'btn sm', href: 'mailto:' + c.email }, icon('mail'), 'Email'));
      if (c.phone) links.push(h('a', { class: 'btn sm', href: 'tel:' + c.phone }, icon('phone'), 'Call'));
      if (c.linkedin) links.push(h('a', { class: 'btn sm', href: c.linkedin, target: '_blank', rel: 'noopener' }, icon('external'), 'LinkedIn'));
      return h('div', { class: 'entry' },
        h('div', { class: 'entry-head' },
          h('div', {},
            h('div', { class: 'name' }, c.name),
            h('div', { class: 'role' }, [c.role, c.org].filter(Boolean).join(', ') || 'No title yet')),
          h('span', { class: 'chip' }, label(JH.CONTACT_TYPES, c.type))),
        c.lastContact && h('p', { class: 'muted small', style: 'margin-top:6px' }, `Last contact ${JH.fmtDate(c.lastContact)} (${JH.relDay(c.lastContact)})`),
        c.notes && h('p', { style: 'margin-top:8px;white-space:pre-wrap' }, c.notes),
        h('div', { class: 'links' }, links,
          h('button', { class: 'btn sm ghost', type: 'button', onclick: () => { S().updateJob(jobId, (j) => { j.contacts.find((x) => x.id === c.id).lastContact = JH.todayISO(); }); refresh(); } }, 'Log contact today'),
          h('button', { class: 'btn sm ghost', type: 'button', onclick: () => contactDialog(c.id) }, 'Edit'),
          h('button', { class: 'btn sm ghost danger', type: 'button', onclick: async () => {
            if (await confirmBox('Remove contact?', `${c.name} will be removed from this job.`, 'Remove')) { S().updateJob(jobId, (j) => { j.contacts = j.contacts.filter((x) => x.id !== c.id); }); refresh(); }
          } }, 'Remove')));
    });
    return h('div', { class: 'stack' },
      h('div', { class: 'row between' }, h('h3', {}, 'People on this job'), h('button', { class: 'btn primary', type: 'button', onclick: () => contactDialog() }, icon('plus'), 'Add contact')),
      list.length ? list : h('div', { class: 'card empty' }, h('b', {}, 'No contacts yet'), 'Add the recruiter, hiring manager and anyone on the interview panel, with their role.'));
  }

  /* ---------- interviews ---------- */
  function interviewDialog(ivId) {
    const job = getJob();
    const iv = ivId ? job.interviews.find((x) => x.id === ivId) : JH.newInterview();
    const stageOpts = JH.INTERVIEW_STAGES.includes(iv.stage) ? JH.INTERVIEW_STAGES : [iv.stage, ...JH.INTERVIEW_STAGES];
    const stage = h('select', { value: iv.stage }, stageOpts.map((s) => h('option', { value: s }, s)));
    const date = h('input', { type: 'datetime-local', value: iv.date || '' });
    const format = h('select', { value: iv.format }, JH.INTERVIEW_FORMATS.map(([v, l]) => h('option', { value: v }, l)));
    const where = h('input', { type: 'text', value: iv.where || '', placeholder: 'Meeting link or address' });
    const outcome = h('select', { value: iv.outcome }, JH.OUTCOMES.map(([v, l]) => h('option', { value: v }, l)));
    const prep = h('textarea', { rows: 3, value: iv.prep || '', placeholder: 'Questions to ask, stories to use, things to research' });
    const after = h('textarea', { rows: 3, value: iv.afterNotes || '', placeholder: 'What was asked, how it went, next steps' });
    const checks = job.contacts.map((c) => {
      const cb = h('input', { type: 'checkbox', checked: iv.interviewers.includes(c.id), dataset: { id: c.id } });
      return h('label', { class: 'check' }, cb, `${c.name}${c.role ? ', ' + c.role : ''}`);
    });
    openDialog({
      title: ivId ? 'Edit interview' : 'Add interview',
      body: h('div', { class: 'grid two' },
        h('label', { class: 'f' }, 'Stage', stage), h('label', { class: 'f' }, 'Date and time', date),
        h('label', { class: 'f' }, 'Format', format), h('label', { class: 'f' }, 'Link or place', where),
        h('div', { class: 'f wide' }, 'Who you meet', checks.length ? h('div', { class: 'stack', style: 'gap:6px' }, checks) : h('span', { class: 'small' }, 'Add contacts on the Contacts tab to tag interviewers.')),
        h('label', { class: 'f wide' }, 'Preparation', prep),
        h('label', { class: 'f' }, 'How it went', outcome),
        h('label', { class: 'f wide' }, 'Notes afterwards', after)),
      wide: true,
      actions: [
        { label: 'Cancel' },
        { label: 'Save interview', kind: 'primary', onClick: () => {
          const next = Object.assign({}, iv, { stage: stage.value, date: date.value, format: format.value, where: where.value.trim(), outcome: outcome.value, prep: prep.value, afterNotes: after.value,
            interviewers: checks.map((l) => l.firstChild).filter((cb) => cb.checked).map((cb) => cb.dataset.id) });
          let moved = '';
          S().updateJob(jobId, (j) => {
            const i = j.interviews.findIndex((x) => x.id === next.id);
            if (i >= 0) j.interviews[i] = next; else { j.interviews.push(next); S().logActivity(j, `Interview added: ${next.stage}`); }
            if (!ivId && next.date) {
              const target = next.stage === 'Offer call' ? 'offer' : next.stage === 'Recruiter screen' ? 'screening' : 'interviewing';
              if (JH.PIPELINE.indexOf(j.status) >= 0 && JH.PIPELINE.indexOf(j.status) < JH.PIPELINE.indexOf(target)) { moved = target; }
            }
          });
          if (moved) { JH.ui.setStatus(jobId, moved); toast(`Moved to ${statusLabel(moved)}`); }
          refresh();
        } },
      ],
    });
  }
  function interviews(job) {
    const list = [...job.interviews].sort((a, b) => (a.date || '9').localeCompare(b.date || '9')).map((iv) => {
      const names = iv.interviewers.map((id) => (job.contacts.find((c) => c.id === id) || {}).name).filter(Boolean);
      const isLink = /^https?:\/\//i.test(iv.where || '');
      return h('div', { class: 'entry' },
        h('div', { class: 'entry-head' },
          h('div', {},
            h('div', { class: 'name' }, iv.stage),
            h('div', { class: 'role' }, iv.date ? `${JH.fmtDateTime(iv.date)} (${JH.relDay(iv.date)})` : 'No date yet')),
          h('span', { class: 'chip' + (iv.outcome === 'passed' ? ' ok' : iv.outcome === 'failed' ? ' gap' : '') }, label(JH.OUTCOMES, iv.outcome))),
        h('p', { class: 'small muted', style: 'margin-top:6px' }, label(JH.INTERVIEW_FORMATS, iv.format)),
        iv.where && h('p', { class: 'small', style: 'margin-top:2px' }, isLink ? h('a', { href: iv.where, target: '_blank', rel: 'noopener' }, 'Join or open link') : iv.where),
        names.length && h('p', { class: 'small', style: 'margin-top:2px' }, 'With ' + names.join(', ')),
        iv.prep && h('div', { style: 'margin-top:10px' }, h('b', { class: 'small' }, 'Preparation'), h('p', { style: 'white-space:pre-wrap' }, iv.prep)),
        iv.afterNotes && h('div', { style: 'margin-top:10px' }, h('b', { class: 'small' }, 'Afterwards'), h('p', { style: 'white-space:pre-wrap' }, iv.afterNotes)),
        h('div', { class: 'links' },
          h('button', { class: 'btn sm ghost', type: 'button', onclick: () => interviewDialog(iv.id) }, 'Edit'),
          h('button', { class: 'btn sm ghost danger', type: 'button', onclick: async () => {
            if (await confirmBox('Remove interview?', `${iv.stage} will be removed from this job.`, 'Remove')) { S().updateJob(jobId, (j) => { j.interviews = j.interviews.filter((x) => x.id !== iv.id); }); refresh(); }
          } }, 'Remove')));
    });
    return h('div', { class: 'stack' },
      h('div', { class: 'row between' }, h('h3', {}, 'Interview rounds'), h('button', { class: 'btn primary', type: 'button', onclick: () => interviewDialog() }, icon('plus'), 'Add interview')),
      list.length ? list : h('div', { class: 'card empty' }, h('b', {}, 'No interviews yet'), 'Add each round with its date, who you meet and your preparation notes.'));
  }

  /* ---------- notes and files ---------- */
  function fileBlock(title, file, { note, actions }) {
    return h('div', { class: 'entry' },
      h('div', { class: 'entry-head' },
        h('div', {}, h('div', { class: 'name' }, title), h('div', { class: 'role' }, file ? file.name : 'Nothing linked')),
        file && h('a', { class: 'btn sm', href: S().fileUrl(file), target: '_blank', rel: 'noopener' }, icon('external'), 'Open in Drive')),
      note && h('p', { class: 'muted small', style: 'margin-top:4px' }, note),
      h('div', { class: 'links' }, actions));
  }
  async function pick(kind, apply) {
    try {
      const f = await JH.ui.chooseFile(kind);
      if (f) { S().updateJob(jobId, (j) => apply(j, f)); refresh(); }
    } catch (e) { toast(e.message, { kind: 'bad' }); }
  }
  function notes(job) {
    const p = profile();
    const cv = job.cvFile || p.cvFile;
    const cvBlock = fileBlock('CV for this application', cv, {
      note: job.cvFile ? 'A different CV from your default.' : p.cvFile ? 'Your default CV from Settings.' : 'Set a default CV in Settings, or choose one for this job.',
      actions: [
        h('button', { class: 'btn sm', type: 'button', onclick: () => pick('cv', (j, f) => { j.cvFile = f; }) }, 'Choose from Drive'),
        job.cvFile && h('button', { class: 'btn sm ghost', type: 'button', onclick: () => { upd((j) => { j.cvFile = null; }, false); refresh(); } }, 'Use default CV'),
      ],
    });
    const saved = h('select', { 'aria-label': 'Saved cover letters', onchange: (e) => {
      const f = p.coverLetters.find((x) => x.id === e.target.value);
      if (f) { S().updateJob(jobId, (j) => { j.coverLetterFile = f; j.coverLetterNA = false; }); refresh(); }
    } }, h('option', { value: '' }, 'Use a saved cover letter'), p.coverLetters.map((f) => h('option', { value: f.id }, f.name)));
    const clBlock = fileBlock('Cover letter', job.coverLetterNA ? null : job.coverLetterFile, {
      note: job.coverLetterNA ? 'Marked as not needed for this job.' : '',
      actions: [
        !job.coverLetterNA && h('button', { class: 'btn sm', type: 'button', onclick: () => pick('cover', (j, f) => { j.coverLetterFile = f; }) }, 'Choose from Drive'),
        !job.coverLetterNA && p.coverLetters.length ? saved : null,
        h('label', { class: 'check' }, h('input', { type: 'checkbox', checked: job.coverLetterNA, onchange: (e) => { S().updateJob(jobId, (j) => { j.coverLetterNA = e.target.checked; }); refresh(); } }), 'Not needed'),
      ],
    });
    return h('div', { class: 'stack' },
      h('label', { class: 'f' }, 'Notes', h('textarea', { rows: 9, placeholder: 'Anything worth remembering: culture, team, red flags, questions to ask, salary talks', value: job.notes || '', oninput: (e) => upd((j) => { j.notes = e.target.value; }) })),
      cvBlock, clBlock,
      h('div', { class: 'stack' },
        h('h3', {}, 'Activity'),
        h('div', { class: 'timeline' }, (job.activity || []).slice(0, 25).map((a) => h('div', {}, h('time', {}, JH.fmtDate(JH.dateOf(a.at))), h('span', {}, a.text))))));
  }

  /* ---------- add a job ---------- */
  function openAdd(draft = {}) {
    const hasKey = !!S().getKey();
    const url = h('input', { type: 'url', value: draft.url || '', placeholder: 'Paste the Seek or LinkedIn link' });
    const badge = h('span', { class: 'muted small' });
    const upBadge = () => { const s = JH.detectSource(url.value.trim()); badge.textContent = s ? `Found on ${sourceLabel(s)}` : ''; };
    url.addEventListener('input', upBadge); upBadge();
    const title = h('input', { type: 'text', value: draft.title || '', placeholder: 'Product Manager' });
    const company = h('input', { type: 'text', value: draft.company || '', placeholder: 'Company name' });
    const status = h('select', { value: 'saved' }, [h('option', { value: 'saved' }, 'Saved for later'), h('option', { value: 'applied' }, 'Already applied')]);
    const desc = h('textarea', { rows: 6, value: draft.description || '', placeholder: 'Paste the job ad text. Needed for CV matching, and lets AI fill in the details.' });
    const aiChk = h('input', { type: 'checkbox', checked: hasKey && (draft.description || '').length > 60, disabled: !hasKey });
    openDialog({
      title: 'Add a job',
      body: h('div', { class: 'stack' },
        h('label', { class: 'f' }, 'Link to the ad', url, badge),
        h('div', { class: 'grid two' }, h('label', { class: 'f' }, 'Job title', title), h('label', { class: 'f' }, 'Company', company)),
        h('label', { class: 'f' }, 'Where are you with it?', status),
        h('label', { class: 'f' }, 'Job ad text', desc),
        h('label', { class: 'check' }, aiChk, hasKey ? 'Fill in the other details from the ad with AI' : 'Add your Claude API key in Settings to fill in details with AI')),
      actions: [
        { label: 'Cancel' },
        { label: 'Add job', kind: 'primary', onClick: () => {
          const canon = JH.canonicalUrl(url.value.trim());
          const dup = canon && S().state.data.jobs.find((j) => j.url === canon);
          if (dup) { toast('You already track this ad.', { action: { label: 'Open it', fn: () => JH.nav.openJob(dup.id) } }); return false; }
          if (!canon && !title.value.trim() && !desc.value.trim()) { toast('Add a link, a title or the ad text.', { kind: 'bad' }); return false; }
          const job = JH.newJob({ title: title.value.trim(), company: company.value.trim(), url: canon, source: JH.detectSource(canon), description: desc.value.trim(), status: status.value });
          if (job.status === 'applied') { job.appliedDate = JH.todayISO(); job.followUpDate = JH.addDays(job.appliedDate, 7); }
          S().addJob(job);
          JH.nav.openJob(job.id);
          if (aiChk.checked && desc.value.trim().length >= 60) {
            toast('Reading the ad with AI…', { ms: 2500 });
            JH.ai.extractJob(desc.value).then((r) => {
              S().updateJob(job.id, (j) => applyExtract(j, r));
              toast('Details filled in from the ad.');
              if (jobId === job.id) refresh();
            }).catch((e) => toast(e.message, { kind: 'bad' }));
          }
        } },
      ],
    });
  }

  JH.drawer = { show, hide, refresh, isOpen, hasFocus, openAdd, applyExtract };
})();
