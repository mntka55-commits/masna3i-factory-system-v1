(() => {
  const client = window.__masna3iClient || window.supabase?.createClient?.(
    'https://favitcmfzdlvgtwicxmb.supabase.co',
    'sb_publishable_to-VILINGqpWLu7Sod8ULQ_YBGMP7MZ'
  );
  if (!client) return;
  window.__masna3iClient = client;

  const today = () => new Date().toISOString().slice(0, 10);
  const esc = (v) => String(v ?? '').replace(/[&<>'"]/g, (c) => ({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#039;','"':'&quot;'}[c]));
  const outcomeLabel = (x) => ({ good_ready:'سليم → READY', repair:'تحت الإصلاح' }[x] || x || '—');

  async function load() {
    const [
      r1,r2,r3,r4,r5,r6,r7,r8
    ] = await Promise.all([
      client.from('returns').select('id,return_number,sale_id,return_date,notes,created_at').order('return_date',{ascending:false}),
      client.from('return_lines').select('id,return_id,sale_line_id,quantity,outcome,financial_credit_amount'),
      client.from('sales').select('id,customer_id,sale_date,sale_kind'),
      client.from('sale_lines').select('id,sale_id,model_id,quantity,unit_price'),
      client.from('invoices').select('id,sale_id,invoice_number,invoice_date'),
      client.from('customers').select('id,code,name'),
      client.from('models').select('id,code,name'),
      Promise.all([
        client.from('v_return_damage_balances').select('return_damage_lot_id,return_line_id,remaining_pieces').gt('remaining_pieces',0),
        client.from('ready_lots').select('id,source_return_line_id,remaining_pieces').gt('remaining_pieces',0),
      ])
    ]);
    [r1,r2,r3,r4,r5,r6,r7,r8[0],r8[1]].forEach((x)=>{ if(x.error) throw x.error; });
    return {
      returns:r1.data||[], lines:r2.data||[], sales:r3.data||[], saleLines:r4.data||[],
      invoices:r5.data||[], customers:r6.data||[], models:r7.data||[],
      damage:r8[0].data||[], ready:r8[1].data||[]
    };
  }

  function lineContext(d,line) {
    const sl=d.saleLines.find(x=>x.id===line.sale_line_id);
    const sale=d.sales.find(x=>x.id===d.returns.find(r=>r.id===line.return_id)?.sale_id);
    const model=d.models.find(x=>x.id===sl?.model_id);
    const customer=d.customers.find(x=>x.id===sale?.customer_id);
    const invoice=d.invoices.find(x=>x.sale_id===sale?.id);
    return {sl,sale,model,customer,invoice};
  }

  function render(d) {
    const credit=d.lines.reduce((s,x)=>s+Number(x.financial_credit_amount||0),0);
    const repair=d.damage.reduce((s,x)=>s+Number(x.remaining_pieces||0),0);
    const returnReady=d.ready.reduce((s,x)=>s+Number(x.remaining_pieces||0),0);

    const rows=d.returns.map((r)=>{
      const sale=d.sales.find(x=>x.id===r.sale_id);
      const customer=d.customers.find(x=>x.id===sale?.customer_id);
      const invoice=d.invoices.find(x=>x.sale_id===r.sale_id);
      const lines=d.lines.filter(x=>x.return_id===r.id);
      return `<tr>
        <td><b>${esc(r.return_number)}</b><br><span class="subtext">${esc(invoice?.invoice_number||'—')}</span></td>
        <td>${esc(r.return_date||'—')}</td>
        <td>${esc(customer?.name||'بدون عميل')}</td>
        <td>${lines.map(l=>`${qty(l.quantity)} × ${esc(d.models.find(m=>m.id===d.saleLines.find(sl=>sl.id===l.sale_line_id)?.model_id)?.code||'—')} — ${outcomeLabel(l.outcome)}`).join('، ')}</td>
        <td><b>${money(lines.reduce((s,l)=>s+Number(l.financial_credit_amount||0),0))}</b></td>
      </tr>`;
    });

    const actions=d.lines.map((line)=>{
      const c=lineContext(d,line);
      const pending=d.damage.find(x=>x.return_line_id===line.id);
      const readyQty=d.ready.filter(x=>x.source_return_line_id===line.id).reduce((s,x)=>s+Number(x.remaining_pieces||0),0);
      const redelivered=d.saleLines.filter(x=>x.source_return_line_id===line.id).reduce((s,x)=>s+Number(x.quantity||0),0);
      const available=Math.max(0,Number(line.quantity)-redelivered);
      let buttons='';
      if(pending) buttons+=`<button class="table-button" data-repair="${line.id}">تم التصليح</button> `;
      if(readyQty>0 && available>0 && c.customer) buttons+=`<button class="table-button" data-redelivery="${line.id}">إعادة تسليم</button>`;
      return `<div class="activity-row"><span class="dot"></span><div><b>${esc(c.model?.code||'—')} — ${esc(c.model?.name||'')}</b><small>مرتجع ${esc(d.returns.find(r=>r.id===line.return_id)?.return_number||'—')} · ${esc(c.customer?.name||'بدون عميل')}</small></div><strong>${qty(line.quantity)} قطعة</strong><span>${buttons||'<span class="subtext">لا يوجد إجراء</span>'}</span></div>`;
    }).join('') || '<div class="empty-state compact"><b>لا توجد بنود مرتجعات</b><span>سجل أول مرتجع لظهور الإجراءات هنا.</span></div>';

    document.getElementById('view').innerHTML=`
      <div class="hero"><div><h2>المرتجعات</h2><p>المرتجع يقلل رصيد العميل ولا يعدل الفاتورة الأصلية بصمت.</p></div><button class="button" id="addReturn">＋ تسجيل مرتجع</button></div>
      <div class="stats-grid">
        ${statCard('↩','المرتجعات',qty(d.returns.length),'حركات')}
        ${statCard('−','رصيد المرتجعات',money(credit),'ائتمان للعملاء')}
        ${statCard('🛠','تحت الإصلاح',qty(repair),'قطعة')}
        ${statCard('◈','READY من مرتجعات',qty(returnReady),'قطعة')}
      </div>
      <div class="panel note-panel" style="margin-bottom:14px"><h3>قاعدة التشغيل</h3><p>إعادة التسليم تُصدر فاتورة جديدة بنوع <b>return_redelivery</b>، لكنها لا تُحسب كمبيعات جديدة في تقارير الأداء. السعر الافتراضي هو السعر الأصلي ويمكن للمالك تعديله.</p><p>التصفية تُنفذ لاحقًا كـClearance Sale مستقل، وليست نتيجة مرتجع.</p></div>
      <div class="panel">${table(['المرتجع / الفاتورة','التاريخ','العميل','التفاصيل','رصيد العميل'],rows,'لا توجد مرتجعات مسجلة حتى الآن.')}</div>
      <div class="panel" style="margin-top:14px"><div class="panel-head"><div><h3>الإجراءات</h3><span>إتمام الإصلاح أو إعادة التسليم من مصدر المرتجع نفسه.</span></div></div>${actions}</div>`;
    document.getElementById('addReturn').onclick=()=>openReturn(d);
    document.querySelectorAll('[data-repair]').forEach(b=>b.onclick=()=>repair(d,b.dataset.repair));
    document.querySelectorAll('[data-redelivery]').forEach(b=>b.onclick=()=>redelivery(d,b.dataset.redelivery));
  }

  function openReturn(d){
    const invoices=d.invoices.filter(i=>d.saleLines.some(sl=>sl.sale_id===i.sale_id));
    document.body.insertAdjacentHTML('beforeend',`
      <div class="modal-backdrop" id="returnModal"><div class="modal-card" role="dialog" aria-modal="true">
        <div class="modal-head"><div><h3>تسجيل مرتجع</h3><span>القيمة تُسجل كرَصيد للعميل.</span></div><button class="modal-close" id="closeReturn">×</button></div>
        <form id="returnForm" class="stack-form">
          <label>الفاتورة<select id="returnInvoice" required><option value="">اختر الفاتورة</option>${invoices.map(i=>`<option value="${esc(i.sale_id)}">${esc(i.invoice_number)}</option>`).join('')}</select></label>
          <div id="returnLines" class="allocation-box"><div class="allocation-empty">اختر الفاتورة.</div></div>
          <label>الكمية<input id="returnQty" type="number" min="1" step="1" disabled required></label>
          <label>النتيجة<select id="returnOutcome"><option value="good_ready">سليم — READY</option><option value="repair">تحت الإصلاح</option></select></label>
          <label>ملاحظات<input id="returnNotes" maxlength="300" placeholder="اختياري"></label>
          <div id="returnStatus" class="global-status"></div>
          <div class="modal-actions"><button type="button" class="button secondary" id="cancelReturn">إلغاء</button><button class="button" id="saveReturn" type="submit">حفظ المرتجع</button></div>
        </form>
      </div></div>`);

    const modal=document.getElementById('returnModal');
    const close=()=>modal?.remove();
    document.getElementById('closeReturn').onclick=close;
    document.getElementById('cancelReturn').onclick=close;
    modal.addEventListener('click',e=>{if(e.target===modal)close();});
    const invoice=document.getElementById('returnInvoice');
    const box=document.getElementById('returnLines');
    const q=document.getElementById('returnQty');
    const status=document.getElementById('returnStatus');
    let selected=null;

    invoice.onchange=()=>{
      selected=null;q.disabled=true;q.value='';
      const saleId=invoice.value;
      const items=d.saleLines.filter(sl=>sl.sale_id===saleId);
      box.innerHTML=items.length?items.map(sl=>{
        const returned=d.lines.filter(l=>l.sale_line_id===sl.id).reduce((s,l)=>s+Number(l.quantity||0),0);
        const available=Math.max(0,Number(sl.quantity)-returned);
        const m=d.models.find(x=>x.id===sl.model_id);
        return `<button type="button" class="allocation-row" data-select-line="${sl.id}" data-max="${available}" ${available?'':'disabled'}>
          <span><b>${esc(m?.code||'—')} — ${esc(m?.name||'')}</b><small>السعر ${money(sl.unit_price)}</small></span>
          <span>باع ${qty(sl.quantity)}</span><span>متاح ${qty(available)}</span>
        </button>`;
      }).join(''):'<div class="allocation-empty">لا توجد بنود.</div>';
      box.querySelectorAll('[data-select-line]').forEach(btn=>btn.onclick=()=>{
        box.querySelectorAll('[data-select-line]').forEach(x=>x.classList.remove('active'));
        btn.classList.add('active');selected=btn.dataset.selectLine;q.disabled=false;q.max=btn.dataset.max;q.value='1';
      });
    };

    document.getElementById('returnForm').onsubmit=async e=>{
      e.preventDefault();
      const quantity=Number(q.value||0), max=Number(q.max||0);
      if(!selected)return status.textContent='اختر بندًا من الفاتورة.';
      if(!Number.isInteger(quantity)||quantity<=0||quantity>max)return status.textContent='راجع كمية المرتجع.';
      const save=document.getElementById('saveReturn');save.disabled=true;status.textContent='جارٍ تسجيل المرتجع…';
      try{
        const {error}=await client.rpc('post_return',{
          p_return_number:`RET-${Date.now()}`,
          p_sale_id:invoice.value,p_return_date:today(),
          p_lines:[{sale_line_id:selected,quantity,outcome:document.getElementById('returnOutcome').value}],
          p_notes:document.getElementById('returnNotes').value.trim()||null
        });
        if(error)throw error;
        close();setStatus('تم تسجيل المرتجع وربط أثره المالي بالعميل.','info');await renderRoute(true);
      }catch(err){status.textContent=`تعذر تسجيل المرتجع: ${err.message}`;save.disabled=false;}
    };
  }

  function repair(d,id){
    const damage=d.damage.find(x=>x.return_line_id===id);if(!damage)return;
    document.body.insertAdjacentHTML('beforeend',`
      <div class="modal-backdrop" id="repairModal"><div class="modal-card"><div class="modal-head"><div><h3>تم التصليح</h3><span>يعود إلى READY بنفس التكلفة التاريخية.</span></div><button class="modal-close" id="closeRepair">×</button></div>
      <form id="repairForm" class="stack-form"><label>الكمية<input id="repairQty" type="number" min="1" max="${Number(damage.remaining_pieces)}" value="${Number(damage.remaining_pieces)}" required></label><div id="repairStatus" class="global-status"></div>
      <div class="modal-actions"><button type="button" class="button secondary" id="cancelRepair">إلغاء</button><button class="button" type="submit" id="saveRepair">تم التصليح</button></div></form></div></div>`);
    const modal=document.getElementById('repairModal'),close=()=>modal?.remove();
    document.getElementById('closeRepair').onclick=close;document.getElementById('cancelRepair').onclick=close;
    modal.addEventListener('click',e=>{if(e.target===modal)close();});
    document.getElementById('repairForm').onsubmit=async e=>{
      e.preventDefault();const n=Number(document.getElementById('repairQty').value||0);
      if(!Number.isInteger(n)||n<=0||n>Number(damage.remaining_pieces))return;
      const b=document.getElementById('saveRepair'),s=document.getElementById('repairStatus');b.disabled=true;
      try{const {error}=await client.rpc('post_return_repair_to_ready',{p_return_line_id:id,p_pieces:n});if(error)throw error;close();setStatus(`تم نقل ${qty(n)} قطعة إلى READY.`,'info');await renderRoute(true);}
      catch(err){s.textContent=`تعذر إتمام الإصلاح: ${err.message}`;b.disabled=false;}
    };
  }

  function redelivery(d,id){
    const line=d.lines.find(x=>x.id===id);const c=lineContext(d,line);if(!line||!c.sl||!c.customer)return;
    const readyQty=d.ready.filter(x=>x.source_return_line_id===id).reduce((s,x)=>s+Number(x.remaining_pieces||0),0);
    const redelivered=d.saleLines.filter(x=>x.source_return_line_id===id).reduce((s,x)=>s+Number(x.quantity||0),0);
    const available=Math.min(readyQty,Math.max(0,Number(line.quantity)-redelivered));if(available<=0)return;

    document.body.insertAdjacentHTML('beforeend',`
      <div class="modal-backdrop" id="redeliveryModal"><div class="modal-card"><div class="modal-head"><div><h3>إعادة تسليم مرتجع</h3><span>فاتورة جديدة من نوع return_redelivery.</span></div><button class="modal-close" id="closeRedelivery">×</button></div>
      <form id="redeliveryForm" class="stack-form"><label>العميل<input value="${esc(c.customer.name)}" disabled></label><label>الكمية<input id="redQty" type="number" min="1" max="${available}" value="${available}" required></label>
      <label>السعر للقطعة<input id="redPrice" type="number" min="0" step="0.01" value="${Number(c.sl.unit_price||0)}" required><small class="field-help">الافتراضي هو السعر الأصلي ويمكن للمالك تعديله.</small></label>
      <label>رقم الفاتورة<input id="redInv" maxlength="80" required value="RET-RED-${Date.now()}"></label><div id="redStatus" class="global-status"></div>
      <div class="modal-actions"><button type="button" class="button secondary" id="cancelRedelivery">إلغاء</button><button class="button" type="submit" id="saveRedelivery">إصدار الفاتورة</button></div></form></div></div>`);
    const modal=document.getElementById('redeliveryModal'),close=()=>modal?.remove();
    document.getElementById('closeRedelivery').onclick=close;document.getElementById('cancelRedelivery').onclick=close;
    modal.addEventListener('click',e=>{if(e.target===modal)close();});
    document.getElementById('redeliveryForm').onsubmit=async e=>{
      e.preventDefault();
      const n=Number(document.getElementById('redQty').value||0),price=Number(document.getElementById('redPrice').value||0);
      if(!Number.isInteger(n)||n<=0||n>available)return;
      if(!Number.isFinite(price)||price<0)return;
      const b=document.getElementById('saveRedelivery'),s=document.getElementById('redStatus');b.disabled=true;s.textContent='جارٍ إصدار الفاتورة…';
      try{
        const {error}=await client.rpc('post_return_redelivery',{
          p_invoice_number:document.getElementById('redInv').value.trim(),p_sale_date:today(),
          p_return_line_id:id,p_quantity:n,p_unit_price:price,p_notes:'إعادة تسليم مرتجع'
        });
        if(error)throw error;close();setStatus('تم إصدار فاتورة إعادة التسليم وربطها بالمرتجع الأصلي.','info');await renderRoute(true);
      }catch(err){s.textContent=`تعذر إصدار الفاتورة: ${err.message}`;b.disabled=false;}
    };
  }

  const original=window.returnsView;
  window.returnsView=async()=>{try{render(await load());}catch(e){setStatus(`تعذر تحميل شاشة المرتجعات: ${e.message}`,'error');}};
  window.__masna3iOriginalReturnsView=original;
  if(location.hash.replace('#','')==='returns'&&document.getElementById('view'))window.returnsView();
})();