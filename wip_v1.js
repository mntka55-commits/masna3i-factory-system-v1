(() => {
  const SUPABASE_URL = 'https://favitcmfzdlvgtwicxmb.supabase.co';
  const SUPABASE_PUBLISHABLE_KEY = 'sb_publishable_to-VILINGqpWLu7Sod8ULQ_YBGMP7MZ';
  const client = window.__masna3iClient || window.supabase.createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY);
  window.__masna3iClient = client;

  function getRowContext(button) {
    const row = button.closest('tr');
    if (!row) return null;
    const code = row.querySelector('td:first-child b')?.textContent?.trim();
    const input = row.querySelector('input.inline-input');
    const pieces = Number(input?.value || 0);
    return { code, pieces };
  }

  async function moveToReady(button) {
    const context = getRowContext(button);
    if (!context?.code) return alert('تعذر تحديد الموديل. حدّث الصفحة وحاول مرة أخرى.');
    if (!Number.isInteger(context.pieces) || context.pieces <= 0) {
      return alert('اكتب عدد القطع المراد تحويلها إلى READY أولاً.');
    }

    button.disabled = true;
    button.textContent = 'جارٍ التحويل…';

    try {
      const { data: models, error: modelError } = await client
        .from('models')
        .select('id,code')
        .eq('code', context.code)
        .limit(1);
      if (modelError) throw modelError;
      if (!models?.length) throw new Error('الموديل غير موجود.');

      const { data: lots, error: lotError } = await client
        .from('wip_lots')
        .select('id,remaining_pieces,created_at')
        .eq('model_id', models[0].id)
        .gt('remaining_pieces', 0)
        .order('created_at', { ascending: true })
        .order('id', { ascending: true })
        .limit(1);
      if (lotError) throw lotError;
      if (!lots?.length) throw new Error('لا توجد كمية WIP متاحة لهذا الموديل.');
      if (context.pieces > Number(lots[0].remaining_pieces)) {
        throw new Error(`لا يمكن تحويل ${context.pieces} قطعة؛ المتاح في WIP هو ${lots[0].remaining_pieces} فقط.`);
      }

      const { error: rpcError } = await client.rpc('post_wip_to_ready', {
        p_wip_lot_id: lots[0].id,
        p_pieces: context.pieces,
      });
      if (rpcError) throw rpcError;

      alert(`تم تحويل ${context.pieces} قطعة إلى READY بنجاح.`);
      location.hash = 'wip';
      location.reload();
    } catch (error) {
      button.disabled = false;
      button.textContent = 'تحويل إلى READY';
      alert(`تعذر التحويل: ${error.message || 'حدث خطأ غير معروف.'}`);
    }
  }

  document.addEventListener('click', (event) => {
    const button = event.target.closest('button.table-button');
    if (!button) return;
    if (!button.textContent.includes('تحويل إلى READY')) return;
    event.preventDefault();
    event.stopPropagation();
    moveToReady(button);
  }, true);


  async function wipView() {
    const rows = await fetchOne('v_wip_balances', 'model_id,model_code,model_name,wip_pieces');
    const tr = rows.map((r) => `<tr><td><b>${escapeHtml(r.model_code)}</b><br><span class="subtext">${escapeHtml(r.model_name)}</span></td><td>${qty(r.wip_pieces)}</td><td><input class="inline-input" value="0" min="0" type="number" /></td><td><button class="table-button">تحويل إلى READY</button></td></tr>`);
    document.getElementById('view').innerHTML = `<div class="hero"><div><h2>WIP</h2><p>القطع تحت التجهيز والتحويل إلى READY.</p></div><span class="read-rule">التحويل الجزئي مسموح، ولا يمكن تجاوز المتاح في WIP.</span></div><div class="stats-grid">${statCard('▤','إجمالي WIP',qty(rows.reduce((s,r)=>s+Number(r.wip_pieces||0),0)),'قطعة تحت التجهيز')}${statCard('◈','عدد الموديلات',qty(rows.length),'بها WIP')}</div><div class="panel">${table(['الموديل','WIP','تحويل مقترح','الإجراء'], tr, 'لا توجد قطع تحت التجهيز حتى الآن.')}</div>`;
  }
  window.wipView = wipView;
})();
