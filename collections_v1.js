(() => {
  if (!document.getElementById('app')) return;

  async function collectionsView() {
  const [customerBalances, invoiceBalances, collections, accounts] = await Promise.all([
    fetchOne('v_customer_account_balances', 'customer_id,code,name,amount_due,customer_credit'),
    fetchOne('v_invoice_balances', 'invoice_id,invoice_number,invoice_date,customer_id,outstanding_total'),
    fetchOne('collections', 'id,collection_date,account_id,amount,reference,created_at'),
    fetchOne('money_accounts', 'id,name,kind,active'),
  ]);

  const debtors = customerBalances.filter((r) => Number(r.amount_due || 0) > 0);
  const unassignedOpenInvoices = invoiceBalances.filter(
    (r) => !r.customer_id && Number(r.outstanding_total || 0) > 0
  );
  const unassignedOutstanding = unassignedOpenInvoices.reduce(
    (s, r) => s + Number(r.outstanding_total || 0), 0
  );
  const totalOutstanding = debtors.reduce((s, r) => s + Number(r.amount_due || 0), 0);
  const totalCollected = collections.reduce((s, r) => s + Number(r.amount || 0), 0);
  const activeAccounts = accounts.filter((a) => a.active);

  const rows = collections
    .slice()
    .sort((a, b) => String(b.collection_date || b.created_at || '').localeCompare(String(a.collection_date || a.created_at || '')))
    .map((r) => `<tr>
      <td>${escapeHtml(r.collection_date || r.created_at?.slice(0, 10) || '—')}</td>
      <td>${escapeHtml(r.reference || '—')}</td>
      <td>${escapeHtml(accounts.find((a) => a.id === r.account_id)?.name || '—')}</td>
      <td><b>${money(r.amount)}</b></td>
      <td><span class="status-pill ok">مسجل</span></td>
    </tr>`);

  document.getElementById('view').innerHTML = `
    <div class="hero">
      <div><h2>التحصيلات</h2><p>ابدأ من حساب العميل ثم وزّع التحصيل على فواتيره. لا توجد قائمة فواتير عامة للتدوير عليها.</p></div>
      <button class="button" data-open-customer-picker>＋ تحصيل من عميل</button>
    </div>
    ${!activeAccounts.length ? `<div class="panel note-panel">
      <h3>الحسابات النقدية / البنكية غير مُعدة</h3>
      <p>أنشئ خزينة أو حسابًا بنكيًا مرة واحدة. الحساب سيظهر بعدها تلقائيًا في التحصيلات والمدفوعات والمصروفات.</p>
      <button class="button" data-add-money-account>＋ إنشاء حساب نقدية / بنك</button>
    </div>` : ''}
    ${unassignedOpenInvoices.length ? `<div class="panel note-panel">
      <h3>تنبيه: فواتير بدون حساب عميل</h3>
      <p>يوجد ${qty(unassignedOpenInvoices.length)} فاتورة مستحقة بقيمة <b>${money(unassignedOutstanding)}</b> غير مرتبطة بعميل مسجل، لذلك لن تظهر داخل حساب عميل.</p>
      <button class="button secondary" data-nav="invoices">مراجعة الفواتير</button>
    </div>` : ''}
    <div class="stats-grid">
      ${statCard('▣', 'إجمالي المستحق من العملاء', money(totalOutstanding), `${qty(debtors.length)} عميل عليه مستحق`)}
      ${statCard('✓', 'إجمالي التحصيلات', money(totalCollected), 'حركات فعلية مسجلة')}
      ${statCard('●', 'حسابات نقدية/بنك', qty(activeAccounts.length), 'متاحة للتحصيل')}
      ${statCard('↗', 'العملاء القابلون للتحصيل', qty(debtors.length), 'ابدأ من حساب العميل')}
    </div>
    <div class="panel">
      <div class="panel-head"><div><h3>حسابات العملاء المفتوحة</h3><span>الاختيار هنا على العميل، والفواتير تظهر داخل حسابه فقط.</span></div></div>
      ${table(['العميل','الكود','المستحق','لصالح العميل','الإجراء'], debtors.map((r) => `
        <tr>
          <td><b>${escapeHtml(r.name)}</b></td>
          <td>${escapeHtml(r.code || '—')}</td>
          <td><b>${money(r.amount_due)}</b></td>
          <td>${money(r.customer_credit)}</td>
          <td><button class="button" data-open-customer-account="${escapeHtml(r.customer_id)}">فتح الحساب</button><button class="table-button" data-collect-customer="${escapeHtml(r.customer_id)}">تحصيل</button></td>
        </tr>`), 'لا توجد حسابات عملاء عليها مستحقات حاليًا.')}
    </div>
    <div class="panel collection-panel">
      <div class="panel-head"><div><h3>آخر حركات التحصيل</h3><span>كل حركة مرتبطة بحساب نقدية أو بنك.</span></div></div>
      ${table(['التاريخ','المرجع','الحساب','القيمة','الحالة'], rows, 'لا توجد تحصيلات حتى الآن.')}
    </div>
  `;
  bindInnerNav();
}

  window.collectionsView = collectionsView;
})();