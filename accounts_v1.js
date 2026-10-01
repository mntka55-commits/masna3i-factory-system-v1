(() => {
  if (!document.getElementById('app')) return;

  async function accountsView() {
  const [customerBalances, purchaseBalances, moneyBalances, expenses, suppliers, customers] = await Promise.all([
    fetchOne('v_customer_account_balances', 'customer_id,code,name,amount_due,customer_credit'),
    fetchOne('v_supplier_account_balances', 'supplier_id,payable_balance'),
    fetchOne('v_money_balances', 'account_id,name,kind,balance,active'),
    fetchOne('expenses', 'amount,cost_type'),
    fetchOne('suppliers', 'id,name'),
    fetchOne('customers', 'id,code,name,phone,address'),
  ]);

  const customerDue = customerBalances.reduce((s,r)=>s+Number(r.amount_due||0),0);
  const supplierDue = purchaseBalances.reduce((s,r)=>s+Math.max(Number(r.payable_balance||0),0),0);
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

  window.accountsView = accountsView;
})();