(() => {
  function c() {
    if (window.__masna3iClient) return window.__masna3iClient;
    const createClient = window.supabase?.createClient;
    if (!createClient) return null;
    window.__masna3iClient = createClient(
      'https://favitcmfzdlvgtwicxmb.supabase.co',
      'sb_publishable_to-VILINGqpWLu7Sod8ULQ_YBGMP7MZ',
    );
    return window.__masna3iClient;
  }
  if (!c()) return;

  const esc = (v) => String(v ?? '').replace(/[&<>'"]/g, (x) => ({
    '&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#039;','"':'&#34;'
  }[x]));
  const money = (v) => new Intl.NumberFormat('en-US', { maximumFractionDigits: 2 }).format(Number(v || 0)) + ' ج';
  const qty = (v) => new Intl.NumberFormat('en-US', { maximumFractionDigits: 0 }).format(Number(v || 0));
  const today = () => new Date().toISOString().slice(0, 10);
  const kindLabel = (k) => k === 'cash' ? 'نقدية' : k === 'bank' ? 'بنك' : k || '—';

  async function openMoneyAccountModal(onCreated) {
    document.getElementById('moneyAccountModal')?.remove();
    const modal = document.createElement('div');
    modal.className = 'modal-backdrop';
    modal.id = 'moneyAccountModal';
    modal.innerHTML = `
      <div class="modal-card" role="dialog" aria-modal="true" aria-labelledby="moneyAccountTitle">
        <div class="modal-head">
          <div><span class="eyebrow">الحسابات المالية</span><h3 id="moneyAccountTitle">إضافة حساب نقدية / بنك</h3><span>الحساب يبدأ برصيد صفر؛ الرصيد الافتتاحي له مسار منفصل.</span></div>
          <button type="button" class="modal-close" data-close-money-account>×</button>
        </div>
        <form id="moneyAccountForm" class="stack-form">
          <label>اسم الحساب<input id="moneyAccountName" required maxlength="120" placeholder="مثال: خزينة المصنع" /></label>
          <label>النوع<select id="moneyAccountKind" required><option value="cash">نقدية</option><option value="bank">بنك</option></select></label>
          <div id="moneyAccountStatus" class="modal-status"></div>
          <div class="modal-actions">
            <button type="button" class="button secondary" data-close-money-account>إلغاء</button>
            <button type="submit" class="button" id="saveMoneyAccount">حفظ الحساب</button>
          </div>
        </form>
      </div>`;
    document.body.appendChild(modal);

    const close = () => modal.remove();
    modal.querySelectorAll('[data-close-money-account]').forEach((b) => b.onclick = close);
    modal.addEventListener('click', (e) => { if (e.target === modal) close(); });

    modal.querySelector('#moneyAccountForm').addEventListener('submit', async (e) => {
      e.preventDefault();
      const submit = modal.querySelector('#saveMoneyAccount');
      const status = modal.querySelector('#moneyAccountStatus');
      const name = modal.querySelector('#moneyAccountName').value.trim();
      const kind = modal.querySelector('#moneyAccountKind').value;
      if (!name) return;
      submit.disabled = true;
      status.className = 'modal-status info';
      status.textContent = 'جارٍ إنشاء الحساب…';
      try {
        const { data, error } = await c().from('money_accounts')
          .insert({ name, kind, active: true })
          .select('id,name,kind,active')
          .single();
        if (error) throw error;
        status.className = 'modal-status success';
        status.textContent = 'تم إنشاء الحساب وتفعيله.';
        await new Promise((resolve) => setTimeout(resolve, 220));
        close();
        onCreated?.(data);
        window.renderRoute?.(true);
      } catch (err) {
        status.className = 'modal-status error';
        status.textContent = 'تعذر إنشاء الحساب: ' + err.message;
        submit.disabled = false;
      }
    });
  }

  async function openCustomerAccount(customerId, autoCollect = false) {
    document.getElementById('customerAccountModal')?.remove();
    const supabase = c();
    if (!supabase) return;

    const [
      { data: customers, error: customerError },
      { data: balances, error: balanceError },
      { data: invoiceBalances, error: invoiceError },
      { data: statement, error: statementError },
      { data: accounts, error: accountsError },
    ] = await Promise.all([
      supabase.from('customers').select('id,code,name,phone,address,notes').eq('id', customerId).limit(1),
      supabase.from('v_customer_account_balances').select('*').eq('customer_id', customerId).limit(1),
      supabase.from('v_invoice_balances').select('invoice_id,invoice_number,invoice_date,customer_id,invoice_total,collected_total,outstanding_total,sale_kind').eq('customer_id', customerId).order('invoice_date', { ascending: true }),
      supabase.from('v_customer_account_statement').select('event_date,event_type,event_label,reference,notes,debit_amount,credit_amount,running_balance').eq('customer_id', customerId).order('event_date', { ascending: true }),
      supabase.from('money_accounts').select('id,name,kind,active').order('name'),
    ]);

    if (customerError || balanceError || invoiceError || statementError || accountsError) {
      const err = customerError || balanceError || invoiceError || statementError || accountsError;
      alert('تعذر تحميل حساب العميل: ' + err.message);
      return;
    }

    const customer = customers?.[0];
    if (!customer) return;
    const balance = balances?.[0] || {};
    const invoices = invoiceBalances || [];
    const openInvoices = invoices.filter((x) => Number(x.outstanding_total || 0) > 0);
    const activeAccounts = (accounts || []).filter((x) => x.active);

    const modal = document.createElement('div');
    modal.id = 'customerAccountModal';
    modal.className = 'modal-backdrop';
    modal.innerHTML = `
      <div class="modal-card" role="dialog" aria-modal="true" style="max-width:1280px">
        <div class="modal-head">
          <div>
            <span class="eyebrow">حساب العميل</span>
            <h3>${esc(customer.name)} ${customer.code ? '— ' + esc(customer.code) : ''}</h3>
            <span>${esc(customer.phone || customer.address || 'حساب العميل والفواتير والحركات المالية')}</span>
          </div>
          <div class="modal-actions">
            <button type="button" class="button" id="customerAccountCollect">＋ تحصيل من العميل</button>
            <button type="button" class="modal-close" id="closeCustomerAccount">×</button>
          </div>
        </div>

        <div class="stats-grid three" style="margin-bottom:14px">
          <div class="stat-card"><div><span>المطلوب حاليًا</span><strong>${money(balance.amount_due)}</strong><small>بعد التحصيلات والمرتجعات</small></div></div>
          <div class="stat-card"><div><span>إجمالي الفواتير</span><strong>${money(balance.billed_sales)}</strong><small>${qty(invoices.length)} فاتورة</small></div></div>
          <div class="stat-card"><div><span>التحصيلات</span><strong>${money(balance.collected)}</strong><small>من الحركات المسجلة</small></div></div>
        </div>

        <div id="customerCollectionPane" style="display:none;margin-bottom:14px"></div>

        <div class="panel" style="margin-bottom:14px">
          <div class="panel-head">
            <div><h3>الفواتير</h3><span>الفواتير مرتبطة بهذا العميل فقط، والمتبقي هو الحد الفعلي للتحصيل.</span></div>
          </div>
          <div id="customerInvoices"></div>
        </div>

        <div class="panel">
          <div class="panel-head"><div><h3>كشف الحساب</h3><span>كل حركة مالية مرتبة زمنيًا.</span></div></div>
          <div id="customerStatement"></div>
        </div>
      </div>`;
    document.body.appendChild(modal);

    const close = () => modal.remove();
    modal.querySelector('#closeCustomerAccount').onclick = close;
    modal.addEventListener('click', (e) => { if (e.target === modal) close(); });

    const invoiceRows = invoices.map((r) => {
      const due = Number(r.outstanding_total || 0);
      const status = due > 0 ? '<span class="status-pill warning">مفتوحة</span>' : '<span class="status-pill ok">مكتملة</span>';
      return `<tr>
        <td><b>${esc(r.invoice_number)}</b></td>
        <td>${esc(r.invoice_date || '—')}</td>
        <td>${money(r.invoice_total)}</td>
        <td>${money(r.collected_total)}</td>
        <td><b>${money(due)}</b></td>
        <td>${status}</td>
      </tr>`;
    }).join('');
    modal.querySelector('#customerInvoices').innerHTML = invoiceRows
      ? `<div class="table-wrap"><table><thead><tr><th>الفاتورة</th><th>التاريخ</th><th>الإجمالي</th><th>المحصل</th><th>المتبقي</th><th>الحالة</th></tr></thead><tbody>${invoiceRows}</tbody></table></div>`
      : '<div class="empty-state"><b>لا توجد فواتير لهذا العميل حتى الآن.</b><span>عند تسجيل بيع باسم العميل ستظهر الفاتورة هنا.</span></div>';

    const statementRows = (statement || []).map((r) => `<tr>
      <td>${esc(r.event_date || '—')}</td>
      <td><span class="status-pill neutral">${esc(r.event_label || r.event_type || '—')}</span></td>
      <td><b>${esc(r.reference || '—')}</b><br><span class="subtext">${esc(r.notes || '')}</span></td>
      <td>${money(r.debit_amount)}</td>
      <td>${money(r.credit_amount)}</td>
      <td><b>${money(r.running_balance)}</b></td>
    </tr>`).join('');
    modal.querySelector('#customerStatement').innerHTML = statementRows
      ? `<div class="table-wrap"><table><thead><tr><th>التاريخ</th><th>الحركة</th><th>المرجع / البيان</th><th>مدين</th><th>دائن</th><th>الرصيد</th></tr></thead><tbody>${statementRows}</tbody></table></div>`
      : '<div class="empty-state"><b>لا توجد حركة مالية.</b><span>سيظهر كشف الحساب بعد أول عملية بيع أو تحصيل.</span></div>';

    const pane = modal.querySelector('#customerCollectionPane');
    const renderCollectionPane = () => {
      if (!activeAccounts.length) {
        pane.innerHTML = `
          <div class="panel note-panel">
            <h3>الحساب النقدي / البنكي غير جاهز</h3>
            <p>لا يوجد حساب نشط لاستلام التحصيل. أنشئ الحساب هنا وسيظهر مباشرة في نفس العملية.</p>
            <button type="button" class="button" id="createAccountFromCustomerCollection">＋ إنشاء حساب نقدية / بنك</button>
          </div>`;
        modal.querySelector('#createAccountFromCustomerCollection').onclick = () => openMoneyAccountModal((created) => {
          activeAccounts.push(created);
          renderCollectionPane();
        });
        return;
      }

      if (!openInvoices.length) {
        pane.innerHTML = `
          <div class="panel note-panel">
            <h3>لا توجد فواتير مستحقة للتحصيل</h3>
            <p>${Number(balance.amount_due || 0) > 0
              ? 'يوجد رصيد مستحق في الحساب لكنه ليس موزعًا على فواتير مبيعات مفتوحة في V1 الحالي.'
              : 'الحساب لا يحتوي على فواتير مفتوحة حاليًا.'}</p>
          </div>`;
        return;
      }

      pane.innerHTML = `
        <div class="panel" style="border:1px dashed #cbd5e1">
          <div class="panel-head">
            <div><h3>تحصيل من ${esc(customer.name)}</h3><span>اكتب إجمالي المبلغ ثم وزّعه على فواتير العميل. التوزيع لا يتجاوز المتبقي على أي فاتورة.</span></div>
            <button type="button" class="button secondary" id="autoAllocateCustomer">توزيع على الأقدم</button>
          </div>
          <div class="form-grid">
            <label>مبلغ التحصيل<input id="customerCollectionAmount" type="number" min="0.01" step="0.01" placeholder="مثال: 1,000" /></label>
            <label>الحساب المستلم<select id="customerCollectionAccount"><option value="">اختر الحساب</option>${activeAccounts.map((a) => `<option value="${esc(a.id)}">${esc(a.name)} — ${kindLabel(a.kind)}</option>`).join('')}</select></label>
          </div>
          <div class="form-grid">
            <label>تاريخ التحصيل<input id="customerCollectionDate" type="date" value="${today()}" required /></label>
            <label>المرجع<input id="customerCollectionReference" maxlength="120" placeholder="رقم إيصال / تحويل (اختياري)" /></label>
          </div>
          <label>ملاحظات<input id="customerCollectionNotes" maxlength="300" placeholder="ملاحظات (اختياري)" /></label>
          <div id="customerAllocationBox" class="allocation-box" style="margin-top:10px"></div>
          <div class="allocation-total"><span>إجمالي التوزيع</span><strong id="customerAllocationTotal">0 ج</strong></div>
          <div class="modal-actions">
            <button type="button" class="button secondary" id="cancelCustomerCollection">إغلاق التحصيل</button>
            <button type="button" class="button" id="saveCustomerCollection">حفظ التحصيل</button>
          </div>
          <div id="customerCollectionStatus" class="modal-status"></div>
        </div>`;

      const amount = modal.querySelector('#customerCollectionAmount');
      const box = modal.querySelector('#customerAllocationBox');
      const totalNode = modal.querySelector('#customerAllocationTotal');
      const status = modal.querySelector('#customerCollectionStatus');
      const renderAllocations = () => {
        box.innerHTML = openInvoices.map((inv) => `
          <div class="allocation-row" data-customer-invoice="${esc(inv.invoice_id)}" data-max="${Number(inv.outstanding_total)}">
            <div><b>${esc(inv.invoice_number)}</b><small>${esc(inv.invoice_date || '')}</small></div>
            <span>${money(inv.outstanding_total)}</span>
            <input type="number" min="0" max="${Number(inv.outstanding_total)}" step="0.01" value="0" placeholder="0" />
          </div>`).join('');
        box.querySelectorAll('input').forEach((input) => input.addEventListener('input', () => {
          const max = Number(input.max || 0);
          let value = Number(input.value || 0);
          if (value < 0) value = 0;
          if (value > max) value = max;
          input.value = value ? String(value) : '';
          const total = [...box.querySelectorAll('input')].reduce((s, x) => s + Number(x.value || 0), 0);
          totalNode.textContent = money(total);
        }));
      };
      renderAllocations();

      modal.querySelector('#autoAllocateCustomer').onclick = () => {
        let remaining = Number(amount.value || 0);
        if (!(remaining > 0)) return status.textContent = 'اكتب مبلغ التحصيل أولًا.';
        [...box.querySelectorAll('.allocation-row')].forEach((row) => {
          const input = row.querySelector('input');
          const max = Number(row.dataset.max || 0);
          const assigned = Math.min(remaining, max);
          input.value = assigned ? String(assigned) : '';
          remaining -= assigned;
        });
        const total = [...box.querySelectorAll('input')].reduce((s, x) => s + Number(x.value || 0), 0);
        totalNode.textContent = money(total);
        status.textContent = remaining > 0 ? 'المبلغ أكبر من إجمالي المستحق على الفواتير المفتوحة.' : '';
      };

      modal.querySelector('#cancelCustomerCollection').onclick = () => { pane.style.display = 'none'; };
      modal.querySelector('#saveCustomerCollection').onclick = async () => {
        status.className = 'modal-status info';
        status.textContent = '';
        const amountValue = Number(amount.value || 0);
        const accountId = modal.querySelector('#customerCollectionAccount').value;
        const allocations = [...box.querySelectorAll('.allocation-row')].map((row) => ({
          invoice_id: row.dataset.customerInvoice,
          amount: Number(row.querySelector('input')?.value || 0)
        })).filter((x) => x.amount > 0);
        const allocationTotal = allocations.reduce((s, x) => s + x.amount, 0);

        if (!(amountValue > 0)) return status.textContent = 'مبلغ التحصيل يجب أن يكون أكبر من صفر.';
        if (!accountId) return status.textContent = 'اختر الحساب المستلم.';
        if (!allocations.length) return status.textContent = 'وزّع مبلغ التحصيل على فاتورة واحدة على الأقل.';
        if (Math.abs(allocationTotal - amountValue) > 0.005) {
          return status.textContent = `إجمالي التوزيع ${money(allocationTotal)} ولا يساوي مبلغ التحصيل ${money(amountValue)}.`;
        }

        const invalid = allocations.some((x) => {
          const row = box.querySelector(`[data-customer-invoice="${CSS.escape(x.invoice_id)}"]`);
          return Number(x.amount) > Number(row?.dataset?.max || 0);
        });
        if (invalid) return status.textContent = 'يوجد توزيع يتجاوز المتبقي على فاتورة.';
        const save = modal.querySelector('#saveCustomerCollection');
        save.disabled = true;
        save.textContent = 'جارٍ الحفظ…';

        try {
          const { error } = await supabase.rpc('post_customer_collection', {
            p_customer_id: customerId,
            p_amount: amountValue,
            p_collection_date: modal.querySelector('#customerCollectionDate').value,
            p_account_id: accountId,
            p_allocations: allocations,
            p_reference: modal.querySelector('#customerCollectionReference').value.trim() || null,
            p_notes: modal.querySelector('#customerCollectionNotes').value.trim() || null,
          });
          if (error) throw error;
          status.className = 'modal-status success';
          status.textContent = 'تم تسجيل التحصيل وتوزيعه على حساب العميل.';
          setTimeout(() => location.reload(), 450);
        } catch (err) {
          status.className = 'modal-status error';
          status.textContent = 'تعذر تسجيل التحصيل: ' + err.message;
          save.disabled = false;
          save.textContent = 'حفظ التحصيل';
        }
      };
    };

    modal.querySelector('#customerAccountCollect').onclick = () => {
      pane.style.display = pane.style.display === 'none' ? 'block' : 'none';
      if (pane.style.display === 'block') renderCollectionPane();
    };

    if (autoCollect) {
      pane.style.display = 'block';
      renderCollectionPane();
    }
  }

  function openCustomerPicker() {
    document.getElementById('customerPickerModal')?.remove();
    const supabase = c();
    supabase.from('customers').select('id,code,name').order('name').then(async ({ data: customers, error }) => {
      if (error) return alert('تعذر تحميل العملاء: ' + error.message);
      const ids = (customers || []).map((x) => x.id);
      let balances = [];
      if (ids.length) {
        const res = await supabase.from('v_customer_account_balances').select('customer_id,code,name,amount_due,customer_credit').in('customer_id', ids);
        if (res.error) return alert('تعذر تحميل أرصدة العملاء: ' + res.error.message);
        balances = res.data || [];
      }
      const byId = new Map(balances.map((x) => [x.customer_id, x]));
      const debtors = (customers || []).map((customer) => ({ ...customer, ...(byId.get(customer.id) || {}) }))
        .filter((x) => Number(x.amount_due || 0) > 0);

      const modal = document.createElement('div');
      modal.id = 'customerPickerModal';
      modal.className = 'modal-backdrop';
      modal.innerHTML = `
        <div class="modal-card" role="dialog" aria-modal="true" style="max-width:900px">
          <div class="modal-head"><div><span class="eyebrow">التحصيلات</span><h3>اختيار حساب العميل</h3><span>اختر العميل أولًا؛ الفواتير ستظهر داخل حسابه.</span></div><button type="button" class="modal-close" id="closeCustomerPicker">×</button></div>
          <div class="panel" style="margin:0">${debtors.length ? `
            <div class="table-wrap"><table><thead><tr><th>العميل</th><th>المستحق</th><th>الرصيد لصالحه</th><th>الإجراء</th></tr></thead><tbody>
              ${debtors.map((x) => `<tr><td><b>${esc(x.name)}</b><br><span class="subtext">${esc(x.code || '')}</span></td><td><b>${money(x.amount_due)}</b></td><td>${money(x.customer_credit)}</td><td><button type="button" class="button" data-pick-customer="${esc(x.customer_id)}">فتح الحساب</button></td></tr>`).join('')}
            </tbody></table></div>`
            : '<div class="empty-state"><b>لا توجد حسابات عملاء عليها مستحق حاليًا.</b><span>عند تسجيل فاتورة باسم عميل مسجل، سيظهر حسابه هنا.</span></div>'}
          </div>
        </div>`;
      document.body.appendChild(modal);
      modal.querySelector('#closeCustomerPicker').onclick = () => modal.remove();
      modal.addEventListener('click', (e) => { if (e.target === modal) modal.remove(); });
      modal.querySelectorAll('[data-pick-customer]').forEach((b) => b.onclick = () => {
        modal.remove();
        openCustomerAccount(b.dataset.pickCustomer, true);
      });
    });
  }

  document.addEventListener('click', (event) => {
    const statementButton = event.target.closest('[data-account-statement][data-account-type="customer"]');
    if (statementButton) {
      event.preventDefault();
      event.stopImmediatePropagation();
      openCustomerAccount(statementButton.dataset.accountStatement, false);
      return;
    }

    const openAccountButton = event.target.closest('[data-open-customer-account]');
    if (openAccountButton) {
      event.preventDefault();
      event.stopImmediatePropagation();
      openCustomerAccount(openAccountButton.dataset.openCustomerAccount, false);
      return;
    }

    const collectButton = event.target.closest('[data-collect-customer]');
    if (collectButton) {
      event.preventDefault();
      event.stopImmediatePropagation();
      openCustomerAccount(collectButton.dataset.collectCustomer, true);
      return;
    }

    const pickerButton = event.target.closest('[data-open-customer-picker]');
    if (pickerButton) {
      event.preventDefault();
      event.stopImmediatePropagation();
      openCustomerPicker();
      return;
    }

    const addMoney = event.target.closest('[data-add-money-account]');
    if (addMoney) {
      event.preventDefault();
      event.stopImmediatePropagation();
      openMoneyAccountModal();
      return;
    }

    const toggle = event.target.closest('[data-toggle-money-account]');
    if (toggle) {
      event.preventDefault();
      event.stopImmediatePropagation();
      const id = toggle.dataset.toggleMoneyAccount;
      const next = toggle.dataset.nextActive === 'true';
      toggle.disabled = true;
      c().from('money_accounts').update({ active: next }).eq('id', id).then(({ error }) => {
        if (error) {
          alert('تعذر تغيير حالة الحساب: ' + error.message);
          toggle.disabled = false;
        } else {
          window.renderRoute?.(true);
        }
      });
    }
  }, true);

  window.__openCustomerAccount = openCustomerAccount;
  window.__openCustomerCollection = (customerId) => openCustomerAccount(customerId, true);
  window.__openMoneyAccountModal = openMoneyAccountModal;
})();