(() => {
  if (!document.getElementById('app')) return;

  async function invoicesView() {
    const [balances, customers] = await Promise.all([
      fetchOne('v_invoice_balances', 'invoice_id,invoice_number,invoice_date,customer_id,invoice_total,sale_kind'),
      fetchOne('customers', 'id,name'),
    ]);

    const kind = (value) => value === 'clearance_sale'
      ? 'بيع تصفية'
      : value === 'return_redelivery'
        ? 'إعادة تسليم مرتجع'
        : 'بيع عادي';

    const rows = balances.map((r) => {
      const customer = customers.find((c) => c.id === r.customer_id)?.name || '—';
      return `<tr>
        <td><b>${escapeHtml(r.invoice_number)}</b></td>
        <td>${escapeHtml(customer)}</td>
        <td>${escapeHtml(r.invoice_date || '—')}</td>
        <td>${escapeHtml(kind(r.sale_kind))}</td>
        <td><b>${money(r.invoice_total)}</b></td>
        <td><button type="button" class="button secondary" data-print-invoice="${escapeHtml(r.invoice_id)}">عرض / طباعة</button></td>
      </tr>`;
    });

    document.getElementById('view').innerHTML = `
      <div class="hero"><div><h2>الفواتير</h2><p>سجل المستندات وفواتير البيع وتفاصيلها والطباعة.</p></div></div>
      <div class="panel invoice-rule"><b>قاعدة الحساب:</b> الفاتورة مستند للتنظيم والمراجعة، والتحصيل الفعلي يُسجل على حساب العميل.</div>
      <div class="panel">${table(['رقم الفاتورة','العميل','التاريخ','نوع البيع','الإجمالي','الإجراء'], rows, 'لا توجد فواتير حتى الآن.')}</div>`;

    document.querySelectorAll('[data-print-invoice]').forEach((button) => button.addEventListener('click', () => {
      const fn = window.__printMasna3iInvoice;
      if (typeof fn === 'function') fn(button.dataset.printInvoice);
      else setStatus('واجهة الفاتورة غير جاهزة حاليًا.', 'error');
    }));
  }

  window.invoicesView = invoicesView;
})();