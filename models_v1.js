(() => {
  const appRoot = document.getElementById('app');
  if (!appRoot) return;

  function client() {
    return window.__masna3iClient || null;
  }


  async function modelsView() {
    const [models, wip, ready, costs] = await Promise.all([
      fetchOne('models', 'id,code,name'),
      fetchOne('v_wip_balances', 'model_id,wip_pieces'),
      fetchOne('v_ready_balances', 'model_id,ready_pieces'),
      fetchOne('v_model_current_costs', 'model_id,current_cost_per_piece,fabric_cost_per_piece,variable_cost_per_piece,cutting_operation_id'),
    ]);
  
    const wipByModel = new Map(wip.map((row) => [row.model_id, Number(row.wip_pieces || 0)]));
    const readyByModel = new Map(ready.map((row) => [row.model_id, Number(row.ready_pieces || 0)]));
    const costByModel = new Map(costs.map((row) => [row.model_id, row]));
    const viewNode = document.getElementById('view');
    const filterState = { query: '', filter: 'all' };
  
    const rowForModel = (m) => {
      const c = costByModel.get(m.id);
      const w = wipByModel.get(m.id) || 0;
      const r = readyByModel.get(m.id) || 0;
      return `<tr>
        <td><b>${escapeHtml(m.code)}</b></td>
        <td>${escapeHtml(m.name)}</td>
        <td>${qty(w)}</td>
        <td>${qty(r)}</td>
        <td>${c ? money(c.current_cost_per_piece) : '—'}</td>
        <td>${c ? 'آخر قصة مكتملة' : 'لم تُقص بعد'}</td>
        <td><button class="table-button" data-model="${m.id}">التفاصيل</button></td>
      </tr>`;
    };
  
    const renderModelRows = () => {
      const query = filterState.query.trim().toLocaleLowerCase('ar');
      const filtered = models.filter((m) => {
        const w = wipByModel.get(m.id) || 0;
        const r = readyByModel.get(m.id) || 0;
        const haystack = `${m.code || ''} ${m.name || ''}`.toLocaleLowerCase('ar');
        const matchesQuery = !query || haystack.includes(query);
        const matchesFilter =
          filterState.filter === 'all' ||
          (filterState.filter === 'wip' && w > 0) ||
          (filterState.filter === 'ready' && r > 0);
        return matchesQuery && matchesFilter;
      });
  
      const body = document.getElementById('modelsTableBody');
      if (!body) return;
      body.innerHTML = filtered.length
        ? filtered.map(rowForModel).join('')
        : `<tr><td colspan="7"><div class="empty-state compact"><b>لا توجد نتائج مطابقة</b><span>غيّر كلمة البحث أو حالة العرض.</span></div></td></tr>`;
  
      viewNode.querySelectorAll('[data-model-filter]').forEach((button) => {
        const active = button.dataset.modelFilter === filterState.filter;
        button.classList.toggle('active', active);
        button.setAttribute('aria-pressed', active ? 'true' : 'false');
      });
    };
  
    viewNode.innerHTML = `
      <div class="hero"><div><h2>الموديلات</h2><p>تعريف ومتابعة تكلفة وإنتاج كل موديل.</p></div><button class="button">＋ إضافة موديل</button></div>
      <div class="toolbar">
        <input id="modelSearch" aria-label="البحث في الموديلات" placeholder="⌕ ابحث باسم الموديل أو الكود" autocomplete="off" />
        <div class="filter-chips" role="group" aria-label="تصفية الموديلات">
          <button type="button" class="chip active" data-model-filter="all" aria-pressed="true">الكل</button>
          <button type="button" class="chip" data-model-filter="wip" aria-pressed="false">قيد الإنتاج</button>
          <button type="button" class="chip" data-model-filter="ready" aria-pressed="false">جاهز</button>
        </div>
      </div>
      <div class="panel">
        <div class="table-wrap">
          <table>
            <thead><tr><th>الكود</th><th>الموديل</th><th>WIP</th><th>READY</th><th>تكلفة القطعة الحالية</th><th>المصدر</th><th>الإجراء</th></tr></thead>
            <tbody id="modelsTableBody"></tbody>
          </table>
        </div>
      </div>`;
  
    renderModelRows();
  
    viewNode.querySelector('#modelSearch')?.addEventListener('input', (event) => {
      filterState.query = event.currentTarget.value || '';
      renderModelRows();
    });
  
    viewNode.querySelectorAll('[data-model-filter]').forEach((button) => {
      button.addEventListener('click', () => {
        filterState.filter = button.dataset.modelFilter || 'all';
        renderModelRows();
      });
    });
  
    viewNode.addEventListener('click', (event) => {
      const button = event.target.closest('[data-model]');
      if (!button) return;
      state.modelId = button.dataset.model;
      location.hash = 'model-detail';
    });
  }
  async function createModel(payload) {
    const c = client();
    if (!c) throw new Error('جلسة النظام غير جاهزة.');
    const { data: sessionData, error: sessionError } = await c.auth.getSession();
    if (sessionError) throw sessionError;
    const user = sessionData?.session?.user;
    if (!user) throw new Error('انتهت الجلسة، سجل الدخول مرة أخرى.');

    const { data: memberships, error: memberError } = await c
      .from('factory_memberships')
      .select('factory_id')
      .eq('user_id', user.id)
      .eq('active', true)
      .limit(1);
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
    const createClient = window.supabase?.createClient;
    if (!createClient) return null;
    window.__masna3iClient = createClient(
      'https://favitcmfzdlvgtwicxmb.supabase.co',
      'sb_publishable_to-VILINGqpWLu7Sod8ULQ_YBGMP7MZ',
    );
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
    el.addEventListener('click', (e) => {
      if (e.target === el || e.target.closest('[data-close-model]')) el.remove();
    });

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
        await createModel({
          code: String(fd.get('code') || '').trim(),
          name: String(fd.get('name') || '').trim(),
          selling_price: String(fd.get('selling_price') || '').trim(),
          sizes: split('sizes'),
          colors: split('colors'),
          notes: String(fd.get('notes') || '').trim(),
        });
        status.textContent = 'تم حفظ الموديل بنجاح.';
        status.className = 'modal-status success';
        setTimeout(() => {
          el.remove();
          location.hash = 'models';
          clearReadCache(); renderRoute(true);
        }, 350);
      } catch (err) {
        status.textContent = `تعذر الحفظ: ${err.message}`;
        status.className = 'modal-status error';
        submit.disabled = false;
      }
    });
  }

  window.modelsView = modelsView;

  // Event delegation keeps the action independent of render timing.
  document.addEventListener('click', (event) => {
    const addButton = event.target.closest('.hero .button');
    if (!addButton || !addButton.textContent.includes('إضافة موديل')) return;
    event.preventDefault();
    const c = ensureClient();
    if (!c) return;
    modal();
  }, true);
})();
