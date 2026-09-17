(() => {
  const client = window.__masna3iClient || window.supabase?.createClient?.(
    'https://favitcmfzdlvgtwicxmb.supabase.co',
    'sb_publishable_to-VILINGqpWLu7Sod8ULQ_YBGMP7MZ'
  );
  if (!client) return;
  window.__masna3iClient = client;

  const esc = (v) => String(v ?? '').replace(/[&<>'"]/g, (c) => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', "'":'&#039;', '"':'&quot;' }[c]));

  async function factoryId() {
    const { data: { user }, error: ue } = await client.auth.getUser();
    if (ue || !user) throw new Error('جلسة الدخول غير صالحة.');
    const { data, error } = await client.from('factory_memberships').select('factory_id').eq('user_id', user.id).eq('active', true).limit(1).maybeSingle();
    if (error) throw error;
    if (!data?.factory_id) throw new Error('لا يوجد مصنع مرتبط بالحساب.');
    return data.factory_id;
  }

  async function counts() {
    const [{ count: suppliers, error: se }, { count: materials, error: me }] = await Promise.all([
      client.from('suppliers').select('id', { count: 'exact', head: true }),
      client.from('materials').select('id', { count: 'exact', head: true }),
    ]);
    if (se) throw se;
    if (me) throw me;
    return { suppliers: suppliers || 0, materials: materials || 0 };
  }

  function openSetup(missing) {
    document.querySelector('.modal-backdrop.purchase-prereq-modal')?.remove();
    const modal = document.createElement('div');
    modal.className = 'modal-backdrop purchase-prereq-modal';
    modal.innerHTML = `<div class="modal-card" role="dialog" aria-modal="true">
      <div class="modal-head"><div><h3>تجهيز بيانات الشراء</h3><span>قبل تسجيل أول شراء نحتاج تعريف المورد والخامة مرة واحدة.</span></div><button type="button" class="modal-close" data-close>×</button></div>
      <div class="modal-form">
        ${missing.suppliers ? `<div class="panel"><h4>إضافة مورد</h4><label>اسم المورد<input id="quickSupplierName" maxlength="120" placeholder="مثال: مورد الأقمشة" required /></label><label>الهاتف<input id="quickSupplierPhone" maxlength="50" placeholder="اختياري" /></label><button type="button" class="button" id="saveQuickSupplier">حفظ المورد</button><div id="supplierStatus" class="modal-status"></div></div>` : ''}
        ${missing.materials ? `<div class="panel"><h4>إضافة خامة</h4><label>كود الخامة<input id="quickMaterialCode" maxlength="60" placeholder="مثال: FAB-001" required /></label><label>اسم الخامة<input id="quickMaterialName" maxlength="120" placeholder="مثال: قماش كريب أسود" required /></label><label>النوع<select id="quickMaterialKind"><option value="fabric">قماش</option><option value="accessory">إكسسوار</option></select></label><label>الوحدة<select id="quickMaterialUnit"><option value="meter">متر</option><option value="piece">قطعة</option><option value="kg">كيلو</option></select></label><label>الحد الأدنى<input id="quickMaterialMin" type="number" min="0" step="0.001" placeholder="اختياري" /></label><button type="button" class="button" id="saveQuickMaterial">حفظ الخامة</button><div id="materialStatus" class="modal-status"></div></div>` : ''}
        <div class="modal-actions"><button type="button" class="button secondary" data-close>إغلاق</button></div>
      </div>
    </div>`;
    document.body.appendChild(modal);
    modal.querySelectorAll('[data-close]').forEach((b) => b.onclick = () => modal.remove());

    const refresh = async () => {
      const c = await counts();
      if (c.suppliers && c.materials) { modal.remove(); alert('تم تجهيز بيانات الشراء. اضغط «شراء جديد» مرة أخرى.'); }
    };

    modal.querySelector('#saveQuickSupplier')?.addEventListener('click', async () => {
      const status = modal.querySelector('#supplierStatus');
      const name = modal.querySelector('#quickSupplierName').value.trim();
      if (!name) return status.textContent = 'اكتب اسم المورد أولًا.';
      status.textContent = 'جارٍ الحفظ…';
      try {
        const fid = await factoryId();
        const { error } = await client.from('suppliers').insert({ factory_id: fid, name, phone: modal.querySelector('#quickSupplierPhone').value.trim() || null });
        if (error) throw error;
        status.className = 'modal-status success'; status.textContent = 'تم حفظ المورد.';
        await refresh();
      } catch (e) { status.className = 'modal-status error'; status.textContent = `تعذر حفظ المورد: ${e.message}`; }
    });

    modal.querySelector('#saveQuickMaterial')?.addEventListener('click', async () => {
      const status = modal.querySelector('#materialStatus');
      const code = modal.querySelector('#quickMaterialCode').value.trim();
      const name = modal.querySelector('#quickMaterialName').value.trim();
      if (!code || !name) return status.textContent = 'اكتب كود واسم الخامة أولًا.';
      status.textContent = 'جارٍ الحفظ…';
      try {
        const fid = await factoryId();
        const minimum = modal.querySelector('#quickMaterialMin').value;
        const { error } = await client.from('materials').insert({ factory_id: fid, code, name, kind: modal.querySelector('#quickMaterialKind').value, unit: modal.querySelector('#quickMaterialUnit').value, minimum_stock: minimum === '' ? null : Number(minimum) });
        if (error) throw error;
        status.className = 'modal-status success'; status.textContent = 'تم حفظ الخامة.';
        await refresh();
      } catch (e) { status.className = 'modal-status error'; status.textContent = `تعذر حفظ الخامة: ${e.message}`; }
    });
  }

  async function guard(event) {
    const button = event.target.closest('.hero .button');
    if (!button || !button.textContent.includes('شراء جديد')) return;
    try {
      const c = await counts();
      if (c.suppliers && c.materials) return;
      event.preventDefault();
      event.stopImmediatePropagation();
      openSetup({ suppliers: !c.suppliers, materials: !c.materials });
    } catch (e) {
      event.preventDefault();
      event.stopImmediatePropagation();
      alert(`تعذر فحص بيانات الشراء: ${e.message}`);
    }
  }

  document.addEventListener('click', guard, true);
})();
