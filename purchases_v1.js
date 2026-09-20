(() => {
  const client = window.__masna3iClient || window.supabase?.createClient?.(
    'https://favitcmfzdlvgtwicxmb.supabase.co',
    'sb_publishable_to-VILINGqpWLu7Sod8ULQ_YBGMP7MZ'
  );
  if (!client) return;
  window.__masna3iClient = client;

  const today = () => new Date().toISOString().slice(0, 10);
  const esc = (v) => String(v ?? '').replace(/[&<>'"]/g, (c) => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', "'":'&#039;', '"':'&quot;' }[c]));

  async function loadData() {
    const [{ data: suppliers, error: se }, { data: materials, error: me }] = await Promise.all([
      client.from('suppliers').select('id,name').order('name'),
      client.from('materials').select('id,code,name,kind,unit').order('name'),
    ]);
    if (se) throw se;
    if (me) throw me;
    return { suppliers: suppliers || [], materials: materials || [] };
  }

  function lineTemplate(materials, index) {
    const options = materials.map((m) => `<option value="${m.id}">${esc(m.code)} — ${esc(m.name)} (${m.kind === 'fabric' ? 'قماش' : 'إكسسوار'})</option>`).join('');
    return `<div class="purchase-line" data-purchase-line="${index}">
      <label>الصنف<select data-purchase-material required><option value="">اختر الصنف</option>${options}</select></label>
      <label>اللون / البيان<input data-purchase-color maxlength="120" placeholder="اختياري" /></label>
      <label>الكمية<input data-purchase-qty type="number" min="0.001" step="0.001" required /></label>
      <label>سعر الوحدة<input data-purchase-price type="number" min="0" step="0.01" required /></label>
      <button type="button" class="button secondary purchase-remove" data-remove-purchase-line ${index === 0 ? 'disabled' : ''}>حذف</button>
    </div>`;
  }

  async function openPurchaseModal() {
    let data;
    try { data = await loadData(); } catch (e) { alert(`تعذر تحميل بيانات الشراء: ${e.message}`); return; }
    if (!data.suppliers.length || !data.materials.length) {
      const missing = [!data.suppliers.length ? 'مورد' : '', !data.materials.length ? 'صنف/خامة' : ''].filter(Boolean).join(' و ');
      alert(`قبل تسجيل شراء يجب تعريف ${missing} أولًا.`);
      return;
    }

    document.querySelector('.modal-backdrop.purchase-modal')?.remove();
    const supplierOptions = data.suppliers.map((s) => `<option value="${s.id}">${esc(s.name)}</option>`).join('');
    const modal = document.createElement('div');
    modal.className = 'modal-backdrop purchase-modal';
    modal.innerHTML = `<div class="modal-card purchase-modal-card" role="dialog" aria-modal="true">
      <div class="modal-head"><div><h3>شراء جديد</h3><span>الشراء يزيد المخزون ويحفظ سعر كل سطر تاريخيًا.</span></div><button type="button" class="modal-close" data-close-purchase>×</button></div>
      <form id="purchaseForm" class="modal-form">
        <div class="form-grid">
          <label>رقم الفاتورة<input id="purchaseInvoice" required maxlength="80" placeholder="مثال: PUR-001" /></label>
          <label>المورد<select id="purchaseSupplier" required><option value="">اختر المورد</option>${supplierOptions}</select></label>
          <label>تاريخ الشراء<input id="purchaseDate" type="date" value="${today()}" required /></label>
        </div>
        <div class="panel-subhead"><div><h4>بنود الشراء</h4><span>يمكن أن تحتوي الفاتورة على أكثر من خامة.</span></div><button type="button" class="button secondary" id="addPurchaseLine">＋ إضافة بند</button></div>
        <div id="purchaseLines">${lineTemplate(data.materials, 0)}</div>
        <label>ملاحظات<textarea id="purchaseNotes" rows="2" placeholder="اختياري"></textarea></label>
        <div id="purchaseStatus" class="modal-status"></div>
        <div class="modal-actions"><button type="button" class="button secondary" data-close-purchase>إلغاء</button><button type="submit" class="button" id="purchaseSubmit">تسجيل الشراء</button></div>
      </form>
    </div>`;
    document.body.appendChild(modal);

    const close = () => modal.remove();
    modal.querySelectorAll('[data-close-purchase]').forEach((b) => b.onclick = close);
    let lineCount = 1;
    const lines = modal.querySelector('#purchaseLines');
    modal.querySelector('#addPurchaseLine').onclick = () => { lines.insertAdjacentHTML('beforeend', lineTemplate(data.materials, lineCount++)); bindRemove(); };
    function bindRemove() {
      lines.querySelectorAll('[data-remove-purchase-line]').forEach((b) => b.onclick = () => { const row = b.closest('[data-purchase-line]'); if (row && lines.querySelectorAll('[data-purchase-line]').length > 1) row.remove(); });
    }
    bindRemove();

    modal.querySelector('#purchaseForm').onsubmit = async (event) => {
      event.preventDefault();
      const submit = modal.querySelector('#purchaseSubmit');
      const status = modal.querySelector('#purchaseStatus');
      submit.disabled = true; status.className = 'modal-status'; status.textContent = 'جارٍ تسجيل الشراء…';
      try {
        const rows = [...lines.querySelectorAll('[data-purchase-line]')];
        const pLines = rows.map((row) => ({
          material_id: row.querySelector('[data-purchase-material]').value,
          color: row.querySelector('[data-purchase-color]').value.trim() || null,
          quantity: Number(row.querySelector('[data-purchase-qty]').value),
          unit_price: Number(row.querySelector('[data-purchase-price]').value),
        }));
        if (pLines.some((x) => !x.material_id || !Number.isFinite(x.quantity) || x.quantity <= 0 || !Number.isFinite(x.unit_price) || x.unit_price < 0)) throw new Error('راجع الصنف والكمية وسعر الوحدة في كل بند.');
        const { error } = await client.rpc('post_purchase', {
          p_invoice_number: modal.querySelector('#purchaseInvoice').value.trim(),
          p_supplier_id: modal.querySelector('#purchaseSupplier').value,
          p_purchase_date: modal.querySelector('#purchaseDate').value,
          p_lines: pLines,
          p_notes: modal.querySelector('#purchaseNotes').value.trim() || null,
        });
        if (error) throw error;
        status.className = 'modal-status success'; status.textContent = 'تم تسجيل الشراء وزيادة المخزون بنجاح.';
        setTimeout(() => { close(); renderRoute(true); }, 500);
      } catch (e) {
        status.className = 'modal-status error'; status.textContent = `تعذر تسجيل الشراء: ${e.message}`; submit.disabled = false;
      }
    };
  }

  if (!document.documentElement.dataset.purchaseClickDelegation) {
    document.documentElement.dataset.purchaseClickDelegation = '1';
    document.addEventListener('click', (event) => {
      const button = event.target.closest?.('.hero .button');
      if (!button || !button.textContent.includes('شراء جديد')) return;
      event.preventDefault();
      openPurchaseModal();
    });
  }
})();
