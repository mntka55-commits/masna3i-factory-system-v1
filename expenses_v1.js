(() => {
  const factoryMoneyLabel = (kind) => kind === 'cash' ? 'نقدية' : kind === 'bank' ? 'بنك' : (kind || '—');

  window.expensesView = async function expensesViewV1() {
    const [expenses, categories, accounts, moneyBalances] = await Promise.all([
      fetchOne('expenses', 'id,expense_number,category_id,expense_date,amount,cost_type,account_id,description,notes,created_at'),
      fetchOne('expense_categories', 'id,name,default_cost_type,active,created_at'),
      fetchOne('money_accounts', 'id,name,kind,active,created_at'),
      fetchOne('v_money_balances', 'account_id,name,kind,active,balance'),
    ]);

    const activeCategories = categories.filter((c) => c.active);
    const activeAccounts = accounts.filter((a) => a.active);
    const balanceByAccount = new Map(moneyBalances.map((a) => [a.account_id, a]));
    const total = expenses.reduce((s, e) => s + Number(e.amount || 0), 0);
    const fixedTotal = expenses.filter((e) => e.cost_type === 'fixed').reduce((s, e) => s + Number(e.amount || 0), 0);
    const variableTotal = expenses.filter((e) => e.cost_type === 'variable').reduce((s, e) => s + Number(e.amount || 0), 0);

    const rows = expenses
      .slice()
      .sort((a, b) => String(b.expense_date || b.created_at || '').localeCompare(String(a.expense_date || a.created_at || '')))
      .map((e) => {
        const category = categories.find((c) => c.id === e.category_id);
        const account = accounts.find((a) => a.id === e.account_id);
        return `<tr>
          <td><b>${escapeHtml(e.expense_number)}</b></td>
          <td>${escapeHtml(e.expense_date || '—')}</td>
          <td>${escapeHtml(category?.name || '—')}</td>
          <td>${e.cost_type === 'fixed' ? 'ثابت' : e.cost_type === 'variable' ? 'متغير' : escapeHtml(e.cost_type || '—')}</td>
          <td><b>${money(e.amount)}</b></td>
          <td>${escapeHtml(account?.name || '—')}</td>
          <td>${escapeHtml(e.description || '—')}</td>
        </tr>`;
      });

    const categoryRows = categories
      .slice()
      .sort((a, b) => Number(b.active) - Number(a.active) || String(a.name || '').localeCompare(String(b.name || '')))
      .map((c) => `<tr>
        <td><b>${escapeHtml(c.name)}</b></td>
        <td>${c.default_cost_type === 'variable' ? 'متغير' : 'ثابت'}</td>
        <td>${c.active ? '<span class="status-pill ok">نشط</span>' : '<span class="status-pill neutral">موقوف</span>'}</td>
      </tr>`);

    const accountRows = activeAccounts.map((a) => {
      const balance = balanceByAccount.get(a.id);
      return `<tr>
        <td><b>${escapeHtml(a.name)}</b></td>
        <td>${factoryMoneyLabel(a.kind)}</td>
        <td><b>${money(balance?.balance || 0)}</b></td>
      </tr>`;
    });

    document.getElementById('view').innerHTML = `
      <div class="hero">
        <div>
          <h2>المصروفات</h2>
          <p>المصروف حركة مالية مستقلة وتُنشئ خروجًا من حساب النقدية/البنك المختار.</p>
        </div>
        <div class="hero-actions">
          <button class="button secondary" id="openExpenseCategoryForm">＋ تصنيف مصروف</button>
          <button class="button" id="openExpenseForm">＋ تسجيل مصروف</button>
        </div>
      </div>

      <div class="stats-grid">
        ${statCard('▥','إجمالي المصروفات',money(total),`${qty(expenses.length)} حركة`)}
        ${statCard('●','مصروفات ثابتة',money(fixedTotal),'لا تدخل في تكلفة الموديل')}
        ${statCard('↗','مصروفات متغيرة',money(variableTotal),'منفصلة عن تكلفة الموديل')}
        ${statCard('▣','حسابات الدفع',qty(activeAccounts.length),'نقدية / بنك نشطة')}
      </div>

      ${!activeCategories.length ? `
        <div class="panel note-panel">
          <h3>ابدأ بإعداد تصنيف مصروف</h3>
          <p>لا توجد تصنيفات نشطة حاليًا. أضف تصنيفًا مثل كهرباء، إيجار، صيانة أو خامات تشغيلية ثم سجّل الحركة.</p>
          <button class="button secondary" id="openExpenseCategoryEmpty">＋ إضافة أول تصنيف</button>
        </div>` : ''}

      ${!activeAccounts.length ? `
        <div class="panel note-panel">
          <h3>لا يوجد حساب نقدية/بنك</h3>
          <p>لا يمكن ترحيل مصروف بدون حساب دفع. أنشئ الحساب من شاشة الحسابات ثم أضف الرصيد الافتتاحي من مسار الإعداد.</p>
          <button class="button secondary" data-nav="accounts">فتح الحسابات</button>
        </div>` : ''}

      <div class="two-col">
        <div class="panel">
          <div class="panel-head">
            <div><h3>حسابات الدفع</h3><span>الرصيد هنا مشتق من حركات النقدية/البنك الأصلية.</span></div>
          </div>
          ${table(['الحساب','النوع','الرصيد الحالي'], accountRows, 'لا توجد حسابات نقدية أو بنكية نشطة.')}
        </div>
        <div class="panel">
          <div class="panel-head">
            <div><h3>تصنيفات المصروفات</h3><span>التصنيف يحدد المقترح الأولي لنوع التكلفة ويمكن تغييره عند تسجيل المصروف.</span></div>
          </div>
          ${table(['التصنيف','النوع الافتراضي','الحالة'], categoryRows, 'لا توجد تصنيفات.')}
        </div>
      </div>

      <div class="panel">
        <div class="panel-head">
          <div><h3>حركات المصروفات</h3><span>كل حركة مرتبطة بتصنيف ونوع تكلفة وحساب نقدية/بنكية.</span></div>
        </div>
        ${table(['رقم المصروف','التاريخ','التصنيف','نوع التكلفة','القيمة','الحساب','الوصف'], rows, 'لا توجد مصروفات مسجلة حتى الآن.')}
      </div>
    `;

    const openCategoryForm = () => {
      document.body.insertAdjacentHTML('beforeend', `
        <div class="modal-backdrop" id="expenseCategoryModal">
          <div class="modal-card" role="dialog" aria-modal="true" aria-labelledby="expenseCategoryTitle">
            <div class="modal-head">
              <div><h3 id="expenseCategoryTitle">إضافة تصنيف مصروف</h3><span>سيظهر التصنيف فورًا في نموذج تسجيل المصروف.</span></div>
              <button class="modal-close" id="closeExpenseCategory">×</button>
            </div>
            <form id="expenseCategoryForm" class="stack-form">
              <label>اسم التصنيف
                <input id="expenseCategoryName" required maxlength="120" placeholder="مثال: كهرباء المصنع" />
              </label>
              <label>النوع الافتراضي
                <select id="expenseCategoryDefaultType" required>
                  <option value="fixed">ثابت</option>
                  <option value="variable">متغير</option>
                </select>
              </label>
              <small class="field-help">هذا اختيار افتراضي فقط؛ يمكن تغييره عند تسجيل المصروف نفسه.</small>
              <div class="modal-actions">
                <button type="button" class="button secondary" id="cancelExpenseCategory">إلغاء</button>
                <button type="submit" class="button" id="saveExpenseCategory">حفظ التصنيف</button>
              </div>
              <div class="global-status" id="expenseCategoryStatus"></div>
            </form>
          </div>
        </div>
      `);

      const modal = document.getElementById('expenseCategoryModal');
      const status = document.getElementById('expenseCategoryStatus');
      const button = document.getElementById('saveExpenseCategory');
      const close = () => modal?.remove();
      document.getElementById('closeExpenseCategory').onclick = close;
      document.getElementById('cancelExpenseCategory').onclick = close;
      modal.addEventListener('click', (e) => { if (e.target === modal) close(); });

      document.getElementById('expenseCategoryForm').addEventListener('submit', async (event) => {
        event.preventDefault();
        const name = document.getElementById('expenseCategoryName').value.trim();
        const defaultType = document.getElementById('expenseCategoryDefaultType').value;
        if (!name) return;
        button.disabled = true;
        button.textContent = 'جارٍ الحفظ…';

        const { error } = await client.from('expense_categories').insert({
          name,
          default_cost_type: defaultType,
          active: true,
        });

        if (error) {
          status.textContent = `تعذر إضافة التصنيف: ${error.message}`;
          button.disabled = false;
          button.textContent = 'حفظ التصنيف';
          return;
        }

        close();
        setStatus('تمت إضافة تصنيف المصروف.', 'info');
        await renderRoute(true);
      });
    };

    document.getElementById('openExpenseCategoryForm').onclick = openCategoryForm;
    document.getElementById('openExpenseCategoryEmpty')?.addEventListener('click', openCategoryForm);

    document.getElementById('openExpenseForm').onclick = () => {
      const today = new Date().toISOString().slice(0, 10);
      const stamp = new Date().toISOString().replace(/[-:TZ.]/g, '').slice(0, 14);
      const categoryOptions = activeCategories.map((cat) =>
        `<option value="${escapeHtml(cat.id)}" data-cost-type="${escapeHtml(cat.default_cost_type || 'fixed')}">${escapeHtml(cat.name)}</option>`
      ).join('');
      const accountOptions = activeAccounts.map((a) =>
        `<option value="${escapeHtml(a.id)}">${escapeHtml(a.name)} — ${escapeHtml(factoryMoneyLabel(a.kind))}</option>`
      ).join('');

      document.body.insertAdjacentHTML('beforeend', `
        <div class="modal-backdrop" id="expenseModal">
          <div class="modal-card" role="dialog" aria-modal="true" aria-labelledby="expenseTitle">
            <div class="modal-head">
              <div><h3 id="expenseTitle">تسجيل مصروف</h3><span>تسجيل المصروف ينشئ حركة خروج من الحساب المختار.</span></div>
              <button class="modal-close" id="closeExpense">×</button>
            </div>
            <form id="expenseForm" class="stack-form">
              <label>رقم المصروف
                <input id="expenseNumber" required maxlength="120" value="EXP-${stamp}" />
              </label>
              <label>التصنيف
                <select id="expenseCategory" required ${activeCategories.length ? '' : 'disabled'}>
                  <option value="">${activeCategories.length ? 'اختر التصنيف' : 'لا توجد تصنيفات نشطة'}</option>
                  ${categoryOptions}
                </select>
              </label>
              <label>نوع التكلفة
                <select id="expenseCostType" required>
                  <option value="fixed">ثابت</option>
                  <option value="variable">متغير</option>
                </select>
                <small class="field-help">يُقترح النوع الافتراضي من التصنيف ويمكن تغييره قبل التسجيل.</small>
              </label>
              <label>المبلغ
                <input id="expenseAmount" type="number" min="0.01" step="0.01" required placeholder="مثال: 500" />
              </label>
              <label>حساب الدفع
                <select id="expenseAccount" required ${activeAccounts.length ? '' : 'disabled'}>
                  <option value="">${activeAccounts.length ? 'اختر النقدية / البنك' : 'لا يوجد حساب نشط'}</option>
                  ${accountOptions}
                </select>
              </label>
              <label>التاريخ
                <input id="expenseDate" type="date" value="${today}" required />
              </label>
              <label>الوصف
                <input id="expenseDescription" maxlength="300" placeholder="مثال: كهرباء المصنع" />
              </label>
              <label>ملاحظات
                <input id="expenseNotes" maxlength="300" placeholder="ملاحظات (اختياري)" />
              </label>
              <div class="modal-actions">
                <button type="button" class="button secondary" id="cancelExpense">إلغاء</button>
                <button type="submit" class="button" id="saveExpense" ${activeCategories.length && activeAccounts.length ? '' : 'disabled'}>حفظ المصروف</button>
              </div>
              <div class="global-status" id="expenseStatus"></div>
            </form>
          </div>
        </div>
      `);

      const modal = document.getElementById('expenseModal');
      const categorySelect = document.getElementById('expenseCategory');
      const costTypeSelect = document.getElementById('expenseCostType');
      const status = document.getElementById('expenseStatus');
      const saveButton = document.getElementById('saveExpense');
      const close = () => modal?.remove();

      categorySelect.addEventListener('change', () => {
        const option = categorySelect.options[categorySelect.selectedIndex];
        const suggested = option?.dataset?.costType;
        if (suggested === 'fixed' || suggested === 'variable') costTypeSelect.value = suggested;
      });

      document.getElementById('closeExpense').onclick = close;
      document.getElementById('cancelExpense').onclick = close;
      modal.addEventListener('click', (e) => { if (e.target === modal) close(); });

      document.getElementById('expenseForm').addEventListener('submit', async (event) => {
        event.preventDefault();
        const expenseNumber = document.getElementById('expenseNumber').value.trim();
        const categoryId = categorySelect.value;
        const costType = costTypeSelect.value;
        const amount = Number(document.getElementById('expenseAmount').value || 0);
        const accountId = document.getElementById('expenseAccount').value;
        if (!expenseNumber) return status.textContent = 'رقم المصروف مطلوب.';
        if (!categoryId) return status.textContent = 'اختر تصنيف المصروف.';
        if (amount <= 0) return status.textContent = 'مبلغ المصروف يجب أن يكون أكبر من صفر.';
        if (!accountId) return status.textContent = 'اختر حساب النقدية/البنك.';
        if (!['fixed','variable'].includes(costType)) return status.textContent = 'اختر نوع التكلفة.';

        saveButton.disabled = true;
        saveButton.textContent = 'جارٍ الحفظ…';

        const { error } = await client.rpc('post_expense', {
          p_expense_number: expenseNumber,
          p_category_id: categoryId,
          p_expense_date: document.getElementById('expenseDate').value,
          p_amount: amount,
          p_cost_type: costType,
          p_account_id: accountId,
          p_description: document.getElementById('expenseDescription').value.trim() || null,
          p_notes: document.getElementById('expenseNotes').value.trim() || null,
        });

        if (error) {
          status.textContent = `تعذر تسجيل المصروف: ${error.message}`;
          saveButton.disabled = false;
          saveButton.textContent = 'حفظ المصروف';
          return;
        }

        close();
        setStatus('تم تسجيل المصروف وتحديث رصيد الحساب.', 'info');
        await renderRoute(true);
      });
    };
    bindInnerNav();
  };
})();
