(() => {
  const SUPABASE_URL = 'https://favitcmfzdlvgtwicxmb.supabase.co';
  const SUPABASE_PUBLISHABLE_KEY = 'sb_publishable_to-VILINGqpWLu7Sod8ULQ_YBGMP7MZ';
  function db() {
    if (window.__masna3iClient) return window.__masna3iClient;
    if (!window.supabase || !window.supabase.createClient) return null;
    window.__masna3iClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY);
    return window.__masna3iClient;
  }
  const esc = (v) => String(v ?? '').replace(/[&<>'"]/g, (c) => ({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#039;','"':'&quot;'}[c]));
  const moneyLocal = (v) => new Intl.NumberFormat('en-US',{maximumFractionDigits:2}).format(Number(v || 0)) + ' ج';

  async function modelDetailViewV1() {
    const client = db();
    if (!client || !state.modelId) return;
    const results = await Promise.all([
      client.from('models').select('id,code,name,selling_price,sizes,colors,notes').eq('id',state.modelId).limit(1),
      client.from('v_model_current_costs').select('current_cost_per_piece,fabric_cost_per_piece,accessory_cost_per_piece,variable_cost_per_piece,consumed_quantity,actual_pieces').eq('model_id',state.modelId).limit(1),
      client.from('v_model_material_costs').select('model_material_id,material_id,material_code,material_name,material_kind,unit,quantity_per_piece,source_unit_price,unit_cost_override,effective_unit_price,price_source,recipe_cost_per_piece').eq('model_id',state.modelId).order('material_name'),
      client.from('model_variable_costs').select('id,cost_type,name,amount_per_piece,notes').eq('model_id',state.modelId).order('created_at')
    ]);
    const model = results[0].data && results[0].data[0];
    if (!model) { location.hash='models'; return; }
    if (results[0].error) throw results[0].error;
    if (results[1].error) throw results[1].error;
    if (results[2].error) throw results[2].error;
    if (results[3].error) throw results[3].error;

    const cost = (results[1].data || [])[0] || null;
    const materialRows = results[2].data || [];
    const variableRows = results[3].data || [];
    const variableTotal = variableRows.reduce((s,r)=>s+Number(r.amount_per_piece||0),0);
    const recipeTotal = materialRows.reduce((s,r)=>s+Number(r.recipe_cost_per_piece||0),0) + variableTotal;

    const materialRowsHtml = materialRows.map(r => {
      return '<tr>' +
        '<td><b>' + esc(r.material_name) + '</b><br><span class="subtext">' + esc(r.material_code) + ' — ' + (r.material_kind === 'fabric' ? 'قماش' : 'إكسسوار') + '</span></td>' +
        '<td>' + (r.quantity_per_piece == null ? 'فعلي في القصة' : Number(r.quantity_per_piece).toFixed(3) + ' ' + esc(r.unit) + '/قطعة') + '</td>' +
        '<td>' + (r.source_unit_price == null ? '<span class="status-pill warning">غير متوفر</span>' : moneyLocal(r.source_unit_price)) + '</td>' +
        '<td><input class="inline-input model-material-override" data-id="' + esc(r.model_material_id) + '" type="number" min="0" step="0.0001" value="' + (r.unit_cost_override == null ? '' : Number(r.unit_cost_override)) + '" placeholder="تلقائي" /></td>' +
        '<td>' + (r.effective_unit_price == null ? '—' : moneyLocal(r.effective_unit_price)) + '</td>' +
        '<td>' + ({owner_override:'Override من Owner',latest_purchase:'آخر فاتورة شراء',warehouse:'قيمة المخزن',unavailable:'غير متاح'}[r.price_source] || '—') + '</td>' +
        '<td>' + (r.recipe_cost_per_piece == null ? '—' : moneyLocal(r.recipe_cost_per_piece)) + '</td>' +
        '<td><button class="table-button model-material-save" data-id="' + esc(r.model_material_id) + '">حفظ</button></td>' +
      '</tr>';
    }).join('');

    const variableRowsHtml = variableRows.map(r => {
      return '<tr>' +
        '<td><input class="inline-input variable-name" data-id="' + esc(r.id) + '" value="' + esc(r.name) + '" /></td>' +
        '<td><input class="inline-input variable-amount" data-id="' + esc(r.id) + '" type="number" min="0" step="0.01" value="' + Number(r.amount_per_piece || 0) + '" /></td>' +
        '<td>' + esc(r.notes || '—') + '</td>' +
        '<td><button class="table-button variable-save" data-id="' + esc(r.id) + '">حفظ</button></td>' +
        '<td><button class="table-button danger variable-delete" data-id="' + esc(r.id) + '">حذف</button></td>' +
      '</tr>';
    }).join('');

    document.getElementById('view').innerHTML =
      '<div class="hero"><div><span class="eyebrow">تكلفة الموديل</span><h2>' + esc(model.name) + ' — ' + esc(model.code) + '</h2><p>سعر المصدر ظاهر، وOverride اختياري، والتاريخ لا يتغير بأثر رجعي.</p></div><button class="button secondary" data-nav="models">← رجوع للموديلات</button></div>' +
      '<div class="stats-grid three">' +
        '<div class="stat-card"><div class="stat-icon">◈</div><div><span>التكلفة الحالية</span><strong>' + (cost ? moneyLocal(cost.current_cost_per_piece) : '—') + '</strong><small>آخر قصة + الأسعار المعتمدة</small></div></div>' +
        '<div class="stat-card"><div class="stat-icon">◇</div><div><span>تكلفة الخطة</span><strong>' + moneyLocal(recipeTotal) + '</strong><small>المكونات + التكلفة المتغيرة</small></div></div>' +
        '<div class="stat-card"><div class="stat-icon">▤</div><div><span>تكلفة متغيرة</span><strong>' + moneyLocal(variableTotal) + '</strong><small>إضافات Owner لكل قطعة</small></div></div>' +
      '</div>' +
      '<div class="panel"><div class="panel-head"><div><h3>مواد الموديل</h3><span>السعر من آخر فاتورة شراء، وOwner يستطيع اعتماد سعر مختلف.</span></div><button class="button" id="addModelMaterial">＋ إضافة مادة / إكسسوار</button></div>' +
      '<div class="table-wrap"><table><thead><tr><th>المادة</th><th>الاستهلاك/قطعة</th><th>سعر المصدر</th><th>سعر Owner</th><th>السعر المعتمد</th><th>المصدر</th><th>تكلفة/قطعة</th><th></th></tr></thead><tbody>' +
      (materialRowsHtml || '<tr><td colspan="8" class="empty-cell">لم تتم إضافة مواد للموديل بعد.</td></tr>') +
      '</tbody></table></div></div>' +
      '<div class="panel"><div class="panel-head"><div><h3>تكلفة متغيرة</h3><span>مساحة مرنة لأي إضافة يريدها الـOwner، مثل خياطة أو كي أو تشطيب.</span></div><button class="button" id="addVariableCost">＋ إضافة تكلفة متغيرة</button></div>' +
      '<div class="table-wrap"><table><thead><tr><th>البند</th><th>ج/قطعة</th><th>ملاحظات</th><th></th><th></th></tr></thead><tbody>' +
      (variableRowsHtml || '<tr><td colspan="5" class="empty-cell">لا توجد تكلفة متغيرة مضافة.</td></tr>') +
      '</tbody></table></div></div>' +
      '<div class="two-col"><div class="panel"><div class="panel-head"><div><h3>التكلفة الفعلية الحالية</h3><span>من آخر قصة مكتملة/posted</span></div></div>' +
      (cost ? '<div class="cost-breakdown">' +
        '<div class="report-line"><span>قماش فعلي</span><b>' + moneyLocal(cost.fabric_cost_per_piece) + '</b></div>' +
        '<div class="report-line"><span>إكسسوارات</span><b>' + moneyLocal(cost.accessory_cost_per_piece) + '</b></div>' +
        '<div class="report-line"><span>تكلفة متغيرة</span><b>' + moneyLocal(cost.variable_cost_per_piece) + '</b></div>' +
        '<div class="report-line total"><span>الإجمالي</span><b>' + moneyLocal(cost.current_cost_per_piece) + '</b></div>' +
      '</div>' : '<div class="empty-state compact"><b>لا توجد قصة مكتملة بعد</b><span>سجل أول قصة ليظهر لها تاريخ تكلفة.</span></div>') +
      '</div><div class="panel note-panel"><h3>بيانات الموديل</h3>' +
      '<p>سعر البيع: <b>' + (model.selling_price == null ? '—' : moneyLocal(model.selling_price)) + '</b></p>' +
      '<p>المقاسات: <b>' + esc((model.sizes || []).join('، ') || '—') + '</b></p>' +
      '<p>الألوان: <b>' + esc((model.colors || []).join('، ') || '—') + '</b></p>' +
      '<p>' + esc(model.notes || 'لا توجد ملاحظات.') + '</p></div></div>';

    if (typeof bindInnerNav === 'function') bindInnerNav();

    document.getElementById('addModelMaterial').onclick = async () => {
      const all = await client.from('materials').select('id,code,name,kind,unit').order('name');
      if (all.error) return setStatus('تعذر تحميل الخامات: ' + all.error.message, 'error');
      const used = new Set(materialRows.map(r=>r.material_id));
      const options = (all.data || []).filter(m=>!used.has(m.id)).map(m => '<option value="' + esc(m.id) + '">' + esc(m.name) + ' — ' + esc(m.code) + ' (' + (m.kind === 'fabric' ? 'قماش' : 'إكسسوار') + ')</option>').join('');
      document.body.insertAdjacentHTML('beforeend',
        '<div class="modal-backdrop" id="modelMaterialModal"><div class="modal-card"><div class="modal-head"><div><h3>إضافة مادة للموديل</h3><span>الإكسسوار سيُخصم من المخزن حسب الكمية/قطعة عند الإنتاج.</span></div><button class="modal-close" id="closeModelMaterial">×</button></div>' +
        '<form id="modelMaterialForm" class="stack-form"><label>المادة<select id="modelMaterialId" required><option value="">اختر المادة</option>' + options + '</select></label>' +
        '<label>الكمية لكل قطعة<input id="modelMaterialQty" type="number" min="0" step="0.001" placeholder="مثال: 1 أو 0.25" /></label>' +
        '<label>سعر Owner (اختياري)<input id="modelMaterialOverride" type="number" min="0" step="0.0001" placeholder="اتركه فارغًا لاستخدام آخر سعر شراء" /></label>' +
        '<div class="modal-actions"><button type="button" class="button secondary" id="cancelModelMaterial">إلغاء</button><button type="submit" class="button">حفظ</button></div><div class="global-status" id="modelMaterialStatus"></div></form></div></div>'
      );
      const modal=document.getElementById('modelMaterialModal');
      const close=()=>modal.remove();
      document.getElementById('closeModelMaterial').onclick=close;
      document.getElementById('cancelModelMaterial').onclick=close;
      modal.addEventListener('click',(e)=>{if(e.target===modal)close();});
      document.getElementById('modelMaterialForm').addEventListener('submit',async(e)=>{
        e.preventDefault();
        const materialId=document.getElementById('modelMaterialId').value;
        const qty=document.getElementById('modelMaterialQty').value.trim();
        const overrideValue=document.getElementById('modelMaterialOverride').value.trim();
        const mat=(all.data||[]).find(m=>m.id===materialId);
        if (!materialId) return setStatus('اختر المادة.','error');
        if (mat && mat.kind==='accessory' && !(Number(qty)>0)) return setStatus('للإكسسوار الكمية لكل قطعة مطلوبة.','error');
        const res=await client.from('model_materials').insert({
          factory_id:state.factory.id, model_id:state.modelId, material_id:materialId,
          quantity_per_piece:qty===''?null:Number(qty),
          unit_cost_override:overrideValue===''?null:Number(overrideValue)
        });
        if(res.error) return setStatus('تعذر الحفظ: '+res.error.message,'error');
        close(); await modelDetailViewV1();
      });
    };

    document.querySelectorAll('.model-material-save').forEach(btn=>btn.onclick=async()=>{
      const id=btn.dataset.id;
      const input=document.querySelector('.model-material-override[data-id="' + CSS.escape(id) + '"]');
      const value=(input && input.value || '').trim();
      const res=await client.from('model_materials').update({unit_cost_override:value===''?null:Number(value)}).eq('id',id);
      if(res.error) return setStatus('تعذر حفظ سعر Owner: '+res.error.message,'error');
      await modelDetailViewV1();
    });

    document.getElementById('addVariableCost').onclick=()=>{
      document.body.insertAdjacentHTML('beforeend',
        '<div class="modal-backdrop" id="variableCostModal"><div class="modal-card"><div class="modal-head"><div><h3>إضافة تكلفة متغيرة</h3><span>تُحسب لكل قطعة ولا تُسجل كمصروف نقدي.</span></div><button class="modal-close" id="closeVariableCost">×</button></div>' +
        '<form id="variableCostForm" class="stack-form"><label>اسم البند<input id="variableCostName" required maxlength="120" placeholder="مثال: خياطة" /></label>' +
        '<label>القيمة لكل قطعة<input id="variableCostAmount" type="number" min="0" step="0.01" required placeholder="مثال: 10" /></label>' +
        '<label>ملاحظات<input id="variableCostNotes" maxlength="250" placeholder="اختياري" /></label>' +
        '<div class="modal-actions"><button type="button" class="button secondary" id="cancelVariableCost">إلغاء</button><button type="submit" class="button">حفظ</button></div><div class="global-status" id="variableCostStatus"></div></form></div></div>'
      );
      const modal=document.getElementById('variableCostModal');
      const close=()=>modal.remove();
      document.getElementById('closeVariableCost').onclick=close;
      document.getElementById('cancelVariableCost').onclick=close;
      modal.addEventListener('click',(e)=>{if(e.target===modal)close();});
      document.getElementById('variableCostForm').addEventListener('submit',async(e)=>{
        e.preventDefault();
        const name=document.getElementById('variableCostName').value.trim();
        const amount=Number(document.getElementById('variableCostAmount').value||0);
        if(!name || amount<0) return;
        const res=await client.from('model_variable_costs').insert({
          factory_id:state.factory.id, model_id:state.modelId, cost_type:'other',
          name:name, amount_per_piece:amount, notes:document.getElementById('variableCostNotes').value.trim()||null
        });
        if(res.error) return setStatus('تعذر الحفظ: '+res.error.message,'error');
        close(); await modelDetailViewV1();
      });
    };

    document.querySelectorAll('.variable-save').forEach(btn=>btn.onclick=async()=>{
      const id=btn.dataset.id;
      const name=(document.querySelector('.variable-name[data-id="' + CSS.escape(id) + '"]') || {}).value || '';
      const amount=Number(((document.querySelector('.variable-amount[data-id="' + CSS.escape(id) + '"]') || {}).value) || 0);
      if(!name || amount<0) return;
      const res=await client.from('model_variable_costs').update({name:name,amount_per_piece:amount}).eq('id',id);
      if(res.error) return setStatus('تعذر التعديل: '+res.error.message,'error');
      await modelDetailViewV1();
    });

    document.querySelectorAll('.variable-delete').forEach(btn=>btn.onclick=async()=>{
      const id=btn.dataset.id;
      const res=await client.from('model_variable_costs').delete().eq('id',id);
      if(res.error) return setStatus('تعذر الحذف: '+res.error.message,'error');
      await modelDetailViewV1();
    });
  }

  window.modelDetailView = modelDetailViewV1;
})();