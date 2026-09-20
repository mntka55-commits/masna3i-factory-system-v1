(() => {
  const client = window.__masna3iClient || window.supabase?.createClient?.(
    'https://favitcmfzdlvgtwicxmb.supabase.co',
    'sb_publishable_to-VILINGqpWLu7Sod8ULQ_YBGMP7MZ'
  );
  if (!client) return;
  window.__masna3iClient = client;

  const today = () => new Date().toISOString().slice(0, 10);
  const esc = (v) => String(v ?? '').replace(/[&<>'"]/g, (c) => ({ '&':'&#38;', '<':'&#60;', '>':'&#62;', "'":'&#039;', '"':'&#34;' }[c]));
  const money = (v) => new Intl.NumberFormat('en-US', { maximumFractionDigits: 2 }).format(Number(v || 0)) + ' ج';
  const qty = (v) => new Intl.NumberFormat('en-US', { maximumFractionDigits: 3 }).format(Number(v || 0));

  async function loadContext() {
    const results = await Promise.all([
      client.from('suppliers').select('id,name').order('name'),
      client.from('purchase_invoices').select('id,supplier_id,invoice_number,purchase_date').order('purchase_date', { ascending: false }),
      client.from('purchase_lines').select('id,purchase_invoice_id,material_id,quantity,unit_price').order('created_at'),
      client.from('materials').select('id,code,name,unit'),
      client.from('inventory_layers').select('source_purchase_line_id,remaining_quantity'),
      client.from('supplier_return_lines').select('purchase_line_id,quantity'),
      client.from('v_supplier_returns_report').select('id,return_number,supplier_id,supplier_name,return_date,approved_total,line_count,notes').order('return_date', { ascending: false }).limit(20)
    ]);
    results.forEach((r) => { if (r.error) throw r.error; });

    const suppliers = results[0].data || [];
    const invoices = results[1].data || [];
    const lines = results[2].data || [];
    const materials = results[3].data || [];
    const layers = results[4].data || [];
    const returnLines = results[5].data || [];
    const recentReturns = results[6].data || [];

    const invoiceMap = new Map(invoices.map((x) => [x.id, x]));
    const materialMap = new Map(materials.map((x) => [x.id, x]));
    const availableMap = new Map();
    const returnedMap = new Map();

    layers.forEach((x) => {
      availableMap.set(
        x.source_purchase_line_id,
        (availableMap.get(x.source_purchase_line_id) || 0) + Number(x.remaining_quantity || 0)
      );
    });

    returnLines.forEach((x) => {
      returnedMap.set(
        x.purchase_line_id,
        (returnedMap.get(x.purchase_line_id) || 0) + Number(x.quantity || 0)
      );
    });

    const eligibleLines = lines.map((line) => {
      const invoice = invoiceMap.get(line.purchase_invoice_id);
      const material = materialMap.get(line.material_id);
      const availableInventory = Number(availableMap.get(line.id) || 0);
      const returnedQty = Number(returnedMap.get(line.id) || 0);
      const unreturned = Math.max(0, Number(line.quantity || 0) - returnedQty);
      return {
        id: line.id,
        supplier_id: invoice?.supplier_id || null,
        invoice_number: invoice?.invoice_number || '—',
        purchase_date: invoice?.purchase_date || '',
        material_code: material?.code || '—',
        material_name: material?.name || '—',
        unit: material?.unit || 'وحدة',
        quantity: Number(line.quantity || 0),
        unit_price: Number(line.unit_price || 0),
        returned_qty: returnedQty,
        available: Math.min(availableInventory, unreturned)
      };
    }).filter((x) => x.supplier_id && x.available > 0);

    return { suppliers, eligibleLines, recentReturns };
  }

  function lineRow(line) {
    return [
      '<div class="allocation-row supplier-return-row" data-return-line="' + esc(line.id) + '" data-max="' + line.available + '">',
      '<label style="display:flex;align-items:center;gap:8px;min-width:0">',
      '<input type="checkbox" data-return-check>',
      '<span><b>' + esc(line.material_code) + ' — ' + esc(line.material_name) + '</b><small>فاتورة ' + esc(line.invoice_number) + ' • ' + esc(line.purchase_date) + '</small></span>',
      '</label>',
      '<span><b>متاح ' + qty(line.available) + '</b><small>المشتري ' + qty(line.quantity) + ' • مرتجع سابق ' + qty(line.returned_qty) + '</small></span>',
      '<label class="mini-field">الكمية<input data-return-qty type="number" min="0" max="' + line.available + '" step="0.001" value="0" disabled></label>',
      '<label class="mini-field">سعر الفاتورة<input data-original-price type="number" value="' + line.unit_price + '" disabled readonly></label>',
      '<label class="mini-field">السعر المعتمد<input data-return-price type="number" min="0" step="0.01" value="' + line.unit_price + '" disabled></label>',
      '</div>'
    ].join('');
  }

  async function openModal() {
    const old = document.getElementById('supplierReturnModal');
    if (old) old.remove();

    let data;
    try {
      data = await loadContext();
    } catch (e) {
      alert('تعذر تحميل بيانات مرتجع المورد: ' + e.message);
      return;
    }

    if (!data.suppliers.length) {
      alert('لا يوجد موردون مسجلون.');
      return;
    }

    const supplierOptions = data.suppliers.map((s) => '<option value="' + esc(s.id) + '">' + esc(s.name) + '</option>').join('');
    const modal = document.createElement('div');
    modal.className = 'modal-backdrop';
    modal.id = 'supplierReturnModal';
    modal.innerHTML = [
      '<div class="modal-card" role="dialog" aria-modal="true" style="max-width:1180px">',
      '<div class="modal-head"><div><span class="eyebrow">المشتريات</span><h3>مرتجع شراء</h3><span>الافتراضي هو سعر فاتورة الشراء، ويمكن للمالك تعديل السعر المعتمد.</span></div><button type="button" class="modal-close" id="closeSupplierReturn">×</button></div>',
      '<form id="supplierReturnForm" class="modal-form">',
      '<div class="form-grid">',
      '<label>رقم المرتجع<input id="supplierReturnNumber" required maxlength="80" value="SRET-' + Date.now() + '"></label>',
      '<label>المورد<select id="supplierReturnSupplier" required><option value="">اختر المورد</option>' + supplierOptions + '</select></label>',
      '<label>تاريخ المرتجع<input id="supplierReturnDate" type="date" value="' + today() + '" required></label>',
      '</div>',
      '<div class="panel-subhead"><div><h4>بنود يمكن إرجاعها</h4><span>يعرض فقط ما زال موجودًا من نفس سطر فاتورة الشراء.</span></div><strong id="supplierReturnTotal">0 ج</strong></div>',
      '<div id="supplierReturnLines" class="stack-form"><div class="allocation-empty">اختر المورد لعرض البنود.</div></div>',
      '<label>ملاحظات<textarea id="supplierReturnNotes" rows="2" maxlength="300" placeholder="اختياري"></textarea></label>',
      '<div id="supplierReturnStatus" class="global-status"></div>',
      '<div class="modal-actions"><button type="button" class="button secondary" id="cancelSupplierReturn">إلغاء</button><button type="submit" class="button" id="saveSupplierReturn">تسجيل المرتجع</button></div>',
      '</form></div>'
    ].join('');

    document.body.appendChild(modal);

    const close = () => modal.remove();
    document.getElementById('closeSupplierReturn').onclick = close;
    document.getElementById('cancelSupplierReturn').onclick = close;
    modal.addEventListener('click', (e) => { if (e.target === modal) close(); });

    const supplier = document.getElementById('supplierReturnSupplier');
    const linesBox = document.getElementById('supplierReturnLines');
    const totalNode = document.getElementById('supplierReturnTotal');

    const updateTotal = () => {
      const total = Array.from(linesBox.querySelectorAll('[data-return-line]')).reduce((sum, row) => {
        if (!row.querySelector('[data-return-check]')?.checked) return sum;
        const q = Number(row.querySelector('[data-return-qty]')?.value || 0);
        const p = Number(row.querySelector('[data-return-price]')?.value || 0);
        return sum + (q * p);
      }, 0);
      totalNode.textContent = money(total);
    };

    const renderLines = () => {
      const rows = data.eligibleLines.filter((x) => x.supplier_id === supplier.value);
      linesBox.innerHTML = rows.length
        ? rows.map(lineRow).join('')
        : '<div class="allocation-empty">لا توجد كمية متاحة للإرجاع لهذا المورد حاليًا.</div>';

      linesBox.querySelectorAll('[data-return-check]').forEach((check) => {
        check.addEventListener('change', () => {
          const row = check.closest('[data-return-line]');
          const q = row.querySelector('[data-return-qty]');
          const p = row.querySelector('[data-return-price]');
          q.disabled = !check.checked;
          p.disabled = !check.checked;
          q.value = check.checked ? row.dataset.max : '0';
          updateTotal();
        });
      });

      linesBox.querySelectorAll('[data-return-qty],[data-return-price]').forEach((input) => input.addEventListener('input', updateTotal));
      updateTotal();
    };

    supplier.addEventListener('change', renderLines);

    document.getElementById('supplierReturnForm').onsubmit = async (e) => {
      e.preventDefault();
      const status = document.getElementById('supplierReturnStatus');
      const save = document.getElementById('saveSupplierReturn');

      const selected = Array.from(linesBox.querySelectorAll('[data-return-line]')).map((row) => ({
        row,
        checked: row.querySelector('[data-return-check]')?.checked,
        purchase_line_id: row.dataset.returnLine,
        quantity: Number(row.querySelector('[data-return-qty]')?.value || 0),
        approved_unit_price: Number(row.querySelector('[data-return-price]')?.value || 0),
        max: Number(row.dataset.max || 0)
      })).filter((x) => x.checked);

      if (!selected.length) {
        status.textContent = 'اختر بندًا واحدًا على الأقل.';
        return;
      }
      if (selected.some((x) => !Number.isFinite(x.quantity) || x.quantity <= 0 || x.quantity > x.max)) {
        status.textContent = 'راجع كميات المرتجع مقابل الكمية المتاحة.';
        return;
      }
      if (selected.some((x) => !Number.isFinite(x.approved_unit_price) || x.approved_unit_price < 0)) {
        status.textContent = 'راجع الأسعار المعتمدة.';
        return;
      }

      save.disabled = true;
      save.textContent = 'جارٍ التسجيل…';
      status.textContent = 'يتم تسجيل المرتجع وحركة المخزون ورصيد المورد معًا…';

      try {
        const { error } = await client.rpc('post_supplier_return', {
          p_return_number: document.getElementById('supplierReturnNumber').value.trim(),
          p_supplier_id: supplier.value,
          p_return_date: document.getElementById('supplierReturnDate').value,
          p_lines: selected.map((x) => ({
            purchase_line_id: x.purchase_line_id,
            quantity: x.quantity,
            approved_unit_price: x.approved_unit_price
          })),
          p_notes: document.getElementById('supplierReturnNotes').value.trim() || null
        });

        if (error) throw error;
        close();
        if (typeof setStatus === 'function') setStatus('تم تسجيل مرتجع المورد وتحديث المخزون ورصيد المورد.', 'info');
        if (typeof renderRoute === 'function') await renderRoute(true);
      } catch (err) {
        status.textContent = 'تعذر تسجيل المرتجع: ' + err.message;
        save.disabled = false;
        save.textContent = 'تسجيل المرتجع';
      }
    };
  }

  async function renderPanel() {
    const panel = document.getElementById('supplierReturnsPanel');
    if (!panel) return;

    try {
      const { data, error } = await client
        .from('v_supplier_returns_report')
        .select('id,return_number,supplier_name,return_date,approved_total,line_count,notes')
        .order('return_date', { ascending: false })
        .limit(20);

      if (error) throw error;

      const rows = (data || []).map((r) => [
        '<tr><td><b>' + esc(r.return_number) + '</b></td>',
        '<td>' + esc(r.return_date || '') + '</td>',
        '<td>' + esc(r.supplier_name || '') + '</td>',
        '<td>' + qty(r.line_count) + '</td>',
        '<td>' + money(r.approved_total) + '</td></tr>'
      ].join(''));

      panel.innerHTML = '<div class="panel-head"><div><h3>مرتجعات الموردين</h3><span>القيمة المعتمدة تخص رصيد المورد، وحركة المخزون مرتبطة بنفس المرتجع.</span></div></div>' +
        (typeof table === 'function'
          ? table(['المرتجع','التاريخ','المورد','البنود','القيمة'], rows, 'لا توجد مرتجعات مورد مسجلة حتى الآن.')
          : '<div class="empty-state">لا توجد مرتجعات مورد مسجلة حتى الآن.</div>');
    } catch (e) {
      panel.innerHTML = '<div class="empty-state"><b>تعذر تحميل مرتجعات الموردين</b><span>' + esc(e.message) + '</span></div>';
    }
  }

  window.__masna3iOpenSupplierReturnModal = openModal;
  window.__masna3iRenderSupplierReturnsPanel = renderPanel;

  if (!document.documentElement.dataset.supplierReturnClickDelegation) {
    document.documentElement.dataset.supplierReturnClickDelegation = '1';
    document.addEventListener('click', (event) => {
      const button = event.target.closest?.('[data-open-supplier-return]');
      if (!button) return;
      event.preventDefault();
      openModal();
    });
  }
})();