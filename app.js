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
  ['returns', '↩', 'المرتجعات'],
  ['accounts', '●', 'الحسابات'],
  ['customers', '●', 'العملاء'],
  ['suppliers', '◆', 'الموردين'],
  ['reports', '▰', 'التقارير'],
];

const state = { membership: null, factory: null, user: null, modelId: null };
const currency = new Intl.NumberFormat('ar-EG', { maximumFractionDigits: 2 });
const number = new Intl.NumberFormat('ar-EG', { maximumFractionDigits: 0 });
const money = (value) => `${currency.format(Number(value || 0))} ج`;
const qty = (value) => number.format(Number(value || 0));
const escapeHtml = (value) => String(value ?? '').replace(/[&<>'"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#039;', '"': '&quot;' }[c]));

function pageTitle(key) { return NAV.find(([id]) => id === key)?.[2] || 'مصنعي'; }
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
  const { data, error } = await client.from(table).select(select);
  if (error) throw error;
  return data || [];
}

async function buildShell() {
  const email = state.user?.email || '';
  app.innerHTML = `
    <div class="app-shell">
      <aside class="sidebar">
        <div class="side-brand"><span class="brand-mark">م</span><div><b>مصنعي</b><small>إدارة أسهل .. إنتاج أفضل</small></div></div>
        <nav>${NAV.map(([id, icon, label]) => `<button class="nav-item" data-nav="${id}"><span>${icon}</span><strong>${label}</strong></button>`).join('')}</nav>
        <div class="side-footer"><div class="factory-chip"><b>${escapeHtml(state.factory?.name || 'المصنع')}</b><span>${escapeHtml(state.membership?.role || '')}</span></div><button id="logout" class="logout">↪ تسجيل الخروج</button></div>
      </aside>
      <main class="content-shell">
        <header class="topbar"><div><span class="crumb">مصنعي /</span><h1 id="pageHeading">الرئيسية</h1></div><div class="top-actions"><button id="refresh" class="icon-button" title="تحديث">↻</button><div class="user-chip"><span class="avatar">${escapeHtml((email[0] || 'M').toUpperCase())}</span><div><b>${escapeHtml(email || 'المستخدم')}</b><small>15 سبتمبر 2026</small></div></div></div></header>
        <div class="global-status"></div>
        <section id="view" class="view"></section>
      </main>
    </div>`;

  document.querySelectorAll('[data-nav]').forEach((button) => {
    button.addEventListener('click', () => {
      const key = button.dataset.nav;
      location.hash = key;
      renderRoute();
    });
  });
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

async function modelsView() {
  const [models, wip, ready, costs] = await Promise.all([
    fetchOne('models', 'id,code,name,selling_price,created_at'),
    fetchOne('v_wip_balances', 'model_id,wip_pieces'),
    fetchOne('v_ready_balances', 'model_id,ready_pieces'),
    fetchOne('v_model_current_costs', 'model_id,current_cost_per_piece,fabric_cost_per_piece,variable_cost_per_piece,cutting_operation_id'),
  ]);
  const rows = models.map((m) => { const c = costs.find((x) => x.model_id === m.id); return `<tr><td><b>${escapeHtml(m.code)}</b></td><td>${escapeHtml(m.name)}</td><td>${qty(wip.find((x) => x.model_id === m.id)?.wip_pieces)}</td><td>${qty(ready.find((x) => x.model_id === m.id)?.ready_pieces)}</td><td>${c ? money(c.current_cost_per_piece) : '—'}</td><td>${c ? 'آخر قصة مكتملة' : 'لم تُقص بعد'}</td><td><button class="table-button" data-model="${m.id}">التفاصيل</button></td></tr>`; });
  document.getElementById('view').innerHTML = `<div class="hero"><div><h2>الموديلات</h2><p>تعريف ومتابعة تكلفة وإنتاج كل موديل.</p></div><button class="button">＋ إضافة موديل</button></div><div class="toolbar"><input id="modelSearch" placeholder="⌕ ابحث باسم الموديل أو الكود" /><div class="filter-chips"><span class="chip active">الكل</span><span class="chip">قيد الإنتاج</span><span class="chip">جاهز</span></div></div><div class="panel">${table(['الكود','الموديل','WIP','READY','تكلفة القطعة الحالية','المصدر','الإجراء'], rows, 'لا توجد موديلات مسجلة حتى الآن.')}</div>`;
  document.querySelectorAll('[data-model]').forEach((b) => b.addEventListener('click', () => { state.modelId = b.dataset.model; location.hash = 'model-detail'; renderRoute(); }));
}

async function modelDetailView() {
  if (!state.modelId) { location.hash = 'models'; return modelsView(); }
  const [models, wip, ready, costs, variable] = await Promise.all([
    fetchOne('models', 'id,code,name,selling_price,notes').then((rows) => rows.filter((x) => x.id === state.modelId)),
    fetchOne('v_wip_balances', 'model_id,wip_pieces').then((rows) => rows.filter((x) => x.model_id === state.modelId)),
    fetchOne('v_ready_balances', 'model_id,ready_pieces').then((rows) => rows.filter((x) => x.model_id === state.modelId)),
    fetchOne('v_model_current_costs', 'model_id,current_cost_per_piece,fabric_cost_per_piece,variable_cost_per_piece,cutting_operation_id,consumed_quantity,actual_pieces').then((rows) => rows.filter((x) => x.model_id === state.modelId)),
    fetchOne('model_variable_costs', 'model_id,cost_type,name,amount_per_piece').then((rows) => rows.filter((x) => x.model_id === state.modelId)),
  ]);
  const m = models[0]; if (!m) return modelsView();
  const c = costs[0];
  document.getElementById('view').innerHTML = `<div class="hero"><div><span class="eyebrow">نشط</span><h2>${escapeHtml(m.name)} — ${escapeHtml(m.code)}</h2><p>التكلفة والإنتاج والحركة الفعلية.</p></div><button class="button secondary" data-nav="models">← رجوع للموديلات</button></div><div class="stats-grid three"><div class="stat-card"><div class="stat-icon">◈</div><div><span>تكلفة القطعة الحالية</span><strong>${c ? money(c.current_cost_per_piece) : '—'}</strong><small>من آخر قصة مكتملة</small></div></div>${statCard('▤','WIP',qty(wip[0]?.wip_pieces),'قطعة')}${statCard('◈','READY',qty(ready[0]?.ready_pieces),'قطعة')}</div><div class="two-col"><div class="panel"><div class="panel-head"><div><h3>مكونات التكلفة</h3><span>المصدر الحالي</span></div></div>${table(['البند','القيمة/قطعة','المصدر'], [c ? `<tr><td>استهلاك قماش فعلي</td><td>${money(c.fabric_cost_per_piece)}</td><td>آخر قصة مكتملة</td></tr>` : '', c ? `<tr><td>التكاليف المتغيرة</td><td>${money(c.variable_cost_per_piece)}</td><td>إعدادات الموديل</td></tr>` : ''], c ? '—' : 'لم تُسجل قصة مكتملة لهذا الموديل بعد.')}</div><div class="panel note-panel"><h3>قاعدة مهمة</h3><p>المصدر الحالي للاستهلاك الفعلي هو <b>آخر عملية قص مكتملة للموديل</b>.</p><p>تغيير سعر شراء القماش لاحقًا لا يعيد كتابة تكلفة قصة قديمة.</p><p>التكلفة الثابتة تظل منفصلة ولا تُوزع على تكلفة الموديل في V1.</p></div></div>`;
  bindInnerNav();
}

async function inventoryView() {
  const rows = await fetchOne('v_inventory_balances', 'material_id,code,name,kind,unit,current_quantity,minimum_stock');
  const low = rows.filter((r) => r.minimum_stock != null && Number(r.current_quantity || 0) <= Number(r.minimum_stock));
  const tableRows = rows.map((r) => `<tr><td><b>${escapeHtml(r.name)}</b><br><span class="subtext">${escapeHtml(r.code)}</span></td><td>${escapeHtml(r.kind === 'fabric' ? 'قماش' : 'إكسسوار')}</td><td>${qty(r.current_quantity)} ${escapeHtml(r.unit)}</td><td>${r.minimum_stock == null ? '—' : qty(r.minimum_stock)}</td><td><span class="status-pill ${low.includes(r) ? 'warning' : 'ok'}">${low.includes(r) ? 'حد أدنى' : 'جيد'}</span></td><td><button class="table-button">الحركة</button></td></tr>`);
  document.getElementById('view').innerHTML = `<div class="hero"><div><h2>المخزن</h2><p>الأقمشة والإكسسوارات — بدون مخزون سالب.</p></div><button class="button secondary">＋ إضافة حركة تصحيح</button></div><div class="stats-grid">${statCard('▣','إجمالي الأصناف',qty(rows.length),'أصناف مسجلة')}${statCard('⚠','أقل مخزون',qty(low.length),'تحتاج متابعة')}${statCard('✓','مخزون سالب', '0','الحركة مرفوضة عند النزول تحت الصفر')}${statCard('◈','أرصدة فعلية',qty(rows.reduce((s,r)=>s+Number(r.current_quantity||0),0)),'بوحدات كل صنف')}</div><div class="panel">${table(['الصنف','النوع','الكمية','الحد الأدنى','الحالة',''], tableRows, 'لا توجد خامات مسجلة حتى الآن.')}</div>`;
}

async function purchasesView() {
  const [purchases, suppliers, totals] = await Promise.all([
    fetchOne('purchase_invoices', 'id,invoice_number,supplier_id,purchase_date,created_at'),
    fetchOne('suppliers', 'id,name'),
    fetchOne('v_purchase_totals', 'purchase_invoice_id,total_amount'),
  ]);
  const rows = purchases.map((p) => `<tr><td>${escapeHtml(p.invoice_number)}</td><td>${escapeHtml(suppliers.find((s)=>s.id===p.supplier_id)?.name || '—')}</td><td>${escapeHtml(p.purchase_date)}</td><td>${money(totals.find((t)=>t.purchase_invoice_id===p.id)?.total_amount)}</td><td><button class="table-button">التفاصيل</button></td></tr>`);
  document.getElementById('view').innerHTML = `<div class="hero"><div><h2>المشتريات</h2><p>الشراء يزيد المخزون ويسجل حركة المورد — ليس مصروف تشغيل.</p></div><button class="button">＋ شراء جديد</button></div><div class="panel purchase-note"><b>قاعدة تشغيلية:</b> الشراء يدخل المخزون ويحفظ سعره التاريخي لكل سطر شراء.</div><div class="panel">${table(['رقم الفاتورة','المورد','التاريخ','الإجمالي','الإجراء'], rows, 'لا توجد فواتير شراء حتى الآن.')}</div>`;
}

async function wipView() {
  const rows = await fetchOne('v_wip_balances', 'model_id,model_code,model_name,wip_pieces');
  const tr = rows.map((r) => `<tr><td><b>${escapeHtml(r.model_code)}</b><br><span class="subtext">${escapeHtml(r.model_name)}</span></td><td>${qty(r.wip_pieces)}</td><td><input class="inline-input" value="0" min="0" type="number" /></td><td><button class="table-button">تحويل إلى READY</button></td></tr>`);
  document.getElementById('view').innerHTML = `<div class="hero"><div><h2>WIP</h2><p>القطع تحت التجهيز والتحويل إلى READY.</p></div><span class="read-rule">التحويل الجزئي مسموح، ولا يمكن تجاوز المتاح في WIP.</span></div><div class="stats-grid">${statCard('▤','إجمالي WIP',qty(rows.reduce((s,r)=>s+Number(r.wip_pieces||0),0)),'قطعة تحت التجهيز')}${statCard('◈','عدد الموديلات',qty(rows.length),'بها WIP')}</div><div class="panel">${table(['الموديل','WIP','تحويل مقترح','الإجراء'], tr, 'لا توجد قطع تحت التجهيز حتى الآن.')}</div>`;
}

async function readyView() {
  const rows = await fetchOne('v_ready_balances', 'model_id,model_code,model_name,ready_pieces');
  const tr = rows.map((r) => `<tr><td><b>${escapeHtml(r.model_code)}</b> — ${escapeHtml(r.model_name)}</td><td>${qty(r.ready_pieces)}</td><td><span class="status-pill ok">متاح للبيع</span></td><td><button class="table-button" data-nav="sales">بيع جزء</button></td></tr>`);
  document.getElementById('view').innerHTML = `<div class="hero"><div><h2>جاهز للبيع</h2><p>READY هو المصدر الوحيد القابل للبيع.</p></div></div><div class="stats-grid">${statCard('◈','إجمالي READY',qty(rows.reduce((s,r)=>s+Number(r.ready_pieces||0),0)),'قطعة جاهزة')}${statCard('✓','مصدر البيع','READY','لا يوجد بيع من WIP')}</div><div class="panel">${table(['الموديل','الكمية الجاهزة','الحالة',''], tr, 'لا توجد قطع جاهزة للبيع حتى الآن.')}</div>`;
  bindInnerNav();
}

async function salesView() {
  const invoices = await fetchOne('v_invoice_totals', 'invoice_id,invoice_number,invoice_date,customer_id,invoice_total');
  const customers = await fetchOne('customers', 'id,name');
  const tr = invoices.map((r) => `<tr><td>${escapeHtml(r.invoice_number)}</td><td>${escapeHtml(customers.find((c)=>c.id===r.customer_id)?.name || '—')}</td><td>${escapeHtml(r.invoice_date)}</td><td>${money(r.invoice_total)}</td><td><button class="table-button" data-invoice="${r.invoice_id}">الفاتورة</button></td></tr>`);
  document.getElementById('view').innerHTML = `<div class="hero"><div><h2>المبيعات</h2><p>بيع من READY فقط — البيع الجزئي ومتعدد الموديلات.</p></div><button class="button">＋ بيع جديد</button></div><div class="panel purchase-note"><b>قاعدة تشغيلية:</b> الفاتورة تُنشأ مع البيع، ويمكن أن تحتوي على أكثر من موديل.</div><div class="panel">${table(['الفاتورة','العميل','التاريخ','الإجمالي',''], tr, 'لا توجد مبيعات حتى الآن.')}</div>`;
  document.querySelectorAll('[data-invoice]').forEach((b)=>b.addEventListener('click',()=>{ location.hash='invoices'; state.invoiceId=b.dataset.invoice; renderRoute(); }));
}

async function invoicesView() {
  const balances = await fetchOne('v_invoice_balances', 'invoice_id,invoice_number,invoice_date,customer_id,invoice_total,collected_total,outstanding_total');
  const customers = await fetchOne('customers', 'id,name');
  const tr = balances.map((r) => `<tr><td><b>${escapeHtml(r.invoice_number)}</b></td><td>${escapeHtml(customers.find((c)=>c.id===r.customer_id)?.name || '—')}</td><td>${money(r.invoice_total)}</td><td>${money(r.collected_total)}</td><td>${money(r.outstanding_total)}</td><td><span class="status-pill ${Number(r.outstanding_total||0)>0?'warning':'ok'}">${Number(r.outstanding_total||0)>0?'مدفوعة جزئيًا':'مكتملة'}</span></td><td><button class="table-button">طباعة</button></td></tr>`);
  document.getElementById('view').innerHTML = `<div class="hero"><div><h2>الفواتير</h2><p>فاتورة واضحة للطباعة وإعادة الطباعة.</p></div></div><div class="panel invoice-rule"><b>قاعدة الطباعة:</b> الطباعة وإعادة الطباعة لا تنشئ حركة جديدة ولا تغيّر المخزون أو الحسابات.</div><div class="panel">${table(['رقم الفاتورة','العميل','الإجمالي','المدفوع','المتبقي','الحالة',''], tr, 'لا توجد فواتير حتى الآن.')}</div>`;
}

async function collectionsView() {
  const [balances, collections, accounts, customers] = await Promise.all([
    fetchOne('v_invoice_balances', 'invoice_id,invoice_number,invoice_date,customer_id,invoice_total,collected_total,outstanding_total'),
    fetchOne('collections', 'id,collection_date,account_id,amount,reference,created_at'),
    fetchOne('money_accounts', 'id,name,kind,active'),
    fetchOne('customers', 'id,name'),
  ]);

  const openInvoices = balances.filter((r) => Number(r.outstanding_total || 0) > 0);
  const totalOutstanding = openInvoices.reduce((s, r) => s + Number(r.outstanding_total || 0), 0);
  const totalCollected = collections.reduce((s, r) => s + Number(r.amount || 0), 0);
  const activeAccounts = accounts.filter((a) => a.active);

  const rows = collections
    .slice()
    .sort((a, b) => String(b.collection_date || b.created_at || '').localeCompare(String(a.collection_date || a.created_at || '')))
    .map((r) => {
      const invoice = balances.find((x) => Number(x.collected_total || 0) > 0 && x.invoice_id === r.invoice_id);
      return `<tr><td>${escapeHtml(r.collection_date || r.created_at?.slice(0,10) || '—')}</td><td>${escapeHtml(r.reference || '—')}</td><td>${escapeHtml(accounts.find((a) => a.id === r.account_id)?.name || '—')}</td><td><b>${money(r.amount)}</b></td><td><span class="status-pill ok">مسجل</span></td></tr>`;
    });

  document.getElementById('view').innerHTML = `
    <div class="hero">
      <div><h2>التحصيلات</h2><p>التحصيل مستقل عن إنشاء الفاتورة، ويمكن تسجيله على دفعات متعددة حتى إغلاق المستحق.</p></div>
      <button class="button" id="openCollectionForm">＋ تسجيل تحصيل</button>
    </div>
    <div class="stats-grid">
      ${statCard('▣', 'المستحق من الفواتير', money(totalOutstanding), `${qty(openInvoices.length)} فاتورة مفتوحة`)}
      ${statCard('✓', 'إجمالي التحصيلات', money(totalCollected), 'حركات فعلية مسجلة')}
      ${statCard('●', 'حسابات نقدية/بنك', qty(activeAccounts.length), 'متاحة للتحصيل')}
      ${statCard('↗', 'الفواتير القابلة للتحصيل', qty(openInvoices.length), 'المتبقي أكبر من صفر')}
    </div>
    <div class="panel collection-panel">
      <div class="panel-head"><div><h3>حركات التحصيل</h3><span>كل حركة مرتبطة بحساب نقدي/بنكي ولا تنشئ فاتورة جديدة.</span></div></div>
      ${table(['التاريخ','المرجع','الحساب','القيمة','الحالة'], rows, 'لا توجد تحصيلات حتى الآن.')}
    </div>
  `;

  const openForm = () => {
    const today = new Date().toISOString().slice(0, 10);
    const invoiceOptions = openInvoices.map((r) =>
      `<option value="${escapeHtml(r.invoice_id)}" data-number="${escapeHtml(r.invoice_number)}" data-max="${Number(r.outstanding_total || 0)}">${escapeHtml(r.invoice_number)} — ${escapeHtml(customers.find((c) => c.id === r.customer_id)?.name || 'بدون عميل')} — متبقي ${money(r.outstanding_total)}</option>`
    ).join('');
    const accountOptions = activeAccounts.map((a) => `<option value="${escapeHtml(a.id)}">${escapeHtml(a.name)} — ${escapeHtml(a.kind || '')}</option>`).join('');

    document.body.insertAdjacentHTML('beforeend', `
      <div class="modal-backdrop" id="collectionModal">
        <div class="modal-card" role="dialog" aria-modal="true" aria-labelledby="collectionTitle">
          <div class="modal-head"><div><h3 id="collectionTitle">تسجيل تحصيل</h3><span>لا يمكن تجاوز المستحق على الفاتورة.</span></div><button class="modal-close" id="closeCollectionModal">×</button></div>
          <form id="collectionForm" class="stack-form">
            <label>الفاتورة
              <select id="collectionInvoice" required>
                <option value="">اختر الفاتورة</option>
                ${invoiceOptions}
              </select>
              <small class="field-help" id="collectionOutstanding">اختر فاتورة لمعرفة الحد الأقصى للتحصيل.</small>
            </label>
            <label>مبلغ التحصيل
              <input id="collectionAmount" type="number" min="0.01" step="0.01" required placeholder="مثال: 300" />
            </label>
            <label>الحساب
              <select id="collectionAccount" required>
                <option value="">اختر النقدية / البنك</option>
                ${accountOptions}
              </select>
            </label>
            <label>تاريخ التحصيل
              <input id="collectionDate" type="date" value="${today}" required />
            </label>
            <label>المرجع
              <input id="collectionReference" maxlength="120" placeholder="رقم إيصال / تحويل (اختياري)" />
            </label>
            <label>ملاحظات
              <input id="collectionNotes" maxlength="300" placeholder="ملاحظات (اختياري)" />
            </label>
            <div class="modal-actions"><button type="button" class="button secondary" id="cancelCollection">إلغاء</button><button type="submit" class="button" id="saveCollection">حفظ التحصيل</button></div>
            <div class="global-status" id="collectionStatus"></div>
          </form>
        </div>
      </div>
    `);

    const modal = document.getElementById('collectionModal');
    const invoiceSelect = document.getElementById('collectionInvoice');
    const amountInput = document.getElementById('collectionAmount');
    const outstandingHelp = document.getElementById('collectionOutstanding');
    const close = () => modal?.remove();

    const syncLimit = () => {
      const option = invoiceSelect.options[invoiceSelect.selectedIndex];
      const max = Number(option?.dataset?.max || 0);
      amountInput.max = max > 0 ? String(max) : '';
      outstandingHelp.textContent = max > 0 ? `المتاح للتحصيل: ${money(max)}` : 'اختر فاتورة لمعرفة الحد الأقصى للتحصيل.';
      if (Number(amountInput.value || 0) > max && max > 0) amountInput.value = String(max);
    };

    invoiceSelect.addEventListener('change', syncLimit);
    document.getElementById('closeCollectionModal').onclick = close;
    document.getElementById('cancelCollection').onclick = close;
    modal.addEventListener('click', (e) => { if (e.target === modal) close(); });

    document.getElementById('collectionForm').addEventListener('submit', async (event) => {
      event.preventDefault();
      const status = document.getElementById('collectionStatus');
      const option = invoiceSelect.options[invoiceSelect.selectedIndex];
      const invoiceNumber = option?.dataset?.number || '';
      const amount = Number(amountInput.value || 0);
      const max = Number(option?.dataset?.max || 0);
      if (!invoiceNumber) return status.textContent = 'اختر الفاتورة أولًا.';
      if (amount <= 0) return status.textContent = 'مبلغ التحصيل يجب أن يكون أكبر من صفر.';
      if (amount > max) return status.textContent = `المبلغ يتجاوز المستحق. الحد الأقصى: ${money(max)}`;
      if (!document.getElementById('collectionAccount').value) return status.textContent = 'اختر الحساب النقدي/البنكي.';

      const button = document.getElementById('saveCollection');
      button.disabled = true;
      button.textContent = 'جارٍ الحفظ…';
      status.textContent = '';

      const { error } = await client.rpc('post_collection', {
        p_invoice_number: invoiceNumber,
        p_amount: amount,
        p_collection_date: document.getElementById('collectionDate').value,
        p_account_id: document.getElementById('collectionAccount').value,
        p_reference: document.getElementById('collectionReference').value.trim() || null,
        p_notes: document.getElementById('collectionNotes').value.trim() || null,
      });

      if (error) {
        status.textContent = `تعذر تسجيل التحصيل: ${error.message}`;
        button.disabled = false;
        button.textContent = 'حفظ التحصيل';
        return;
      }

      close();
      setStatus('تم تسجيل التحصيل وتحديث رصيد الفاتورة والحساب.', 'info');
      await renderRoute(true);
    });
  };

  document.getElementById('openCollectionForm').onclick = openForm;
}

async function returnsView() {
  const rows = await fetchOne('returns', 'return_number,return_date,sale_id,customer_note,notes,created_at');
  const tr = rows.map((r) => `<tr><td>${escapeHtml(r.return_number)}</td><td>${escapeHtml(r.return_date)}</td><td>مرتجع مستقل</td><td>${escapeHtml(r.customer_note || r.notes || '—')}</td><td><span class="status-pill neutral">مراجعة</span></td></tr>`);
  document.getElementById('view').innerHTML = `<div class="hero"><div><h2>المرتجعات</h2><p>المرتجع حركة مستقلة ولا يتم تعديل الفاتورة بصمت.</p></div><button class="button">＋ تسجيل مرتجع</button></div><div class="decision-grid"><div class="decision-card good"><b>سليم</b><span>يعود إلى READY</span></div><div class="decision-card"><b>قابل للإصلاح</b><span>Repair → READY</span></div><div class="decision-card"><b>يُباع بخصم</b><span>Discounted Sale</span></div><div class="decision-card danger"><b>هالك</b><span>Scrap</span></div></div><div class="panel">${table(['رقم المرتجع','التاريخ','المصدر','ملاحظة','الحالة'], tr, 'لا توجد مرتجعات حتى الآن.')}</div>`;
}

async function customersView() {
  const customers = await fetchOne('customers', 'id,code,name,phone,address');
  const rows = customers.map(c => `<tr><td><b>${escapeHtml(c.code || '—')}</b></td><td>${escapeHtml(c.name)}</td><td>${escapeHtml(c.phone || '—')}</td><td>${escapeHtml(c.address || '—')}</td></tr>`);
  document.getElementById('view').innerHTML = `<div class="hero"><div><h2>العملاء</h2><p>إدارة بيانات العملاء المستخدمة في المبيعات والفواتير والتحصيلات.</p></div><button class="button" data-add-customer>＋ إضافة عميل</button></div><div class="panel">${table(['الكود','اسم العميل','الهاتف','العنوان'], rows, 'لا يوجد عملاء مسجلون حتى الآن.')}</div>`;
}

async function suppliersView() {
  const suppliers = await fetchOne('suppliers', 'id,name,phone,notes');
  const rows = suppliers.map(s => `<tr><td><b>${escapeHtml(s.name)}</b></td><td>${escapeHtml(s.phone || '—')}</td><td>${escapeHtml(s.notes || '—')}</td></tr>`);
  document.getElementById('view').innerHTML = `<div class="hero"><div><h2>الموردين</h2><p>إدارة بيانات الموردين المستخدمة في المشتريات ومدفوعاتهم.</p></div><button class="button" data-add-supplier>＋ إضافة مورد</button></div><div class="panel">${table(['اسم المورد','الهاتف','ملاحظات'], rows, 'لا يوجد موردون مسجلون حتى الآن.')}</div>`;
}

async function accountsView() {
  const [invoiceBalances, purchaseBalances, moneyBalances, expenses, suppliers, customers] = await Promise.all([
    fetchOne('v_invoice_balances', 'outstanding_total'),
    fetchOne('v_purchase_balances', 'remaining_amount'),
    fetchOne('v_money_balances', 'name,kind,balance'),
    fetchOne('expenses', 'amount,cost_type'),
    fetchOne('suppliers', 'id,name'),
    fetchOne('customers', 'id,code,name,phone,address'),
  ]);
  const customerDue = invoiceBalances.reduce((s,r)=>s+Number(r.outstanding_total||0),0);
  const supplierDue = purchaseBalances.reduce((s,r)=>s+Number(r.remaining_amount||0),0);
  const expenseTotal = expenses.reduce((s,r)=>s+Number(r.amount||0),0);
  const cash = moneyBalances.reduce((s,r)=>s+Number(r.balance||0),0);
  document.getElementById('view').innerHTML = `<div class="hero"><div><h2>الحسابات</h2><p>العملاء والموردون والمصروفات والنقدية.</p></div></div><div class="stats-grid">${statCard('●','رصيد العملاء',money(customerDue),`${qty(customers.length)} عميل`)}${statCard('▰','رصيد الموردين',money(supplierDue),`${qty(suppliers.length)} مورد`)}${statCard('▥','مصروفات مسجلة',money(expenseTotal),'من الحركات الأصلية')}${statCard('▣','النقدية والبنك',money(cash),'من أرصدة الحسابات')}</div><div class="two-col"><div class="panel"><div class="panel-head"><div><h3>العملاء</h3><span>بيانات العملاء المستخدمة في فواتير البيع والتحصيلات.</span></div><button class="button secondary" data-add-customer>＋ إضافة عميل</button></div>${table(['الكود','اسم العميل','الهاتف','العنوان'], customers.map(c=>`<tr><td><b>${escapeHtml(c.code || '—')}</b></td><td>${escapeHtml(c.name)}</td><td>${escapeHtml(c.phone || '—')}</td><td>${escapeHtml(c.address || '—')}</td></tr>`), 'لا يوجد عملاء مسجلون حتى الآن.')}</div><div class="panel"><div class="panel-head"><div><h3>الموردون</h3><span>بيانات الموردين المستخدمة في المشتريات ومدفوعاتهم.</span></div><button class="button secondary" data-add-supplier>＋ إضافة مورد</button></div>${table(['اسم المورد','الهاتف','ملاحظات'], suppliers.map(s=>`<tr><td><b>${escapeHtml(s.name)}</b></td><td>${escapeHtml(s.phone || '—')}</td><td>${escapeHtml(s.notes || '—')}</td></tr>`), 'لا يوجد موردون مسجلون حتى الآن.')}</div></div><div class="two-col"><div class="panel"><h3>سداد الموردين</h3><p class="muted">مدفوعات الموردين مسار مستقل عن الشراء وتؤثر في رصيد المورد والنقدية.</p><button class="button secondary">＋ تسجيل دفعة مورد</button></div><div class="panel"><div class="panel-head"><div><h3>المصروفات</h3><span>المصروفات منفصلة عن تكاليف الإنتاج المتغيرة.</span></div><button class="button secondary">＋ إضافة مصروف</button></div></div></div>`;
}

async function reportsView() {
  const [invoices, collections, ready, wip, fixed, variable] = await Promise.all([
    fetchOne('v_invoice_totals', 'invoice_total'),
    fetchOne('collections', 'amount'),
    fetchOne('v_ready_balances', 'ready_pieces'),
    fetchOne('v_wip_balances', 'wip_pieces'),
    fetchOne('v_fixed_costs', 'fixed_cost_total'),
    fetchOne('v_variable_cutting_costs', 'variable_fabric_cost'),
  ]);
  const sales = invoices.reduce((s,r)=>s+Number(r.invoice_total||0),0);
  const collected = collections.reduce((s,r)=>s+Number(r.amount||0),0);
  const fixedTotal = fixed.reduce((s,r)=>s+Number(r.fixed_cost_total||0),0);
  const variableTotal = variable.reduce((s,r)=>s+Number(r.variable_fabric_cost||0),0);
  const readyTotal = ready.reduce((s,r)=>s+Number(r.ready_pieces||0),0);
  const wipTotal = wip.reduce((s,r)=>s+Number(r.wip_pieces||0),0);
  document.getElementById('view').innerHTML = `<div class="hero"><div><h2>التقارير</h2><p>تقارير مشتقة من الحركات الأصلية، وليست مصدر الحقيقة.</p></div></div><div class="stats-grid">${statCard('↗','المبيعات',money(sales),'إجمالي الفواتير')}${statCard('✓','التحصيلات',money(collected),'تحصيلات فعلية')}${statCard('◈','READY',qty(readyTotal),'قطعة')}${statCard('▤','WIP',qty(wipTotal),'قطعة')}</div><div class="two-col"><div class="panel"><h3>تفصيل التكاليف</h3><div class="report-line"><span>التكاليف الثابتة</span><b>${money(fixedTotal)}</b></div><div class="report-line"><span>التكلفة المتغيرة المسجلة للقص</span><b>${money(variableTotal)}</b></div><div class="report-line total"><span>الإجمالي</span><b>${money(fixedTotal + variableTotal)}</b></div></div><div class="panel note-panel"><h3>تنبيه محاسبي</h3><p>لا يتم عرض «صافي الربح» كحساب V1 معتمد هنا. التكاليف المتغيرة والثابتة تظل منفصلة حسب الـCanonical Master.</p></div></div>`;
}

async function cuttingView() {
  const [models, inventory] = await Promise.all([fetchOne('models', 'id,code,name'), fetchOne('v_inventory_balances', 'material_id,name,code,unit,current_quantity,kind')]);
  const fabric = inventory.filter((x)=>x.kind==='fabric');
  document.getElementById('view').innerHTML = `<div class="hero"><div><h2>القص والإنتاج</h2><p>القص الفعلي من الخامة حتى دخول WIP.</p></div></div><div class="steps"><span class="done">1 اختيار الموديل</span><span class="done">2 الخامة الفعلية</span><span>3 القطع الفعلية</span><span>4 دخول WIP</span></div><div class="two-col"><div class="panel form-panel"><h3>قصة قص جديدة</h3><div class="rule-box">بدء القص يعتمد على الأمتار الفعلية الداخلة للقص فقط — لا يوجد حقل لعدد قطع متوقع.</div><label>الموديل<select><option value="">اختر الموديل</option>${models.map(m=>`<option>${escapeHtml(m.code)} — ${escapeHtml(m.name)}</option>`).join('')}</select></label><label>الخامة<select><option value="">اختر القماش</option>${fabric.map(m=>`<option>${escapeHtml(m.code)} — ${escapeHtml(m.name)}</option>`).join('')}</select></label><label>الكمية الفعلية الداخلة<input type="number" min="0" step="0.01" placeholder="مثال: 150" /></label><button class="button" id="cutStart">حفظ بدء القص</button></div><div class="panel note-panel"><h3>قواعد القص المثبتة</h3><p>• القصة تخص موديلًا واحدًا.</p><p>• يمكن استخدام أكثر من خامة في نفس القصة.</p><p>• عند بدء القص يتم خصم الأمتار الفعلية من المخزن بصورة ذرية.</p><p>• نهاية القصة تسجل الأمتار الفعلية + القطع الفعلية، ثم يدخل الناتج WIP.</p></div></div>`;
  document.getElementById('cutStart').onclick = () => setStatus('واجهة G7 جاهزة. ربط حفظ قصة القص بالـRPC التشغيلي سيتم بعد تثبيت واجهة G7.', 'info');
}

async function renderRoute() {
  const key = location.hash.replace('#','') || 'dashboard';
  if (!document.getElementById('view')) await buildShell();
  setActiveNav(key);
  const loaders = { dashboard, models: modelsView, 'model-detail': modelDetailView, inventory: inventoryView, purchases: purchasesView, cutting: cuttingView, wip: wipView, ready: readyView, sales: salesView, invoices: invoicesView, collections: collectionsView, returns: returnsView, accounts: accountsView, customers: customersView, suppliers: suppliersView, reports: reportsView };
  const loader = loaders[key] || dashboard;
  try { setStatus('جارٍ تحميل البيانات…'); await loader(); setStatus(''); } catch (error) { console.error(error); setStatus(`تعذر تحميل الشاشة: ${error.message}`, 'error'); }
}

function bindInnerNav() {
  document.querySelectorAll('[data-nav]').forEach((button) => button.addEventListener('click', () => { location.hash = button.dataset.nav; renderRoute(); }));
}

async function route() {
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
  await renderRoute();
}

window.addEventListener('hashchange', renderRoute);
client.auth.onAuthStateChange(() => route());
route();
