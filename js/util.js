/* Pure helpers: no network, no Drive. Safe to unit-test in Node. */
(function (root) {
  const JH = (root.JH = root.JH || {});

  const STATUSES = [
    { id: 'saved', label: 'Saved' },
    { id: 'applied', label: 'Applied' },
    { id: 'screening', label: 'Screening' },
    { id: 'interviewing', label: 'Interviewing' },
    { id: 'offer', label: 'Offer' },
    { id: 'rejected', label: 'Rejected' },
    { id: 'withdrawn', label: 'Withdrawn' },
  ];
  const ACTIVE_STATUSES = ['saved', 'applied', 'screening', 'interviewing', 'offer'];
  const PIPELINE = ['saved', 'applied', 'screening', 'interviewing', 'offer'];

  const WORK_MODES = [['', 'Not stated'], ['remote', 'Remote'], ['hybrid', 'Hybrid'], ['onsite', 'On site']];
  const EMPLOYMENT = [['', 'Not stated'], ['permanent', 'Permanent'], ['contract', 'Contract'], ['fixed-term', 'Fixed term'], ['part-time', 'Part time']];
  const SALARY_PERIODS = [['year', 'per year'], ['month', 'per month'], ['day', 'per day'], ['hour', 'per hour']];
  const CONTACT_TYPES = [
    ['recruiter-agency', 'Agency recruiter'],
    ['recruiter-internal', 'Internal recruiter / talent'],
    ['hiring-manager', 'Hiring manager'],
    ['interviewer', 'Interviewer'],
    ['referrer', 'Referrer'],
    ['other', 'Other'],
  ];
  const INTERVIEW_STAGES = ['Recruiter screen', 'Hiring manager chat', 'Product / case round', 'Technical round', 'Panel', 'Stakeholder meeting', 'Final round', 'Offer call', 'Other'];
  const INTERVIEW_FORMATS = [['video', 'Video call'], ['phone', 'Phone'], ['onsite', 'On site'], ['take-home', 'Take-home task']];
  const OUTCOMES = [['pending', 'Pending'], ['passed', 'Went well'], ['unsure', 'Unsure'], ['failed', 'Did not progress']];

  const uid = () =>
    root.crypto && root.crypto.randomUUID
      ? root.crypto.randomUUID()
      : 'id-' + Math.random().toString(36).slice(2) + Date.now().toString(36);

  const pad = (n) => String(n).padStart(2, '0');
  const isoDate = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  const todayISO = () => isoDate(new Date());
  function addDays(iso, n) {
    const [y, m, d] = iso.split('-').map(Number);
    const dt = new Date(y, m - 1, d + n);
    return isoDate(dt);
  }
  function daysBetween(aIso, bIso) {
    const [y1, m1, d1] = aIso.split('-').map(Number);
    const [y2, m2, d2] = bIso.split('-').map(Number);
    return Math.round((Date.UTC(y2, m2 - 1, d2) - Date.UTC(y1, m1 - 1, d1)) / 86400000);
  }
  const dateOf = (s) => (s ? String(s).slice(0, 10) : '');
  function fmtDate(iso) {
    if (!iso) return '';
    const [y, m, d] = dateOf(iso).split('-').map(Number);
    return new Date(y, m - 1, d).toLocaleDateString('en-NZ', { day: 'numeric', month: 'short', year: y === new Date().getFullYear() ? undefined : 'numeric' });
  }
  function fmtDateTime(s) {
    if (!s) return '';
    const dt = new Date(s);
    if (isNaN(dt)) return s;
    return dt.toLocaleString('en-NZ', { weekday: 'short', day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' });
  }
  function relDay(iso) {
    if (!iso) return '';
    const n = daysBetween(todayISO(), dateOf(iso));
    if (n === 0) return 'today';
    if (n === 1) return 'tomorrow';
    if (n === -1) return 'yesterday';
    if (n > 1) return `in ${n} days`;
    return `${-n} days ago`;
  }

  /* ---------- URLs and sharing ---------- */
  function firstUrl(text) {
    const m = String(text || '').match(/https?:\/\/[^\s<>"')\]]+/i);
    return m ? m[0].replace(/[.,;:!?]+$/, '') : '';
  }
  function detectSource(url) {
    try {
      const h = new URL(url).hostname.toLowerCase();
      if (h.includes('seek.')) return 'seek';
      if (h.includes('linkedin.')) return 'linkedin';
      if (h.includes('trademe.')) return 'trademe';
    } catch (e) {}
    return url ? 'other' : '';
  }
  function canonicalUrl(url) {
    if (!url) return '';
    try {
      const u = new URL(url);
      const host = u.hostname.toLowerCase();
      if (host.includes('linkedin.')) {
        const m = u.pathname.match(/\/jobs\/view\/(?:[^/]*-)?(\d{6,})/);
        const id = m ? m[1] : u.searchParams.get('currentJobId');
        if (id) return `https://www.linkedin.com/jobs/view/${id}/`;
      }
      if (host.includes('seek.')) {
        const m = u.pathname.match(/\/job\/(\d+)/);
        const id = m ? m[1] : u.searchParams.get('jobId');
        if (id) return `${u.protocol}//${u.hostname}/job/${id}`;
      }
      ['utm_source', 'utm_medium', 'utm_campaign', 'utm_term', 'utm_content', 'trk', 'trackingId', 'refId', 'gclid', 'fbclid'].forEach((k) => u.searchParams.delete(k));
      u.hash = '';
      return u.toString();
    } catch (e) {
      return url;
    }
  }
  /* Turn whatever the Android share sheet sends into a draft job. */
  function parseShare({ title, text, url }) {
    const link = firstUrl(url) || firstUrl(text) || firstUrl(title);
    const clean = (s) => {
      let t = String(s || '');
      if (link) t = t.split(link).join(' ');
      t = t.replace(/\s+/g, ' ').trim();
      return t.replace(/^(check out|see|have a look at|take a look at)\s+(this\s+)?(job|role|position)?:?\s*/i, '').trim();
    };
    const PAT = /^(.{3,120})\s+(?:at|@|-|–|—|\|)\s+(.{2,80})$/i;
    const draft = { url: canonicalUrl(link), source: detectSource(link), title: '', company: '', description: '' };
    // Try the share title and the share text on their own first, so a chatty message does not leak into the company name.
    // LinkedIn style: "Check out this job at Company: Role"
    const li = [text, title].map((s) => String(s || '').split(link || '\u0000').join(' ').replace(/\s+/g, ' ').trim())
      .map((s) => s.match(/(?:job|role|position)\s+at\s+(.{2,80}?):\s*(.{3,120})$/i)).find(Boolean);
    if (li) { draft.title = li[2].trim(); draft.company = li[1].trim(); return draft; }
    for (const cand of [clean(title), clean(text), clean([title, text].filter(Boolean).join(' '))]) {
      const m = cand.match(PAT);
      if (m) { draft.title = m[1].trim(); draft.company = m[2].trim(); return draft; }
    }
    const label = clean(title) || clean(text);
    if (label && label.length <= 140) draft.title = label;
    else draft.description = clean([title, text].filter(Boolean).join(' '));
    return draft;
  }
  function driveIdFromUrl(s) {
    const str = String(s || '').trim();
    let m = str.match(/\/d\/([a-zA-Z0-9_-]{15,})/) || str.match(/[?&]id=([a-zA-Z0-9_-]{15,})/);
    if (m) return m[1];
    return /^[a-zA-Z0-9_-]{25,}$/.test(str) ? str : '';
  }

  /* ---------- hashing ---------- */
  function hash(str) {
    let h = 5381;
    const s = String(str || '');
    for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) | 0;
    return (h >>> 0).toString(36);
  }

  /* ---------- keyword highlighting ---------- */
  function escapeRe(s) {
    return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }
  /* terms: [{term, kind}]. Returns [{t, kind|null}] segments covering the whole text. */
  function segmentText(text, terms) {
    text = String(text || '');
    const list = (terms || []).filter((x) => x && x.term && x.term.trim().length > 1);
    if (!text || !list.length) return [{ t: text, kind: null }];
    const kinds = new Map();
    list.forEach((x) => {
      const k = x.term.trim().toLowerCase();
      if (!kinds.has(k)) kinds.set(k, x.kind);
    });
    const sorted = [...kinds.keys()].sort((a, b) => b.length - a.length);
    const re = new RegExp('(?<![\\p{L}\\p{N}])(' + sorted.map(escapeRe).join('|') + ')(?![\\p{L}\\p{N}])', 'giu');
    const out = [];
    let last = 0;
    let m;
    while ((m = re.exec(text))) {
      if (m.index > last) out.push({ t: text.slice(last, m.index), kind: null });
      out.push({ t: m[0], kind: kinds.get(m[0].toLowerCase()) || null });
      last = m.index + m[0].length;
      if (m[0].length === 0) re.lastIndex++;
    }
    if (last < text.length) out.push({ t: text.slice(last), kind: null });
    return out;
  }

  /* ---------- DOCX text extraction (minimal zip reader) ---------- */
  async function inflateRaw(u8) {
    const stream = new Blob([u8]).stream().pipeThrough(new DecompressionStream('deflate-raw'));
    return new Uint8Array(await new Response(stream).arrayBuffer());
  }
  async function docxToText(arrayBuffer) {
    const u8 = new Uint8Array(arrayBuffer);
    const dv = new DataView(arrayBuffer);
    let i = u8.length - 22;
    while (i >= 0 && dv.getUint32(i, true) !== 0x06054b50) i--;
    if (i < 0) throw new Error('This does not look like a Word (.docx) file.');
    const count = dv.getUint16(i + 10, true);
    let p = dv.getUint32(i + 16, true);
    const dec = new TextDecoder();
    for (let n = 0; n < count; n++) {
      if (dv.getUint32(p, true) !== 0x02014b50) break;
      const method = dv.getUint16(p + 10, true);
      const compSize = dv.getUint32(p + 20, true);
      const nameLen = dv.getUint16(p + 28, true);
      const extraLen = dv.getUint16(p + 30, true);
      const commentLen = dv.getUint16(p + 32, true);
      const localOff = dv.getUint32(p + 42, true);
      const name = dec.decode(u8.slice(p + 46, p + 46 + nameLen));
      if (name === 'word/document.xml') {
        const lNameLen = dv.getUint16(localOff + 26, true);
        const lExtraLen = dv.getUint16(localOff + 28, true);
        const start = localOff + 30 + lNameLen + lExtraLen;
        const comp = u8.slice(start, start + compSize);
        const xmlBytes = method === 0 ? comp : await inflateRaw(comp);
        const xml = dec.decode(xmlBytes);
        return xml
          .replace(/<\/w:p>/g, '\n')
          .replace(/<w:tab\s*\/?>/g, '\t')
          .replace(/<w:br[^>]*\/?>/g, '\n')
          .replace(/<[^>]+>/g, '')
          .replace(/&lt;/g, '<')
          .replace(/&gt;/g, '>')
          .replace(/&quot;/g, '"')
          .replace(/&apos;/g, "'")
          .replace(/&amp;/g, '&')
          .replace(/\n{3,}/g, '\n\n')
          .trim();
      }
      p += 46 + nameLen + extraLen + commentLen;
    }
    throw new Error('Could not find the text inside this Word file.');
  }

  /* ---------- data model ---------- */
  function emptyData() {
    const now = new Date().toISOString();
    return {
      schema: 1,
      meta: { createdAt: now, updatedAt: now },
      profile: { cvFile: null, cvText: '', cvTextAt: '', coverLetters: [], aiKeyInDrive: false, aiKey: '', model: '' },
      jobs: [],
      deleted: {},
    };
  }
  function newJob(p = {}) {
    const now = new Date().toISOString();
    return Object.assign(
      {
        id: uid(),
        title: '',
        company: '',
        url: '',
        source: '',
        location: '',
        workMode: '',
        employment: '',
        seniority: '',
        salaryMin: '',
        salaryMax: '',
        salaryCurrency: 'NZD',
        salaryPeriod: 'year',
        techStack: [],
        visaNotes: '',
        status: 'saved',
        appliedDate: '',
        deadline: '',
        followUpDate: '',
        description: '',
        notes: '',
        cvFile: null,
        coverLetterFile: null,
        coverLetterNA: false,
        contacts: [],
        interviews: [],
        match: null,
        activity: [{ at: now, text: 'Added to tracker' }],
        createdAt: now,
        updatedAt: now,
      },
      p
    );
  }
  function newContact(p = {}) {
    return Object.assign({ id: uid(), name: '', role: '', type: 'recruiter-internal', org: '', email: '', phone: '', linkedin: '', lastContact: '', notes: '' }, p);
  }
  function newInterview(p = {}) {
    return Object.assign({ id: uid(), stage: 'Recruiter screen', date: '', format: 'video', where: '', interviewers: [], prep: '', outcome: 'pending', afterNotes: '' }, p);
  }

  /* Merge two copies of the data file. Newest updatedAt wins per job. */
  function mergeData(local, remote) {
    if (!remote) return local;
    if (!local) return remote;
    const out = JSON.parse(JSON.stringify(local));
    const deleted = Object.assign({}, remote.deleted || {}, local.deleted || {});
    const byId = new Map();
    [...(remote.jobs || []), ...(local.jobs || [])].forEach((j) => {
      const cur = byId.get(j.id);
      if (!cur || (j.updatedAt || '') >= (cur.updatedAt || '')) byId.set(j.id, j);
    });
    out.jobs = [...byId.values()].filter((j) => !(deleted[j.id] && deleted[j.id] > (j.updatedAt || '')));
    out.deleted = deleted;
    const lNew = (local.meta && local.meta.updatedAt) || '';
    const rNew = (remote.meta && remote.meta.updatedAt) || '';
    out.profile = rNew > lNew ? Object.assign({}, local.profile, remote.profile) : out.profile;
    out.meta = Object.assign({}, local.meta, { updatedAt: lNew > rNew ? lNew : rNew });
    return out;
  }

  /* ---------- export ---------- */
  function csvCell(v) {
    const s = v == null ? '' : String(v);
    return /[",\n\r]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
  }
  function toCsv(jobs) {
    const cols = [
      ['Title', (j) => j.title],
      ['Company', (j) => j.company],
      ['Status', (j) => j.status],
      ['Source', (j) => j.source],
      ['Link', (j) => j.url],
      ['Location', (j) => j.location],
      ['Work mode', (j) => j.workMode],
      ['Employment', (j) => j.employment],
      ['Seniority', (j) => j.seniority],
      ['Salary min', (j) => j.salaryMin],
      ['Salary max', (j) => j.salaryMax],
      ['Currency', (j) => j.salaryCurrency],
      ['Salary period', (j) => j.salaryPeriod],
      ['Tech stack', (j) => (j.techStack || []).join('; ')],
      ['Applied', (j) => j.appliedDate],
      ['Deadline', (j) => j.deadline],
      ['Follow up', (j) => j.followUpDate],
      ['Match score', (j) => (j.match ? j.match.score : '')],
      ['Contacts', (j) => (j.contacts || []).map((c) => `${c.name} (${c.role})`).join('; ')],
      ['Interviews', (j) => (j.interviews || []).map((i) => `${i.stage} ${i.date}`).join('; ')],
      ['Notes', (j) => j.notes],
      ['Added', (j) => j.createdAt],
    ];
    const lines = [cols.map((c) => csvCell(c[0])).join(',')];
    jobs.forEach((j) => lines.push(cols.map((c) => csvCell(c[1](j))).join(',')));
    return lines.join('\r\n');
  }

  function salaryText(j) {
    const a = Number(j.salaryMin) || 0;
    const b = Number(j.salaryMax) || 0;
    if (!a && !b) return '';
    const f = (n) => (n >= 1000 && j.salaryPeriod === 'year' ? Math.round(n / 1000) + 'k' : n.toLocaleString('en-NZ'));
    const per = { year: '', month: '/mo', day: '/day', hour: '/hr' }[j.salaryPeriod] || '';
    const range = a && b && a !== b ? `${f(a)} to ${f(b)}` : f(a || b);
    return `${j.salaryCurrency || ''} ${range}${per}`.trim();
  }

  Object.assign(JH, {
    STATUSES, ACTIVE_STATUSES, PIPELINE, WORK_MODES, EMPLOYMENT, SALARY_PERIODS, CONTACT_TYPES,
    INTERVIEW_STAGES, INTERVIEW_FORMATS, OUTCOMES,
    uid, todayISO, addDays, daysBetween, dateOf, fmtDate, fmtDateTime, relDay,
    firstUrl, detectSource, canonicalUrl, parseShare, driveIdFromUrl,
    hash, segmentText, docxToText, emptyData, newJob, newContact, newInterview, mergeData, toCsv, salaryText,
  });
  if (typeof module !== 'undefined') module.exports = JH;
})(typeof window !== 'undefined' ? window : globalThis);
