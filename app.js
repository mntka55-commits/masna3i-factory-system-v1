const SUPABASE_URL = 'https://favitcmfzdlvgtwicxmb.supabase.co';
const SUPABASE_PUBLISHABLE_KEY = 'sb_publishable_to-VILINGqpWLu7Sod8ULQ_YBGMP7MZ';
const client = window.supabase.createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY);
const app = document.getElementById('app');

const NAV = [
  ['dashboard', '⌂', 'الرئيسية'],
  ['models', '✦', 'الموديلات'],
  ['cutting', '✂', 'القص والإنتاج'],
  ['wip', '▤', 'WIP'],
  ['ready', '◈', 'جاهز للبيع'],
  ['inventory', '▣', 'المخزن'],
  ['purchases', '🛒', 'المشتريات'],
  ['sales', '▥', 'المبيعات'],
  ['invoices', '▤', 'الفواتير'],
  ['collections', '▣', 'التحصيلات'],
  ['expenses', '▤', 'المصروفات'],
  ['returns', '↩', 'المرتجعات'],
  ['accounts', '●', 'الحسابات'],
  ['opening-setup', '◐', 'الإعداد الافتتاحي'],
  ['customers', '●', 'العملاء'],
  ['suppliers', '◆', 'الموردين'],
  ['supplier-payments', '⇄', 'مدفوعات الموردين'],
  ['reports', '▰', 'التقارير'],
];

const NAV_GROUPS = [
  { label: 'الرئيسية', ids: ['dashboard'] },
  { label: 'الإنتاج', ids: ['models', 'cutting', 'wip', 'ready'] },
  { label: 'المخزون والشراء', ids: ['inventory', 'purchases'] },
  { label: 'المبيعات والتحصيل', ids: ['sales', 'invoices', 'collections', 'returns'] },
  { label: 'الحسابات والتقارير', ids: ['accounts', 'opening-setup', 'customers', 'suppliers', 'supplier-payments', 'expenses', 'reports'] },
];

const ROUTES = {
  dashboard: 'dashboardView',
  models: 'modelsView',
  'model-detail': 'modelDetailView',
  inventory: 'inventoryView',
  purchases: 'purchasesView',
  cutting: 'cuttingView',
  wip: 'wipView',
  ready: 'readyView',
  sales: 'salesView',
  invoices: 'invoicesView',
  collections: 'collectionsView',
  expenses: 'expensesView',
  returns: 'returnsView',
  accounts: 'accountsView',
  'opening-setup': 'openingSetupView',
  customers: 'customersView',
  'supplier-payments': 'supplierPaymentsView',
  suppliers: 'suppliersView',
  reports: 'reportsView',
};

function resolveRoute(key) {
  const name = ROUTES[key];
  return name ? window[name] : null;
}

const state = { membership: null, factory: null, user: null, modelId: null };
let routeInFlight = null;
const DRAFT_PREFIX = 'masna3i:draft:v1:';
const READ_CACHE = new Map();
const READ_CACHE_TTL = 4000;
let renderToken = 0;

const currency = new Intl.NumberFormat('en-US', { maximumFractionDigits: 2 });
const number = new Intl.NumberFormat('en-US', { maximumFractionDigits: 0 });
const money = (value) => `${currency.format(Number(value || 0))} ج`;
const qty = (value) => number.format(Number(value || 0));
const escapeHtml = (value) => String(value ?? '').replace(/[&<>'"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#039;', '"': '&quot;' }[c]));

function pageTitle(key) { return NAV.find(([id]) => id === key)?.[2] || 'مصنعي'; }

function draftKey(form) {
  if (!form || form.dataset.draftSkip === 'true' || form.id === 'loginForm' || form.id === 'factoryForm') return null;
  const id = form.id || form.dataset.draftId;
  if (!id) return null;
  return DRAFT_PREFIX + (state.factory?.id || 'unknown') + ':' + (location.hash || '#dashboard') + ':' + id;
}

function saveDraft(form) {
  const key = draftKey(form);
  if (!key) return;
  const fields = [...form.querySelectorAll('input,select,textarea')].filter((field) => field.type !== 'password');
  const data = fields.map((field, index) => ({
    key: field.name || field.id || field.dataset.draftField || (field.tagName + ':' + index),
    value: field.type === 'checkbox' || field.type === 'radio' ? field.checked : field.value,
    checked: field.type === 'checkbox' || field.type === 'radio' ? field.checked : undefined,
  }));
  try { localStorage.setItem(key, JSON.stringify({ savedAt: Date.now(), fields: data })); } catch (_) {}
}

function restoreDraft(form) {
  if (!form || form.dataset.draftRestored === 'true') return;
  form.dataset.draftRestored = 'true';
  const key = draftKey(form);
  if (!key) return;
  let payload = null;
  try { payload = JSON.parse(localStorage.getItem(key) || 'null'); } catch (_) {}
  if (!payload?.fields?.length) return;
  const fields = [...form.querySelectorAll('input,select,textarea')].filter((field) => field.type !== 'password');
  const byKey = new Map(fields.map((field, index) => [field.name || field.id || field.dataset.draftField || (field.tagName + ':' + index), field]));
  payload.fields.forEach((saved) => {
    const field = byKey.get(saved.key);
    if (!field) return;
    if (field.type === 'checkbox' || field.type === 'radio') field.checked = !!saved.checked;
    else field.value = saved.value ?? '';
  });
}

function enableDraftPersistence() {
  if (document.documentElement.dataset.draftPersistence === 'true') return;
  document.documentElement.dataset.draftPersistence = 'true';

  const capture = (event) => {
    const form = event.target.closest?.('form');
    if (form) saveDraft(form);
  };
  const restoreOnFocus = (event) => {
    const form = event.target.closest?.('form');
    if (form) restoreDraft(form);
  };

  document.addEventListener('input', capture, true);
  document.addEventListener('change', capture, true);
  document.addEventListener('focusin', restoreOnFocus, true);
  document.addEventListener('submit', (event) => {
    const form = event.target.closest?.('form');
    const key = draftKey(form);
    if (!key) return;
    setTimeout(() => {
      if (!form.isConnected) {
        try { localStorage.removeItem(key); } catch (_) {}
      }
    }, 2500);
  }, true);

  document.querySelectorAll('form').forEach(restoreDraft);
}
function setStatus(text, kind = '') {
  const node = document.querySelector('.global-status');
  if (!node) return;
  node.textContent = text || '';
  node.className = `global-status ${kind}`;
}

function loginScreen(message = '') {
  app.innerHTML = `
    <div class="auth-shell">
      <div class="auth-card">
        <div class="brand-lockup"><span class="brand-mark">م</span><div><b>مصنعي</b><small>Factory System V1</small></div></div>
        <div class="global-status error">${escapeHtml(message)}</div>
        <h1>تسجيل الدخول</h1>
        <p class="muted">الدخول بحساب المصنع الحقيقي. لا توجد بيانات تجريبية.</p>
        <form id="loginForm" class="stack-form">
          <label>البريد الإلكتروني<input id="email" type="email" autocomplete="email" required /></label>
          <label>كلمة المرور<input id="password" type="password" autocomplete="current-password" required /></label>
          <button type="submit">دخول</button>
        </form>
      </div>
    </div>`;
  document.getElementById('loginForm').addEventListener('submit', async (event) => {
    event.preventDefault();
    setStatus('جارٍ تسجيل الدخول…');
    const { error } = await client.auth.signInWithPassword({
      email: document.getElementById('email').value.trim(),
      password: document.getElementById('password').value,
    });
    if (error) return setStatus(`تعذر تسجيل الدخول: ${error.message}`, 'error');
    await route();
  });
}

function onboardingScreen() {
  app.innerHTML = `
    <div class="auth-shell"><div class="auth-card">
      <div class="brand-lockup"><span class="brand-mark">م</span><div><b>مصنعي</b><small>Factory System V1</small></div></div>
      <h1>الإعداد الأول للمصنع</h1>
      <p class="muted">الحساب مسجل، ولا يوجد مصنع مرتبط به بعد. أنشئ المصنع الأول من هنا.</p>
      <form id="factoryForm" class="stack-form">
        <label>اسم المصنع<input id="factoryName" required maxlength="120" placeholder="مثال: مصنع النور" /></label>
        <button type="submit">إنشاء المصنع</button>
      </form>
      <button id="logout" class="button secondary">تسجيل الخروج</button>
      <div class="global-status"></div>
    </div></div>`;
  document.getElementById('factoryForm').addEventListener('submit', async (event) => {
    event.preventDefault();
    const name = document.getElementById('factoryName').value.trim();
    if (!name) return;
    setStatus('جارٍ إنشاء المصنع…');
    const { error } = await client.rpc('create_first_factory', { p_name: name });
    if (error) return setStatus(`تعذر إنشاء المصنع: ${error.message}`, 'error');
    await route();
  });
  document.getElementById('logout').onclick = async () => { await client.auth.signOut(); await route(); };
}

async function fetchOne(table, select = '*') {
  const key = `${table}|${select}`;
  const cached = READ_CACHE.get(key);
  const now = Date.now();
  if (cached && (now - cached.at) < READ_CACHE_TTL) return cached.data;

  const { data, error } = await client.from(table).select(select);
  if (error) throw error;

  const rows = data || [];
  READ_CACHE.set(key, { at: now, data: rows });
  return rows;
}

function clearReadCache() {
  READ_CACHE.clear();
}

async function buildShell() {
  const email = state.user?.email || '';
  const navMap = new Map(NAV.map((item) => [item[0], item]));
  const groupedNav = NAV_GROUPS.map((group, index) => {
    const items = group.ids
      .map((id) => navMap.get(id))
      .filter(Boolean)
      .map(([id, icon, label]) => `<button class="nav-item" data-nav="${id}"><span>${icon}</span><strong>${label}</strong></button>`)
      .join('');
    return `<div class="nav-group${index > 0 ? ' with-divider' : ''}"><div class="nav-group-label">${group.label}</div>${items}</div>`;
  }).join('');

  const todayLabel = new Intl.DateTimeFormat('ar-EG', { dateStyle: 'medium' }).format(new Date());

  app.innerHTML = `
    <div class="app-shell">
      <aside class="sidebar">
        <div class="side-brand"><span class="brand-mark">م</span><div><b>مصنعي</b><small>إدارة أسهل .. إنتاج أفضل</small></div></div>
        <nav>${groupedNav}</nav>
        <div class="side-footer"><div class="factory-chip"><b>${escapeHtml(state.factory?.name || 'المصنع')}</b><span>${escapeHtml(state.membership?.role || '')}</span></div><button id="logout" class="logout">↪ تسجيل الخروج</button></div>
      </aside>
      <main class="content-shell">
        <header class="topbar"><div><span class="crumb">مصنعي /</span><h1 id="pageHeading">الرئيسية</h1></div><div class="top-actions"><button id="refresh" class="icon-button" title="تحديث">↻</button><div class="user-chip"><span class="avatar">${escapeHtml((email[0] || 'م').toUpperCase())}</span><div><b>${escapeHtml(email || 'المستخدم')}</b><small>${escapeHtml(todayLabel)}</small></div></div></div></header>
        <div class="global-status"></div>
        <section id="view" class="view"></section>
      </main>
    </div>`;

  bindNavigation();
  document.getElementById('refresh').onclick = () => renderRoute(true);
  document.getElementById('logout').onclick = async () => { await client.auth.signOut(); await route(); };
}

function setActiveNav(key) {
  document.querySelectorAll('.nav-item').forEach((button) => button.classList.toggle('active', button.dataset.nav === key));
  document.getElementById('pageHeading').textContent = pageTitle(key);
}

function statCard(icon, label, value, meta = '') {
  return `<div class="stat-card"><div class="stat-icon">${icon}</div><div><span>${label}</span><strong>${value}</strong><small>${meta}</small></div></div>`;
}

function table(headers, rows, empty = 'لا توجد حركات مسجلة حتى الآن.') {
  if (!rows.length) return `<div class="empty-state"><b>${empty}</b><span>البيانات ستظهر هنا عند تسجيل أول حركة فعلية.</span></div>`;
  return `<div class="table-wrap"><table><thead><tr>${headers.map((h) => `<th>${h}</th>`).join('')}</tr></thead><tbody>${rows.join('')}</tbody></table></div>`;
}


async function renderRoute(force = false) {
  const token = ++renderToken;
  if (force) clearReadCache();

  const key = location.hash.replace('#','') || 'dashboard';
  if (!document.getElementById('view')) await buildShell();
  if (token !== renderToken) return;
  setActiveNav(key);

  const loader = resolveRoute(key);
  if (typeof loader !== 'function') {
    setStatus(`الشاشة غير جاهزة: ${key}`, 'error');
    return;
  }

  const view = document.getElementById('view');
  if (view) {
    view.innerHTML = '<div class="panel empty-state"><b>جارٍ فتح الشاشة…</b><span>بنحمّل البيانات الفعلية، استنى لحظة.</span></div>';
  }
  try {
    setStatus('جارٍ تحميل البيانات…');
    await loader();
    if (token !== renderToken) return;
    document.querySelectorAll('form:not([data-draft-restored])').forEach(restoreDraft);
    setStatus('');
  } catch (error) {
    if (token !== renderToken) return;
    console.error(error);
    setStatus(`تعذر تحميل الشاشة: ${error.message}`, 'error');
  }
}


function bindNavigation() {
  if (document.documentElement.dataset.navigationBound === 'true') return;
  document.documentElement.dataset.navigationBound = 'true';
  document.addEventListener('click', (event) => {
    const button = event.target.closest?.('[data-nav]');
    if (!button) return;

    const key = button.dataset.nav;
    if (!key) return;

    event.preventDefault();
    event.stopImmediatePropagation();
    if (location.hash !== '#' + key) location.hash = key;
  }, true);
}

function bindInnerNav() {
  bindNavigation();
}

async function route() {
  if (routeInFlight) return routeInFlight;
  routeInFlight = (async () => {
    const { data: { session } } = await client.auth.getSession();
    if (!session) return loginScreen();
    state.user = session.user;
    const { data: memberships, error } = await client.from('factory_memberships').select('factory_id,role,active').eq('user_id', session.user.id).eq('active', true);
    if (error) return loginScreen(`تعذر قراءة صلاحية المصنع: ${error.message}`);
    if (!memberships?.length) return onboardingScreen();
    state.membership = memberships[0];
    const { data: factories, error: factoryError } = await client.from('factories').select('id,name,active').eq('id', memberships[0].factory_id).limit(1);
    if (factoryError) return loginScreen(`تعذر قراءة المصنع: ${factoryError.message}`);
    state.factory = factories?.[0] || null;
    await buildShell();
    enableDraftPersistence();
    await renderRoute();
  })();
  try { return await routeInFlight; } finally { routeInFlight = null; }
}

window.addEventListener('hashchange', renderRoute);
client.auth.onAuthStateChange((event) => {
  if (!window.__masna3iBooted) return;
  if (event === 'SIGNED_IN' || event === 'SIGNED_OUT' || event === 'USER_UPDATED') route();
});
