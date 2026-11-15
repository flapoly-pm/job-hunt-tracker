/* Google sign-in, Google Drive storage, local offline cache and app state. */
(function () {
  const JH = window.JH;
  const CFG = window.JOBHUNT_CONFIG || {};
  const SCOPES = [
    'https://www.googleapis.com/auth/drive.file',
    'https://www.googleapis.com/auth/userinfo.email',
    'https://www.googleapis.com/auth/userinfo.profile',
  ].join(' ');
  const FOLDER_NAME = 'Job Hunt Tracker';
  const FILE_NAME = 'jobhunt-data.json';
  const K = { token: 'jh.token', user: 'jh.user', folder: 'jh.folderId', file: 'jh.fileId', cache: 'jh.cache', key: 'jh.apiKey', version: 'jh.version' };

  const state = {
    configured: !!CFG.GOOGLE_CLIENT_ID,
    phase: 'init', // init | signed-out | ready
    sync: 'idle', // idle | dirty | saving | saved | offline | needs-auth | error
    error: '',
    user: null,
    data: null,
    folderId: '',
    fileId: '',
    lastSaved: '',
    connected: false,
  };

  const listeners = new Set();
  const on = (fn) => (listeners.add(fn), () => listeners.delete(fn));
  const emit = (type = 'data') => listeners.forEach((fn) => { try { fn(type); } catch (e) { console.error(e); } });
  const setSync = (s, err = '') => { state.sync = s; state.error = err; emit('sync'); };

  const lsGet = (k) => { try { return localStorage.getItem(k); } catch (e) { return null; } };
  const lsSet = (k, v) => { try { v == null ? localStorage.removeItem(k) : localStorage.setItem(k, v); } catch (e) {} };

  /* ---------- Google sign-in (token model) ---------- */
  let tok = null;
  let gsiPromise = null;
  function loadScript(src) {
    return new Promise((res, rej) => {
      const s = document.createElement('script');
      s.src = src; s.async = true; s.onload = res;
      s.onerror = () => rej(Object.assign(new Error('offline'), { offline: true }));
      document.head.appendChild(s);
    });
  }
  function loadGsi() {
    if (window.google && google.accounts && google.accounts.oauth2) return Promise.resolve();
    if (!gsiPromise) gsiPromise = loadScript('https://accounts.google.com/gsi/client').catch((e) => { gsiPromise = null; throw e; });
    return gsiPromise;
  }
  function readStoredToken() {
    try {
      const t = JSON.parse(lsGet(K.token) || 'null');
      if (t && t.expires_at > Date.now()) tok = t;
    } catch (e) {}
  }
  function requestToken(prompt) {
    return new Promise(async (resolve, reject) => {
      try { await loadGsi(); } catch (e) { return reject(e); }
      const client = google.accounts.oauth2.initTokenClient({
        client_id: CFG.GOOGLE_CLIENT_ID,
        scope: SCOPES,
        hint: state.user ? state.user.email : undefined,
        callback: (r) => {
          if (r.error) return reject(Object.assign(new Error(r.error_description || r.error), { needAuth: true }));
          tok = { access_token: r.access_token, expires_at: Date.now() + (Number(r.expires_in) - 90) * 1000 };
          lsSet(K.token, JSON.stringify(tok));
          resolve(tok);
        },
        error_callback: (e) => reject(Object.assign(new Error(e && e.type ? e.type : 'sign-in cancelled'), { needAuth: true })),
      });
      client.requestAccessToken({ prompt });
    });
  }
  async function getToken() {
    if (tok && tok.expires_at > Date.now()) return tok;
    readStoredToken();
    if (tok && tok.expires_at > Date.now()) return tok;
    if (!navigator.onLine) throw Object.assign(new Error('offline'), { offline: true });
    return requestToken(''); // silent when consent already given
  }
  async function authFetch(url, opts = {}, retry = true) {
    const t = await getToken();
    const r = await fetch(url, Object.assign({}, opts, { headers: Object.assign({}, opts.headers, { Authorization: 'Bearer ' + t.access_token }) }));
    if (r.status === 401 && retry) { tok = null; lsSet(K.token, null); return authFetch(url, opts, false); }
    if (!r.ok) {
      let msg = r.statusText;
      try { const j = await r.json(); msg = (j.error && (j.error.message || j.error)) || msg; } catch (e) {}
      throw Object.assign(new Error(`Google Drive ${r.status}: ${msg}`), { status: r.status });
    }
    return r;
  }
  const DRIVE = 'https://www.googleapis.com/drive/v3';
  const UPLOAD = 'https://www.googleapis.com/upload/drive/v3';

  /* ---------- Drive folder + data file ---------- */
  async function findOne(q) {
    const r = await authFetch(`${DRIVE}/files?q=${encodeURIComponent(q)}&fields=files(id,name,modifiedTime)&orderBy=createdTime&pageSize=5&spaces=drive`);
    return (await r.json()).files[0] || null;
  }
  async function stillExists(id) {
    try {
      const r = await authFetch(`${DRIVE}/files/${id}?fields=id,trashed`);
      return !(await r.json()).trashed;
    } catch (e) {
      if (e.status === 404) return false;
      throw e;
    }
  }
  function multipart(meta, content, mime) {
    const b = 'jh' + Math.random().toString(36).slice(2);
    return {
      type: `multipart/related; boundary=${b}`,
      body: `--${b}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${JSON.stringify(meta)}\r\n--${b}\r\nContent-Type: ${mime}\r\n\r\n${content}\r\n--${b}--`,
    };
  }
  async function ensureStore() {
    let folderId = lsGet(K.folder);
    if (folderId && !(await stillExists(folderId))) folderId = null;
    if (!folderId) {
      const f = await findOne(`name='${FOLDER_NAME}' and mimeType='application/vnd.google-apps.folder' and trashed=false`);
      if (f) folderId = f.id;
      else {
        const r = await authFetch(`${DRIVE}/files?fields=id`, {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ name: FOLDER_NAME, mimeType: 'application/vnd.google-apps.folder' }),
        });
        folderId = (await r.json()).id;
      }
    }
    let fileId = lsGet(K.file);
    if (fileId && !(await stillExists(fileId))) fileId = null;
    if (!fileId) {
      const f = await findOne(`name='${FILE_NAME}' and '${folderId}' in parents and trashed=false`);
      if (f) fileId = f.id;
      else {
        const mp = multipart({ name: FILE_NAME, parents: [folderId], mimeType: 'application/json' }, JSON.stringify(JH.emptyData()), 'application/json');
        const r = await authFetch(`${UPLOAD}/files?uploadType=multipart&fields=id,version`, { method: 'POST', headers: { 'Content-Type': mp.type }, body: mp.body });
        fileId = (await r.json()).id;
      }
    }
    state.folderId = folderId; state.fileId = fileId;
    lsSet(K.folder, folderId); lsSet(K.file, fileId);
  }
  async function downloadData() {
    const meta = await (await authFetch(`${DRIVE}/files/${state.fileId}?fields=version,modifiedTime`)).json();
    const r = await authFetch(`${DRIVE}/files/${state.fileId}?alt=media`);
    let data = null;
    try { data = await r.json(); } catch (e) {}
    lsSet(K.version, meta.version);
    return { data: normalise(data), version: meta.version, modifiedTime: meta.modifiedTime };
  }
  function normalise(d) {
    const base = JH.emptyData();
    if (!d || typeof d !== 'object') return base;
    d.profile = Object.assign(base.profile, d.profile || {});
    d.jobs = Array.isArray(d.jobs) ? d.jobs : [];
    d.deleted = d.deleted || {};
    d.meta = Object.assign(base.meta, d.meta || {});
    d.jobs.forEach((j) => Object.assign(j, Object.assign(JH.newJob({ id: j.id }), j)));
    return d;
  }

  /* ---------- local cache ---------- */
  function writeCache() {
    if (!state.data || !state.user) return;
    lsSet(K.cache, JSON.stringify({ email: state.user.email, data: state.data }));
  }
  function readCache(email) {
    try {
      const c = JSON.parse(lsGet(K.cache) || 'null');
      if (c && c.data && (!email || c.email === email)) return normalise(c.data);
    } catch (e) {}
    return null;
  }

  /* ---------- saving ---------- */
  let saveTimer = null, saving = false, again = false;
  function scheduleSave() {
    clearTimeout(saveTimer);
    saveTimer = setTimeout(save, 1500);
  }
  function serialise(d) {
    const copy = JSON.parse(JSON.stringify(d));
    if (!copy.profile.aiKeyInDrive) copy.profile.aiKey = '';
    return JSON.stringify(copy);
  }
  function classify(e) {
    if (e && e.offline) return setSync('offline');
    if (e && e.needAuth) return setSync('needs-auth');
    if (e instanceof TypeError) return setSync('offline');
    setSync('error', (e && e.message) || 'Could not save to Google Drive');
  }
  async function save() {
    clearTimeout(saveTimer);
    if (!state.data || !state.fileId) { if (state.data && state.user) classify({ needAuth: true }); return; }
    if (saving) { again = true; return; }
    saving = true;
    setSync('saving');
    try {
      const meta = await (await authFetch(`${DRIVE}/files/${state.fileId}?fields=version`)).json();
      const known = lsGet(K.version);
      if (known && meta.version !== known) {
        const remote = await downloadData();
        state.data = JH.mergeData(state.data, remote.data);
        writeCache();
        emit('data');
      }
      const r = await authFetch(`${UPLOAD}/files/${state.fileId}?uploadType=media&fields=version,modifiedTime`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: serialise(state.data),
      });
      const j = await r.json();
      lsSet(K.version, j.version);
      state.lastSaved = j.modifiedTime;
      setSync('saved');
    } catch (e) {
      classify(e);
    } finally {
      saving = false;
      if (again) { again = false; scheduleSave(); }
    }
  }

  function mutate(fn, opts = {}) {
    fn(state.data);
    state.data.meta.updatedAt = new Date().toISOString();
    writeCache();
    state.sync = 'dirty';
    scheduleSave();
    emit(opts.silent ? 'sync' : 'data');
  }
  function updateJob(id, fn, opts = {}) {
    mutate((d) => {
      const j = d.jobs.find((x) => x.id === id);
      if (!j) return;
      fn(j);
      j.updatedAt = new Date().toISOString();
    }, opts);
  }
  function logActivity(j, text) {
    j.activity = j.activity || [];
    j.activity.unshift({ at: new Date().toISOString(), text });
    j.activity = j.activity.slice(0, 60);
  }
  function addJob(job) {
    mutate((d) => { d.jobs.unshift(job); });
    return job;
  }
  function removeJob(id) {
    mutate((d) => {
      d.jobs = d.jobs.filter((j) => j.id !== id);
      d.deleted[id] = new Date().toISOString();
    });
  }
  const getJob = (id) => (state.data ? state.data.jobs.find((j) => j.id === id) : null);

  /* ---------- connect / sign in / out ---------- */
  async function fetchUser() {
    const r = await authFetch('https://www.googleapis.com/oauth2/v3/userinfo');
    const u = await r.json();
    state.user = { email: u.email, name: u.name || u.email, picture: u.picture || '' };
    lsSet(K.user, JSON.stringify(state.user));
  }
  async function connect() {
    await ensureStore();
    const remote = await downloadData();
    const local = readCache(state.user.email);
    const merged = local && state.data ? JH.mergeData(state.data, remote.data) : local ? JH.mergeData(local, remote.data) : remote.data;
    state.data = merged;
    state.connected = true;
    state.phase = 'ready';
    writeCache();
    emit('data');
    if (JSON.stringify(merged.jobs.length) !== JSON.stringify(remote.data.jobs.length) || merged.meta.updatedAt > remote.data.meta.updatedAt) {
      state.sync = 'dirty';
      await save();
    } else {
      setSync('saved');
      state.lastSaved = remote.modifiedTime;
      emit('sync');
    }
  }
  async function signIn() {
    if (!state.configured) throw new Error('This copy of the app has no Google Client ID yet. See the setup guide.');
    setSync('saving');
    try {
      await requestToken(state.user ? '' : 'select_account');
      const prev = lsGet(K.user);
      await fetchUser();
      if (prev && JSON.parse(prev).email !== state.user.email) { lsSet(K.cache, null); lsSet(K.folder, null); lsSet(K.file, null); lsSet(K.version, null); state.data = null; }
      state.phase = 'loading';
      emit('data');
      await connect();
    } catch (e) {
      state.phase = state.data ? 'ready' : 'signed-out';
      classify(e);
      throw e;
    }
  }
  async function reconnect() {
    try {
      await requestToken('');
      if (!state.user) await fetchUser();
      await connect();
    } catch (e) { classify(e); throw e; }
  }
  function signOut() {
    try { if (tok && window.google && google.accounts) google.accounts.oauth2.revoke(tok.access_token, () => {}); } catch (e) {}
    Object.values(K).forEach((k) => lsSet(k, null));
    tok = null;
    Object.assign(state, { user: null, data: null, phase: 'signed-out', sync: 'idle', folderId: '', fileId: '', connected: false, lastSaved: '' });
    emit('data');
  }

  async function init() {
    if (!state.configured) { state.phase = 'signed-out'; emit('data'); return; }
    try { state.user = JSON.parse(lsGet(K.user) || 'null'); } catch (e) {}
    const cached = state.user ? readCache(state.user.email) : null;
    if (!state.user || !cached) { state.phase = 'signed-out'; emit('data'); return; }
    state.data = cached;
    state.folderId = lsGet(K.folder) || '';
    state.fileId = lsGet(K.file) || '';
    state.phase = 'ready';
    emit('data');
    if (!navigator.onLine) return setSync('offline');
    try {
      readStoredToken();
      await getToken();
      await connect();
    } catch (e) { classify(e); }
  }

  /* ---------- Drive files: picking and reading (CVs, cover letters) ---------- */
  async function pickFile(kind) {
    if (!CFG.GOOGLE_API_KEY) throw Object.assign(new Error('Picker not configured'), { code: 'NO_PICKER' });
    await loadScript('https://apis.google.com/js/api.js');
    await new Promise((r) => gapi.load('picker', r));
    const t = await getToken();
    return new Promise((resolve) => {
      const view = new google.picker.DocsView(google.picker.ViewId.DOCS).setIncludeFolders(true).setSelectFolderEnabled(false);
      view.setMimeTypes([
        'application/vnd.google-apps.document', 'application/pdf',
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document', 'text/plain',
      ].join(','));
      const b = new google.picker.PickerBuilder()
        .addView(view).setOAuthToken(t.access_token).setDeveloperKey(CFG.GOOGLE_API_KEY)
        .setTitle(kind === 'cover' ? 'Choose a cover letter' : 'Choose your CV')
        .setCallback((d) => {
          if (d.action === 'picked') { const f = d.docs[0]; resolve({ id: f.id, name: f.name, url: f.url, mime: f.mimeType }); }
          else if (d.action === 'cancel') resolve(null);
        });
      if (CFG.GOOGLE_APP_ID) b.setAppId(CFG.GOOGLE_APP_ID);
      b.build().setVisible(true);
    });
  }
  function fileFromLink(link, name) {
    const id = JH.driveIdFromUrl(link);
    if (!id) return null;
    return { id, name: name || 'Drive file', url: /^https?:/.test(link) ? link : `https://drive.google.com/file/d/${id}/view`, mime: '' };
  }
  const fileUrl = (f) => (f ? f.url || `https://drive.google.com/file/d/${f.id}/view` : '');

  function toBase64(u8) {
    let s = '';
    for (let i = 0; i < u8.length; i += 0x8000) s += String.fromCharCode.apply(null, u8.subarray(i, i + 0x8000));
    return btoa(s);
  }
  /* Returns { text } or { pdfBase64 }. */
  async function readFile(file) {
    let mime = file.mime;
    try {
      if (!mime) mime = (await (await authFetch(`${DRIVE}/files/${file.id}?fields=mimeType`)).json()).mimeType;
      if (mime === 'application/vnd.google-apps.document') {
        return { text: await (await authFetch(`${DRIVE}/files/${file.id}/export?mimeType=text/plain`)).text() };
      }
      if (mime === 'text/plain' || mime === 'text/markdown') {
        return { text: await (await authFetch(`${DRIVE}/files/${file.id}?alt=media`)).text() };
      }
      const buf = await (await authFetch(`${DRIVE}/files/${file.id}?alt=media`)).arrayBuffer();
      if (mime === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document') return { text: await JH.docxToText(buf) };
      if (mime === 'application/pdf') return { pdfBase64: toBase64(new Uint8Array(buf)) };
    } catch (e) {
      if (e.status === 404 || e.status === 403) throw new Error("The app can't open this file. Choose it with the Drive picker, or paste the CV text instead.");
      throw e;
    }
    throw new Error('This file type is not supported. Use a Google Doc, Word, PDF or text file.');
  }

  /* ---------- AI key (device first; optionally synced through Drive) ---------- */
  const getKey = () => lsGet(K.key) || (state.data && state.data.profile.aiKey) || '';
  function setKey(key, viaDrive) {
    lsSet(K.key, key || null);
    mutate((d) => { d.profile.aiKeyInDrive = !!viaDrive && !!key; d.profile.aiKey = viaDrive ? key : ''; }, { silent: true });
  }

  window.addEventListener('online', () => { if (state.data && state.user && state.sync !== 'saved') save(); });
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden' && state.sync === 'dirty') save(); });

  JH.store = { state, on, emit, init, signIn, reconnect, signOut, mutate, updateJob, logActivity, addJob, removeJob, getJob, save, pickFile, fileFromLink, fileUrl, readFile, getKey, setKey, FOLDER_NAME, K };
})();
