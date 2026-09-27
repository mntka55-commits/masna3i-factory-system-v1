(() => {
  if (window.__masna3iBooted) return;
  window.__masna3iBooted = true;
  window.route?.();
})();
