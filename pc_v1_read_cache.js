(() => {
  if (!window.supabase?.createClient || window.__masna3iReadCachePatch) return;

  const originalCreateClient = window.supabase.createClient.bind(window.supabase);
  const cache = new Map();
  const TTL = 4000;
  const MUTATIONS = new Set(['insert', 'update', 'upsert', 'delete']);

  function cacheKey(table, selectArgs) {
    return `${table}|select|${JSON.stringify(selectArgs || [])}`;
  }

  function wrapBuilder(builder, table, ops = []) {
    if (!builder || typeof builder !== 'object') return builder;

    return new Proxy(builder, {
      get(target, prop, receiver) {
        if (prop === 'then') {
          const selectOp = ops.length === 1 && ops[0][0] === 'select';
          if (!selectOp) {
            const then = Reflect.get(target, prop, receiver);
            return typeof then === 'function' ? then.bind(target) : then;
          }

          const key = cacheKey(table, ops[0][1]);
          const cached = cache.get(key);
          const now = Date.now();

          if (cached && now - cached.at < TTL) {
            return (onFulfilled, onRejected) => Promise.resolve(cached.result).then(onFulfilled, onRejected);
          }

          const then = Reflect.get(target, prop, receiver);
          return (onFulfilled, onRejected) => then.call(
            target,
            (result) => {
              cache.set(key, { at: Date.now(), result });
              return onFulfilled ? onFulfilled(result) : result;
            },
            onRejected,
          );
        }

        const value = Reflect.get(target, prop, receiver);
        if (typeof value !== 'function') return value;

        return (...args) => {
          if (MUTATIONS.has(prop)) {
            cache.clear();
            return value.apply(target, args);
          }

          const next = value.apply(target, args);
          if (prop === 'select' && ops.length === 0) {
            return wrapBuilder(next, table, [['select', args]]);
          }

          return ops.length ? wrapBuilder(next, table, [...ops, [prop, args]]) : next;
        };
      },
    });
  }

  window.supabase.createClient = (...args) => {
    const client = originalCreateClient(...args);
    const originalFrom = client.from.bind(client);

    client.from = (table) => wrapBuilder(originalFrom(table), table);
    return client;
  };

  window.__masna3iReadCachePatch = { cache, ttl: TTL };
})();
