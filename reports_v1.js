(() => {
  const client = window.__masna3iClient || window.supabase?.createClient?.(
    'https://favitcmfzdlvgtwicxmb.supabase.co',
    'sb_publishable_to-VILINGqpWLu7Sod8ULQ_YBGMP7MZ'
  );
  if (!client) return;
  window.__masna3iClient = client;

  const iso = (d) => d.toISOString().slice(0, 10);
  const monthAgo = () => {
    const d = new Date();
    d.setDate(d.getDate() - 29);
    return iso(d);
  };
  const today = () => iso(new Date());

  const esc = (value) => String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');

  const sum = (rows, key) => rows.reduce((total, row) => total + Number(row?.[key] || 0), 0);

  async function load(from, to) {
    const [daily, models, inventory, customers, suppliers, dq, ready, wip, moneyBalances] = await Promise.all([
      client
        .from('v_reporting_daily_financials')
        .select('report_date,normal_sales,clearance_sales,return_redelivery_sales,gross_sales,return_credits,net_sales,historical_cogs,returned_cogs,net_cogs,gross_margin,collections,fixed_expenses,variable_expenses,operating_expenses')
        .gte('report_date', from)
        .lte('report_date', to)
        .order('report_date', { ascending: true }),
      client
        .from('v_model_sales_performance')
        .select('report_date,sale_kind,model_id,model_code,model_name,pieces,sales_amount,historical_cogs')
        .gte('report_date', from)
        .lte('report_date', to)
        .order('report_date', { ascending: true }),
      client
        .from('v_inventory_valuation')
        .select('material_id,code,name,kind,unit,current_quantity,minimum_stock,inventory_value')
        .order('code', { ascending: true }),
      client
        .from('v_customer_account_balances')
        .select('customer_id,name,net_balance,amount_due,customer_credit'),
      client
        .from('v_supplier_account_balances')
        .select('supplier_id,name,payable_balance'),
      client
        .from('v_reporting_data_quality')
        .select('issue_code,issue_count'),
      client
        .from('v_ready_balances')
        .select('ready_pieces'),
      client
        .from('v_wip_balances')
        .select('wip_pieces'),
      client
        .from('v_money_balances')
        .select('account_id,name,kind,active,balance')
        .eq('active', true)
    ]);

    [daily, models, inventory, customers, suppliers, dq, ready, wip, moneyBalances]
      .forEach((result) => { if (result.error) throw result.error; });

    return {
      daily: daily.data || [],
      models: models.data || [],
      inventory: inventory.data || [],
      customers: customers.data || [],
      suppliers: suppliers.data || [],
      dq: dq.data || [],
      ready: ready.data || [],
      wip: wip.data || [],
      moneyBalances: moneyBalances.data || []
    };
  }

  async function render(from = monthAgo(), to = today()) {
    try {
      const d = await load(from, to);

      const netSales = sum(d.daily, 'net_sales');
      const grossSales = sum(d.daily, 'gross_sales');
      const netCogs = sum(d.daily, 'net_cogs');
      const historicalCogs = sum(d.daily, 'historical_cogs');
      const returnedCogs = sum(d.daily, 'returned_cogs');
      const returnCredits = sum(d.daily, 'return_credits');
      const grossMargin = sum(d.daily, 'gross_margin');
      const collected = sum(d.daily, 'collections');
      const fixed = sum(d.daily, 'fixed_expenses');
      const variable = sum(d.daily, 'variable_expenses');

      const customerDue = d.customers.reduce((total, row) => total + Number(row.amount_due || 0), 0);
      const customerCredit = d.customers.reduce((total, row) => total + Number(row.customer_credit || 0), 0);
      const supplierDue = d.suppliers.reduce((total, row) => total + Number(row.payable_balance || 0), 0);
      const cashBank = d.moneyBalances.reduce((total, row) => total + Number(row.balance || 0), 0);
      const readyPieces = sum(d.ready, 'ready_pieces');
      const wipPieces = sum(d.wip, 'wip_pieces');
      const inventoryValue = sum(d.inventory, 'inventory_value');
      const lowStock = d.inventory.filter(
        row => row.minimum_stock != null && Number(row.current_quantity || 0) <= Number(row.minimum_stock)
      ).length;
      const qualityIssues = sum(d.dq, 'issue_count');

      const salesMix = [
        ['مبيعات عادية', sum(d.daily, 'normal_sales'), 'normal_sale'],
        ['بيع تصفية', sum(d.daily, 'clearance_sales'), 'clearance_sale'],
        ['إعادة تسليم مرتجع', sum(d.daily, 'return_redelivery_sales'), 'return_redelivery'],
        ['ائتمانات مرتجعات', -returnCredits, 'return_credit']
      ].map(([label, amount, kind]) =>
        '<tr><td><b>' + esc(label) + '</b></td><td>' + money(amount) + '</td><td>' + esc(kind) + '</td></tr>'
      ).join('');

      const modelMap = new Map();
      d.models.forEach((row) => {
        const key = row.model_id;
        if (!modelMap.has(key)) {
          modelMap.set(key, {
            code: row.model_code,
            name: row.model_name,
            pieces: 0,
            sales: 0,
            cogs: 0
          });
        }
        const item = modelMap.get(key);
        item.pieces += Number(row.pieces || 0);
        item.sales += Number(row.sales_amount || 0);
        item.cogs += Number(row.historical_cogs || 0);
      });
      const modelRows = [...modelMap.values()]
        .sort((a, b) => b.sales - a.sales)
        .map((row) => '<tr>' +
          '<td><b>' + esc(row.code) + '</b><br><span class="muted">' + esc(row.name) + '</span></td>' +
          '<td>' + qty(row.pieces) + '</td>' +
          '<td>' + money(row.sales) + '</td>' +
          '<td>' + money(row.cogs) + '</td>' +
          '<td>' + money(row.sales - row.cogs) + '</td>' +
          '</tr>'
        ).join('');

      const inventoryRows = d.inventory
        .map((row) => {
          const current = Number(row.current_quantity || 0);
          const minimum = row.minimum_stock == null ? null : Number(row.minimum_stock);
          const isLow = minimum != null && current <= minimum;
          return '<tr>' +
            '<td><b>' + esc(row.code) + '</b><br><span class="muted">' + esc(row.name) + '</span></td>' +
            '<td>' + esc(row.kind) + '</td>' +
            '<td>' + current.toLocaleString('en-US') + ' ' + esc(row.unit) + '</td>' +
            '<td>' + money(row.inventory_value) + '</td>' +
            '<td>' + (isLow ? '<span class="tag danger">منخفض</span>' : '<span class="tag">طبيعي</span>') + '</td>' +
          '</tr>';
        })
        .join('');

      const dailyRows = d.daily
        .slice()
        .reverse()
        .slice(0, 12)
        .map((row) => '<tr>' +
          '<td>' + esc(row.report_date) + '</td>' +
          '<td>' + money(row.net_sales) + '</td>' +
          '<td>' + money(row.net_cogs) + '</td>' +
          '<td>' + money(row.gross_margin) + '</td>' +
          '<td>' + money(row.collections) + '</td>' +
        '</tr>')
        .join('');

      const warnings = qualityIssues
        ? '<div class="panel note-panel" style="margin-bottom:14px"><h3>تنبيه جودة الداتا</h3><p>يوجد ' + qty(qualityIssues) + ' مشكلة في مؤشرات جودة التقارير. لا تعتمد نتائج التقارير حتى تُغلق.</p></div>'
        : '<div class="panel note-panel" style="margin-bottom:14px"><h3>سلامة طبقة التقارير</h3><p>كل مؤشرات جودة الداتا الحالية = 0.</p></div>';

      document.getElementById('view').innerHTML = `
        <div class="hero">
          <div>
            <h2>مركز القرار</h2>
            <p>التقارير النهائية مشتقة من Reporting Views والحركات الأصلية فقط.</p>
          </div>
          <div class="hero-actions"><button class="button secondary" id="applyReportFilter">تحديث الفترة</button></div>
        </div>

        <div class="toolbar">
          <label style="flex:1;max-width:240px">من<input id="reportFrom" type="date" value="${from}"></label>
          <label style="flex:1;max-width:240px">إلى<input id="reportTo" type="date" value="${to}"></label>
        </div>

        ${warnings}

        <div class="stats-grid">
          ${statCard('↗', 'صافي المبيعات', money(netSales), `${money(grossSales)} إجمالي الفواتير قبل ائتمانات المرتجعات`)}
          ${statCard('▣', 'صافي COGS', money(netCogs), `${money(historicalCogs)} تاريخي - ${money(returnedCogs)} عكس مرتجعات`)}
          ${statCard('◆', 'الهامش الإجمالي', money(grossMargin), 'صافي المبيعات - صافي COGS')}
          ${statCard('✓', 'التحصيلات', money(collected), 'داخل الفترة المحددة')}
        </div>

        <div class="stats-grid">
          ${statCard('●', 'مستحق العملاء', money(customerDue), `${money(customerCredit)} رصيد لصالح العملاء`)}
          ${statCard('▰', 'مستحق الموردين', money(supplierDue), 'الرصيد الحالي بعد المردودات والمدفوعات')}
          ${statCard('◈', 'قيمة المخزون', money(inventoryValue), `${qty(lowStock)} صنف عند/تحت الحد الأدنى`)}
          ${statCard('▤', 'النقد والبنك', money(cashBank), 'الرصيد الحالي للحسابات النشطة')}
        </div>

        <div class="two-col">
          <div class="panel">
            <div class="panel-head">
              <div><h3>تفكيك المبيعات</h3><span>إعادة التسليم والخصومات المالية للمرتجعات تظل واضحة منفصلة.</span></div>
            </div>
            ${table(['البند','القيمة','النوع'], salesMix, 'لا توجد حركة مبيعات/مرتجعات في الفترة.')}
          </div>

          <div class="panel">
            <h3>التشغيل الحالي</h3>
            <div class="report-line"><span>READY</span><b>${qty(readyPieces)} قطعة</b></div>
            <div class="report-line"><span>WIP</span><b>${qty(wipPieces)} قطعة</b></div>
            <div class="report-line"><span>مصروفات ثابتة</span><b>${money(fixed)}</b></div>
            <div class="report-line"><span>مصروفات متغيرة</span><b>${money(variable)}</b></div>
            <div class="report-line total"><span>قاعدة V1</span><b>لا يوجد Net Profit كأساس تقريري</b></div>
          </div>
        </div>

        <div class="panel" style="margin-top:14px">
          <div class="panel-head">
            <div><h3>أداء الموديلات خلال الفترة</h3><span>المبيعات والتكلفة التاريخية الملتقطة لحظة البيع.</span></div>
          </div>
          ${table(['الموديل','القطع','المبيعات','التكلفة التاريخية','الفارق الإجمالي'], modelRows, 'لا توجد مبيعات حسب الموديل في الفترة.')}
        </div>

        <div class="two-col" style="margin-top:14px">
          <div class="panel">
            <div class="panel-head"><div><h3>قيمة المخزون الحالي</h3><span>قيمة طبقات المخزون المتبقية، منفصلة عن تكلفة الموديل الحالية.</span></div></div>
            ${table(['الخامة','النوع','الكمية','القيمة','الحالة'], inventoryRows, 'لا يوجد مخزون حالي.')}
          </div>

          <div class="panel">
            <div class="panel-head"><div><h3>المؤشرات اليومية</h3><span>بحسب تاريخ العملية الفعلي، وليس created_at.</span></div></div>
            ${table(['التاريخ','صافي المبيعات','صافي COGS','الهامش الإجمالي','التحصيلات'], dailyRows, 'لا توجد حركة مالية في الفترة.')}
          </div>
        </div>

        <div class="panel" style="margin-top:14px">
          <h3>مرجع المرتجعات</h3>
          <div class="report-line"><span>ائتمانات المرتجعات</span><b>${money(returnCredits)}</b></div>
          <div class="report-line"><span>عكس التكلفة التاريخية</span><b>${money(returnedCogs)}</b></div>
          <div class="report-line"><span>عدد أنواع مشكلات جودة التقارير</span><b>${qty(qualityIssues)}</b></div>
        </div>
      `;

      document.getElementById('applyReportFilter').onclick = async () => {
        const a = document.getElementById('reportFrom').value;
        const b = document.getElementById('reportTo').value;
        if (!a || !b || a > b) {
          setStatus('راجع الفترة الزمنية.', 'error');
          return;
        }
        await render(a, b);
      };
    } catch (error) {
      setStatus(`تعذر تحميل التقارير: ${error.message}`, 'error');
    }
  }

  const original = window.reportsView;
  window.reportsView = () => render();
  window.__masna3iOriginalReportsView = original;

  if (location.hash.replace('#', '') === 'reports' && document.getElementById('view')) {
    window.reportsView();
  }
})();