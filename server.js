Const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { URL } = require('url');
const { Resend } = require('resend');
const resend = new Resend(process.env.RESEND_API_KEY);
const PORT = process.env.PORT || 3000;
const BASE_URL = process.env.BASE_URL || `http://localhost:${PORT}`;
const JWT_SECRET = process.env.JWT_SECRET || 'forge-secret-change-me';
const DB_PATH = path.join(__dirname, 'data.json');
const PUBLIC = path.join(__dirname, 'public');

function load() {
  if (!fs.existsSync(DB_PATH)) return { users: [], jobs: [], nextUserId: 1, nextJobId: 1 };
  return JSON.parse(fs.readFileSync(DB_PATH, 'utf8'));
}
function save(db) { fs.writeFileSync(DB_PATH, JSON.stringify(db, null, 2)); }
let db = load();

function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = crypto.scryptSync(password, salt, 64).toString('hex');
  return salt + ':' + hash;
}
function verifyPassword(password, stored) {
  const [salt, hash] = stored.split(':');
  const test = crypto.scryptSync(password, salt, 64).toString('hex');
  return crypto.timingSafeEqual(Buffer.from(hash, 'hex'), Buffer.from(test, 'hex'));
}
function b64url(buf) { return Buffer.from(buf).toString('base64url'); }
function signToken(payload) {
  const header = b64url(JSON.stringify({ alg: 'HS256', typ: 'JWT' }));
  const body = b64url(JSON.stringify({ ...payload, exp: Math.floor(Date.now() / 1000) + 7 * 86400 }));
  const sig = crypto.createHmac('sha256', JWT_SECRET).update(header + '.' + body).digest('base64url');
  return header + '.' + body + '.' + sig;
}
function verifyToken(token) {
  const parts = token.split('.');
  if (parts.length !== 3) throw new Error('bad token');
  const [header, body, sig] = parts;
  const expected = crypto.createHmac('sha256', JWT_SECRET).update(header + '.' + body).digest('base64url');
  if (sig !== expected) throw new Error('bad signature');
  const payload = JSON.parse(Buffer.from(body, 'base64url').toString());
  if (payload.exp < Math.floor(Date.now() / 1000)) throw new Error('expired');
  return payload;
}

function json(res, status, data) {
  const body = JSON.stringify(data);
  res.writeHead(status, {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Access-Control-Allow-Methods': 'GET,POST,PUT,DELETE,OPTIONS'
  });
  res.end(body);
}
function readBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on('data', c => chunks.push(c));
    req.on('end', () => {
      try { resolve(Buffer.concat(chunks).toString() ? JSON.parse(Buffer.concat(chunks).toString()) : {}); }
      catch { reject(new Error('Invalid JSON')); }
    });
  });
}
function getAuth(req) {
  const h = req.headers.authorization;
  if (!h || !h.startsWith('Bearer ')) return null;
  try { return verifyToken(h.slice(7)); } catch { return null; }
}
function serveStatic(req, res, urlPath) {
  let filePath = path.join(PUBLIC, urlPath === '/' ? 'index.html' : urlPath);
  if (!filePath.startsWith(PUBLIC)) { res.writeHead(403); return res.end(); }
  if (!fs.existsSync(filePath) || fs.statSync(filePath).isDirectory()) {
    filePath = path.join(PUBLIC, 'index.html');
  }
  const ext = path.extname(filePath).toLowerCase();
  const types = { '.html': 'text/html', '.css': 'text/css', '.js': 'application/javascript', '.txt': 'text/plain', '.xml': 'application/xml' };
  res.writeHead(200, { 'Content-Type': types[ext] || 'application/octet-stream' });
  res.end(fs.readFileSync(filePath));
}

const server = http.createServer(async (req, res) => {
  if (req.method === 'OPTIONS') {
    res.writeHead(204, {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization',
      'Access-Control-Allow-Methods': 'GET,POST,PUT,DELETE,OPTIONS'
    });
    return res.end();
  }
  const url = new URL(req.url, BASE_URL);
  const p = url.pathname;
  try {
    if (p === '/api/register' && req.method === 'POST') {
      const body = await readBody(req);
      const { email, password, name } = body;
      if (!email || !password || !name) return json(res, 400, { error: 'Email, password and name required' });
      if (password.length < 6) return json(res, 400, { error: 'Password must be at least 6 characters' });
      const emailNorm = email.toLowerCase().trim();
      if (db.users.find(u => u.email === emailNorm)) return json(res, 409, { error: 'Email already registered' });
      const user = { id: db.nextUserId++, email: emailNorm, password: hashPassword(password), name: name.trim(), created_at: new Date().toISOString() };
      db.users.push(user); save(db);
      const token = signToken({ id: user.id, email: user.email, name: user.name });
      return json(res, 201, { token, user: { id: user.id, email: user.email, name: user.name } });
    }
    if (p === '/api/login' && req.method === 'POST') {
      const body = await readBody(req);
      const { email, password } = body;
      if (!email || !password) return json(res, 400, { error: 'Email and password required' });
      const user = db.users.find(u => u.email === email.toLowerCase().trim());
      if (!user || !verifyPassword(password, user.password)) return json(res, 401, { error: 'Invalid email or password' });
      const token = signToken({ id: user.id, email: user.email, name: user.name });
      return json(res, 200, { token, user: { id: user.id, email: user.email, name: user.name } });
    }
    if (p === '/api/me' && req.method === 'GET') {
      const auth = getAuth(req);
      if (!auth) return json(res, 401, { error: 'Authentication required' });
      const u = db.users.find(x => x.id === auth.id);
      if (!u) return json(res, 404, { error: 'User not found' });
      return json(res, 200, { id: u.id, email: u.email, name: u.name });
    }
    if (p === '/api/jobs' && req.method === 'GET') {
      let jobs = db.jobs.slice();
      const q = url.searchParams.get('q');
      const type = url.searchParams.get('type');
      const location = url.searchParams.get('location');
      if (q) {
        const term = q.toLowerCase();
        jobs = jobs.filter(j => j.title.toLowerCase().includes(term) || j.company.toLowerCase().includes(term) || j.description.toLowerCase().includes(term));
      }
      if (type) jobs = jobs.filter(j => j.type === type);
      if (location) jobs = jobs.filter(j => j.location.toLowerCase().includes(location.toLowerCase()));
      jobs.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
      return json(res, 200, jobs.map(j => {
        const poster = db.users.find(u => u.id === j.user_id);
        return { ...j, poster_name: poster ? poster.name : 'Unknown' };
      }));
    }
    if (p.startsWith('/api/jobs/') && req.method === 'GET') {
      const id = Number(p.split('/')[3]);
      const job = db.jobs.find(j => j.id === id);
      if (!job) return json(res, 404, { error: 'Job not found' });
      const poster = db.users.find(u => u.id === job.user_id);
      return json(res, 200, { ...job, poster_name: poster ? poster.name : 'Unknown', poster_email: poster ? poster.email : null });
    }
    if (p === '/api/jobs' && req.method === 'POST') {
      const user = getAuth(req);
      if (!user) return json(res, 401, { error: 'Authentication required' });
      const body = await readBody(req);
      const { title, company, location, type, salary, description, apply_url } = body;
      if (!title || !company || !location || !type || !description) return json(res, 400, { error: 'Title, company, location, type and description required' });
      const job = { id: db.nextJobId++, user_id: user.id, title: title.trim(), company: company.trim(), location: location.trim(), type: type.trim(), salary: salary ? salary.trim() : null, description: description.trim(), apply_url: apply_url ? apply_url.trim() : null, created_at: new Date().toISOString() };
      db.jobs.push(job); save(db);
      return json(res, 201, job);
    }
    if (p.startsWith('/api/jobs/') && req.method === 'DELETE') {
      const user = getAuth(req);
      if (!user) return json(res, 401, { error: 'Authentication required' });
      const id = Number(p.split('/')[3]);
      const idx = db.jobs.findIndex(j => j.id === id);
      if (idx === -1) return json(res, 404, { error: 'Job not found' });
      if (db.jobs[idx].user_id !== user.id) return json(res, 403, { error: 'Not your job' });
      db.jobs.splice(idx, 1); save(db);
      return json(res, 200, { ok: true });
    }
    if (p === '/api/my-jobs' && req.method === 'GET') {
      const user = getAuth(req);
      if (!user) return json(res, 401, { error: 'Authentication required' });
      return json(res, 200, db.jobs.filter(j => j.user_id === user.id).sort((a, b) => new Date(b.created_at) - new Date(a.created_at)));
    }
    if (p === '/sitemap.xml') {
      const base = BASE_URL.replace(/\/$/, '');
      let xml = '<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">';
      xml += '<url><loc>' + base + '/</loc><priority>1.0</priority></url>';
      db.jobs.forEach(j => { xml += '<url><loc>' + base + '/job/' + j.id + '</loc><priority>0.8</priority></url>'; });
      xml += '</urlset>';
      res.writeHead(200, { 'Content-Type': 'application/xml' });
      return res.end(xml);
    }
    if (p === '/api/send-email' && req.method === 'POST') {
      const body = await readBody(req);
      try {
        const response = await resend.emails.send({
          from: 'onboarding@resend.dev',
          to: body.recipientEmail,
          subject: `New Form Submission: ${body.formType}`,
          html: `<p><strong>Details:</strong></p><pre>${JSON.stringify(body.formData, null, 2)}</pre>`
        });
        return json(res, 200, { success: true, response });
      } catch (err) {
        return json(res, 500, { error: err.message });
      }
    }

    serveStatic(req, res, p);
  } catch (err) {
    console.error(err);
    json(res, 500, { error: 'Server error' });
  }
});

server.listen(PORT, () => console.log('Forge → ' + BASE_URL));
