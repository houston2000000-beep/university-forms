const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { URL } = require('url');
const { Resend } = require('resend');

// Initialize Resend & Environment Config
const resend = new Resend(process.env.RESEND_API_KEY);
const PORT = process.env.PORT || 3000;
const BASE_URL = process.env.BASE_URL || `http://localhost:${PORT}`;
const JWT_SECRET = process.env.JWT_SECRET || 'forge-secret-change-me';
const DB_PATH = path.join(__dirname, 'data.json');

// Ensure public directory exists if serving static files, or embed UI directly
const otps = {};

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
function generateOTP() {
  return Math.floor(100000 + Math.random() * 900000).toString();
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

// HTML Frontend Template served directly from the server
const htmlTemplate = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>beBee - Authentication</title>
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&display=swap" rel="stylesheet">
  <style>
    :root {
      --primary: #ff9900;
      --primary-dark: #e68a00;
      --bg: #ffffff;
      --text: #222222;
      --text-muted: #717171;
      --border-light: #e0e0e0;
    }
    * { box-sizing: border-box; margin: 0; padding: 0; font-family: 'Inter', sans-serif; }
    body { background-color: var(--bg); color: var(--text); display: flex; justify-content: center; align-items: flex-start; min-height: 100vh; padding: 40px 20px; }
    .auth-container { width: 100%; max-width: 420px; background: #ffffff; }
    .logo-area { text-align: center; margin-bottom: 28px; }
    .logo-text { font-size: 28px; font-weight: 800; color: var(--text); text-decoration: none; display: inline-flex; gap: 2px; }
    .logo-text span { color: var(--primary); }
    h1 { font-size: 24px; font-weight: 700; margin-bottom: 6px; }
    .subtext { font-size: 14px; color: var(--text-muted); margin-bottom: 24px; }
    .subtext a { color: var(--primary); font-weight: 600; text-decoration: none; cursor: pointer; }
    .subtext a:hover { text-decoration: underline; }
    label { display: block; font-size: 13px; font-weight: 600; color: #333333; margin-bottom: 6px; }
    .form-group { margin-bottom: 16px; position: relative; }
    .input-wrapper { position: relative; display: flex; align-items: center; }
    .input-wrapper span.icon { position: absolute; left: 14px; color: var(--text-muted); font-size: 14px; }
    .input-wrapper input { width: 100%; padding: 12px 14px 12px 38px; border: 1px solid var(--border-light); border-radius: 6px; font-size: 14px; outline: none; transition: all 0.2s ease; background: #fff; color: var(--text); }
    .input-wrapper input:focus { border-color: var(--primary); box-shadow: 0 0 0 2px rgba(255, 153, 0, 0.15); }
    .suggestions-box { position: absolute; top: calc(100% + 4px); left: 0; right: 0; background: #ffffff; border: 1px solid var(--border-light); border-radius: 6px; box-shadow: 0 4px 12px rgba(0,0,0,0.1); z-index: 99; max-height: 220px; overflow-y: auto; display: none; }
    .suggestion-item { padding: 10px 14px; font-size: 14px; cursor: pointer; display: flex; align-items: center; gap: 10px; border-bottom: 1px solid #f5f5f5; }
    .suggestion-item:hover { background-color: #fcfcfc; color: var(--primary); }
    input.plain-input { width: 100%; padding: 12px 14px; border: 1px solid var(--border-light); border-radius: 6px; font-size: 14px; outline: none; background: #fff; }
    input.plain-input:focus { border-color: var(--primary); box-shadow: 0 0 0 2px rgba(255, 153, 0, 0.15); }
    .name-row { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }
    .terms-row { display: flex; align-items: flex-start; gap: 10px; font-size: 13px; color: var(--text-muted); margin-bottom: 22px; }
    .terms-row input { margin-top: 2px; accent-color: var(--primary); width: 16px; height: 16px; cursor: pointer; }
    .terms-row a { color: var(--primary); text-decoration: none; font-weight: 500; }
    .social-btn { width: 100%; padding: 12px; border: 1px solid var(--border-light); border-radius: 6px; background: white; font-size: 14px; font-weight: 500; cursor: pointer; display: flex; align-items: center; justify-content: center; gap: 10px; margin-bottom: 12px; transition: background 0.2s; color: var(--text); }
    .social-btn:hover { background: #f7f7f7; }
    .divider { display: flex; align-items: center; text-align: center; margin: 22px 0; color: #888888; font-size: 11px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.8px; }
    .divider::before, .divider::after { content: ''; flex: 1; border-bottom: 1px solid var(--border-light); }
    .divider::before { margin-right: 12px; } .divider::after { margin-left: 12px; }
    .role-selector { display: flex; align-items: center; background: #fffaf0; border: 1px solid #fed7aa; border-radius: 6px; padding: 10px 14px; margin-bottom: 18px; gap: 12px; }
    .role-icon { background: var(--primary); color: white; width: 24px; height: 24px; border-radius: 4px; display: flex; align-items: center; justify-content: center; font-size: 12px; }
    .role-title { font-size: 14px; font-weight: 600; }
    .btn-primary { width: 100%; background: var(--primary); color: white; border: none; padding: 13px; border-radius: 6px; font-size: 15px; font-weight: 600; cursor: pointer; transition: background 0.2s; display: flex; align-items: center; justify-content: center; gap: 6px; margin-top: 8px; }
    .btn-primary:hover { background: var(--primary-dark); }
    .btn-primary:disabled { opacity: 0.7; cursor: not-allowed; }
    .hidden { display: none !important; }
    #authStatus { font-size: 13px; font-weight: 600; margin-top: 14px; text-align: center; }
    .login-extras { display: flex; justify-content: space-between; align-items: center; font-size: 13px; margin-bottom: 6px; }
    .login-extras a { color: var(--primary); text-decoration: none; font-weight: 500; }
    .magic-link-row { text-align: center; margin-top: 18px; font-size: 13px; }
    .magic-link-row a { color: var(--primary); text-decoration: none; font-weight: 600; }
    .otp-container { text-align: center; padding-top: 10px; }
    .otp-boxes { display: flex; gap: 10px; justify-content: center; margin: 24px 0; }
    .otp-box { width: 48px; height: 52px; text-align: center; font-size: 20px; font-weight: 600; border: 1px solid var(--border-light); border-radius: 6px; outline: none; }
    .otp-box:focus { border-color: var(--primary); box-shadow: 0 0 0 2px rgba(255, 153, 0, 0.15); }
  </style>
</head>
<body>
  <div class="auth-container">
    <div class="logo-area"><a href="#" class="logo-text">🐝 be<span>Bee</span></a></div>

    <!-- LOGIN SCREEN -->
    <div id="loginScreen" class="hidden">
      <h1>Log in</h1>
      <div class="subtext">Don't have an account? <a onclick="switchView('register')">Create account</a></div>
      <form onsubmit="handleLoginSubmit(event)">
        <div class="form-group">
          <label>Email</label>
          <div class="input-wrapper"><span class="icon">✉️</span><input type="email" id="loginEmail" placeholder="email@example.com" required /></div>
        </div>
        <div class="form-group">
          <div class="login-extras"><label style="margin-bottom:0;">Password</label></div>
          <div class="input-wrapper" style="margin-top:6px;"><span class="icon">🔒</span><input type="password" id="loginPassword" required /></div>
        </div>
        <button type="submit" class="btn-primary">Log in</button>
      </form>
    </div>

    <!-- REGISTRATION SCREEN -->
    <div id="registerScreen">
      <h1>Create account</h1>
      <div class="subtext">Already have an account? <a onclick="switchView('login')">Log in</a></div>
      <div class="form-group">
        <label>Location</label>
        <div class="input-wrapper"><span class="icon">📍</span><input type="text" id="regLocation" oninput="filterLocations(this.value)" autocomplete="off" /></div>
        <div id="suggestionsBox" class="suggestions-box"></div>
      </div>
      <div class="role-selector">
        <div class="role-icon">💼</div>
        <div class="role-title">Talent</div>
      </div>
      <form id="createAccountForm" onsubmit="handleInitialRegister(event)">
        <div class="form-group">
          <label>Full Name</label>
          <div class="input-wrapper"><span class="icon">👤</span><input type="text" id="fullName" placeholder="John Doe" required /></div>
        </div>
        <div class="form-group">
          <label>Email</label>
          <div class="input-wrapper"><span class="icon">✉️</span><input type="email" id="userEmail" placeholder="email@example.com" required /></div>
        </div>
        <div class="form-group">
          <label>Password (min 6 chars)</label>
          <div class="input-wrapper"><span class="icon">🔒</span><input type="password" id="userPassword" placeholder="Password" required /></div>
        </div>
        <button type="submit" id="signupBtn" class="btn-primary">Sign up</button>
      </form>
    </div>

    <!-- OTP VERIFICATION SCREEN -->
    <div id="verifyScreen" class="otp-container hidden">
      <h1>Enter Verification Code</h1>
      <p class="subtext">We sent a confirmation code to your email.</p>
      <div class="otp-boxes">
        <input type="text" maxlength="1" class="otp-box" oninput="handleOtpInput(this, 0)" />
        <input type="text" maxlength="1" class="otp-box" oninput="handleOtpInput(this, 1)" />
        <input type="text" maxlength="1" class="otp-box" oninput="handleOtpInput(this, 2)" />
        <input type="text" maxlength="1" class="otp-box" oninput="handleOtpInput(this, 3)" />
        <input type="text" maxlength="1" class="otp-box" oninput="handleOtpInput(this, 4)" />
        <input type="text" maxlength="1" class="otp-box" oninput="handleOtpInput(this, 5)" />
      </div>
      <button type="button" id="verifyOtpBtn" class="btn-primary" onclick="verifyRegistrationOTP()">Verify Email & Log In</button>
    </div>
    <p id="authStatus"></p>
  </div>

  <script>
    let registeredEmail = "";

    function switchView(view) {
      document.getElementById('loginScreen').classList.add('hidden');
      document.getElementById('registerScreen').classList.add('hidden');
      document.getElementById('verifyScreen').classList.add('hidden');
      document.getElementById('authStatus').innerText = '';
      if (view === 'login') document.getElementById('loginScreen').classList.remove('hidden');
      if (view === 'register') document.getElementById('registerScreen').classList.remove('hidden');
    }

    function handleOtpInput(element, index) {
      element.value = element.value.replace(/[^0-9]/g, '');
      const boxes = document.querySelectorAll('.otp-box');
      if (element.value && index < boxes.length - 1) boxes[index + 1].focus();
    }

    async function handleInitialRegister(e) {
      e.preventDefault();
      const name = document.getElementById('fullName').value;
      const email = document.getElementById('userEmail').value;
      const password = document.getElementById('userPassword').value;
      registeredEmail = email;

      const signupBtn = document.getElementById('signupBtn');
      signupBtn.innerHTML = 'Sending Code...';
      signupBtn.disabled = true;

      try {
        const res = await fetch('/api/register/request-otp', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ name, email, password })
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'Failed to request OTP');

        document.getElementById('registerScreen').classList.add('hidden');
        document.getElementById('verifyScreen').classList.remove('hidden');
        setStatus('Verification code sent to your email!', false);
      } catch (err) {
        setStatus(err.message, true);
        signupBtn.innerHTML = 'Sign up';
        signupBtn.disabled = false;
      }
    }

    async function verifyRegistrationOTP() {
      const boxes = document.querySelectorAll('.otp-box');
      const code = Array.from(boxes).map(b => b.value).join('');
      if (code.length < 6) return setStatus('Please enter all 6 digits', true);

      try {
        const res = await fetch('/api/register/verify-otp', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email: registeredEmail, code })
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'Invalid code');

        localStorage.setItem('token', data.token);
        setStatus('Account created successfully!', false);
        setTimeout(() => alert('Welcome to beBee! Registration complete.'), 300);
      } catch (err) {
        setStatus(err.message, true);
      }
    }

    async function handleLoginSubmit(e) {
      e.preventDefault();
      const email = document.getElementById('loginEmail').value;
      const password = document.getElementById('loginPassword').value;

      try {
        const res = await fetch('/api/login', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email, password })
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'Login failed');

        localStorage.setItem('token', data.token);
        setStatus('Logged in successfully!', false);
        setTimeout(() => alert('Welcome back!'), 300);
      } catch (err) {
        setStatus(err.message, true);
      }
    }

    function setStatus(msg, isError) {
      const el = document.getElementById('authStatus');
      el.innerText = msg;
      el.style.color = isError ? '#dc2626' : '#16a34a';
    }
  </script>
</body>
</html>`;

// HTTP Server Routing
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
    // Serve Frontend
    if (p === '/' && req.method === 'GET') {
      res.writeHead(200, { 'Content-Type': 'text/html' });
      return res.end(htmlTemplate);
    }

    // Register Request OTP
    if (p === '/api/register/request-otp' && req.method === 'POST') {
      const body = await readBody(req);
      const { email, password, name } = body;
      if (!email || !password || !name) return json(res, 400, { error: 'Email, password and name required' });
      if (password.length < 6) return json(res, 400, { error: 'Password must be at least 6 characters' });
      
      const emailNorm = email.toLowerCase().trim();
      if (db.users.find(u => u.email === emailNorm)) return json(res, 409, { error: 'Email already registered' });

      const code = generateOTP();
      otps[emailNorm] = { code, type: 'register', payload: { name: name.trim(), password }, expires: Date.now() + 10 * 60 * 1000 };

      try {
        await resend.emails.send({
          from: 'onboarding@resend.dev',
          to: emailNorm,
          subject: 'Your Verification Code',
          html: `<p>Your email verification code is: <strong>${code}</strong>. It expires in 10 minutes.</p>`
        });
        return json(res, 200, { message: 'Verification code sent to your email' });
      } catch (err) {
        return json(res, 500, { error: 'Failed to send email: ' + err.message });
      }
    }

    // Register Verify OTP
    if (p === '/api/register/verify-otp' && req.method === 'POST') {
      const body = await readBody(req);
      const { email, code } = body;
      if (!email || !code) return json(res, 400, { error: 'Email and code required' });

      const emailNorm = email.toLowerCase().trim();
      const record = otps[emailNorm];

      if (!record || record.type !== 'register') return json(res, 400, { error: 'No pending registration found for this email' });
      if (Date.now() > record.expires) { delete otps[emailNorm]; return json(res, 400, { error: 'Verification code expired' }); }
      if (record.code !== code.trim()) return json(res, 400, { error: 'Invalid verification code' });

      const user = {
        id: db.nextUserId++,
        email: emailNorm,
        password: hashPassword(record.payload.password),
        name: record.payload.name,
        created_at: new Date().toISOString()
      };
      db.users.push(user);
      save(db);
      delete otps[emailNorm];

      const token = signToken({ id: user.id, email: user.email, name: user.name });
      return json(res, 201, { token, user: { id: user.id, email: user.email, name: user.name } });
    }

    // Login Endpoint
    if (p === '/api/login' && req.method === 'POST') {
      const body = await readBody(req);
      const { email, password } = body;
      if (!email || !password) return json(res, 400, { error: 'Email and password required' });

      const emailNorm = email.toLowerCase().trim();
      const user = db.users.find(u => u.email === emailNorm);

      if (!user) return json(res, 404, { error: "You don't have an account with this email. Please create one." });
      if (!verifyPassword(password, user.password)) return json(res, 401, { error: "Incorrect password. Please try again." });

      const token = signToken({ id: user.id, email: user.email, name: user.name });
      return json(res, 200, { token, user: { id: user.id, email: user.email, name: user.name } });
    }

    res.writeHead(404, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Not found' }));
  } catch (err) {
    console.error(err);
    json(res, 500, { error: 'Server error' });
  }
});

server.listen(PORT, () => console.log('Server running on → ' + BASE_URL));
