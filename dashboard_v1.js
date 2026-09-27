(() => {
  if (!document.getElementById('app')) return;

  async function dashboard() {
  const [invoices, collections, ready, wip, inventory, models, purchases] = await Promise.all([
    fetchOne('v_invoice_totals', 'invoice_id,invoice_number,invoice_date,invoice_total'),
    fetchOne('collections', 'amount,created_at'),
    fetchOne('v_ready_balances', 'model_id,model_code,model_name,ready_pieces'),
    fetchOne('v_wip_balances', 'model_id,model_code,model_name,wip_pieces'),
    fetchOne('v_inventory_balances', 'material_id,code,name,unit,current_quantity,minimum_stock'),
    fetchOne('models', 'id,code,name'),
    fetchOne('v_purchase_totals', 'purchase_invoice_id,total_amount'),
  ]);
  const salesTotal = invoices.reduce((s, r) => s + Number(r.invoice_total || 0), 0);
  const collectionTotal = collections.reduce((s, r) => s + Number(r.amount || 0), 0);
  const readyTotal = ready.reduce((s, r) => s + Number(r.ready_pieces || 0), 0);
  const wipTotal = wip.reduce((s, r) => s + Number(r.wip_pieces || 0), 0);
  const low = inventory.filter((r) => r.minimum_stock != null && Number(r.current_quantity || 0) <= Number(r.minimum_stock));
  const purchaseTotal = purchases.reduce((s, r) => s + Number(r.total_amount || 0), 0);
  const activity = [...invoices.map((x) => ({ date: x.invoice_date, title: `بيع ${x.invoice_number}`, value: money(x.invoice_total) })), ...collections.slice(0, 4).map((x) => ({ date: x.created_at?.slice(0, 10), title: 'تحصيل', value: money(x.amount) }))].sort((a, b) => (b.date || '').localeCompare(a.date || '')).slice(0, 5);
  const production = models.slice(0, 8).map((m) => { const w = wip.find((x) => x.model_id === m.id)?.wip_pieces || 0; const r = ready.find((x) => x.model_id === m.id)?.ready_pieces || 0; return `<tr><td><b>${escapeHtml(m.code)}</b><br><span class="subtext">${escapeHtml(m.name)}</span></td><td>${qty(w)}</td><td>${qty(r)}</td><td><span class="status-pill ${r ? 'ok' : 'neutral'}">${r ? 'جاهز' : 'متابعة'}</span></td></tr>`; });
  document.getElementById('view').innerHTML = `
    <div class="hero"><div><h2>نظرة شاملة على مصنعك اليوم</h2><p>القراءة من الحركات الأصلية فقط، بدون أرقام تجريبية.</p></div><div class="hero-actions"><button class="button secondary" data-nav="reports">عرض التقارير</button><button class="button" data-nav="cutting">✂ بدء القص</button></div></div>
    <div class="stats-grid">${statCard('▤', 'المبيعات', money(salesTotal), `${qty(invoices.length)} فاتورة`)}${statCard('▥', 'التحصيلات', money(collectionTotal), 'مستلمة فعليًا')}${statCard('◈', 'READY', qty(readyTotal), 'قطعة جاهزة')}${statCard('▣', 'مخزون منخفض', qty(low.length), 'أصناف تحتاج متابعة')}</div>
    <div class="two-col">
      <div class="panel"><div class="panel-head"><div><h3>حالة الإنتاج الحالية</h3><span>الموديل / WIP / READY</span></div><button class="link-button" data-nav="models">عرض الكل</button></div>${table(['الموديل','WIP','READY','الحالة'], production, 'لا توجد موديلات مسجلة حتى الآن.')}</div>
      <div class="panel"><div class="panel-head"><div><h3>ملخص الحركة</h3><span>آخر البيانات الفعلية</span></div></div><div class="activity-list">${activity.length ? activity.map((a) => `<div class="activity-row"><span class="dot"></span><div><b>${escapeHtml(a.title)}</b><small>${escapeHtml(a.date || '')}</small></div><strong>${a.value}</strong></div>`).join('') : '<div class="empty-state compact"><b>لا توجد عمليات بعد</b><span>ابدأ بتسجيل شراء أو تعريف موديل أو قصة قص.</span></div>'}</div></div>
    </div>
    <div class="three-col">
      <div class="panel mini-panel"><span>الموديلات</span><strong>${qty(models.length)}</strong><small>تعريفات فعلية</small></div>
      <div class="panel mini-panel"><span>إجمالي المشتريات</span><strong>${money(purchaseTotal)}</strong><small>من فواتير الشراء</small></div>
      <div class="panel mini-panel"><span>WIP</span><strong>${qty(wipTotal)}</strong><small>قطعة تحت التجهيز</small></div>
    </div>`;
  bindInnerNav();
}

  window.dashboardView = dashboard;
})();