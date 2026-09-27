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

  function openCustomerModal() {
    if (document.getElementById('customerCreateModal')) return;
    const el = document.createElement('div');
    el.id = 'customerCreateModal';
    el.className = 'modal-backdrop';
    el.innerHTML = `<div class="modal-card" role="dialog" aria-modal="true" aria-labelledby="customerCreateTitle">
      <div class="modal-head"><div><span class="eyebrow">بيانات العملاء</span><h3 id="customerCreateTitle">إضافة عميل</h3></div><button type="button" class="modal-close" data-close-customer>×</button></div>
      <form id="customerCreateForm" class="modal-form">
        <div class="form-grid">
          <label>كود العميل*<input name="code" required maxlength="80" placeholder="C-001" /></label>
          <label>اسم العميل*<input name="name" required maxlength="160" placeholder="اسم العميل" /></label>
        </div>
        <div class="form-grid">
          <label>الهاتف<input name="phone" maxlength="50" placeholder="01xxxxxxxxx" /></label>
          <label>العنوان<input name="address" maxlength="240" placeholder="العنوان" /></label>
        </div>
        <label>ملاحظات<textarea name="notes" rows="3" placeholder="ملاحظات اختيارية"></textarea></label>
        <div id="customerCreateStatus" class="modal-status"></div>
        <div class="modal-actions"><button type="button" class="button secondary" data-close-customer>إلغاء</button><button type="submit" class="button">حفظ العميل</button></div>
      </form>
    </div>`;
    document.body.appendChild(el);
    const close = () => el.remove();
    el.querySelectorAll('[data-close-customer]').forEach((b) => b.onclick = close);
    el.addEventListener('click', (e) => { if (e.target === el) close(); });

    el.querySelector('#customerCreateForm').addEventListener('submit', async (e) => {
      e.preventDefault();
      const form = e.currentTarget;
      const status = el.querySelector('#customerCreateStatus');
      const submit = form.querySelector('button[type="submit"]');
      submit.disabled = true;
      status.className = 'modal-status info';
      status.textContent = 'جارٍ حفظ العميل…';
      try {
        const c = getClient();
        if (!c) throw new Error('جلسة النظام غير جاهزة.');
        const fid = await factoryId(c);
        const fd = new FormData(form);
        const payload = {
          factory_id: fid,
          code: String(fd.get('code') || '').trim(),
          name: String(fd.get('name') || '').trim(),
          phone: String(fd.get('phone') || '').trim() || null,
          address: String(fd.get('address') || '').trim() || null,
          notes: String(fd.get('notes') || '').trim() || null,
        };
        const { error } = await c.from('customers').insert(payload);
        if (error) throw error;
        status.className = 'modal-status success';
        status.textContent = 'تم حفظ العميل بنجاح.';
        setTimeout(() => { close(); location.hash = 'accounts'; location.reload(); }, 400);
      } catch (err) {
        status.className = 'modal-status error';
        status.textContent = `تعذر حفظ العميل: ${err.message}`;
        submit.disabled = false;
      }
    });
  }

  document.addEventListener('click', (event) => {
    const button = event.target.closest('[data-add-customer]');
    if (!button) return;
    event.preventDefault();
    openCustomerModal();
  }, true);

  window.__openCustomerModal = openCustomerModal;

  async function customersView() {
    const [customers, balances] = await Promise.all([
      fetchOne('customers', 'id,code,name,phone,address'),
      fetchOne('v_customer_account_balances', 'customer_id,amount_due,customer_credit'),
    ]);
    const balanceMap = new Map(balances.map((b) => [b.customer_id, b]));
    const rows = customers.map(c => {
      const b = balanceMap.get(c.id) || {};
      const due = Number(b.amount_due || 0);
      const credit = Number(b.customer_credit || 0);
      return `<tr>
        <td><b>${escapeHtml(c.code || '—')}</b></td>
        <td><b>${escapeHtml(c.name)}</b></td>
        <td>${escapeHtml(c.phone || '—')}</td>
        <td>${money(due)}</td>
        <td>${money(credit)}</td>
        <td>
          <button class="table-button" data-account-statement="${escapeHtml(c.id)}" data-account-type="customer">فتح الحساب</button>
          ${due > 0 ? `<button class="table-button" data-collect-customer="${escapeHtml(c.id)}">تحصيل</button>` : ''}
        </td>
      </tr>`;
    });
    document.getElementById('view').innerHTML = `<div class="hero"><div><h2>العملاء</h2><p>حساب كل عميل يجمع فواتيره وتحصيلاته ومرتجعاته في مكان واحد.</p></div><button class="button" data-add-customer>＋ إضافة عميل</button></div><div class="panel">${table(['الكود','اسم العميل','الهاتف','المطلوب','لصالح العميل','الحساب'], rows, 'لا يوجد عملاء مسجلون حتى الآن.')}</div>`;
    bindInnerNav();
  }
  window.customersView = customersView;
})();
