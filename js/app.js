/* App shell: top bar, routing, sync status, share-sheet and bookmarklet intake, start-up. */
(function () {
  const JH = window.JH;
  const { h, icon, toast } = JH.ui;
  const S = () => JH.store;
  const root = document.getElementById('app');
  const VIEWS = ['today', 'board', 'list', 'settings'];
  const LABELS = { today: 'Today', board: 'Board', list: 'All jobs', settings: 'Settings' };
  const lsGet = (k) => { try { return localStorage.getItem(k); } catch (e) { return null; } };
  const lsSet = (k, v) => { try { localStorage.setItem(k, v); } catch (e) {} };

  let view = VIEWS.includes(lsGet('jh.view')) ? lsGet('jh.view') : 'today';
  let lastPhase = null;
  let syncEl = null, bannerEl = null;
  let pending = null;
  try { pending = JSON.parse(sessionStorage.getItem('jh.pending') || 'null'); } catch (e) {}

  const nav = {
    go: (v) => { location.hash = '#/' + v; },
    openJob: (id) => { location.hash = '#/job/' + id; },
    closeJob: () => { location.hash = '#/' + view; },
    render: () => render(),
  };
  JH.nav = nav;

  /* ---------- intake: Android share sheet, bookmarklet, shortcut ---------- */
  function queueIntake(draft) {
    pending = draft || {};
    try { sessionStorage.setItem('jh.pending', JSON.stringify(pending)); } catch (e) {}
    flushIntake();
  }
  function flushIntake() {
    if (!pending || S().state.phase !== 'ready') return;
    const d = pending;
    pending = null;
    try { sessionStorage.removeItem('jh.pending'); } catch (e) {}
    setTimeout(() => JH.drawer.openAdd(d), 0);
  }
  function readLaunchParams() {
    const q = new URLSearchParams(location.search);
    if (!q.toString()) return;
    if (q.has('url') || q.has('text') || q.has('title')) {
      pending = JH.parseShare({ title: q.get('title') || '', text: q.get('text') || '', url: q.get('url') || '' });
    } else if (q.get('add')) {
      pending = {};
    }
    if (pending) { try { sessionStorage.setItem('jh.pending', JSON.stringify(pending)); } catch (e) {} }
    history.replaceState(null, '', location.pathname + (location.hash || ''));
  }
  function handleCapture(qs) {
    let d = null;
    try { d = JSON.parse(new URLSearchParams(qs).get('d') || 'null'); } catch (e) {}
    history.replaceState(null, '', location.pathname + '#/' + view);
    if (d && (d.url || d.title || d.description)) {
      const url = JH.canonicalUrl(d.url || '');
      queueIntake({ url, source: JH.detectSource(url), title: (d.title || '').trim(), company: (d.company || '').trim(), description: (d.description || '').trim() });
    }
    route();
  }

  /* ---------- routing ---------- */
  function route() {
    const raw = location.hash.replace(/^#\/?/, '');
    const [path, qs] = raw.split('?');
    const parts = path.split('/');
    if (parts[0] === 'capture') return handleCapture(qs || '');
    if (S().state.phase !== 'ready') return;
    if (parts[0] === 'job' && parts[1]) {
      if (!root.querySelector('.topbar')) render();
      return JH.drawer.show(parts[1]);
    }
    if (VIEWS.includes(parts[0])) { view = parts[0]; lsSet('jh.view', view); }
    JH.drawer.hide();
    render();
  }

  /* ---------- sync status ---------- */
  const SYNC_TEXT = { idle: '', dirty: 'Unsaved changes', saving: 'Saving to Drive', saved: 'Saved to Drive', offline: 'Offline, will sync later', 'needs-auth': 'Reconnect to Google', error: 'Not saved, tap to retry' };
  function updateSync() {
    const st = S().state;
    if (syncEl) { syncEl.dataset.s = st.sync; syncEl.lastChild.textContent = SYNC_TEXT[st.sync] || ''; }
    if (!bannerEl) return;
    bannerEl.replaceChildren();
    bannerEl.hidden = true;
    if (st.sync === 'needs-auth' || st.sync === 'error') {
      bannerEl.hidden = false;
      bannerEl.className = 'banner ' + (st.sync === 'error' ? 'bad' : '');
      const btn = h('button', { class: 'btn sm', type: 'button', onclick: syncAction }, st.sync === 'error' ? 'Try again' : 'Reconnect to Google');
      bannerEl.append(h('span', {}, st.sync === 'error' ? `Could not save to Google Drive. ${st.error} Your changes are kept on this device.` : 'Google needs you to confirm sign-in again. Your changes are kept on this device until then.'), btn);
    }
  }
  async function syncAction() {
    const s = S().state.sync;
    if (s !== 'error' && s !== 'needs-auth') return;
    try { await (s === 'error' ? S().save() : S().reconnect()); } catch (e) { toast(e.message || 'Could not reconnect', { kind: 'bad' }); }
  }

  /* ---------- shell ---------- */
  function topbar() {
    syncEl = h('button', { class: 'sync', type: 'button', onclick: syncAction, 'aria-live': 'polite' }, h('i', {}), h('span', {}));
    const u = S().state.user;
    return h('header', { class: 'topbar' },
      h('div', { class: 'brand' }, h('span', { class: 'brand-mark' }, icon('briefcase')), h('span', {}, 'Job Hunt')),
      h('nav', { class: 'nav', 'aria-label': 'Main' }, VIEWS.map((v) => h('button', { type: 'button', 'aria-current': v === view ? 'page' : null, onclick: () => nav.go(v) }, LABELS[v]))),
      h('div', { class: 'spacer' }),
      syncEl,
      h('button', { class: 'btn primary', type: 'button', onclick: () => JH.drawer.openAdd() }, icon('plus'), 'Add job'),
      u && h('span', { class: 'avatar', title: u.email }, u.picture ? h('img', { src: u.picture, alt: '', referrerpolicy: 'no-referrer' }) : (u.name || '?').slice(0, 1).toUpperCase()));
  }
  function render() {
    const st = S().state;
    const keepScroll = window.scrollY;
    root.replaceChildren();
    syncEl = bannerEl = null;
    if (st.phase !== 'ready') { root.append(JH.ui.views.signIn()); return; }
    bannerEl = h('div', { class: 'banner', style: 'margin:12px 20px 0', hidden: true, role: 'status' });
    root.append(topbar(), bannerEl, JH.ui.views[view]());
    updateSync();
    window.scrollTo(0, keepScroll);
  }

  S().on((type) => {
    if (type === 'sync') return updateSync();
    const st = S().state;
    if (st.phase !== lastPhase) {
      lastPhase = st.phase;
      render();
      if (st.phase === 'ready') { route(); flushIntake(); }
      return;
    }
    render();
    if (st.phase === 'ready' && JH.drawer.isOpen() && !JH.drawer.hasFocus()) JH.drawer.refresh();
  });
  window.addEventListener('hashchange', route);
  window.addEventListener('beforeunload', (e) => {
    const s = S().state.sync;
    if (S().state.data && (s === 'dirty' || s === 'saving')) { e.preventDefault(); e.returnValue = ''; }
  });

  /* ---------- start ---------- */
  JH.ui.applyTheme();
  readLaunchParams();
  render();
  S().init().then(() => { if (S().state.phase === 'ready') { lastPhase = 'ready'; route(); flushIntake(); } });
  if (/^#\/capture/.test(location.hash)) route();
  if ('serviceWorker' in navigator && /^https?:$/.test(location.protocol)) {
    navigator.serviceWorker.register('sw.js').catch(() => {});
  }
})();
