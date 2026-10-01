(() => {
  if (!document.getElementById('app')) return;
  const today = () => new Date().toISOString().slice(0,10);
  const kindLabel = (k) => k === 'cash' ? 'نقدية' : 'بنك';

  async function loadPaymentData() {
    const [suppliers, balances, accounts, payments] = await Promise.all([
      fetchOne('suppliers','id,name,phone'),
      fetchOne('v_supplier_account_balances','supplier_id,name,payable_balance,purchases,payments,returns_total'),
      fetchOne('money_accounts','id,name,kind,active'),
      fetchOne('supplier_payments','id,supplier_id,payment_date,account_id,amount,reference,notes,created_at')
    ]);
    return {suppliers, balances, accounts:accounts.filter(a=>a.active), payments};
  }

  async function openSupplierPaymentModal(preselected='') {
    const d = await loadPaymentData();
    document.getElementById('supplierPaymentModal')?.remove();
    const supplierOptions = d.suppliers.map(s=>`<option value="${escapeHtml(s.id)}">${escapeHtml(s.name)}</option>`).join('');
    const accountOptions = d.accounts.map(a=>`<option value="${escapeHtml(a.id)}">${escapeHtml(a.name)} — ${kindLabel(a.kind)}</option>`).join('');
    const modal = document.createElement('div');
    modal.id='supplierPaymentModal'; modal.className='modal-backdrop';
    modal.innerHTML=`
      <div class="modal-card" role="dialog" aria-modal="true">
        <div class="modal-head"><div><span class="eyebrow">دفعات الموردين</span><h3>تسجيل دفعة للمورد</h3><span>الحركة تُسجل على حساب المورد مباشرة. الفواتير للمراجعة فقط.</span></div><button type="button" class="modal-close" id="closeSupplierPayment">×</button></div>
        <form id="supplierPaymentForm" class="modal-form">
          <label>المورد<select id="supplierPaymentSupplier" required><option value="">اختر المورد</option>${supplierOptions}</select></label>
          <div class="panel" style="margin-bottom:12px;background:#f7f8fa"><div class="panel-head"><div><h3>الرصيد الحالي للمورد</h3><span id="supplierBalanceHint">اختر المورد لعرض الحساب الفعلي.</span></div><strong id="supplierBalanceValue">0 ج</strong></div></div>
          <label>مبلغ الدفعة<input id="supplierPaymentAmount" type="number" min="0.01" step="0.01" placeholder="مثال: 1000" required/><small class="field-help">يُخصم من رصيد المورد، وليس من فاتورة محددة.</small></label>
          <div class="panel" style="margin-bottom:12px;background:#f7f8fa"><div class="panel-head"><div><h3>الرصيد بعد الدفع</h3><span>معاينة قبل الحفظ.</span></div><strong id="supplierAfterPaymentValue">0 ج</strong></div></div>
          <label>الحساب الذي خرجت منه الدفعة<select id="supplierPaymentAccount" required ${d.accounts.length?'':'disabled'}><option value="">${d.accounts.length?'اختر النقدية / البنك':'لا يوجد حساب نشط'}</option>${accountOptions}</select></label>
          <div class="form-grid"><label>تاريخ الدفع<input id="supplierPaymentDate" type="date" value="${today()}" required/></label><label>المرجع<input id="supplierPaymentReference" maxlength="120" placeholder="رقم إيصال / تحويل (اختياري)"/></label></div>
          <label>ملاحظات<textarea id="supplierPaymentNotes" rows="2" maxlength="300" placeholder="ملاحظات اختيارية"></textarea></label>
          <div class="modal-actions"><button type="button" class="button secondary" id="cancelSupplierPayment">إلغاء</button><button type="submit" class="button" id="saveSupplierPayment" ${d.accounts.length?'':'disabled'}>حفظ الدفعة</button></div>
          <div id="supplierPaymentStatus" class="modal-status"></div>
        </form>
      </div>`;
    document.body.appendChild(modal);

    const supplier=modal.querySelector('#supplierPaymentSupplier');
    const amount=modal.querySelector('#supplierPaymentAmount');
    const balanceValue=modal.querySelector('#supplierBalanceValue');
    const afterValue=modal.querySelector('#supplierAfterPaymentValue');
    const hint=modal.querySelector('#supplierBalanceHint');
    const status=modal.querySelector('#supplierPaymentStatus');
    const save=modal.querySelector('#saveSupplierPayment');
    const balance=()=>Number(d.balances.find(b=>b.supplier_id===supplier.value)?.payable_balance||0);
    const refresh=()=>{
      const b=balance(), n=Number(amount.value||0), s=d.suppliers.find(x=>x.id===supplier.value);
      balanceValue.textContent=money(b); afterValue.textContent=money(Math.max(b-n,0));
      hint.textContent=s ? 'الحساب الفعلي للمورد: '+s.name : 'اختر المورد لعرض الحساب الفعلي.';
      status.className='modal-status'; status.textContent=n>b&&b>0?'مبلغ الدفعة أكبر من رصيد المورد الحالي.':'';
    };
    const close=()=>modal.remove();
    modal.querySelector('#closeSupplierPayment').onclick=close;
    modal.querySelector('#cancelSupplierPayment').onclick=close;
    supplier.value=preselected||'';
    supplier.addEventListener('change',refresh); supplier.addEventListener('input',refresh); amount.addEventListener('input',refresh);
    refresh();

    modal.querySelector('#supplierPaymentForm').addEventListener('submit',async e=>{
      e.preventDefault();
      const sid=supplier.value, n=Number(amount.value||0), b=balance(), aid=modal.querySelector('#supplierPaymentAccount').value;
      if(!sid)return status.textContent='اختر المورد أولًا.';
      if(!(n>0))return status.textContent='مبلغ الدفعة يجب أن يكون أكبر من صفر.';
      if(n>b)return status.textContent='مبلغ الدفعة أكبر من رصيد المورد الحالي.';
      if(!aid)return status.textContent='اختر الحساب الذي خرجت منه الدفعة.';
      save.disabled=true; save.textContent='جارٍ الحفظ…'; status.className='modal-status info'; status.textContent='جارٍ تسجيل الحركة على حساب المورد…';
      try{
        const {error}=await client.rpc('post_supplier_payment_account',{
          p_supplier_id:sid,p_amount:n,p_payment_date:modal.querySelector('#supplierPaymentDate').value,
          p_account_id:aid,p_reference:modal.querySelector('#supplierPaymentReference').value.trim()||null,
          p_notes:modal.querySelector('#supplierPaymentNotes').value.trim()||null
        });
        if(error)throw error;
        close(); clearReadCache(); await renderRoute(true); setStatus('تم تسجيل الدفعة على حساب المورد الفعلي بنجاح.','info');
      }catch(err){status.className='modal-status error';status.textContent='تعذر تسجيل الدفعة: '+err.message;save.disabled=false;save.textContent='حفظ الدفعة';}
    });
  }

  async function supplierPaymentsView(){
    const d=await loadPaymentData(), map=new Map(d.balances.map(b=>[b.supplier_id,b]));
    const total=d.balances.reduce((s,b)=>s+Math.max(Number(b.payable_balance||0),0),0);
    const paid=d.payments.reduce((s,p)=>s+Number(p.amount||0),0);
    const balanceRows=d.suppliers.map(s=>{const b=map.get(s.id)||{};return `<tr><td><b>${escapeHtml(s.name)}</b></td><td>${escapeHtml(s.phone||'—')}</td><td><b>${money(Math.max(Number(b.payable_balance||0),0))}</b></td><td><button type="button" class="button secondary" data-pay-supplier="${escapeHtml(s.id)}">سداد للمورد</button></td></tr>`});
    const payRows=d.payments.slice().sort((a,b)=>String(b.payment_date||b.created_at||'').localeCompare(String(a.payment_date||a.created_at||''))).map(p=>`<tr><td>${escapeHtml(p.payment_date||p.created_at?.slice(0,10)||'—')}</td><td><b>${escapeHtml(d.suppliers.find(s=>s.id===p.supplier_id)?.name||'—')}</b></td><td><b>${money(p.amount)}</b></td><td>${escapeHtml(d.accounts.find(a=>a.id===p.account_id)?.name||'—')}</td><td>${escapeHtml(p.reference||'—')}</td></tr>`);
    document.getElementById('view').innerHTML=`
      <div class="hero"><div><h2>دفعات الموردين</h2><p>الحركة المالية الفعلية تُسجل على حساب المورد. الفواتير للتنظيم والمراجعة.</p></div><button class="button" id="openSupplierPaymentForm">＋ تسجيل دفعة</button></div>
      <div class="stats-grid">${statCard('▰','إجمالي المستحق للموردين',money(total),`${qty(d.suppliers.length)} مورد`)}${statCard('✓','إجمالي المدفوعات المسجلة',money(paid),'حركات فعلية')}${statCard('●','الموردون',qty(d.suppliers.length),'حسابات الموردين')}${statCard('▣','حسابات الدفع النشطة',qty(d.accounts.length),'نقدية / بنك')}</div>
      <div class="panel"><div class="panel-head"><div><h3>أرصدة الموردين</h3><span>السداد هنا يُخصم من الرصيد الفعلي للمورد مباشرة.</span></div></div>${table(['المورد','الهاتف','الرصيد الحالي','الإجراء'],balanceRows,'لا يوجد موردون مسجلون حتى الآن.')}</div>
      <div class="panel" style="margin-top:14px"><div class="panel-head"><div><h3>آخر الدفعات</h3><span>كل دفعة حركة مستقلة في حساب المورد والحساب المالي.</span></div></div>${table(['التاريخ','المورد','القيمة','الحساب','المرجع'],payRows,'لا توجد دفعات مسجلة حتى الآن.')}</div>`;
    document.getElementById('openSupplierPaymentForm').onclick=()=>openSupplierPaymentModal();
    document.querySelectorAll('[data-pay-supplier]').forEach(b=>b.onclick=()=>openSupplierPaymentModal(b.dataset.paySupplier));
  }
  window.supplierPaymentsView=supplierPaymentsView;
  window.__openSupplierPaymentModal=openSupplierPaymentModal;
})();