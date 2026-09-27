(() => {
  if (!document.getElementById('app')) return;

  async function readyView() {
  const rows = await fetchOne('v_ready_balances', 'model_id,model_code,model_name,ready_pieces');
  const tr = rows.map((r) => `<tr><td><b>${escapeHtml(r.model_code)}</b> — ${escapeHtml(r.model_name)}</td><td>${qty(r.ready_pieces)}</td><td><span class="status-pill ok">متاح للبيع</span></td><td><button class="table-button" data-nav="sales">بيع جزء</button></td></tr>`);
  document.getElementById('view').innerHTML = `<div class="hero"><div><h2>جاهز للبيع</h2><p>READY هو المصدر الوحيد القابل للبيع.</p></div></div><div class="stats-grid">${statCard('◈','إجمالي READY',qty(rows.reduce((s,r)=>s+Number(r.ready_pieces||0),0)),'قطعة جاهزة')}${statCard('✓','مصدر البيع','READY','لا يوجد بيع من WIP')}</div><div class="panel">${table(['الموديل','الكمية الجاهزة','الحالة',''], tr, 'لا توجد قطع جاهزة للبيع حتى الآن.')}</div>`;
  bindInnerNav();
}

  window.readyView = readyView;
})();