(() => {
  const client = window.__masna3iClient || window.supabase?.createClient?.(
    'https://favitcmfzdlvgtwicxmb.supabase.co',
    'sb_publishable_to-VILINGqpWLu7Sod8ULQ_YBGMP7MZ'
  );
  if (!client) return;
  window.__masna3iClient = client;

  const iso = (d) => d.toISOString().slice(0,10);
  const monthAgo = () => { const d=new Date(); d.setDate(d.getDate()-29); return iso(d); };
  const today = () => iso(new Date());
  const inRange = (value, from, to) => String(value||'') >= from && String(value||'') <= to;

  async function load(from,to) {
    const [sales,cogs,returnCogs,returns,collections,fixedExp,allExp,customers,suppliers,dq,ready,wip,inventory] = await Promise.all([
      client.from('v_sales_report').select('invoice_id,invoice_number,invoice_date,sale_id,customer_id,sale_kind,pieces,sales_amount'),
      client.from('v_historical_cogs').select('sale_id,invoice_id,invoice_number,sale_date,sale_kind,model_id,quantity,cogs_amount'),
      client.from('v_return_cogs').select('return_id,return_number,return_date,sale_id,pieces,returned_cogs'),
      client.from('v_returns_report').select('return_id,return_number,return_date,sale_id,customer_id,return_line_id,model_id,quantity,outcome,financial_credit_amount'),
      client.from('collections').select('amount,collection_date'),
      client.from('expenses').select('amount,expense_date,cost_type').eq('cost_type','fixed'),
      client.from('expenses').select('amount,expense_date,cost_type'),
      client.from('v_customer_account_balances').select('customer_id,name,net_balance,amount_due,customer_credit'),
      client.from('v_supplier_account_balances').select('supplier_id,name,payable_balance'),
      client.from('v_reporting_data_quality').select('issue_code,issue_count'),
      client.from('v_ready_balances').select('ready_pieces'),
      client.from('v_wip_balances').select('wip_pieces'),
      client.from('v_inventory_balances').select('current_quantity,minimum_stock')
    ]);
    [sales,cogs,returnCogs,returns,collections,fixedExp,allExp,customers,suppliers,dq,ready,wip,inventory]
      .forEach(x=>{if(x.error)throw x.error;});
    const f = sales.data||[], h = cogs.data||[], rc=returnCogs.data||[], rr=returns.data||[];
    const col=(collections.data||[]).filter(x=>inRange(x.collection_date,from,to));
    const fx=(fixedExp.data||[]).filter(x=>inRange(x.expense_date,from,to));
    const ex=(allExp.data||[]).filter(x=>inRange(x.expense_date,from,to));
    const salesInRange=f.filter(x=>inRange(x.invoice_date,from,to));
    const cogsInRange=h.filter(x=>inRange(x.sale_date,from,to));
    const returnsInRange=rr.filter(x=>inRange(x.return_date,from,to));
    const returnCogsInRange=rc.filter(x=>inRange(x.return_date,from,to));
    return {
      sales:salesInRange,cogs:cogsInRange,returns:returnsInRange,returnCogs:returnCogsInRange,
      collections:col,fixed:fx,expenses:ex,customers:customers.data||[],suppliers:suppliers.data||[],
      dq:dq.data||[],ready:ready.data||[],wip:wip.data||[],inventory:inventory.data||[]
    };
  }

  function num(rows, key){return rows.reduce((s,r)=>s+Number(r[key]||0),0);}

  async function render(from=monthAgo(),to=today()) {
    try {
      const d=await load(from,to);
      const normal=num(d.sales.filter(x=>x.sale_kind==='normal_sale'),'sales_amount');
      const clearance=num(d.sales.filter(x=>x.sale_kind==='clearance_sale'),'sales_amount');
      const redelivery=num(d.sales.filter(x=>x.sale_kind==='return_redelivery'),'sales_amount');
      const returnCredits=num(d.returns,'financial_credit_amount');
      const grossSales=normal+clearance+redelivery;
      const netSales=grossSales-returnCredits;
      const grossCogs=num(d.cogs,'cogs_amount');
      const reversedCogs=num(d.returnCogs,'returned_cogs');
      const netCogs=grossCogs-reversedCogs;
      const grossMargin=netSales-netCogs;
      const collected=num(d.collections,'amount');
      const fixed=num(d.fixed,'amount');
      const variable=num(d.expenses.filter(x=>x.cost_type==='variable'),'amount');
      const due=d.customers.reduce((s,x)=>s+Number(x.amount_due||0),0);
      const credit=d.customers.reduce((s,x)=>s+Number(x.customer_credit||0),0);
      const supplierDue=d.suppliers.reduce((s,x)=>s+Number(x.payable_balance||0),0);
      const qualityIssues=d.dq.reduce((s,x)=>s+Number(x.issue_count||0),0);
      const ready=num(d.ready,'ready_pieces'), wip=num(d.wip,'wip_pieces');
      const low=d.inventory.filter(x=>x.minimum_stock!=null&&Number(x.current_quantity||0)<=Number(x.minimum_stock)).length;

      const mix=[
        ['مبيعات جديدة',normal,'normal_sale'],
        ['بيع تصفية',clearance,'clearance_sale'],
        ['إعادة تسليم مرتجع',redelivery,'return_redelivery'],
        ['ائتمان مرتجعات',-returnCredits,'return_credit']
      ].map(x=>`<tr><td><b>${x[0]}</b></td><td>${money(x[1])}</td><td>${x[2]}</td></tr>`).join('');

      const warnings=qualityIssues
        ? `<div class="panel note-panel" style="margin-bottom:14px"><h3>تنبيه جودة الداتا</h3><p>يوجد ${qty(qualityIssues)} مشكلة في مؤشرات جودة التقارير. لا تعتمد أرقام الربحية حتى تُغلق.</p></div>`
        : `<div class="panel note-panel" style="margin-bottom:14px"><h3>سلامة طبقة التقارير</h3><p>كل مؤشرات جودة الداتا الحالية = 0.</p></div>`;

      document.getElementById('view').innerHTML=`
        <div class="hero">
          <div><h2>مركز القرار</h2><p>كل الأرقام أدناه مشتقة من الـReporting Views والحركات الأصلية.</p></div>
          <div class="hero-actions"><button class="button secondary" id="applyReportFilter">تحديث الفترة</button></div>
        </div>
        <div class="toolbar">
          <label style="flex:1;max-width:240px">من<input id="reportFrom" type="date" value="${from}"></label>
          <label style="flex:1;max-width:240px">إلى<input id="reportTo" type="date" value="${to}"></label>
        </div>
        ${warnings}
        <div class="stats-grid">
          ${statCard('↗','صافي المبيعات',money(netSales),`${money(grossSales)} قبل المرتجعات`)}
          ${statCard('▣','صافي COGS',money(netCogs),`${money(reversedCogs)} عكس تكلفة مرتجعات`)}
          ${statCard('◆','الهامش الإجمالي',money(grossMargin),'بعد تكلفة البيع التاريخية')}
          ${statCard('✓','التحصيلات',money(collected),'داخل الفترة')}
        </div>
        <div class="stats-grid">
          ${statCard('●','مستحق العملاء',money(due),`${money(credit)} رصيد لصالح العملاء`)}
          ${statCard('▰','مستحق الموردين',money(supplierDue),'بعد الأرصدة الافتتاحية')}
          ${statCard('◈','READY',qty(ready),'قطعة')}
          ${statCard('▤','WIP',qty(wip),'قطعة')}
        </div>
        <div class="two-col">
          <div class="panel"><div class="panel-head"><div><h3>تفكيك المبيعات</h3><span>مهم لمنع إعادة التسليم من تضخيم المبيعات الجديدة.</span></div></div>
            ${table(['البند','القيمة','النوع'],mix,'لا توجد مبيعات في الفترة.')}
          </div>
          <div class="panel"><h3>التكاليف التشغيلية</h3>
            <div class="report-line"><span>مصروفات ثابتة</span><b>${money(fixed)}</b></div>
            <div class="report-line"><span>مصروفات متغيرة</span><b>${money(variable)}</b></div>
            <div class="report-line"><span>مخزون منخفض</span><b>${qty(low)} صنف</b></div>
            <div class="report-line total"><span>ملاحظة</span><b>صافي الربح النهائي لم يُعتمد بعد</b></div>
          </div>
        </div>
      `;

      document.getElementById('applyReportFilter').onclick=async()=>{
        const a=document.getElementById('reportFrom').value,b=document.getElementById('reportTo').value;
        if(!a||!b||a>b){setStatus('راجع الفترة الزمنية.','error');return;}
        await render(a,b);
      };
    }catch(error){setStatus(`تعذر تحميل التقارير: ${error.message}`,'error');}
  }

  const original=window.reportsView;
  window.reportsView=()=>render();
  window.__masna3iOriginalReportsView=original;
  if(location.hash.replace('#','')==='reports'&&document.getElementById('view'))window.reportsView();
})();