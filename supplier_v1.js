(() => {
  const URL = 'https://favitcmfzdlvgtwicxmb.supabase.co';
  const KEY = 'sb_publishable_to-VILINGqpWLu7Sod8ULQ_YBGMP7MZ';

  function getClient() {
    if (window.__masna3iClient) return window.__masna3iClient;
    const createClient = window.supabase?.createClient;
    if (!createClient) return null;
    window.__masna3iClient = createClient(URL, KEY);
    return window.__masna3iClient;
  }

  async function factoryId(c) {
    const { data: sessionData, error: sessionError } = await c.auth.getSession();
    if (sessionError) throw sessionError;
    const user = sessionData?.session?.user;
    if (!user) throw new Error('انتهت الجلسة، سجل الدخول مرة أخرى.');
    const { data, error } = await c.from('factory_memberships')
      .select('factory_id')
      .eq('user_id', user.id)
      .eq('active', true)
      .limit(1);
    if (error) throw error;
    if (!data?.[0]?.factory_id) throw new Error('لا يوجد مصنع مرتبط بالحساب.');
    return data[0].factory_id;
  }

  function openSupplierModal() {
    if (document.getElementById('supplierCreateModal')) return;
    const el = document.createElement('div');
    el.id = 'supplierCreateModal';
    el.className = 'modal-backdrop';
    el.innerHTML = `<div class="modal-card" role="dialog" aria-modal="true" aria-labelledby="supplierCreateTitle">
      <div class="modal-head"><div><span class="eyebrow">بيانات الموردين</span><h3 id="supplierCreateTitle">إضافة مورد</h3></div><button type="button" class="modal-close" data-close-supplier>×</button></div>
      <form id="supplierCreateForm" class="modal-form">
        <label>اسم المورد*<input name="name" required maxlength="160" placeholder="اسم المورد" /></label>
        <label>الهاتف<input name="phone" maxlength="50" placeholder="01xxxxxxxxx" /></label>
        <label>ملاحظات<textarea name="notes" rows="3" placeholder="ملاحظات اختيارية"></textarea></label>
        <div id="supplierCreateStatus" class="modal-status"></div>
        <div class="modal-actions"><button type="button" class="button secondary" data-close-supplier>إلغاء</button><button type="submit" class="button">حفظ المورد</button></div>
      </form>
    </div>`;
    document.body.appendChild(el);
    const close = () => el.remove();
    el.querySelectorAll('[data-close-supplier]').forEach((b) => b.onclick = close);
    el.addEventListener('click', (e) => { if (e.target === el) close(); });

    el.querySelector('#supplierCreateForm').addEventListener('submit', async (e) => {
      e.preventDefault();
      const form = e.currentTarget;
      const status = el.querySelector('#supplierCreateStatus');
      const submit = form.querySelector('button[type="submit"]');
      submit.disabled = true;
      status.className = 'modal-status info';
      status.textContent = 'جارٍ حفظ المورد…';
      try {
        const c = getClient();
        if (!c) throw new Error('جلسة النظام غير جاهزة.');
        const fid = await factoryId(c);
        const fd = new FormData(form);
        const payload = {
          factory_id: fid,
          name: String(fd.get('name') || '').trim(),
          phone: String(fd.get('phone') || '').trim() || null,
          notes: String(fd.get('notes') || '').trim() || null,
        };
        const { error } = await c.from('suppliers').insert(payload);
        if (error) throw error;
        status.className = 'modal-status success';
        status.textContent = 'تم حفظ المورد بنجاح.';
        setTimeout(() => { close(); location.hash = 'accounts'; location.reload(); }, 400);
      } catch (err) {
        status.className = 'modal-status error';
        status.textContent = `تعذر حفظ المورد: ${err.message}`;
        submit.disabled = false;
      }
    });
  }

  document.addEventListener('click', (event) => {
    const button = event.target.closest('[data-add-supplier]');
    if (!button) return;
    event.preventDefault();
    openSupplierModal();
  }, true);

  window.__openSupplierModal = openSupplierModal;
})();