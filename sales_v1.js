(() => {
  const client = window.__masna3iClient || window.supabase?.createClient?.(
    'https://favitcmfzdlvgtwicxmb.supabase.co',
    'sb_publishable_to-VILINGqpWLu7Sod8ULQ_YBGMP7MZ'
  );
  if (!client) return;
  window.__masna3iClient = client;

  const today = () => new Date().toISOString().slice(0, 10);
  const esc = (v) => String(v ?? '').replace(/[&<>'"]/g, (c) => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', "'":'&#039;', '"':'&quot;' }[c]));

  async function loadReadyModels() {
    const [{ data: ready, error: re }, { data: models, error: me }] = await Promise.all([
      client.from('v_ready_balances').select('model_id,model_code,model_name,ready_pieces').gt('ready_pieces', 0).order('model_code'),
      client.from('models').select('id,code,name,selling_price').order('code'),
    ]);
    if (re) throw re;
    if (me) throw me;
    const map = new Map((models || []).map((m) => [m.id, m]));
    return (ready || []).map((r) => ({ ...r, selling_price: map.get(r.model_id)?.selling_price ?? null }));
  }

  function lineTemplate(rows, index) {
    const options = rows.map((m) => `<option value="${m.model_id}" data-price="${m.selling_price ?? ''}">${esc(m.model_code)} — ${esc(m.model_name)} (READY: ${m.ready_pieces})</option>`).join('');
    return `<div class="purchase-line sale-line" data-sale-line="${index}">
      <label>الموديل<select data-sale-model required><option value="">اختر الموديل من READY</option>${options}</select></label>
      <label>الكمية<input data-sale-qty type="number" min="1" step="1" required placeholder="مثال: 2" /></label>
      <label>سعر البيع للقطعة<input data-sale-price type="number" min="0" step="0.01" required /></label>
      <button type="button" class="button secondary" data-remove-sale-line ${index === 0 ? 'disabled' : ''}>حذف</button>
    </div>`;
  }

  async function openSaleModal(mode = 'normal') {
    const clearance = mode === 'clearance';
    const title = clearance ? 'بيع تصفية' : 'بيع جديد';
    const description = clearance
      ? 'بيع تصفية من READY فقط، مع حفظ سعر البيع الفعلي وقت العملية.'
      : 'البيع من READY فقط، والبيع الجزئي ومتعدد الموديلات مسموح.';
    const submitLabel = clearance ? 'تسجيل بيع التصفية' : 'تسجيل البيع';
    const rpcName = clearance ? 'post_clearance_sale_and_invoice_v2' : 'post_sale_and_invoice_v2';

    let ready;
    try { ready = await loadReadyModels(); } catch (e) { alert(`تعذر تحميل READY: ${e.message}`); return; }
    if (!ready.length) {
      alert('لا توجد قطع READY متاحة للبيع حاليًا.');
      return;
    }

    document.querySelector('.modal-backdrop.sale-modal')?.remove();
    const { data: customers, error: customersError } = await client.from('customers').select('id,code,name').order('name');
    if (customersError) { alert(`تعذر تحميل العملاء: ${customersError.message}`); return; }
    const optionsCustomers = (customers || []).map((c) => `<option value="${c.id}">${esc(c.code)} — ${esc(c.name)}</option>`).join('');
    const modal = document.createElement('div');
    modal.className = 'modal-backdrop sale-modal';
    modal.innerHTML = `<div class="modal-card sale-modal-card" role="dialog" aria-modal="true">
      <div class="modal-head"><div><h3>${title}</h3><span>${description}</span></div><button type="button" class="modal-close" data-close-sale>×</button></div>
      <form id="saleForm" class="modal-form">
        <div class="form-grid">
          <label>رقم الفاتورة<input id="saleInvoice" required maxlength="80" placeholder="مثال: INV-001" /></label>
          <label>تاريخ البيع<input id="saleDate" type="date" value="${today()}" required /></label>
        </div>
        <div class="form-grid">
    <label>نوع العميل
      <select id="saleCustomerType">
        <option value="registered">عميل مسجل</option>
        <option value="external">عميل خارجي</option>
      </select>
    </label>
    <div id="registeredCustomerWrap" style="display:flex;gap:10px;align-items:end">
      <label style="flex:1">العميل
        <select id="saleCustomer"><option value="">بدون عميل محدد</option>${optionsCustomers}</select>
      </label>
      <button type="button" class="button secondary" id="addCustomerFromSale">＋ إضافة عميل</button>
    </div>
    <label id="externalCustomerWrap" style="display:none">اسم العميل الخارجي
      <input id="externalCustomerName" maxlength="160" placeholder="اكتب اسم العميل على الفاتورة" />
      <small class="field-help">لن يتم إنشاء حساب عميل تلقائيًا.</small>
    </label>
  </div>
        <div class="panel-subhead"><div><h4>بنود البيع</h4><span>كل بند يُخصم من READY عند التسجيل.</span></div><button type="button" class="button secondary" id="addSaleLine">＋ إضافة موديل</button></div>
        <div id="saleLines">${lineTemplate(ready, 0)}</div>
        <label>ملاحظات<textarea id="saleNotes" rows="2" placeholder="اختياري"></textarea></label>
        <div id="saleStatus" class="modal-status"></div>
        <div class="modal-actions"><button type="button" class="button secondary" data-close-sale>إلغاء</button><button type="submit" class="button" id="saleSubmit">${submitLabel}</button></div>
      </form>
    </div>`;
    document.body.appendChild(modal);

    const close = () => modal.remove();
    const customerType = modal.querySelector('#saleCustomerType');
    const registeredWrap = modal.querySelector('#registeredCustomerWrap');
    const externalWrap = modal.querySelector('#externalCustomerWrap');
    const syncCustomerType = () => {
      const external = customerType.value === 'external';
      registeredWrap.style.display = external ? 'none' : 'flex';
      externalWrap.style.display = external ? 'block' : 'none';
    };
    customerType.addEventListener('change', syncCustomerType);
    syncCustomerType();

    modal.querySelector('#addCustomerFromSale').onclick = () => {
      if (window.__openCustomerModal) window.__openCustomerModal();
    };
    modal.querySelectorAll('[data-close-sale]').forEach((b) => b.onclick = close);

    const lines = modal.querySelector('#saleLines');
    let lineCount = 1;
    const bindLine = (row) => {
      const model = row.querySelector('[data-sale-model]');
      const price = row.querySelector('[data-sale-price]');
      model.addEventListener('change', () => {
        const selected = model.selectedOptions[0];
        const raw = selected?.dataset?.price ?? '';
        price.value = raw === '' ? '' : raw;
      });
      row.querySelector('[data-remove-sale-line]')?.addEventListener('click', () => {
        if (lines.querySelectorAll('[data-sale-line]').length > 1) row.remove();
      });
    };
    lines.querySelectorAll('[data-sale-line]').forEach(bindLine);
    modal.querySelector('#addSaleLine').onclick = () => {
      lines.insertAdjacentHTML('beforeend', lineTemplate(ready, lineCount++));
      bindLine(lines.lastElementChild);
    };

    modal.querySelector('#saleForm').onsubmit = async (event) => {
      event.preventDefault();
      const submit = modal.querySelector('#saleSubmit');
      const status = modal.querySelector('#saleStatus');
      submit.disabled = true;
      status.className = 'modal-status info';
      status.textContent = 'جارٍ تسجيل البيع وإصدار الفاتورة…';

      try {
        const rows = [...lines.querySelectorAll('[data-sale-line]')];
        const pItems = rows.map((row) => ({
          model_id: row.querySelector('[data-sale-model]').value,
          quantity: Number(row.querySelector('[data-sale-qty]').value),
          unit_price: Number(row.querySelector('[data-sale-price]').value),
        }));
        if (pItems.some((x) => !x.model_id || !Number.isInteger(x.quantity) || x.quantity <= 0 || !Number.isFinite(x.unit_price) || x.unit_price < 0)) {
          throw new Error('راجع الموديل والكمية وسعر البيع في كل بند.');
        }
        const external = customerType.value === 'external';
        const externalName = modal.querySelector('#externalCustomerName').value.trim();
        if (external && !externalName) throw new Error('اكتب اسم العميل الخارجي.');
        const registeredCustomerId = external ? null : (modal.querySelector('#saleCustomer').value || null);

        const { data, error } = await client.rpc(rpcName, {
          p_invoice_number: modal.querySelector('#saleInvoice').value.trim(),
          p_sale_date: modal.querySelector('#saleDate').value,
          p_items: pItems,
          p_customer_id: registeredCustomerId,
          p_external_customer_name: external ? externalName : null,
          p_notes: modal.querySelector('#saleNotes').value.trim() || null,
        });
        if (error) throw error;
        status.className = 'modal-status success';
        status.textContent = `تم ${clearance ? 'تسجيل بيع التصفية' : 'تسجيل البيع'} وإصدار الفاتورة بنجاح. رقم العملية: ${data?.invoice_id || 'تم الإنشاء'}`;
        setTimeout(() => { close(); location.hash = 'sales'; clearReadCache(); renderRoute(true); }, 700);
      } catch (e) {
        status.className = 'modal-status error';
        status.textContent = `تعذر تسجيل البيع: ${e.message}`;
        submit.disabled = false;
      }
    };
  }

  document.addEventListener('click', (event) => {
    const button = event.target.closest('.hero .button[data-sale-kind]');
    if (!button) return;
    event.preventDefault();
    event.stopPropagation();
    openSaleModal(button.dataset.saleKind);
  }, true);

  async function salesView() {
    const invoices = await fetchOne('v_invoice_totals', 'invoice_id,invoice_number,invoice_date,customer_id,invoice_total');
    const customers = await fetchOne('customers', 'id,name');
    const tr = invoices.map((r) => `<tr><td>${escapeHtml(r.invoice_number)}</td><td>${escapeHtml(customers.find((c)=>c.id===r.customer_id)?.name || '—')}</td><td>${escapeHtml(r.invoice_date)}</td><td>${money(r.invoice_total)}</td><td><button class="table-button" data-invoice="${r.invoice_id}">الفاتورة</button></td></tr>`);
    document.getElementById('view').innerHTML = `<div class="hero"><div><h2>المبيعات</h2><p>البيع من READY فقط — البيع الجزئي ومتعدد الموديلات.</p></div><div class="button-row"><button class="button" data-sale-kind="normal">＋ بيع جديد</button><button class="button secondary" data-sale-kind="clearance">＋ بيع تصفية</button></div></div><div class="panel purchase-note"><b>قاعدة تشغيلية:</b> الفاتورة تُنشأ مع البيع، ويمكن أن تحتوي على أكثر من موديل.</div><div class="panel">${table(['الفاتورة','العميل','التاريخ','الإجمالي',''], tr, 'لا توجد مبيعات حتى الآن.')}</div>`;
    document.querySelectorAll('[data-invoice]').forEach((b)=>b.addEventListener('click',()=>{ location.hash='invoices'; state.invoiceId=b.dataset.invoice; renderRoute(); }));
  }
  window.salesView = salesView;
})();
