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

// World-Class UI Frontend Template
const htmlTemplate = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>beBee - Professional Network</title>
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;500;600;700;800&display=swap" rel="stylesheet">
  <style>
    :root {
      --primary: #f97316;
      --primary-hover: #ea580c;
      --primary-light: #ffedd5;
      --bg-gradient: radial-gradient(circle at top right, #fff7ed, #fdf4f0, #f8fafc);
      --card-bg: rgba(255, 255, 255, 0.85);
      --text-main: #0f172a;
      --text-muted: #64748b;
      --border-color: #e2e8f0;
      --input-bg: #ffffff;
      --focus-ring: rgba(249, 115, 22, 0.2);
      --error-color: #ef4444;
      --success-color: #10b981;
      --shadow-elevation: 0 20px 25px -5px rgba(0, 0, 0, 0.05), 0 8px 10px -6px rgba(0, 0, 0, 0.05);
    }

    * { box-sizing: border-box; margin: 0; padding: 0; font-family: 'Plus Jakarta Sans', sans-serif; }
    
    body {
      background: var(--bg-gradient);
      color: var(--text-main);
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      min-height: 100vh;
      padding: 24px;
    }

    .auth-wrapper {
      width: 100%;
      max-width: 440px;
      animation: fadeIn 0.4s ease-out;
    }

    @keyframes fadeIn {
      from { opacity: 0; transform: translateY(10px); }
      to { opacity: 1; transform: translateY(0); }
    }

    .logo-area {
      text-align: center;
      margin-bottom: 32px;
    }

    .logo-text {
      font-size: 36px;
      font-weight: 800;
      color: var(--text-main);
      text-decoration: none;
      letter-spacing: -1px;
    }

    .logo-text span {
      color: var(--primary);
    }

    .auth-card {
      background: var(--card-bg);
      backdrop-filter: blur(12px);
      -webkit-backdrop-filter: blur(12px);
      border: 1px solid rgba(255, 255, 255, 0.8);
      border-radius: 20px;
      padding: 40px 36px;
      box-shadow: var(--shadow-elevation);
    }

    h1 {
      font-size: 24px;
      font-weight: 700;
      color: var(--text-main);
      margin-bottom: 6px;
      letter-spacing: -0.5px;
    }

    .subtext {
      font-size: 14px;
      color: var(--text-muted);
      margin-bottom: 28px;
    }

    .subtext a {
      color: var(--primary);
      font-weight: 600;
      text-decoration: none;
      cursor: pointer;
    }

    .subtext a:hover {
      text-decoration: underline;
    }

    label {
      display: block;
      font-size: 13px;
      font-weight: 600;
      color: var(--text-main);
      margin-bottom: 8px;
    }

    .form-group {
      margin-bottom: 20px;
      position: relative;
    }

    .input-wrapper {
      position: relative;
      display: flex;
      align-items: center;
    }

    .input-wrapper span.icon {
      position: absolute;
      left: 16px;
      color: var(--text-muted);
      font-size: 15px;
    }

    .input-wrapper input {
      width: 100%;
      padding: 13px 16px 13px 44px;
      border: 1.5px solid var(--border-color);
      border-radius: 12px;
      font-size: 14px;
      outline: none;
      transition: all 0.25s cubic-bezier(0.4, 0, 0.2, 1);
      background: var(--input-bg);
      color: var(--text-main);
      font-weight: 500;
    }

    .input-wrapper input:focus {
      border-color: var(--primary);
      box-shadow: 0 0 0 4px var(--focus-ring);
      background: #ffffff;
    }

    .suggestions-box {
      position: absolute;
      top: calc(100% + 6px);
      left: 0;
      right: 0;
      background: #ffffff;
      border: 1px solid var(--border-color);
      border-radius: 12px;
      box-shadow: 0 10px 25px -5px rgba(0, 0, 0, 0.08);
      z-index: 99;
      max-height: 220px;
      overflow-y: auto;
      display: none;
    }

    .suggestion-item {
      padding: 11px 16px;
      font-size: 13px;
      color: var(--text-main);
      cursor: pointer;
      display: flex;
      align-items: center;
      gap: 12px;
      border-bottom: 1px solid #f8fafc;
      font-weight: 500;
    }

    .suggestion-item:last-child { border-bottom: none; }
    .suggestion-item:hover { background-color: #fff7ed; color: var(--primary); }

    .role-selector {
      display: flex;
      align-items: center;
      background: #fff7ed;
      border: 1.5px solid #fed7aa;
      border-radius: 12px;
      padding: 14px 16px;
      margin-bottom: 24px;
      gap: 14px;
    }

    .role-icon {
      background: var(--primary);
      color: white;
      width: 32px;
      height: 32px;
      border-radius: 8px;
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 15px;
    }

    .role-title {
      font-size: 14px;
      font-weight: 700;
      color: var(--text-main);
    }

    .btn-primary {
      width: 100%;
      background: var(--primary);
      color: white;
      border: none;
      padding: 14px;
      border-radius: 12px;
      font-size: 15px;
      font-weight: 700;
      cursor: pointer;
      transition: all 0.2s ease;
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 8px;
      margin-top: 8px;
      box-shadow: 0 4px 12px rgba(249, 115, 22, 0.25);
    }

    .btn-primary:hover {
      background: var(--primary-hover);
      transform: translateY(-1px);
      box-shadow: 0 6px 16px rgba(249, 115, 22, 0.35);
    }

    .btn-primary:active { transform: translateY(0); }
    .btn-primary:disabled { opacity: 0.7; cursor: not-allowed; transform: none; box-shadow: none; }

    .hidden { display: none !important; }

    #authStatus {
      font-size: 13px;
      font-weight: 600;
      margin-top: 18px;
      text-align: center;
    }

    .otp-container { text-align: center; }
    .otp-boxes { display: flex; gap: 10px; justify-content: center; margin: 28px 0; }
    .otp-box {
      width: 46px;
      height: 52px;
      text-align: center;
      font-size: 20px;
      font-weight: 700;
      border: 1.5px solid var(--border-color);
      border-radius: 12px;
      outline: none;
      transition: all 0.2s;
    }
    .otp-box:focus { border-color: var(--primary); box-shadow: 0 0 0 4px var(--focus-ring); background: #ffffff; }

    .goal-option {
      display: flex;
      align-items: flex-start;
      gap: 14px;
      padding: 14px 16px;
      border: 1.5px solid var(--border-color);
      border-radius: 12px;
      margin-bottom: 12px;
      cursor: pointer;
      transition: all 0.2s;
      background: #ffffff;
    }
    .goal-option:hover { border-color: var(--primary); background: #fff7ed; }
    .goal-option input { accent-color: var(--primary); margin-top: 4px; transform: scale(1.1); }

    .footer-actions {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-top: 20px;
    }

    .logout-btn {
      background: none;
      border: none;
      color: var(--text-muted);
      font-size: 13px;
      font-weight: 600;
      cursor: pointer;
      text-decoration: underline;
    }
    .logout-btn:hover { color: var(--text-main); }
  </style>
</head>
<body>
  <div class="auth-wrapper">
    <div class="logo-area">
      <a href="#" class="logo-text">be<span>Bee</span></a>
    </div>

    <div class="auth-card">
      <!-- LOGIN SCREEN -->
      <div id="loginScreen" class="hidden">
        <h1>Welcome back</h1>
        <div class="subtext">New to beBee? <a onclick="switchView('register')">Create an account</a></div>
        <form onsubmit="handleLoginSubmit(event)">
          <div class="form-group">
            <label>Email address</label>
            <div class="input-wrapper">
              <span class="icon">✉️</span>
              <input type="email" id="loginEmail" placeholder="name@example.com" required />
            </div>
          </div>
          <div class="form-group">
            <label>Password</label>
            <div class="input-wrapper">
              <span class="icon">🔒</span>
              <input type="password" id="loginPassword" placeholder="••••••••" required />
            </div>
          </div>
          <button type="submit" class="btn-primary">Sign in</button>
        </form>
      </div>

      <!-- REGISTRATION SCREEN -->
      <div id="registerScreen" class="hidden">
        <h1>Create an account</h1>
        <div class="subtext">Already have an account? <a onclick="switchView('login')">Sign in</a></div>
        
        <div class="form-group">
          <label>Location</label>
          <div class="input-wrapper">
            <span class="icon">📍</span>
            <input type="text" id="regLocation" placeholder="Select your city" oninput="filterLocations(this.value)" autocomplete="off" />
          </div>
          <div id="suggestionsBox" class="suggestions-box"></div>
        </div>

        <div class="role-selector">
          <div class="role-icon">💼</div>
          <div>
            <div class="role-title">Talent Profile</div>
            <div style="font-size: 12px; color: var(--text-muted); font-weight: 500;">Connect with elite opportunities</div>
          </div>
        </div>
        
        <form id="createAccountForm" onsubmit="handleInitialRegister(event)">
          <div class="form-group">
            <label>Full Name</label>
            <div class="input-wrapper">
              <span class="icon">👤</span>
              <input type="text" id="fullName" placeholder="John Doe" required />
            </div>
          </div>
          <div class="form-group">
            <label>Email address</label>
            <div class="input-wrapper">
              <span class="icon">✉️</span>
              <input type="email" id="userEmail" placeholder="name@example.com" required />
            </div>
          </div>
          <div class="form-group">
            <label>Password</label>
            <div class="input-wrapper">
              <span class="icon">🔒</span>
              <input type="password" id="userPassword" placeholder="At least 6 characters" required />
            </div>
          </div>
          <button type="submit" id="signupBtn" class="btn-primary">Agree & Join</button>
        </form>
      </div>

      <!-- OTP VERIFICATION SCREEN -->
      <div id="verifyScreen" class="otp-container hidden">
        <h1>Verify your email</h1>
        <p class="subtext">Enter the 6-digit confirmation code sent to your email address.</p>
        <div class="otp-boxes">
          <input type="text" maxlength="1" class="otp-box" oninput="handleOtpInput(this, 0)" />
          <input type="text" maxlength="1" class="otp-box" oninput="handleOtpInput(this, 1)" />
          <input type="text" maxlength="1" class="otp-box" oninput="handleOtpInput(this, 2)" />
          <input type="text" maxlength="1" class="otp-box" oninput="handleOtpInput(this, 3)" />
          <input type="text" maxlength="1" class="otp-box" oninput="handleOtpInput(this, 4)" />
          <input type="text" maxlength="1" class="otp-box" oninput="handleOtpInput(this, 5)" />
        </div>
        <button type="button" id="verifyOtpBtn" class="btn-primary" onclick="verifyRegistrationOTP()">Confirm & Continue</button>
      </div>

      <!-- ONBOARDING SCREEN -->
      <div id="onboardScreen" class="hidden">
        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 6px;">
          <h1>Your professional goal</h1>
          <span style="font-size: 12px; color: var(--text-muted); font-weight: 700;">Step 1 of 3</span>
        </div>
        <div class="subtext">Let us tailor your experience based on your core objective.</div>
        
        <div class="goal-option">
          <input type="radio" name="goal" id="goal1" checked />
          <label for="goal1" style="cursor: pointer; margin-bottom: 0;">
            <div style="font-weight: 700; font-size: 13px; color: var(--text-main);">Looking for a job</div>
            <div style="font-size: 12px; color: var(--text-muted); font-weight: 500;">Explore new career paths and apply with ease</div>
          </label>
        </div>

        <div class="goal-option">
          <input type="radio" name="goal" id="goal2" />
          <label for="goal2" style="cursor: pointer; margin-bottom: 0;">
            <div style="font-weight: 700; font-size: 13px; color: var(--text-main);">Offering professional services</div>
            <div style="font-size: 12px; color: var(--text-muted); font-weight: 500;">Showcase your specialized skills to clients</div>
          </label>
        </div>

        <div class="goal-option">
          <input type="radio" name="goal" id="goal3" />
          <label for="goal3" style="cursor: pointer; margin-bottom: 0;">
            <div style="font-weight: 700; font-size: 13px; color: var(--text-main);">Recruiting talent or posting jobs</div>
            <div style="font-size: 12px; color: var(--text-muted); font-weight: 500;">Find top-tier professionals for your openings</div>
          </label>
        </div>

        <button type="button" class="btn-primary" onclick="alert('Profile setup complete!')">Continue</button>
        <div class="footer-actions">
          <a onclick="alert('Skipped setup')" style="font-size: 13px; color: var(--text-muted); text-decoration: underline; cursor: pointer; font-weight: 600;">Skip for now</a>
          <button class="logout-btn" onclick="handleLogout()">Sign out</button>
        </div>
      </div>

      <p id="authStatus"></p>
    </div>
  </div>

  <script>
    const nigerianLocations = [
      "Aba, Aba South (NG)", "Abakaliki, Ebonyi (NG)", "Abak (NG)", "Abeokuta, Abeokuta South (NG)", 
      "Abuja, Municipal Area Council (NG)", "Ado Ekiti, Ado-Ekiti (NG)", "Akure, Akure South (NG)", 
      "Asaba, Oshimili South (NG)", "Awka, Awka South (NG)", "Bauchi (NG)", "Benin City, Oredo (NG)", 
      "Calabar, Calabar Municipal (NG)", "Damaturu (NG)", "Dutse (NG)", "Epe, Lagos (NG)", 
      "Enugu, Enugu North (NG)", "Geidam (NG)", "Gembu, Sardauna (NG)", "Gombe (NG)", "Gusau (NG)", 
      "Ibadan, Ibadan North (NG)", "Ikeja, Lagos (NG)", "Ikorodu, Lagos (NG)", "Ilorin, Ilorin West (NG)", 
      "Jalingo (NG)", "Jos, Jos North (NG)", "Kaduna, Kaduna North (NG)", "Kano, Kano Municipal (NG)", 
      "Katsina (NG)", "Lafia (NG)", "Lagos Island, Lagos (NG)", "Lokoja (NG)", "Maiduguri, Jere (NG)", 
      "Makurdi (NG)", "Minna (NG)", "Nsukka (NG)", "Ogbomoso (NG)", "Onitsha, Onitsha North (NG)", 
      "Oshogbo (NG)", "Owerri, Owerri Municipal (NG)", "Port Harcourt, Port Harcourt (NG)", 
      "Sokoto, Sokoto South (NG)", "Umuahia, Umuahia North (NG)", "Uyo, Uyo (NG)", "Warri, Warri South (NG)", 
      "Yenagoa (NG)", "Yola, Yola North (NG)"
    ];

    let registeredEmail = localStorage.getItem('lastRegisteredEmail') || "";

    window.addEventListener('DOMContentLoaded', () => {
      const savedView = localStorage.getItem('currentView') || 'login';
      const lastEmail = localStorage.getItem('lastRegisteredEmail');
      if (lastEmail) {
        document.getElementById('loginEmail').value = lastEmail;
      }
      switchView(savedView, false);
    });

    function switchView(view, saveState = true) {
      document.getElementById('loginScreen').classList.add('hidden');
      document.getElementById('registerScreen').classList.add('hidden');
      document.getElementById('verifyScreen').classList.add('hidden');
      document.getElementById('onboardScreen').classList.add('hidden');
      document.getElementById('authStatus').innerText = '';

      if (view === 'login') {
        document.getElementById('loginScreen').classList.remove('hidden');
        const lastEmail = localStorage.getItem('lastRegisteredEmail');
        if (lastEmail) document.getElementById('loginEmail').value = lastEmail;
      }
      if (view === 'register') document.getElementById('registerScreen').classList.remove('hidden');
      if (view === 'verify') document.getElementById('verifyScreen').classList.remove('hidden');
      if (view === 'onboard') document.getElementById('onboardScreen').classList.remove('hidden');

      if (saveState) {
        localStorage.setItem('currentView', view);
      }
    }

    function filterLocations(query) {
      const box = document.getElementById('suggestionsBox');
      box.innerHTML = '';
      
      if (!query || query.trim() === '') {
        box.style.display = 'none';
        return;
      }

      const matches = nigerianLocations.filter(loc => loc.toLowerCase().includes(query.toLowerCase()));

      if (matches.length > 0) {
        box.style.display = 'block';
        matches.forEach(match => {
          const div = document.createElement('div');
          div.className = 'suggestion-item';
          div.innerHTML = \`📍 <span>\${match}</span>\`;
          div.onclick = () => {
            document.getElementById('regLocation').value = match;
            box.style.display = 'none';
          };
          box.appendChild(div);
        });
      } else {
        box.style.display = 'none';
      }
    }

    document.addEventListener('click', function(e) {
      if (!e.target.closest('.form-group')) {
        const box = document.getElementById('suggestionsBox');
        if(box) box.style.display = 'none';
      }
    });

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
      localStorage.setItem('lastRegisteredEmail', email);

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

        switchView('verify');
        setStatus('Verification code sent to your email!', false);
      } catch (err) {
        setStatus(err.message, true);
        signupBtn.innerHTML = 'Agree & Join';
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
        switchView('onboard');
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
        localStorage.setItem('lastRegisteredEmail', email);
        switchView('onboard');
      } catch (err) {
        setStatus(err.message, true);
      }
    }

    function handleLogout() {
      localStorage.removeItem('token');
      localStorage.removeItem('currentView');
      switchView('login');
    }

    function setStatus(msg, isError) {
      const el = document.getElementById('authStatus');
      el.innerText = msg;
      el.style.color = isError ? 'var(--error-color)' : 'var(--success-color)';
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
    if (p === '/' && req.method === 'GET') {
      res.writeHead(200, { 'Content-Type': 'text/html' });
      return res.end(htmlTemplate);
    }

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
          from: 'support@schoolhelpline.name.ng',
          to: emailNorm,
          subject: 'Your Verification Code',
          html: `<p>Your email verification code is: <strong>${code}</strong>. It expires in 10 minutes.</p>`
        });
        return json(res, 200, { message: 'Verification code sent to your email' });
      } catch (err) {
        return json(res, 500, { error: 'Failed to send email: ' + err.message });
      }
    }

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
