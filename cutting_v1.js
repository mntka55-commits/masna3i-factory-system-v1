(() => {
  const appRoot = document.getElementById('app');
  if (!appRoot) return;

  const today = () => new Date().toISOString().slice(0, 10);

  function rowTemplate(fabric, rowIndex) {
    const options = fabric.map((m) => `<option value="${m.material_id}">${escapeHtml(m.code)} — ${escapeHtml(m.name)} (متاح ${qty(m.current_quantity)} ${escapeHtml(m.unit)})</option>`).join('');
    return `<div class="cut-input-row" data-cut-row="${rowIndex}">
      <label>القماش
        <select data-cut-material required>
          <option value="">اختر القماش</option>${options}
        </select>
      </label>
      <label>الكمية الفعلية
        <input data-cut-quantity type="number" min="0.001" step="0.001" required placeholder="مثال: 150" />
      </label>
      <button type="button" class="button secondary cut-remove" data-remove-cut-row title="حذف الخامة" ${rowIndex === 0 ? 'disabled' : ''}>حذف</button>
    </div>`;
  }

  async function cuttingView() {
    const [models, inventory] = await Promise.all([
      fetchOne('models', 'id,code,name'),
      fetchOne('v_inventory_balances', 'material_id,name,code,unit,current_quantity,kind'),
    ]);

    const fabric = inventory.filter((x) => x.kind === 'fabric');
    const modelOptions = models.map((m) => `<option value="${m.id}">${escapeHtml(m.code)} — ${escapeHtml(m.name)}</option>`).join('');

    document.getElementById('view').innerHTML = `
      <div class="hero">
        <div><h2>القص والإنتاج</h2><p>تسجيل قصة قص فعلية واحدة: موديل واحد + أقمشة فعلية + قطع فعلية، ثم دخول WIP تلقائيًا.</p></div>
      </div>
      <div class="steps">
        <span class="done">1 اختيار الموديل</span>
        <span class="done">2 الأقمشة الفعلية</span>
        <span class="done">3 القطع الفعلية</span>
        <span class="done">4 دخول WIP</span>
      </div>
      <form id="cuttingForm" class="two-col">
        <div class="panel form-panel">
          <h3>تسجيل قصة قص</h3>
          <div class="rule-box">القصة تخص موديلًا واحدًا، ويمكن أن تستخدم أكثر من خامة. يتم تسجيل الأمتار الفعلية والقطع الفعلية في حركة واحدة ذرية.</div>

          <label>تاريخ القص
            <input id="cutDate" type="date" value="${today()}" required />
          </label>

          <label>الموديل
            <select id="cutModel" required>
              <option value="">اختر الموديل</option>${modelOptions}
            </select>
          </label>

          <div class="panel-subhead"><div><h4>الأقمشة الفعلية</h4><span>تُخصم من المخزن عند نجاح التسجيل فقط</span></div><button type="button" class="button secondary" id="addCutFabric">＋ إضافة قماش</button></div>
          <div id="cutInputs">${fabric.length ? rowTemplate(fabric, 0) : '<div class="empty-state compact"><b>لا توجد أقمشة في المخزن</b><span>سجل شراء قماش أولًا قبل تنفيذ قصة قص.</span></div>'}</div>

          <label>عدد القطع الفعلية
            <input id="cutPieces" type="number" min="1" step="1" required placeholder="مثال: 200" />
          </label>

          <label>ملاحظات
            <textarea id="cutNotes" rows="3" placeholder="ملاحظات اختيارية عن القصة"></textarea>
          </label>

          <div id="cutStatus" class="modal-status"></div>
          <div class="modal-actions"><button type="submit" class="button" id="cutSubmit" ${fabric.length ? '' : 'disabled'}>تسجيل قصة القص</button></div>
        </div>

        <div class="panel note-panel">
          <h3>القواعد المثبتة</h3>
          <p>• القصة تخص موديلًا واحدًا.</p>
          <p>• يمكن استخدام أكثر من خامة في نفس القصة.</p>
          <p>• كل كمية قماش تُسجل ككمية فعلية، وليست متوقعة.</p>
          <p>• عدد القطع يُسجل فعليًا في نفس العملية.</p>
          <p>• عند النجاح، يتم خصم الأقمشة من طبقات المخزون وفق منطق FIFO ثم إنشاء WIP بعدد القطع الفعلية.</p>
          <p>• عند عدم كفاية أي خامة، العملية كلها تُرفض دون خصم جزئي.</p>
        </div>
      </form>`;

    const form = document.getElementById('cuttingForm');
    const inputs = document.getElementById('cutInputs');
    const add = document.getElementById('addCutFabric');
    const submit = document.getElementById('cutSubmit');
    const status = document.getElementById('cutStatus');

    let rowCount = 1;

    function bindRows() {
      inputs.querySelectorAll('[data-remove-cut-row]').forEach((button) => {
        button.onclick = () => {
          const row = button.closest('[data-cut-row]');
          if (!row || inputs.querySelectorAll('[data-cut-row]').length <= 1) return;
          row.remove();
        };
      });
    }

    add.onclick = () => {
      if (!fabric.length) return;
      inputs.insertAdjacentHTML('beforeend', rowTemplate(fabric, rowCount++));
      bindRows();
    };

    bindRows();

    form.addEventListener('submit', async (event) => {
      event.preventDefault();
      status.textContent = '';
      status.className = 'modal-status';
      submit.disabled = true;

      try {
        const modelId = document.getElementById('cutModel').value;
        const cuttingDate = document.getElementById('cutDate').value;
        const pieces = Number(document.getElementById('cutPieces').value);
        const notes = document.getElementById('cutNotes').value.trim();
        const rows = [...inputs.querySelectorAll('[data-cut-row]')];
        const pInputs = rows.map((row) => ({
          material_id: row.querySelector('[data-cut-material]').value,
          quantity: Number(row.querySelector('[data-cut-quantity]').value),
        }));

        if (!modelId) throw new Error('اختر الموديل أولًا.');
        if (!cuttingDate) throw new Error('اختر تاريخ القص.');
        if (!Number.isInteger(pieces) || pieces <= 0) throw new Error('عدد القطع الفعلية يجب أن يكون رقمًا صحيحًا أكبر من صفر.');
        if (!pInputs.length || pInputs.some((x) => !x.material_id || !Number.isFinite(x.quantity) || x.quantity <= 0)) throw new Error('أدخل قماشًا وكمية فعلية صحيحة لكل سطر.');

        setStatus('جارٍ تسجيل قصة القص…');
        const { error } = await client.rpc('post_cutting', {
          p_model_id: modelId,
          p_cutting_date: cuttingDate,
          p_actual_pieces: pieces,
          p_inputs: pInputs,
          p_notes: notes || null,
        });
        if (error) throw error;

        setStatus('تم تسجيل قصة القص ودخول الناتج إلى WIP بنجاح.', 'success');
        status.textContent = 'تم تسجيل القصة بنجاح.';
        status.className = 'modal-status success';
        setTimeout(() => renderRoute(true), 500);
      } catch (error) {
        status.textContent = `تعذر تسجيل القصة: ${error.message}`;
        status.className = 'modal-status error';
        submit.disabled = false;
        setStatus('تعذر تسجيل قصة القص.', 'error');
      }
    });
  }

  const original = window.cuttingView;
  window.cuttingView = cuttingView;
  window.__masna3iOriginalCuttingView = original;

  if (location.hash.replace('#', '') === 'cutting' && document.getElementById('view')) cuttingView();
})();
