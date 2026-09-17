const SUPABASE_URL = 'https://favitcmfzdlvgtwicxmb.supabase.co';
const SUPABASE_PUBLISHABLE_KEY = 'sb_publishable_to-VILINGqpWLu7Sod8ULQ_YBGMP7MZ';

const client = window.supabase.createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY);
const screen = document.getElementById('screen');
const statusEl = document.getElementById('status');

function status(message) { statusEl.textContent = message || ''; }

function loginScreen(message = '') {
  screen.innerHTML = `
    <h2>تسجيل الدخول</h2>
    <p class="muted">الدخول بحساب المصنع الحقيقي. لا توجد بيانات تجريبية.</p>
    <form id="loginForm">
      <label for="email">البريد الإلكتروني</label>
      <input id="email" type="email" autocomplete="email" required />
      <label for="password">كلمة المرور</label>
      <input id="password" type="password" autocomplete="current-password" required />
      <button type="submit">دخول</button>
    </form>`;
  status(message);
  document.getElementById('loginForm').addEventListener('submit', async (event) => {
    event.preventDefault();
    status('جارٍ تسجيل الدخول…');
    const email = document.getElementById('email').value.trim();
    const password = document.getElementById('password').value;
    const { error } = await client.auth.signInWithPassword({ email, password });
    if (error) return status(`تعذر تسجيل الدخول: ${error.message}`);
    await route();
  });
}

async function route() {
  const { data: { session } } = await client.auth.getSession();
  if (!session) return loginScreen();

  const { data: memberships, error } = await client
    .from('factory_memberships')
    .select('factory_id, role, active')
    .eq('user_id', session.user.id)
    .eq('active', true);

  if (error) return status(`تعذر قراءة صلاحية المصنع: ${error.message}`);
  if (!memberships?.length) return onboardingScreen();
  return dashboardShell(memberships[0]);
}

function onboardingScreen() {
  screen.innerHTML = `
    <h2>الإعداد الأول للمصنع</h2>
    <p class="muted">الحساب مسجل، ولا يوجد مصنع مرتبط به بعد. أنشئ المصنع الأول من هنا.</p>
    <form id="factoryForm">
      <label for="factoryName">اسم المصنع</label>
      <input id="factoryName" required maxlength="120" placeholder="مثال: مصنع النور" />
      <button type="submit">إنشاء المصنع</button>
    </form>
    <button id="logout" class="secondary">تسجيل الخروج</button>`;
  status('');
  document.getElementById('factoryForm').addEventListener('submit', async (event) => {
    event.preventDefault();
    const name = document.getElementById('factoryName').value.trim();
    if (!name) return;
    status('جارٍ إنشاء المصنع…');
    const { data, error } = await client.rpc('create_first_factory', { p_name: name });
    if (error) return status(`تعذر إنشاء المصنع: ${error.message}`);
    status('تم إنشاء المصنع بنجاح.');
    await route();
  });
  document.getElementById('logout').onclick = async () => { await client.auth.signOut(); await route(); };
}

function dashboardShell(membership) {
  screen.innerHTML = `
    <h2>مصنعي</h2>
    <p class="muted">تم تسجيل الدخول. الدور: ${membership.role}</p>
    <p class="muted">هذه نقطة البداية فقط. سنبني العمليات حسب الـCanonical Master، بدون إدخال أي منطق من RETAG.</p>
    <button id="logout">تسجيل الخروج</button>`;
  status('');
  document.getElementById('logout').onclick = async () => { await client.auth.signOut(); await route(); };
}

client.auth.onAuthStateChange(() => route());
route();
