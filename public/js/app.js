const API = '';
const TOKEN_KEY = 'forge_token';
const USER_KEY = 'forge_user';
let state = { user: null, token: null };

function loadAuth() {
  const token = localStorage.getItem(TOKEN_KEY);
  const user = localStorage.getItem(USER_KEY);
  if (token && user) { state.token = token; state.user = JSON.parse(user); }
}
function saveAuth(token, user) {
  state.token = token; state.user = user;
  localStorage.setItem(TOKEN_KEY, token);
  localStorage.setItem(USER_KEY, JSON.stringify(user));
  updateNav();
}
function clearAuth() {
  state.token = null; state.user = null;
  localStorage.removeItem(TOKEN_KEY);
  localStorage.removeItem(USER_KEY);
  updateNav();
}
function updateNav() {
  const btnAuth = document.getElementById('btn-auth');
  const btnLogout = document.getElementById('btn-logout');
  const navPost = document.getElementById('nav-post');
  const navMy = document.getElementById('nav-my');
  if (state.user) {
    btnAuth.classList.add('hidden');
    btnLogout.classList.remove('hidden');
    navPost.classList.remove('hidden');
    navMy.classList.remove('hidden');
    btnLogout.textContent = 'Log out (' + state.user.name + ')';
  } else {
    btnAuth.classList.remove('hidden');
    btnLogout.classList.add('hidden');
    navPost.classList.add('hidden');
    navMy.classList.add('hidden');
  }
}
async function api(path, opts) {
  opts = opts || {};
  const headers = { 'Content-Type': 'application/json' };
  if (state.token) headers['Authorization'] = 'Bearer ' + state.token;
  if (opts.headers) Object.assign(headers, opts.headers);
  const res = await fetch(API + path, Object.assign({}, opts, { headers: headers }));
  const data = await res.json().catch(function() { return {}; });
  if (!res.ok) throw new Error(data.error || res.statusText);
  return data;
}
function toast(msg) {
  const el = document.createElement('div');
  el.className = 'toast';
  el.textContent = msg;
  document.body.appendChild(el);
  setTimeout(function() { el.remove(); }, 2800);
}
function getRoute() {
  const path = location.pathname;
  if (path === '/' || path === '') return { name: 'list' };
  if (path === '/post') return { name: 'post' };
  if (path === '/my-jobs') return { name: 'my' };
  const m = path.match(/^\/job\/(\d+)$/);
  if (m) return { name: 'detail', id: m[1] };
  return { name: 'list' };
}
function navigate(path) {
  history.pushState(null, '', path);
  render();
}
function esc(s) {
  if (s == null) return '';
  return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}
function cardHTML(j) {
  const date = new Date(j.created_at).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
  return '<div class="job-card" data-id="' + j.id + '"><div class="job-title">' + esc(j.title) + '</div><div class="job-company">' + esc(j.company) + '</div><div class="job-meta"><span>' + esc(j.location) + '</span>' + (j.salary ? '<span>' + esc(j.salary) + '</span>' : '') + '<span class="badge">' + esc(j.type) + '</span><span>' + date + '</span></div></div>';
}

async function viewList() {
  const main = document.getElementById('main');
  main.innerHTML = '<div class="container"><div class="hero"><h1>Open roles</h1><p>Find work. Post work. No noise.</p><div class="search-bar"><input type="search" id="search-q" placeholder="Search…" /><select id="search-type"><option value="">All types</option><option>Full-time</option><option>Part-time</option><option>Contract</option><option>Remote</option><option>Internship</option></select><input type="text" id="search-location" placeholder="Location" /><button class="btn btn-primary" id="btn-search">Search</button></div></div><div id="job-list" class="job-list"><div class="loading">Loading…</div></div></div>';
  async function load() {
    const q = document.getElementById('search-q').value.trim();
    const type = document.getElementById('search-type').value;
    const location = document.getElementById('search-location').value.trim();
    const params = new URLSearchParams();
    if (q) params.set('q', q);
    if (type) params.set('type', type);
    if (location) params.set('location', location);
    try {
      const jobs = await api('/api/jobs?' + params.toString());
      const list = document.getElementById('job-list');
      if (!jobs.length) { list.innerHTML = '<div class="empty">No jobs yet. Be the first to post.</div>'; return; }
      list.innerHTML = jobs.map(cardHTML).join('');
      list.querySelectorAll('.job-card').forEach(function(el) {
        el.addEventListener('click', function() { navigate('/job/' + el.dataset.id); });
      });
    } catch (e) {
      document.getElementById('job-list').innerHTML = '<div class="empty">' + esc(e.message) + '</div>';
    }
  }
  document.getElementById('btn-search').addEventListener('click', load);
  await load();
}

async function viewDetail(id) {
  const main = document.getElementById('main');
  main.innerHTML = '<div class="container"><div class="loading">Loading…</div></div>';
  try {
    const j = await api('/api/jobs/' + id);
    const date = new Date(j.created_at).toLocaleDateString(undefined, { year: 'numeric', month: 'long', day: 'numeric' });
    const isOwner = state.user && state.user.id === j.user_id;
    main.innerHTML = '<div class="container"><a href="/" class="back-link" data-link>← All jobs</a><div class="job-detail"><h1>' + esc(j.title) + '</h1><div class="company">' + esc(j.company) + ' · ' + esc(j.poster_name) + '</div><div class="job-meta"><span class="badge">' + esc(j.type) + '</span><span>' + esc(j.location) + '</span>' + (j.salary ? '<span>' + esc(j.salary) + '</span>' : '') + '<span>' + date + '</span></div><div class="description">' + esc(j.description) + '</div><div class="form-actions">' + (j.apply_url ? '<a class="btn btn-primary" href="' + esc(j.apply_url) + '" target="_blank">Apply</a>' : '<a class="btn btn-primary" href="mailto:' + esc(j.poster_email) + '">Apply via email</a>') + (isOwner ? '<button class="btn btn-ghost" id="btn-delete">Delete</button>' : '') + '</div></div></div>';
    if (isOwner) {
      document.getElementById('btn-delete').addEventListener('click', async function() {
        if (!confirm('Delete this job?')) return;
        try { await api('/api/jobs/' + id, { method: 'DELETE' }); toast('Deleted'); navigate('/'); }
        catch (e) { toast(e.message); }
      });
    }
  } catch (e) {
    main.innerHTML = '<div class="container"><div class="empty">' + esc(e.message) + '</div></div>';
  }
}

async function viewPost() {
  if (!state.user) { openAuth(); navigate('/'); return; }
  const main = document.getElementById('main');
  main.innerHTML = '<div class="container"><div class="form-card"><h1>Post a job</h1><form id="job-form"><div class="form-group"><label>Title</label><input name="title" required placeholder="Senior Engineer" /></div><div class="form-row"><div class="form-group"><label>Company</label><input name="company" required /></div><div class="form-group"><label>Location</label><input name="location" required placeholder="Remote / NYC" /></div></div><div class="form-row"><div class="form-group"><label>Type</label><select name="type"><option>Full-time</option><option>Part-time</option><option>Contract</option><option>Remote</option><option>Internship</option></select></div><div class="form-group"><label>Salary (optional)</label><input name="salary" placeholder="$120k–$150k" /></div></div><div class="form-group"><label>Description</label><textarea name="description" required></textarea></div><div class="form-group"><label>Apply URL (optional)</label><input name="apply_url" type="url" /></div><p class="form-error hidden" id="job-error"></p><div class="form-actions"><button type="submit" class="btn btn-primary">Publish</button><button type="button" class="btn btn-ghost" id="btn-cancel">Cancel</button></div></form></div></div>';
  document.getElementById('btn-cancel').addEventListener('click', function() { navigate('/'); });
  document.getElementById('job-form').addEventListener('submit', async function(e) {
    e.preventDefault();
    const fd = new FormData(e.target);
    const body = Object.fromEntries(fd.entries());
    const errEl = document.getElementById('job-error');
    errEl.classList.add('hidden');
    try {
      const job = await api('/api/jobs', { method: 'POST', body: JSON.stringify(body) });
      toast('Published');
      navigate('/job/' + job.id);
    } catch (err) {
      errEl.textContent = err.message;
      errEl.classList.remove('hidden');
    }
  });
}

async function viewMyJobs() {
  if (!state.user) { openAuth(); navigate('/'); return; }
  const main = document.getElementById('main');
  main.innerHTML = '<div class="container"><div class="hero"><h1>My jobs</h1></div><div id="job-list" class="job-list"><div class="loading">Loading…</div></div></div>';
  try {
    const jobs = await api('/api/my-jobs');
    const list = document.getElementById('job-list');
    if (!jobs.length) { list.innerHTML = '<div class="empty">No jobs yet.</div>'; return; }
    list.innerHTML = jobs.map(cardHTML).join('');
    list.querySelectorAll('.job-card').forEach(function(el) {
      el.addEventListener('click', function() { navigate('/job/' + el.dataset.id); });
    });
  } catch (e) {
    document.getElementById('job-list').innerHTML = '<div class="empty">' + esc(e.message) + '</div>';
  }
}

function openAuth() {
  document.getElementById('auth-modal').classList.remove('hidden');
  document.getElementById('login-form').classList.remove('hidden');
  document.getElementById('register-form').classList.add('hidden');
  document.querySelectorAll('.tab').forEach(function(t) { t.classList.toggle('active', t.dataset.tab === 'login'); });
}
function closeAuth() {
  document.getElementById('auth-modal').classList.add('hidden');
  document.getElementById('login-error').classList.add('hidden');
  document.getElementById('register-error').classList.add('hidden');
}

async function render() {
  const route = getRoute();
  if (route.name === 'list') await viewList();
  else if (route.name === 'detail') await viewDetail(route.id);
  else if (route.name === 'post') await viewPost();
  else if (route.name === 'my') await viewMyJobs();
  else await viewList();
}

document.addEventListener('DOMContentLoaded', function() {
  loadAuth();
  updateNav();
  document.getElementById('btn-auth').addEventListener('click', openAuth);
  document.getElementById('btn-logout').addEventListener('click', function() {
    clearAuth(); toast('Logged out'); navigate('/');
  });
  document.getElementById('auth-close').addEventListener('click', closeAuth);
  document.getElementById('auth-modal').addEventListener('click', function(e) {
    if (e.target === e.currentTarget) closeAuth();
  });
  document.querySelectorAll('.tab').forEach(function(tab) {
    tab.addEventListener('click', function() {
      document.querySelectorAll('.tab').forEach(function(t) { t.classList.remove('active'); });
      tab.classList.add('active');
      const isLogin = tab.dataset.tab === 'login';
      document.getElementById('login-form').classList.toggle('hidden', !isLogin);
      document.getElementById('register-form').classList.toggle('hidden', isLogin);
    });
  });
  document.getElementById('login-form').addEventListener('submit', async function(e) {
    e.preventDefault();
    const fd = new FormData(e.target);
    const err = document.getElementById('login-error');
    err.classList.add('hidden');
    try {
      const data = await api('/api/login', { method: 'POST', body: JSON.stringify({ email: fd.get('email'), password: fd.get('password') }) });
      saveAuth(data.token, data.user); closeAuth(); toast('Welcome, ' + data.user.name); render();
    } catch (ex) { err.textContent = ex.message; err.classList.remove('hidden'); }
  });
  document.getElementById('register-form').addEventListener('submit', async function(e) {
    e.preventDefault();
    const fd = new FormData(e.target);
    const err = document.getElementById('register-error');
    err.classList.add('hidden');
    try {
      const data = await api('/api/register', { method: 'POST', body: JSON.stringify({ name: fd.get('name'), email: fd.get('email'), password: fd.get('password') }) });
      saveAuth(data.token, data.user); closeAuth(); toast('Welcome, ' + data.user.name); render();
    } catch (ex) { err.textContent = ex.message; err.classList.remove('hidden'); }
  });
  document.body.addEventListener('click', function(e) {
    const a = e.target.closest('[data-link]');
    if (a) { e.preventDefault(); navigate(a.getAttribute('href')); }
  });
  window.addEventListener('popstate', render);
  render();
});
