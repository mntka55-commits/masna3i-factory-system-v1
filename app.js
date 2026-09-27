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

async function dashboard() {
  const [invoices, collections, ready, wip, inventory, models, purchases] = await Promise.all([
    fetchOne('v_invoice_totals', 'invoice_id,invoice_number,invoice_date,invoice_total'),
    fetchOne('collections', 'amount,created_at'),
    fetchOne('v_ready_balances', 'model_id,model_code,model_name,ready_pieces'),
    fetchOne('v_wip_balances', 'model_id,model_code,model_name,wip_pieces'),
    fetchOne('v_inventory_balances', 'material_id,code,name,unit,current_quantity,minimum_stock'),
    fetchOne('models', 'id,code,name'),
    fetchOne('v_purchase_totals', 'purchase_invoice_id,total_amount'),
  ]);
  const salesTotal = invoices.reduce((s, r) => s + Number(r.invoice_total || 0), 0);
  const collectionTotal = collections.reduce((s, r) => s + Number(r.amount || 0), 0);
  const readyTotal = ready.reduce((s, r) => s + Number(r.ready_pieces || 0), 0);
  const wipTotal = wip.reduce((s, r) => s + Number(r.wip_pieces || 0), 0);
  const low = inventory.filter((r) => r.minimum_stock != null && Number(r.current_quantity || 0) <= Number(r.minimum_stock));
  const purchaseTotal = purchases.reduce((s, r) => s + Number(r.total_amount || 0), 0);
  const activity = [...invoices.map((x) => ({ date: x.invoice_date, title: `بيع ${x.invoice_number}`, value: money(x.invoice_total) })), ...collections.slice(0, 4).map((x) => ({ date: x.created_at?.slice(0, 10), title: 'تحصيل', value: money(x.amount) }))].sort((a, b) => (b.date || '').localeCompare(a.date || '')).slice(0, 5);
  const production = models.slice(0, 8).map((m) => { const w = wip.find((x) => x.model_id === m.id)?.wip_pieces || 0; const r = ready.find((x) => x.model_id === m.id)?.ready_pieces || 0; return `<tr><td><b>${escapeHtml(m.code)}</b><br><span class="subtext">${escapeHtml(m.name)}</span></td><td>${qty(w)}</td><td>${qty(r)}</td><td><span class="status-pill ${r ? 'ok' : 'neutral'}">${r ? 'جاهز' : 'متابعة'}</span></td></tr>`; });
  document.getElementById('view').innerHTML = `
    <div class="hero"><div><h2>نظرة شاملة على مصنعك اليوم</h2><p>القراءة من الحركات الأصلية فقط، بدون أرقام تجريبية.</p></div><div class="hero-actions"><button class="button secondary" data-nav="reports">عرض التقارير</button><button class="button" data-nav="cutting">✂ بدء القص</button></div></div>
    <div class="stats-grid">${statCard('▤', 'المبيعات', money(salesTotal), `${qty(invoices.length)} فاتورة`)}${statCard('▥', 'التحصيلات', money(collectionTotal), 'مستلمة فعليًا')}${statCard('◈', 'READY', qty(readyTotal), 'قطعة جاهزة')}${statCard('▣', 'مخزون منخفض', qty(low.length), 'أصناف تحتاج متابعة')}</div>
    <div class="two-col">
      <div class="panel"><div class="panel-head"><div><h3>حالة الإنتاج الحالية</h3><span>الموديل / WIP / READY</span></div><button class="link-button" data-nav="models">عرض الكل</button></div>${table(['الموديل','WIP','READY','الحالة'], production, 'لا توجد موديلات مسجلة حتى الآن.')}</div>
      <div class="panel"><div class="panel-head"><div><h3>ملخص الحركة</h3><span>آخر البيانات الفعلية</span></div></div><div class="activity-list">${activity.length ? activity.map((a) => `<div class="activity-row"><span class="dot"></span><div><b>${escapeHtml(a.title)}</b><small>${escapeHtml(a.date || '')}</small></div><strong>${a.value}</strong></div>`).join('') : '<div class="empty-state compact"><b>لا توجد عمليات بعد</b><span>ابدأ بتسجيل شراء أو تعريف موديل أو قصة قص.</span></div>'}</div></div>
    </div>
    <div class="three-col">
      <div class="panel mini-panel"><span>الموديلات</span><strong>${qty(models.length)}</strong><small>تعريفات فعلية</small></div>
      <div class="panel mini-panel"><span>إجمالي المشتريات</span><strong>${money(purchaseTotal)}</strong><small>من فواتير الشراء</small></div>
      <div class="panel mini-panel"><span>WIP</span><strong>${qty(wipTotal)}</strong><small>قطعة تحت التجهيز</small></div>
    </div>`;
  bindInnerNav();
}









async function supplierPaymentsView() {
  const [suppliers, balances, invoices, accounts, payments] = await Promise.all([
    fetchOne('suppliers', 'id,name,phone'),
    fetchOne('v_purchase_balances', 'purchase_invoice_id,supplier_id,total_amount,paid_amount,remaining_amount'),
    fetchOne('purchase_invoices', 'id,invoice_number,purchase_date,supplier_id'),
    fetchOne('money_accounts', 'id,name,kind,active'),
    fetchOne('supplier_payments', 'id,supplier_id,payment_date,account_id,amount,reference,created_at'),
  ]);

  const openBalances = balances.filter((b) => Number(b.remaining_amount || 0) > 0);
  const totalOutstanding = openBalances.reduce((s, b) => s + Number(b.remaining_amount || 0), 0);
  const activeAccounts = accounts.filter((a) => a.active);
  const paymentTotal = payments.reduce((s, p) => s + Number(p.amount || 0), 0);

  const rows = openBalances.map((b) => {
    const inv = invoices.find((i) => i.id === b.purchase_invoice_id);
    const supplier = suppliers.find((s) => s.id === b.supplier_id);
    return `<tr><td><b>${escapeHtml(inv?.invoice_number || '—')}</b></td><td>${escapeHtml(supplier?.name || '—')}</td><td>${escapeHtml(inv?.purchase_date || '—')}</td><td>${money(b.total_amount)}</td><td>${money(b.paid_amount)}</td><td><span class="status-pill warning">${money(b.remaining_amount)}</span></td></tr>`;
  });

  document.getElementById('view').innerHTML = `
    <div class="hero">
      <div><h2>مدفوعات الموردين</h2><p>دفعة مستقلة عن الشراء، ويمكن توزيعها على فاتورة واحدة أو عدة فواتير لنفس المورد.</p></div>
      <button class="button" id="openSupplierPaymentForm">＋ تسجيل دفعة</button>
    </div>
    <div class="stats-grid">
      ${statCard('▰','إجمالي المستحق للموردين',money(totalOutstanding),`${qty(openBalances.length)} فاتورة مفتوحة`)}
      ${statCard('✓','إجمالي المدفوعات المسجلة',money(paymentTotal),'حركات فعلية')}
      ${statCard('●','الموردون',qty(suppliers.length),'مورد')}
      ${statCard('▣','حسابات الدفع النشطة',qty(activeAccounts.length),'نقدية / بنك')}
    </div>
    <div class="panel"><div class="panel-head"><div><h3>الفواتير المفتوحة</h3><span>الحد الأقصى للدفعة على كل فاتورة هو الرصيد المتبقي.</span></div></div>
      ${table(['فاتورة الشراء','المورد','التاريخ','الإجمالي','المدفوع','المتبقي'], rows, 'لا توجد فواتير شراء عليها مستحقات.')}
    </div>
  `;

  document.getElementById('openSupplierPaymentForm').onclick = () => {
    document.body.insertAdjacentHTML('beforeend', `
      <div class="modal-backdrop" id="supplierPaymentModal">
        <div class="modal-card supplier-payment-modal" role="dialog" aria-modal="true" aria-labelledby="supplierPaymentTitle">
          <div class="modal-head"><div><h3 id="supplierPaymentTitle">تسجيل دفعة مورد</h3><span>الدفعة تُخصم من الحساب النقدي/البنكي وتغلق المستحقات المخصصة فقط.</span></div><button class="modal-close" id="closeSupplierPayment">×</button></div>
          <form id="supplierPaymentForm" class="stack-form">
            <label>المورد
              <select id="supplierPaymentSupplier" required>
                <option value="">اختر المورد</option>
                ${suppliers.map(s => `<option value="${escapeHtml(s.id)}">${escapeHtml(s.name)}</option>`).join('')}
              </select>
            </label>
            <div id="supplierInvoiceAllocations" class="allocation-box">
              <div class="allocation-empty">اختر المورد لعرض فواتيره المفتوحة.</div>
            </div>
            <div class="allocation-total"><span>إجمالي الدفعة</span><strong id="supplierPaymentTotal">0 ج</strong></div>
            <label>الحساب
              <select id="supplierPaymentAccount" required ${activeAccounts.length ? '' : 'disabled'}>
                <option value="">${activeAccounts.length ? 'اختر النقدية / البنك' : 'لا يوجد حساب نشط'}</option>
                ${activeAccounts.map(a => `<option value="${escapeHtml(a.id)}">${escapeHtml(a.name)} — ${escapeHtml(a.kind === 'cash' ? 'نقدية' : 'بنك')}</option>`).join('')}
              </select>
              ${activeAccounts.length ? '' : '<small class="field-help">أنشئ حساب نقدية/بنك من شاشة الحسابات أولًا.</small>'}
            </label>
            <label>تاريخ الدفع<input id="supplierPaymentDate" type="date" value="${new Date().toISOString().slice(0,10)}" required /></label>
            <label>المرجع<input id="supplierPaymentReference" maxlength="120" placeholder="رقم إيصال / تحويل (اختياري)" /></label>
            <label>ملاحظات<input id="supplierPaymentNotes" maxlength="300" placeholder="ملاحظات (اختياري)" /></label>
            <div class="modal-actions"><button type="button" class="button secondary" id="cancelSupplierPayment">إلغاء</button><button type="submit" class="button" id="saveSupplierPayment">حفظ الدفعة</button></div>
            <div class="global-status" id="supplierPaymentStatus"></div>
          </form>
        </div>
      </div>
    `);

    const modal = document.getElementById('supplierPaymentModal');
    const supplierSelect = document.getElementById('supplierPaymentSupplier');
    const allocationBox = document.getElementById('supplierInvoiceAllocations');
    const totalNode = document.getElementById('supplierPaymentTotal');
    const status = document.getElementById('supplierPaymentStatus');
    const saveButton = document.getElementById('saveSupplierPayment');
    const close = () => modal?.remove();

    const renderAllocations = () => {
      const supplierId = supplierSelect.value;
      const supplierBalances = openBalances.filter((b) => b.supplier_id === supplierId);
      if (!supplierId) {
        allocationBox.innerHTML = '<div class="allocation-empty">اختر المورد لعرض فواتيره المفتوحة.</div>';
        totalNode.textContent = money(0);
        return;
      }
      if (!supplierBalances.length) {
        allocationBox.innerHTML = '<div class="allocation-empty">لا توجد فواتير مفتوحة لهذا المورد.</div>';
        totalNode.textContent = money(0);
        return;
      }
      allocationBox.innerHTML = `
        <div class="allocation-head"><span>الفاتورة</span><span>المتبقي</span><span>المبلغ المخصص</span></div>
        ${supplierBalances.map((b) => {
          const inv = invoices.find(i => i.id === b.purchase_invoice_id);
          return `<div class="allocation-row" data-invoice-id="${escapeHtml(b.purchase_invoice_id)}" data-max="${Number(b.remaining_amount)}">
            <div><b>${escapeHtml(inv?.invoice_number || '—')}</b><small>${escapeHtml(inv?.purchase_date || '')}</small></div>
            <span>${money(b.remaining_amount)}</span>
            <input class="supplier-allocation-input" type="number" min="0" max="${Number(b.remaining_amount)}" step="0.01" value="0" placeholder="0" />
          </div>`;
        }).join('')}
      `;
      allocationBox.querySelectorAll('.supplier-allocation-input').forEach((input) => input.addEventListener('input', () => {
        const max = Number(input.max || 0);
        let value = Number(input.value || 0);
        if (value < 0) value = 0;
        if (value > max) value = max;
        input.value = value ? String(value) : '';
        const total = [...allocationBox.querySelectorAll('.supplier-allocation-input')].reduce((sum, el) => sum + Number(el.value || 0), 0);
        totalNode.textContent = money(total);
      }));
    };

    supplierSelect.addEventListener('change', renderAllocations);
    document.getElementById('closeSupplierPayment').onclick = close;
    document.getElementById('cancelSupplierPayment').onclick = close;
    modal.addEventListener('click', (e) => { if (e.target === modal) close(); });

    document.getElementById('supplierPaymentForm').addEventListener('submit', async (event) => {
      event.preventDefault();
      status.textContent = '';
      const supplierId = supplierSelect.value;
      if (!supplierId) return status.textContent = 'اختر المورد أولًا.';
      if (!activeAccounts.length) return status.textContent = 'أنشئ حساب نقدية/بنك أولًا من شاشة الحسابات.';
      const allocationRows = [...allocationBox.querySelectorAll('.allocation-row')];
      const allocations = allocationRows.map((row) => ({
        purchase_invoice_id: row.dataset.invoiceId,
        amount: Number(row.querySelector('input')?.value || 0),
      })).filter((x) => x.amount > 0);

      if (!allocations.length) return status.textContent = 'أدخل مبلغًا على فاتورة واحدة على الأقل.';
      const invalid = allocationRows.some((row) => {
        const value = Number(row.querySelector('input')?.value || 0);
        return value < 0 || value > Number(row.dataset.max || 0);
      });
      if (invalid) return status.textContent = 'يوجد مبلغ يتجاوز المتبقي على إحدى الفواتير.';

      const total = allocations.reduce((s, a) => s + a.amount, 0);
      if (total <= 0) return status.textContent = 'إجمالي الدفعة يجب أن يكون أكبر من صفر.';

      saveButton.disabled = true;
      saveButton.textContent = 'جارٍ الحفظ…';

      const { error } = await client.rpc('post_supplier_payment', {
        p_supplier_id: supplierId,
        p_payment_date: document.getElementById('supplierPaymentDate').value,
        p_account_id: document.getElementById('supplierPaymentAccount').value,
        p_allocations: allocations,
        p_reference: document.getElementById('supplierPaymentReference').value.trim() || null,
        p_notes: document.getElementById('supplierPaymentNotes').value.trim() || null,
      });

      if (error) {
        status.textContent = `تعذر تسجيل الدفعة: ${error.message}`;
        saveButton.disabled = false;
        saveButton.textContent = 'حفظ الدفعة';
        return;
      }

      close();
      setStatus('تم تسجيل دفعة المورد وتوزيعها على الفواتير المحددة.', 'info');
      await renderRoute(true);
    });
  };
}


async function accountsView() {
  const [customerBalances, purchaseBalances, moneyBalances, expenses, suppliers, customers] = await Promise.all([
    fetchOne('v_customer_account_balances', 'customer_id,code,name,amount_due,customer_credit'),
    fetchOne('v_purchase_balances', 'remaining_amount'),
    fetchOne('v_money_balances', 'account_id,name,kind,balance,active'),
    fetchOne('expenses', 'amount,cost_type'),
    fetchOne('suppliers', 'id,name'),
    fetchOne('customers', 'id,code,name,phone,address'),
  ]);

  const customerDue = customerBalances.reduce((s,r)=>s+Number(r.amount_due||0),0);
  const supplierDue = purchaseBalances.reduce((s,r)=>s+Number(r.remaining_amount||0),0);
  const expenseTotal = expenses.reduce((s,r)=>s+Number(r.amount||0),0);
  const cash = moneyBalances.reduce((s,r)=>s+Number(r.balance||0),0);
  const activeAccounts = moneyBalances.filter((a) => a.active);

  const accountRows = moneyBalances.map(a =>
    `<tr>
      <td><b>${escapeHtml(a.name)}</b></td>
      <td>${escapeHtml(a.kind === 'cash' ? 'نقدية' : 'بنك')}</td>
      <td><b>${money(a.balance)}</b></td>
      <td><span class="status-pill ${a.active ? 'ok' : 'neutral'}">${a.active ? 'نشط' : 'غير نشط'}</span></td>
      <td><button class="table-button" data-toggle-money-account="${escapeHtml(a.account_id)}" data-next-active="${a.active ? 'false' : 'true'}">${a.active ? 'تعطيل' : 'تفعيل'}</button></td>
    </tr>`
  );

  document.getElementById('view').innerHTML = `
    <div class="hero"><div><h2>الحسابات</h2><p>حسابات العملاء والموردين والنقدية والبنك في مكان واحد، مع فصل واضح بين رصيد الكيان والحساب المالي.</p></div></div>
    <div class="stats-grid">
      ${statCard('●','رصيد العملاء',money(customerDue),`${qty(customers.length)} عميل`)}
      ${statCard('▰','رصيد الموردين',money(supplierDue),`${qty(suppliers.length)} مورد`)}
      ${statCard('▥','مصروفات مسجلة',money(expenseTotal),'من الحركات الأصلية')}
      ${statCard('▣','النقدية والبنك',money(cash),`${qty(activeAccounts.length)} حساب نشط`)}
    </div>

    <div class="panel">
      <div class="panel-head">
        <div><h3>حسابات النقدية والبنك</h3><span>تُستخدم في التحصيلات ومدفوعات الموردين والمصروفات. التعطيل لا يحذف التاريخ.</span></div>
        <button class="button" data-add-money-account>＋ إضافة حساب</button>
      </div>
      ${table(['اسم الحساب','النوع','الرصيد الحالي','الحالة','الإجراء'], accountRows, 'لا توجد حسابات نقدية أو بنكية بعد.')}
    </div>

    <div class="two-col">
      <div class="panel">
        <div class="panel-head"><div><h3>العملاء</h3><span>كل عميل له حساب يظهر فيه فواتيره وتحصيلاته ومرتجعاته.</span></div><button class="button secondary" data-add-customer>＋ إضافة عميل</button></div>
        ${table(['الكود','اسم العميل','الهاتف','المطلوب','لصالح العميل','الحساب'], customers.map(c=>{
          const b = customerBalances.find(x=>x.customer_id===c.id) || {};
          const due = Number(b.amount_due||0);
          return `<tr><td><b>${escapeHtml(c.code || '—')}</b></td><td>${escapeHtml(c.name)}</td><td>${escapeHtml(c.phone || '—')}</td><td>${money(due)}</td><td>${money(b.customer_credit)}</td><td><button class="table-button" data-account-statement="${escapeHtml(c.id)}" data-account-type="customer">فتح الحساب</button>${due > 0 ? ` <button class="table-button" data-collect-customer="${escapeHtml(c.id)}">تحصيل</button>` : ''}</td></tr>`;
        }), 'لا يوجد عملاء مسجلون حتى الآن.')}
      </div>
      <div class="panel"><div class="panel-head"><div><h3>الموردون</h3><span>المشتريات والمدفوعات ومرتجعات الشراء.</span></div><button class="button secondary" data-add-supplier>＋ إضافة مورد</button></div>${table(['اسم المورد','الهاتف','الحساب'], suppliers.map(s=>`<tr><td><b>${escapeHtml(s.name)}</b></td><td>${escapeHtml(s.phone || '—')}</td><td><button class="table-button" data-account-statement="${escapeHtml(s.id)}" data-account-type="supplier">كشف الحساب</button></td></tr>`), 'لا يوجد موردون مسجلون حتى الآن.')}</div>
    </div>

    <div class="two-col">
      <div class="panel"><h3>سداد الموردين</h3><p class="muted">دفعة مستقلة عن الشراء وتستخدم نفس حسابات النقدية والبنك النشطة.</p><button class="button secondary" data-nav="supplier-payments">فتح مدفوعات الموردين</button></div>
      <div class="panel"><h3>المصروفات</h3><p class="muted">المصروفات مرتبطة بحساب الدفع المختار ولا تدخل تلقائيًا في تكلفة الموديل.</p><button class="button secondary" data-nav="expenses">فتح المصروفات</button></div>
    </div>
  `;

  bindInnerNav();
}


async function renderRoute(force = false) {
  const token = ++renderToken;
  if (force) clearReadCache();

  const key = location.hash.replace('#','') || 'dashboard';
  if (!document.getElementById('view')) await buildShell();
  if (token !== renderToken) return;
  setActiveNav(key);

  const loaders = {
    dashboard,
    models: window.modelsView || dashboard,
    'model-detail': window.modelDetailView || dashboard,
    inventory: window.inventoryView || dashboard,
    purchases: window.purchasesView || dashboard,
    cutting: window.cuttingView || dashboard,
    wip: window.wipView || dashboard,
    ready: window.readyView || dashboard,
    sales: window.salesView || dashboard,
    invoices: window.invoicesView || dashboard,
    collections: window.collectionsView || dashboard,
    expenses: window.expensesView || dashboard,
    returns: window.returnsView || dashboard,
    accounts: accountsView,
    'opening-setup': window.openingSetupView,
    customers: window.customersView || dashboard,
    'supplier-payments': window.supplierPaymentsView || supplierPaymentsView,
    suppliers: window.suppliersView || dashboard,
    reports: window.reportsView || dashboard,
  };
  const loader = loaders[key] || dashboard;

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
  let navigationTimer = null;

  document.addEventListener('click', (event) => {
    const button = event.target.closest?.('[data-nav]');
    if (!button) return;

    const key = button.dataset.nav;
    if (!key) return;

    event.preventDefault();
    event.stopImmediatePropagation();
    clearTimeout(navigationTimer);

    navigationTimer = window.setTimeout(() => {
      if (location.hash !== '#' + key) location.hash = key;
    }, 60);
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
  if (event === 'SIGNED_IN' || event === 'SIGNED_OUT' || event === 'USER_UPDATED') route();
});
route();
