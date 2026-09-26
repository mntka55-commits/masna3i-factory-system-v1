(() => {
  const GROUPS = [
    { label: 'الرئيسية', ids: ['dashboard'] },
    { label: 'الإنتاج', ids: ['models', 'cutting', 'wip', 'ready'] },
    { label: 'المخزون والشراء', ids: ['inventory', 'purchases'] },
    { label: 'المبيعات والتحصيل', ids: ['sales', 'invoices', 'collections', 'returns'] },
    { label: 'الحسابات والتقارير', ids: ['accounts', 'opening-setup', 'customers', 'suppliers', 'supplier-payments', 'reports'] },
  ];

  function enhanceShell() {
    const nav = document.querySelector('.sidebar nav');
    if (!nav) return;
    const expected = ['dashboard','models','cutting','wip','ready','inventory','purchases','sales','invoices','collections','returns','accounts','customers','suppliers','reports'];
    const existing = new Map([...nav.querySelectorAll('.nav-item')].map((button) => [button.dataset.nav, button]));
    expected.forEach((id) => { if (!existing.has(id)) { const button = document.querySelector(`.nav-item[data-nav="${id}"]`); if (button) existing.set(id, button); } });

    if (nav.dataset.cohesionReady !== '1') {
      const buttons = new Map(
        [...nav.querySelectorAll('.nav-item')].map((button) => [button.dataset.nav, button]),
      );

      nav.innerHTML = '';
      GROUPS.forEach((group, index) => {
        const section = document.createElement('div');
        section.className = 'nav-group';
        if (index > 0) section.classList.add('with-divider');

        const label = document.createElement('div');
        label.className = 'nav-group-label';
        label.textContent = group.label;
        section.appendChild(label);

        group.ids.forEach((id) => {
          const button = buttons.get(id);
          if (button) section.appendChild(button);
        });

        nav.appendChild(section);
      });

      nav.dataset.cohesionReady = '1';
    }

    const dateNode = document.querySelector('.user-chip small');
    if (dateNode) {
      const today = new Intl.DateTimeFormat('en-US', { dateStyle: 'medium' }).format(new Date());
      if (dateNode.textContent !== today) dateNode.textContent = today;
    }
  }

  window.__masna3iEnhanceShell = enhanceShell;
  enhanceShell();
})();
