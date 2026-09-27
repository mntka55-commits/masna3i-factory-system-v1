(() => {
  if (!document.getElementById('app')) return;

  async function invoicesView() {
  const [balances, customers] = await Promise.all([
    fetchOne('v_invoice_balances', 'invoice_id,invoice_number,invoice_date,customer_id,invoice_total,collected_total,outstanding_total'),
    fetchOne('customers', 'id,name'),
  ]);
  const rows = balances.map((r) => {
    const customer = customers.find((c) => c.id === r.customer_id)?.name || '—';
    const open = Number(r.outstanding_total || 0) > 0;
    return `<tr>
      <td><button type="button" class="table-button" data-print-invoice="${escapeHtml(r.invoice_id)}">${escapeHtml(r.invoice_number)}</button></td>
      <td>${escapeHtml(customer)}</td>
      <td>${escapeHtml(r.invoice_date || '—')}</td>
      <td>${money(r.invoice_total)}</td>
      <td>${money(r.collected_total)}</td>
      <td>${money(r.outstanding_total)}</td>
      <td><span class="status-pill ${open ? 'warning' : 'ok'}">${open ? 'مفتوحة' : 'مكتملة'}</span></td>
      <td><button type="button" class="table-button" data-print-invoice="${escapeHtml(r.invoice_id)}">عرض / طباعة</button></td>
    </tr>`;
  });
  document.getElementById('view').innerHTML = `
    <div class="hero"><div><h2>الفواتير</h2><p>سجل الفواتير وتفاصيلها والطباعة وإعادة الطباعة.</p></div></div>
    <div class="panel invoice-rule"><b>قاعدة الطباعة:</b> الطباعة وإعادة الطباعة لا تنشئ حركة جديدة ولا تغيّر المخزون أو الحسابات.</div>
    <div class="panel">${table(['رقم الفاتورة','العميل','التاريخ','الإجمالي','المحصل','المتبقي','الحالة','الإجراء'], rows, 'لا توجد فواتير حتى الآن.')}</div>`;
  document.querySelectorAll('[data-print-invoice]').forEach((button) => button.addEventListener('click', () => {
    const fn = window.__printMasna3iInvoice;
    if (typeof fn === 'function') fn(button.dataset.printInvoice);
    else setStatus('واجهة الفاتورة غير جاهزة حاليًا.', 'error');
  }));
}

  window.invoicesView = invoicesView;
})();