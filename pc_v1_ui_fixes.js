(() => {
  if (window.__masna3iPcUiFixes) return;
  window.__masna3iPcUiFixes = true;

  function applyModelFilter() {
    const search = document.getElementById('modelSearch');
    const view = search?.closest('#view');
    if (!search || !view) return;

    const query = search.value.trim().toLocaleLowerCase('ar');
    const active = view.querySelector('.filter-chips .chip.active')?.dataset.modelFilter || 'all';
    const rows = [...view.querySelectorAll('table tbody tr')];

    rows.forEach((row) => {
      if (row.children.length < 4) return;
      const code = row.children[0]?.textContent || '';
      const name = row.children[1]?.textContent || '';
      const wip = Number((row.children[2]?.textContent || '').replace(/[^0-9.-]/g, '')) || 0;
      const ready = Number((row.children[3]?.textContent || '').replace(/[^0-9.-]/g, '')) || 0;
      const text = (code + ' ' + name).toLocaleLowerCase('ar');
      const matchesQuery = !query || text.includes(query);
      const matchesFilter =
        active === 'all' ||
        (active === 'wip' && wip > 0) ||
        (active === 'ready' && ready > 0);

      row.hidden = !(matchesQuery && matchesFilter);
    });

    const body = view.querySelector('table tbody');
    if (!body) return;

    const visible = rows.some((row) => !row.hidden && row.children.length >= 4);
    let empty = view.querySelector('[data-model-filter-empty]');

    if (!visible && rows.length) {
      if (!empty) {
        empty = document.createElement('tr');
        empty.dataset.modelFilterEmpty = 'true';
        empty.innerHTML = '<td colspan="7"><div class="empty-state compact"><b>لا توجد نتائج مطابقة</b><span>غيّر كلمة البحث أو حالة العرض.</span></div></td>';
        body.appendChild(empty);
      }
      empty.hidden = false;
    } else if (empty) {
      empty.hidden = true;
    }
  }

  function prepareModelChips() {
    document.querySelectorAll('#view .filter-chips .chip').forEach((chip) => {
      if (!chip.dataset.modelFilter) {
        const label = chip.textContent.trim();
        chip.dataset.modelFilter = label === 'قيد الإنتاج' ? 'wip' : label === 'جاهز' ? 'ready' : 'all';
      }
      chip.setAttribute('role', 'button');
      chip.setAttribute('tabindex', '0');
      chip.setAttribute('aria-pressed', chip.classList.contains('active') ? 'true' : 'false');
    });
  }

  let navigationTimer = null;
  document.addEventListener('click', (event) => {
    const button = event.target.closest?.('[data-nav]');
    if (!button) return;
    const key = button.dataset.nav;
    if (!key) return;

    event.preventDefault();
    event.stopImmediatePropagation();
    clearTimeout(navigationTimer);
    navigationTimer = window.setTimeout(() => {
      if (location.hash !== '#' + key) location.hash = key;
    }, 60);
  }, true);

  document.addEventListener('input', (event) => {
    if (event.target?.id === 'modelSearch') applyModelFilter();
  }, true);

  document.addEventListener('click', (event) => {
    const chip = event.target.closest?.('#view .filter-chips .chip');
    if (!chip) return;

    prepareModelChips();
    document.querySelectorAll('#view .filter-chips .chip').forEach((button) => {
      const active = button === chip;
      button.classList.toggle('active', active);
      button.setAttribute('aria-pressed', active ? 'true' : 'false');
    });
    applyModelFilter();
  }, true);

  document.addEventListener('keydown', (event) => {
    if (!['Enter', ' '].includes(event.key)) return;
    const chip = event.target.closest?.('#view .filter-chips .chip');
    if (!chip) return;
    event.preventDefault();
    chip.click();
  }, true);

  function enforceOpeningSetup() {
    if (location.hash !== '#opening-setup') return;
    if (typeof window.openingSetupView !== 'function') return;
    window.setTimeout(() => {
      if (location.hash === '#opening-setup') window.openingSetupView();
    }, 180);
  }

  window.addEventListener('hashchange', enforceOpeningSetup);

  window.setTimeout(() => {
    prepareModelChips();
    applyModelFilter();
    enforceOpeningSetup();
  }, 0);
})();
