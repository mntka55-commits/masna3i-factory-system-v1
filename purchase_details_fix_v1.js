(() => {
  if (!document.getElementById('app')) return;
  async function openPurchaseDetails(purchaseId) {
    const db = window.__masna3iClient || window.supabase?.createClient?.('https://favitcmfzdlvgtwicxmb.supabase.co','sb_publishable_to-VILINGqpWLu7Sod8ULQ_YBGMP7MZ');
    if (!db) return alert('جلسة النظام غير جاهزة.');
    window.__masna3iClient = db;
    const [inv, lines, mats, suppliers, totals] = await Promise.all([
      db.from('purchase_invoices').select('id,invoice_number,supplier_id,purchase_date,notes').eq('id',purchaseId).limit(1),
      db.from('purchase_lines').select('id,material_id,quantity,unit_price,color,line_total').eq('purchase_invoice_id',purchaseId).order('id'),
      db.from('materials').select('id,code,name,unit'),
      db.from('suppliers').select('id,name'),
      db.from('v_purchase_totals').select('purchase_invoice_id,total_amount').eq('purchase_invoice_id',purchaseId).limit(1)
    ]);
    const error=inv.error||lines.error||mats.error||suppliers.error||totals.error;
    if(error)return alert('تعذر تحميل تفاصيل الشراء: '+error.message);
    const invoice=inv.data?.[0];
    if(!invoice)return alert('فاتورة الشراء غير موجودة.');
    const mm=new Map((mats.data||[]).map(x=>[x.id,x]));
    const supplier=(suppliers.data||[]).find(x=>x.id===invoice.supplier_id);
    const rows=(lines.data||[]).map(x=>{
      const m=mm.get(x.material_id)||{};
      return '<tr><td><b>'+escapeHtml(m.code||'—')+'</b><br><span class="subtext">'+escapeHtml(m.name||'—')+'</span></td><td>'+escapeHtml(x.color||'—')+'</td><td>'+qty(x.quantity)+' '+escapeHtml(m.unit||'')+'</td><td>'+money(x.unit_price)+'</td><td><b>'+money(x.line_total)+'</b></td></tr>';
    });
    document.getElementById('purchaseDetailsModal')?.remove();
    const modal=document.createElement('div');
    modal.id='purchaseDetailsModal'; modal.className='modal-backdrop';
    modal.innerHTML='<div class="modal-card" role="dialog" aria-modal="true"><div class="modal-head"><div><span class="eyebrow">تفاصيل مستند شراء</span><h3>'+escapeHtml(invoice.invoice_number)+'</h3><span>'+escapeHtml(supplier?.name||'—')+' — '+escapeHtml(invoice.purchase_date||'—')+'</span></div><button type="button" class="modal-close" id="closePurchaseDetails">×</button></div><div class="panel"><div class="panel-head"><div><h3>بنود الشراء</h3><span>المستند للتنظيم والمراجعة.</span></div><strong>'+money(totals.data?.[0]?.total_amount)+'</strong></div>'+table(['الصنف','اللون / البيان','الكمية','سعر الوحدة','الإجمالي'],rows,'لا توجد بنود مسجلة لهذه الفاتورة.')+'</div><div class="note-panel"><p>الرصيد المالي الفعلي للمورد يظهر في حساب المورد.</p><p>'+escapeHtml(invoice.notes||'')+'</p></div></div>';
    document.body.appendChild(modal);
    const close=()=>modal.remove();
    modal.querySelector('#closePurchaseDetails').onclick=close;
    modal.addEventListener('click',e=>{if(e.target===modal)close()});
  }
  document.addEventListener('click',event=>{
    const b=event.target.closest?.('[data-purchase-details]');
    if(!b)return;
    event.preventDefault();
    openPurchaseDetails(b.dataset.purchaseDetails);
  });
})();