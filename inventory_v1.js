(() => {
  if (!document.getElementById('app')) return;

  async function inventoryView() {
  const rows = await fetchOne('v_inventory_balances', 'material_id,code,name,kind,unit,current_quantity,minimum_stock');
  const low = rows.filter((r) => r.minimum_stock != null && Number(r.current_quantity || 0) <= Number(r.minimum_stock));
  const tableRows = rows.map((r) => `<tr><td><b>${escapeHtml(r.name)}</b><br><span class="subtext">${escapeHtml(r.code)}</span></td><td>${escapeHtml(r.kind === 'fabric' ? 'قماش' : 'إكسسوار')}</td><td>${qty(r.current_quantity)} ${escapeHtml(r.unit)}</td><td>${r.minimum_stock == null ? '—' : qty(r.minimum_stock)}</td><td><span class="status-pill ${low.includes(r) ? 'warning' : 'ok'}">${low.includes(r) ? 'حد أدنى' : 'جيد'}</span></td><td><button class="table-button" data-stocktake="${r.material_id}">جرد مخزن</button></td></tr>`);
  document.getElementById('view').innerHTML = `
    <div class="hero"><div><h2>المخزن</h2><p>الأقمشة والإكسسوارات — بدون مخزون سالب.</p></div><button class="button secondary" id="openStocktakeAll">＋ جرد مخزن</button></div>
    <div class="stats-grid">${statCard('▣','إجمالي الأصناف',qty(rows.length),'أصناف مسجلة')}${statCard('⚠','أقل مخزون',qty(low.length),'تحتاج متابعة')}${statCard('✓','مخزون سالب','0','الحركة مرفوضة عند النزول تحت الصفر')}${statCard('◈','أرصدة فعلية',qty(rows.reduce((s,r)=>s+Number(r.current_quantity||0),0)),'بوحدات كل صنف')}</div>
    <div class="panel">${table(['الصنف','النوع','الكمية النظامية','الحد الأدنى','الحالة',''], tableRows, 'لا توجد خامات مسجلة حتى الآن.')}</div>`;

  const openStocktake = (materialId = '') => {
    const selected = rows.find(r => r.material_id === materialId) || rows[0];
    const options = rows.map(r => `<option value="${escapeHtml(r.material_id)}" ${selected?.material_id===r.material_id?'selected':''}>${escapeHtml(r.code)} — ${escapeHtml(r.name)} | النظام: ${qty(r.current_quantity)} ${escapeHtml(r.unit)}</option>`).join('');
    document.body.insertAdjacentHTML('beforeend', `
      <div class="modal-backdrop" id="stocktakeModal">
        <div class="modal-card" role="dialog" aria-modal="true" aria-labelledby="stocktakeTitle">
          <div class="modal-head"><div><h3 id="stocktakeTitle">جرد مخزن</h3><span>سجل الكمية الفعلية، والنظام يحسب الفرق ويُنشئ حركة تصحيح.</span></div><button class="modal-close" id="closeStocktake">×</button></div>
          <form id="stocktakeForm" class="stack-form">
            <label>الصنف<select id="stocktakeMaterial" required>${options}</select></label>
            <div class="rule-box" id="stocktakeSystem">الكمية النظامية: —</div>
            <label>الكمية الفعلية في المخزن<input id="stocktakeActual" type="number" min="0" step="0.01" required></label>
            <div class="rule-box" id="stocktakeDifference">الفرق: —</div>
            <label>تاريخ الجرد<input id="stocktakeDate" type="date" value="${new Date().toISOString().slice(0,10)}" required></label>
            <label>ملاحظات<input id="stocktakeNotes" maxlength="300" placeholder="اختياري"></label>
            <div class="modal-actions"><button type="button" class="button secondary" id="cancelStocktake">إلغاء</button><button type="submit" class="button" id="saveStocktake">حفظ الجرد</button></div>
            <div class="global-status" id="stocktakeStatus"></div>
          </form>
        </div>
      </div>`);
    const modal=document.getElementById('stocktakeModal');
    const select=document.getElementById('stocktakeMaterial');
    const actual=document.getElementById('stocktakeActual');
    const system=document.getElementById('stocktakeSystem');
    const diff=document.getElementById('stocktakeDifference');
    const status=document.getElementById('stocktakeStatus');
    const close=()=>modal?.remove();
    const sync=()=>{
      const row=rows.find(r=>r.material_id===select.value);
      const sys=Number(row?.current_quantity||0), act=Number(actual.value||0), d=act-sys;
      system.textContent=`الكمية النظامية: ${qty(sys)} ${row?.unit||''}`;
      diff.textContent=actual.value===''?'الفرق: —':`الفرق: ${d>0?'+':''}${currency.format(d)} ${row?.unit||''} — ${d===0?'لا توجد حركة':'سيتم تسجيل '+(d>0?'زيادة':'عجز')}`;
    };
    select.onchange=sync; actual.oninput=sync; sync();
    document.getElementById('closeStocktake').onclick=close;
    document.getElementById('cancelStocktake').onclick=close;
    modal.addEventListener('click',e=>{if(e.target===modal)close();});
    document.getElementById('stocktakeForm').onsubmit=async e=>{
      e.preventDefault();
      const row=rows.find(r=>r.material_id===select.value), act=Number(actual.value);
      if(!row) return status.textContent='اختر الصنف أولًا.';
      if(!Number.isFinite(act)||act<0) return status.textContent='الكمية الفعلية يجب أن تكون صفر أو أكبر.';
      if(act===Number(row.current_quantity||0)) return status.textContent='لا يوجد فرق؛ لم يتم إنشاء حركة.';
      const button=document.getElementById('saveStocktake'); button.disabled=true; button.textContent='جارٍ الحفظ…'; status.textContent='';
      const {error}=await client.rpc('post_stocktake',{p_material_id:row.material_id,p_actual_quantity:act,p_effective_date:document.getElementById('stocktakeDate').value,p_notes:document.getElementById('stocktakeNotes').value.trim()||null});
      if(error){status.textContent='تعذر تسجيل الجرد: '+error.message;button.disabled=false;button.textContent='حفظ الجرد';return;}
      close(); setStatus('تم تسجيل جرد المخزن وتحديث رصيد الصنف.','info'); await renderRoute(true);
    };
  };
  document.getElementById('openStocktakeAll').onclick=()=>openStocktake();
  document.querySelectorAll('[data-stocktake]').forEach(b=>b.onclick=()=>openStocktake(b.dataset.stocktake));
}

  window.inventoryView = inventoryView;
})();