(() => {
  const client = window.__masna3iClient || window.supabase?.createClient?.(
    'https://favitcmfzdlvgtwicxmb.supabase.co',
    'sb_publishable_to-VILINGqpWLu7Sod8ULQ_YBGMP7MZ'
  );
  if (!client) return;
  window.__masna3iClient = client;

  const esc = (v) => String(v ?? '').replace(/[&<>'"]/g, (c) => ({
    '&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#039;','"':'&#34;'
  }[c]));
  const money = (v) => new Intl.NumberFormat('ar-EG', { maximumFractionDigits: 2 }).format(Number(v || 0)) + ' ج';
  const dateLabel = (v) => v || '—';

  const kindLabel = {
    sale: 'بيع',
    clearance_sale: 'بيع تصفية',
    return_redelivery: 'إعادة تسليم مرتجع',
    collection: 'تحصيل',
    return: 'مرتجع عميل',
    opening_balance: 'رصيد افتتاحي',
    purchase: 'شراء',
    supplier_payment: 'دفعة للمورد',
    supplier_return: 'مرتجع شراء'
  };

  async function openStatement(type, id) {
    const customerMode = type === 'customer';
    const entityTable = customerMode ? 'customers' : 'suppliers';
    const balanceView = customerMode ? 'v_customer_account_balances' : 'v_supplier_account_balances';
    const statementView = customerMode ? 'v_customer_account_statement' : 'v_supplier_account_statement';
    const title = customerMode ? 'كشف حساب عميل' : 'كشف حساب مورد';

    document.getElementById('accountStatementModal')?.remove();

    const [{ data: entityRows, error: entityError }, { data: balances, error: balanceError }, { data: statement, error: statementError }] = await Promise.all([
      client.from(entityTable).select(customerMode ? 'id,code,name,phone,address' : 'id,name,phone').eq('id', id).limit(1),
      client.from(balanceView).select('*').eq(customerMode ? 'customer_id' : 'supplier_id', id).limit(1),
      client.from(statementView).select('event_date,event_type,event_label,reference,notes,debit_amount,credit_amount,running_balance').eq(customerMode ? 'customer_id' : 'supplier_id', id).order('event_date', { ascending: true })
    ]);

    if (entityError) return alert('تعذر تحميل الحساب: ' + entityError.message);
    if (balanceError) return alert('تعذر تحميل الرصيد: ' + balanceError.message);
    if (statementError) return alert('تعذر تحميل كشف الحساب: ' + statementError.message);

    const entity = entityRows?.[0];
    if (!entity) return;

    const balance = balances?.[0] || {};
    const lines = statement || [];

    const summary = customerMode
      ? [
          ['الرصيد الافتتاحي', money(balance.opening_receivable)],
          ['إجمالي الفواتير', money(balance.billed_sales)],
          ['التحصيلات', money(balance.collected)],
          ['ائتمان المرتجعات', money(balance.return_credits)],
          ['المطلوب حاليًا', money(balance.amount_due)],
          ['رصيد لصالح العميل', money(balance.customer_credit)]
        ]
      : [
          ['الرصيد الافتتاحي', money(balance.opening_payable)],
          ['إجمالي المشتريات', money(balance.purchases)],
          ['مدفوع للمورد', money(balance.payments)],
          ['مرتجعات الشراء', money(balance.returns_total)],
          ['المستحق حاليًا', money(balance.payable_balance)]
        ];

    const modal = document.createElement('div');
    modal.className = 'modal-backdrop';
    modal.id = 'accountStatementModal';
    modal.innerHTML = [
      '<div class="modal-card" role="dialog" aria-modal="true" style="max-width:1240px">',
      '<div class="modal-head">',
      '<div><span class="eyebrow">' + esc(customerMode ? 'العملاء' : 'الموردين') + '</span><h3>' + title + '</h3><span>' + esc(entity.name) + (entity.code ? ' — ' + esc(entity.code) : '') + '</span></div>',
      '<button class="modal-close" id="closeAccountStatement">×</button>',
      '</div>',
      '<div class="stats-grid ' + (customerMode ? 'three' : '') + '" style="margin-bottom:14px">',
      summary.map((x) => '<div class="stat-card"><div><span>' + esc(x[0]) + '</span><strong>' + x[1] + '</strong></div></div>').join(''),
      '</div>',
      '<div class="toolbar" style="margin-bottom:12px">',
      '<label>من<input id="statementFrom" type="date"></label>',
      '<label>إلى<input id="statementTo" type="date"></label>',
      '<button class="button secondary" id="statementReset">إظهار الكل</button>',
      '</div>',
      '<div id="statementBody"></div>',
      '</div>'
    ].join('');
    document.body.appendChild(modal);

    const body = document.getElementById('statementBody');
    const render = () => {
      const from = document.getElementById('statementFrom').value;
      const to = document.getElementById('statementTo').value;
      const filtered = lines.filter((r) => (!from || r.event_date >= from) && (!to || r.event_date <= to));
      const rows = filtered.map((r) => [
        '<tr>',
        '<td>' + esc(dateLabel(r.event_date)) + '</td>',
        '<td><span class="status-pill neutral">' + esc(kindLabel[r.event_type] || r.event_label || r.event_type) + '</span></td>',
        '<td><b>' + esc(r.reference || '—') + '</b><br><span class="subtext">' + esc(r.notes || '') + '</span></td>',
        '<td>' + money(r.debit_amount) + '</td>',
        '<td>' + money(r.credit_amount) + '</td>',
        '<td><b>' + money(r.running_balance) + '</b></td>',
        '</tr>'
      ].join(''));

      body.innerHTML = typeof table === 'function'
        ? table(['التاريخ','الحركة','المرجع / البيان','مدين','دائن','الرصيد'], rows, 'لا توجد حركة في الفترة المحددة.')
        : '<div class="empty-state">لا توجد حركة في الفترة المحددة.</div>';
    };

    document.getElementById('closeAccountStatement').onclick = () => modal.remove();
    modal.addEventListener('click', (e) => { if (e.target === modal) modal.remove(); });
    document.getElementById('statementFrom').onchange = render;
    document.getElementById('statementTo').onchange = render;
    document.getElementById('statementReset').onclick = () => {
      document.getElementById('statementFrom').value = '';
      document.getElementById('statementTo').value = '';
      render();
    };
    render();
  }

  document.addEventListener('click', (event) => {
    const button = event.target.closest('[data-account-statement]');
    if (!button) return;
    event.preventDefault();
    openStatement(button.dataset.accountType, button.dataset.accountStatement);
  }, true);

  window.openAccountStatement = openStatement;
})();