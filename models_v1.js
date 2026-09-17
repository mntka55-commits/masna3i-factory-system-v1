(() => {
  const appRoot = document.getElementById('app');
  if (!appRoot) return;

  const esc = (v) => String(v ?? '').replace(/[&<>\"']/g, (c) => ({'&':'&amp;','<':'&lt;','>':'&gt;','\"':'&quot;',"'":'&#039;'}[c]));
  const supabaseClient = () => window.supabase?.createClient ? null : null;

  function client() {
    return window.__masna3iClient || null;
  }

  async function createModel(payload) {
    const c = client();
    if (!c) throw new Error('جلسة النظام غير جاهزة.');
    const { data: sessionData, error: sessionError } = await c.auth.getSession();
    if (sessionError) throw sessionError;
    const user = sessionData?.session?.user;
    if (!user) throw new Error('انتهت الجلسة، سجل الدخول مرة أخرى.');
    const { data: memberships, error: memberError } = await c.from('factory_memberships').select('factory_id').eq('user_id', user.id).eq('active', true).limit(1);
    if (memberError) throw memberError;
    const factoryId = memberships?.[0]?.factory_id;
    if (!factoryId) throw new Error('لا يوجد مصنع مرتبط بالحساب.');
    const { data, error } = await c.from('models').insert({
      factory_id: factoryId,
      code: payload.code,
      name: payload.name,
      selling_price: payload.selling_price === '' ? null : Number(payload.selling_price),
      sizes: payload.sizes,
      colors: payload.colors,
      notes: payload.notes || null,
    }).select('id').single();
    if (error) throw error;
    return data;
  }

  function ensureClient() {
    if (window.__masna3iClient) return window.__masna3iClient;
    const existing = window.supabase?.createClient;
    if (!existing) return null;
    const url = 'https://favitcmfzdlvgtwicxmb.supabase.co';
    const key = 'sb_publishable_to-VILINGqpWLu7Sod8ULQ_YBGMP7MZ';
    window.__masna3iClient = existing(url, key);
    return window.__masna3iClient;
  }

  function modal() {
    if (document.getElementById('modelCreateModal')) return;
    const el = document.createElement('div');
    el.id = 'modelCreateModal';
    el.className = 'modal-backdrop';
    el.innerHTML = `<div class="modal-card" role="dialog" aria-modal="true" aria-labelledby="modelCreateTitle">
      <div class="modal-head"><div><span class="eyebrow">بيانات أساسية</span><h3 id="modelCreateTitle">إضافة موديل</h3></div><button type="button" class="modal-close" data-close-model>×</button></div>
      <form id="modelCreateForm" class="modal-form">
        <div class="form-grid"><label>كود الموديل*<input name="code" required maxlength="80" placeholder="A-104" /></label><label>اسم الموديل*<input name="name" required maxlength="160" placeholder="اسم الموديل" /></label></div>
        <div class="form-grid"><label>سعر البيع للقطعة<input name="selling_price" type="number" min="0" step="0.01" placeholder="0" /></label><label>المقاسات<input name="sizes" placeholder="S, M, L, XL" /></label></div>
        <label>الألوان<input name="colors" placeholder="أسود, أبيض" /></label>
        <label>ملاحظات<textarea name="notes" rows="3" placeholder="ملاحظات اختيارية"></textarea></label>
        <div id="modelCreateStatus" class="modal-status"></div>
        <div class="modal-actions"><button type="button" class="button secondary" data-close-model>إلغاء</button><button type="submit" class="button">حفظ الموديل</button></div>
      </form>
    </div>`;
    document.body.appendChild(el);
    el.addEventListener('click', (e) => { if (e.target === el || e.target.closest('[data-close-model]')) el.remove(); });
    el.querySelector('#modelCreateForm').addEventListener('submit', async (e) => {
      e.preventDefault();
      const form = e.currentTarget;
      const status = el.querySelector('#modelCreateStatus');
      const submit = form.querySelector('button[type="submit"]');
      submit.disabled = true;
      status.textContent = 'جارٍ حفظ الموديل…';
      status.className = 'modal-status info';
      try {
        const fd = new FormData(form);
        const split = (key) => String(fd.get(key) || '').split(',').map((x) => x.trim()).filter(Boolean);
        await createModel({ code: String(fd.get('code')).trim(), name: String(fd.get('name')).trim(), selling_price: String(fd.get('selling_price') || '').trim(), sizes: split('sizes'), colors: split('colors'), notes: String(fd.get('notes') || '').trim() });
        status.textContent = 'تم حفظ الموديل بنجاح.';
        status.className = 'modal-status success';
        setTimeout(() => { el.remove(); location.hash = 'models'; location.reload(); }, 350);
      } catch (err) {
        status.textContent = `تعذر الحفظ: ${err.message}`;
        status.className = 'modal-status error';
        submit.disabled = false;
      }
    });
  }

  function enhanceModels() {
    if (location.hash.replace('#','') !== 'models') return;
    const view = document.getElementById('view');
    if (!view || view.dataset.modelsV1 === '1') return;
    const add = [...view.querySelectorAll('.hero .button')].find((b) => b.textContent.includes('إضافة موديل'));
    if (!add) return;
    add.dataset.modelCreateBound = '1';
    add.addEventListener('click', (e) => { e.preventDefault(); ensureClient(); modal(); });
    view.dataset.modelsV1 = '1';
  }

  const observer = new MutationObserver(enhanceModels);
  observer.observe(appRoot, { childList: true, subtree: true });
  enhanceModels();
})();
