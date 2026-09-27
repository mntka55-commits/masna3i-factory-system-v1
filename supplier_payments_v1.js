(() => {
  if (!document.getElementById('app')) return;

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

  window.supplierPaymentsView = supplierPaymentsView;
})();