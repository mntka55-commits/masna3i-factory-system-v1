(() => {
async function openingSetupView() {
  const [accounts, customers, suppliers, materials, openings] = await Promise.all([
    fetchOne('money_accounts','id,name,kind,active'),
    fetchOne('customers','id,code,name'),
    fetchOne('suppliers','id,name'),
    fetchOne('materials','id,code,name,kind,unit'),
    fetchOne('opening_balances','id,kind,effective_date,account_id,customer_id,supplier_id,material_id,quantity,unit_cost,amount,notes'),
  ]);
  const activeAccounts=accounts.filter(x=>x.active);
  const used=(kind,id,key)=>openings.some(x=>x.kind===kind && x[key]===id);
  const rows=[
    ...openings.map(x=>{
      const target=x.kind==='cash'||x.kind==='bank'?accounts.find(a=>a.id===x.account_id)?.name:x.kind==='inventory'?materials.find(m=>m.id===x.material_id)?.name:x.kind==='customer_receivable'?customers.find(c=>c.id===x.customer_id)?.name:suppliers.find(s=>s.id===x.supplier_id)?.name;
      const label={cash:'نقدية',bank:'بنك',inventory:'مخزون',customer_receivable:'مديونية عميل',supplier_payable:'مستحق مورد'}[x.kind]||x.kind;
      const value=x.kind==='inventory'?qty(x.quantity)+' '+(materials.find(m=>m.id===x.material_id)?.unit||'')+' × '+money(x.unit_cost):money(x.amount);
      return '<tr><td>'+escapeHtml(label)+'</td><td>'+escapeHtml(target||'—')+'</td><td>'+escapeHtml(x.effective_date)+'</td><td>'+escapeHtml(value)+'</td><td>مسجل</td></tr>';
    })
  ];
  document.getElementById('view').innerHTML=`
    <div class="hero"><div><h2>الإعداد الافتتاحي</h2><p>تسجيل أرصدة بداية المصنع كحركات افتتاحية مستقلة — بدون تعديل مباشر للأرصدة.</p></div></div>
    <div class="panel note-panel"><b>قاعدة التشغيل:</b> الافتتاحي يُسجل مرة واحدة لكل حساب/كيان. الإنتاج لا يحتاج رصيد WIP افتتاحي منفصل؛ يبدأ من أول قصة قص فعلية.</div>
    <div class="panel form-panel">
      <h3>إضافة رصيد افتتاحي</h3>
      <form id="openingForm" class="stack-form">
        <label>نوع الرصيد
          <select id="openingKind" required>
            <option value="cash">نقدية</option><option value="bank">بنك</option><option value="inventory">مخزون</option><option value="customer_receivable">رصيد عميل</option><option value="supplier_payable">رصيد مورد</option>
          </select>
        </label>
        <div id="openingTarget"></div>
        <label>تاريخ الرصيد<input id="openingDate" type="date" value="${new Date().toISOString().slice(0,10)}" required></label>
        <div id="openingValue"></div>
        <label>ملاحظات<input id="openingNotes" maxlength="300" placeholder="اختياري"></label>
        <div class="modal-actions"><button type="submit" class="button" id="saveOpening">حفظ الرصيد الافتتاحي</button></div>
        <div class="global-status" id="openingStatus"></div>
      </form>
    </div>
    <div class="panel"><div class="panel-head"><div><h3>الأرصدة الافتتاحية المسجلة</h3><span>قراءة من الحركات الأصلية.</span></div></div>
      ${table(['النوع','الكيان','التاريخ','القيمة','الحالة'],rows,'لا توجد أرصدة افتتاحية مسجلة حتى الآن.')}
    </div>`;
  const kind=document.getElementById('openingKind'), target=document.getElementById('openingTarget'), value=document.getElementById('openingValue');
  const optionList=(items,placeholder,disabledFn)=>'<label>'+placeholder+'<select id="openingTargetId" required><option value="">اختر</option>'+items.map(x=>'<option value="'+escapeHtml(x.id)+'" '+(disabledFn&&disabledFn(x.id)?'disabled':'')+'>'+escapeHtml(x.code?x.code+' — '+x.name:x.name)+'</option>').join('')+'</select></label>';
  function renderFields(){
    const k=kind.value;
    if(k==='cash'||k==='bank'){
      target.innerHTML=optionList(activeAccounts,'الحساب',id=>used(k,id,'account_id'));
      value.innerHTML='<label>المبلغ الافتتاحي<input id="openingAmount" type="number" min="0.01" step="0.01" required placeholder="مثال: 10000"></label>';
    } else if(k==='inventory'){
      target.innerHTML=optionList(materials,'الخامة',id=>used(k,id,'material_id'));
      value.innerHTML='<div class="two-col"><label>الكمية<input id="openingQuantity" type="number" min="0.01" step="0.01" required></label><label>قيمة الوحدة الافتتاحية<input id="openingUnitCost" type="number" min="0" step="0.01" required></label></div>';
    } else if(k==='customer_receivable'){
      target.innerHTML=optionList(customers,'العميل',id=>used(k,id,'customer_id'));
      value.innerHTML='<label>المبلغ المستحق على العميل<input id="openingAmount" type="number" min="0.01" step="0.01" required></label><small class="field-help">هذا يعني أن العميل مدين للمصنع بهذا المبلغ.</small>';
    } else {
      target.innerHTML=optionList(suppliers,'المورد',id=>used(k,id,'supplier_id'));
      value.innerHTML='<label>المبلغ المستحق للمورد<input id="openingAmount" type="number" min="0.01" step="0.01" required></label><small class="field-help">هذا يعني أن المصنع مدين للمورد بهذا المبلغ.</small>';
    }
  }
  kind.onchange=renderFields; renderFields();
  document.getElementById('openingForm').onsubmit=async e=>{
    e.preventDefault();
    const button=document.getElementById('saveOpening'), status=document.getElementById('openingStatus'), k=kind.value, targetId=document.getElementById('openingTargetId')?.value;
    if(!targetId) return status.textContent='اختر الحساب أو الكيان أولًا.';
    const params={p_kind:k,p_effective_date:document.getElementById('openingDate').value,p_account_id:null,p_customer_id:null,p_supplier_id:null,p_material_id:null,p_quantity:null,p_unit_cost:null,p_amount:null,p_notes:document.getElementById('openingNotes').value.trim()||null};
    if(k==='cash'||k==='bank'){params.p_account_id=targetId;params.p_amount=Number(document.getElementById('openingAmount').value||0);}
    if(k==='inventory'){params.p_material_id=targetId;params.p_quantity=Number(document.getElementById('openingQuantity').value||0);params.p_unit_cost=Number(document.getElementById('openingUnitCost').value||0);}
    if(k==='customer_receivable'){params.p_customer_id=targetId;params.p_amount=Number(document.getElementById('openingAmount').value||0);}
    if(k==='supplier_payable'){params.p_supplier_id=targetId;params.p_amount=Number(document.getElementById('openingAmount').value||0);}
    button.disabled=true;button.textContent='جارٍ الحفظ…';status.textContent='';
    const {error}=await client.rpc('post_opening_balance',params);
    if(error){status.textContent='تعذر حفظ الرصيد: '+error.message;button.disabled=false;button.textContent='حفظ الرصيد الافتتاحي';return;}
    setStatus('تم تسجيل الرصيد الافتتاحي كحركة مستقلة.','info'); await renderRoute(true);
  };
}
window.openingSetupView=openingSetupView;
})();