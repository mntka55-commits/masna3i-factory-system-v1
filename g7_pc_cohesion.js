(() => {
  const GROUPS = [
    { label: 'الرئيسية', ids: ['dashboard'] },
    { label: 'الإنتاج', ids: ['models', 'cutting', 'wip', 'ready'] },
    { label: 'المخزون والشراء', ids: ['inventory', 'purchases'] },
    { label: 'المبيعات والتحصيل', ids: ['sales', 'invoices', 'collections', 'returns'] },
    { label: 'الحسابات والتقارير', ids: ['accounts', 'reports'] },
  ];

  function enhanceShell() {
    const appRoot = document.getElementById('app');
    const nav = document.querySelector('.sidebar nav');
    if (!appRoot || !nav) return;

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
      dateNode.textContent = new Intl.DateTimeFormat('ar-EG', { dateStyle: 'medium' }).format(new Date());
    }

    const active = document.querySelector('.nav-item.active');
    if (active) active.setAttribute('aria-current', 'page');
  }

  const observer = new MutationObserver(enhanceShell);
  observer.observe(document.body, { childList: true, subtree: true });
  enhanceShell();
})();
