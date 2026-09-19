(() => {
  const client = window.__masna3iClient || window.supabase?.createClient?.(
    'https://favitcmfzdlvgtwicxmb.supabase.co',
    'sb_publishable_to-VILINGqpWLu7Sod8ULQ_YBGMP7MZ'
  );
  if (!client) return;
  window.__masna3iClient = client;
  const esc = (v) => String(v ?? '').replace(/[&<>'"]/g, (c) => ({ '&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#039;','"':'&quot;' }[c]));
  const money = (v) => new Intl.NumberFormat('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(Number(v || 0)) + ' ج';

  async function printInvoice(id) {
    const { data: inv, error: invError } = await client.from('invoices').select('id,sale_id,invoice_number,invoice_date').eq('id', id).single();
    if (invError) throw invError;
    if (!inv) throw new Error('الفاتورة غير موجودة');
    const [b,l,s,m,c] = await Promise.all([
      client.from('v_invoice_balances').select('*').eq('invoice_id', id).single(),
      client.from('invoice_lines').select('model_id,quantity,unit_price,line_total').eq('invoice_id', id),
      client.from('sales').select('customer_id,external_customer_name,notes').eq('id', inv.sale_id).single(),
      client.from('models').select('id,code,name'),
      client.from('customers').select('id,name,phone'),
    ]);
    if (b.error) throw b.error; if (l.error) throw l.error; if (s.error) throw s.error;
    const bal=b.data, sale=s.data, models=m.data||[], customers=c.data||[];
    const customer=sale?.external_customer_name || customers.find(x=>x.id===sale?.customer_id)?.name || 'عميل غير محدد';
    const kind=bal.sale_kind==='clearance_sale'?'بيع تصفية / خصم':bal.sale_kind==='return_redelivery'?'إعادة تسليم مرتجع':'بيع عادي';
    const rows=(l.data||[]).map((x,i)=>{const md=models.find(z=>z.id===x.model_id);return '<tr><td>'+String(i+1)+'</td><td>'+esc(md?.code)+' — '+esc(md?.name)+'</td><td>'+String(x.quantity)+'</td><td>'+money(x.unit_price)+'</td><td>'+money(x.line_total)+'</td></tr>';}).join('');
    document.getElementById('invoicePrintRoot')?.remove();
    document.body.insertAdjacentHTML('beforeend','<div id="invoicePrintRoot" class="invoice-print-overlay"><div class="invoice-print-tools"><button id="closePrint">إغلاق</button><button id="doPrint">طباعة A4</button></div><article class="invoice-sheet" dir="rtl"><header><div><strong>مصنعي</strong><small>إدارة المصنع</small></div><div><h1>فاتورة بيع</h1><p>رقم: <b>'+esc(inv.invoice_number)+'</b></p><p>التاريخ: '+esc(inv.invoice_date)+'</p><p>النوع: '+kind+'</p></div></header><section class="invoice-info"><div><small>العميل</small><b>'+esc(customer)+'</b></div><div><small>الإجمالي</small><b>'+money(bal.invoice_total)+'</b></div></section><table><thead><tr><th>#</th><th>الموديل</th><th>الكمية</th><th>سعر القطعة</th><th>الإجمالي</th></tr></thead><tbody>'+rows+'</tbody></table><section class="invoice-total"><p>الإجمالي: <b>'+money(bal.invoice_total)+'</b></p><p>المحصل: <b>'+money(bal.collected_total)+'</b></p><p>المتبقي: <b>'+money(bal.outstanding_total)+'</b></p></section>'+(sale?.notes?'<div class="invoice-note"><b>ملاحظات:</b> '+esc(sale.notes)+'</div>':'')+'<footer>مصنعي — إعادة الطباعة لا تنشئ حركة جديدة.</footer></article></div>');
    document.getElementById('closePrint').onclick=()=>document.getElementById('invoicePrintRoot')?.remove();
    document.getElementById('doPrint').onclick=()=>{document.body.classList.add('printing-invoice');window.print();setTimeout(()=>document.body.classList.remove('printing-invoice'),300);};
  }
  window.__printMasna3iInvoice=printInvoice;
})();