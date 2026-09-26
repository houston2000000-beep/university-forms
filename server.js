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

// Complete Masterpiece Frontend Template with Revamped Professional Dashboard
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
      --primary: #ff6b00;
      --primary-hover: #ff852b;
      --primary-glow: rgba(255, 107, 0, 0.35);
      --bg-base: #04060b;
      --card-bg: rgba(13, 19, 33, 0.65);
      --card-border: rgba(255, 255, 255, 0.08);
      --text-main: #f8fafc;
      --text-muted: #94a3b8;
      --input-bg: rgba(8, 13, 24, 0.75);
      --border-color: rgba(255, 255, 255, 0.12);
      --focus-ring: rgba(255, 107, 0, 0.4);
      --error-color: #f87171;
      --success-color: #34d399;
      --shadow-elevation: 0 30px 60px -12px rgba(0, 0, 0, 0.85);
    }

    * { box-sizing: border-box; margin: 0; padding: 0; font-family: 'Plus Jakarta Sans', sans-serif; }
    
    body {
      background-color: var(--bg-base);
      color: var(--text-main);
      min-height: 100vh;
      overflow-x: hidden;
      position: relative;
      display: flex;
    }

    #bgCanvas {
      position: fixed;
      top: 0; left: 0; width: 100vw; height: 100vh;
      z-index: -1;
      pointer-events: none;
    }

    .app-container {
      display: grid;
      grid-template-columns: 1.1fr 0.9fr;
      width: 100vw;
      min-height: 100vh;
    }

    @media (max-width: 1024px) {
      .app-container { grid-template-columns: 1fr; }
      .branding-side { display: none !important; }
    }

    .branding-side {
      padding: 60px;
      display: flex;
      flex-direction: column;
      justify-content: space-between;
      position: relative;
      border-right: 1px solid rgba(255, 255, 255, 0.05);
      background: radial-gradient(circle at top left, rgba(255,107,0,0.08), transparent 50%);
    }

    .brand-top .logo-text {
      font-size: 36px;
      font-weight: 800;
      color: #fff;
      text-decoration: none;
      letter-spacing: -1.5px;
    }
    .brand-top .logo-text span { color: var(--primary); }

    .brand-hero-content h2 {
      font-size: 48px;
      font-weight: 800;
      line-height: 1.1;
      letter-spacing: -2px;
      margin-bottom: 20px;
      background: linear-gradient(135deg, #fff 30%, var(--text-muted) 100%);
      -webkit-background-clip: text;
      -webkit-text-fill-color: transparent;
    }

    .brand-hero-content p {
      font-size: 16px;
      color: var(--text-muted);
      line-height: 1.6;
      max-width: 440px;
      font-weight: 500;
    }

    .live-stats-badge {
      display: inline-flex;
      align-items: center;
      gap: 10px;
      background: rgba(255, 255, 255, 0.04);
      border: 1px solid var(--card-border);
      padding: 10px 18px;
      border-radius: 30px;
      backdrop-filter: blur(10px);
      font-size: 13px;
      font-weight: 600;
      margin-bottom: 24px;
    }
    .pulse-dot {
      width: 8px; height: 8px; background: var(--success-color); border-radius: 50%;
      box-shadow: 0 0 10px var(--success-color);
      animation: pulseAnim 2s infinite;
    }
    @keyframes pulseAnim {
      0% { transform: scale(0.95); box-shadow: 0 0 0 0 rgba(52, 211, 153, 0.7); }
      70% { transform: scale(1); box-shadow: 0 0 0 8px rgba(52, 211, 153, 0); }
      100% { transform: scale(0.95); box-shadow: 0 0 0 0 rgba(52, 211, 153, 0); }
    }

    .auth-side {
      display: flex;
      align-items: center;
      justify-content: center;
      padding: 40px 20px;
      position: relative;
      width: 100%;
    }

    .auth-wrapper {
      width: 100%;
      max-width: 440px;
      animation: fadeIn 0.6s cubic-bezier(0.16, 1, 0.3, 1);
    }

    /* Full width container for dashboard layout */
    .dashboard-wrapper {
      width: 100%;
      max-width: 900px;
      animation: fadeIn 0.6s cubic-bezier(0.16, 1, 0.3, 1);
      padding: 20px;
    }

    @keyframes fadeIn {
      from { opacity: 0; transform: translateY(20px) scale(0.98); }
      to { opacity: 1; transform: translateY(0) scale(1); }
    }

    .mobile-logo {
      text-align: center;
      margin-bottom: 28px;
      display: none;
    }
    @media (max-width: 1024px) { .mobile-logo { display: block; } }
    .mobile-logo a { font-size: 34px; font-weight: 800; color: #fff; text-decoration: none; letter-spacing: -1.5px; }
    .mobile-logo span { color: var(--primary); }

    .auth-card {
      background: var(--card-bg);
      backdrop-filter: blur(25px);
      -webkit-backdrop-filter: blur(25px);
      border: 1px solid var(--card-border);
      border-radius: 28px;
      padding: 44px 38px;
      box-shadow: var(--shadow-elevation);
      position: relative;
      overflow: hidden;
    }

    .auth-card::before {
      content: '';
      position: absolute;
      inset: 0;
      border-radius: 28px;
      padding: 1px;
      background: linear-gradient(to bottom right, rgba(255,255,255,0.2), rgba(255,255,255,0.02));
      -webkit-mask: linear-gradient(#fff 0 0) content-box, linear-gradient(#fff 0 0);
      -webkit-mask-composite: xor;
      mask-composite: exclude;
      pointer-events: none;
    }

    h1 {
      font-size: 26px;
      font-weight: 700;
      color: var(--text-main);
      margin-bottom: 6px;
      letter-spacing: -0.5px;
    }

    .subtext {
      font-size: 14px;
      color: var(--text-muted);
      margin-bottom: 28px;
      font-weight: 500;
      line-height: 1.5;
    }

    .subtext a {
      color: var(--primary);
      font-weight: 600;
      text-decoration: none;
      cursor: pointer;
      transition: opacity 0.2s;
    }
    .subtext a:hover { opacity: 0.85; text-decoration: underline; }

    label {
      display: block;
      font-size: 13px;
      font-weight: 600;
      color: var(--text-main);
      margin-bottom: 8px;
      letter-spacing: -0.2px;
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
      transition: color 0.2s;
    }

    .input-wrapper input {
      width: 100%;
      padding: 15px 16px 15px 46px;
      border: 1.5px solid var(--border-color);
      border-radius: 14px;
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
      background: rgba(10, 16, 28, 0.95);
    }
    .input-wrapper input:focus ~ span.icon { color: var(--primary); }

    .suggestions-box {
      position: absolute;
      top: calc(100% + 6px);
      left: 0; right: 0;
      background: #0b111e;
      border: 1px solid var(--border-color);
      border-radius: 14px;
      box-shadow: 0 25px 30px -5px rgba(0, 0, 0, 0.7);
      z-index: 99;
      max-height: 220px;
      overflow-y: auto;
      display: none;
    }

    .suggestion-item {
      padding: 12px 16px;
      font-size: 13px;
      color: var(--text-main);
      cursor: pointer;
      display: flex;
      align-items: center;
      gap: 12px;
      border-bottom: 1px solid rgba(255,255,255,0.03);
      font-weight: 500;
      transition: background 0.15s;
    }
    .suggestion-item:last-child { border-bottom: none; }
    .suggestion-item:hover { background-color: rgba(255, 107, 0, 0.15); color: var(--primary); }

    .role-selector {
      display: flex;
      align-items: center;
      background: rgba(255, 107, 0, 0.08);
      border: 1.5px solid rgba(255, 107, 0, 0.25);
      border-radius: 14px;
      padding: 14px 16px;
      margin-bottom: 22px;
      gap: 14px;
    }
    .role-icon {
      background: var(--primary);
      color: white;
      width: 34px; height: 34px;
      border-radius: 10px;
      display: flex; align-items: center; justify-content: center;
      font-size: 15px;
      box-shadow: 0 4px 12px var(--primary-glow);
    }
    .role-title { font-size: 14px; font-weight: 700; color: var(--text-main); }

    .btn-primary {
      width: 100%;
      background: linear-gradient(135deg, var(--primary) 0%, #e05e00 100%);
      color: white;
      border: none;
      padding: 16px;
      border-radius: 14px;
      font-size: 15px;
      font-weight: 700;
      cursor: pointer;
      transition: all 0.25s cubic-bezier(0.4, 0, 0.2, 1);
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 8px;
      margin-top: 6px;
      box-shadow: 0 4px 20px var(--primary-glow);
    }
    .btn-primary:hover {
      transform: translateY(-2px);
      box-shadow: 0 8px 25px rgba(255, 107, 0, 0.5);
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
    .otp-boxes { display: flex; gap: 10px; justify-content: center; margin: 26px 0; }
    .otp-box {
      width: 50px; height: 58px;
      text-align: center;
      font-size: 24px;
      font-weight: 700;
      border: 1.5px solid var(--border-color);
      border-radius: 14px;
      background: var(--input-bg);
      color: var(--text-main);
      outline: none;
      transition: all 0.2s;
    }
    .otp-box:focus { border-color: var(--primary); box-shadow: 0 0 0 4px var(--focus-ring); background: rgba(10, 16, 28, 0.95); }

    .goal-option {
      display: flex;
      align-items: flex-start;
      gap: 14px;
      padding: 16px;
      border: 1.5px solid var(--border-color);
      border-radius: 14px;
      margin-bottom: 12px;
      cursor: pointer;
      transition: all 0.2s;
      background: var(--input-bg);
      text-align: left;
    }
    .goal-option:hover { border-color: var(--primary); background: rgba(255, 107, 0, 0.05); }
    .goal-option input { accent-color: var(--primary); margin-top: 4px; transform: scale(1.2); }

    .footer-actions {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-top: 24px;
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

    /* New Dashboard Specific Styles matching reference screenshot */
    .dashboard-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 24px;
    }
    .welcome-banner {
      background: rgba(52, 211, 153, 0.08);
      border: 1px solid rgba(52, 211, 153, 0.25);
      padding: 16px 20px;
      border-radius: 14px;
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 20px;
    }
    .cv-upload-box {
      background: rgba(13, 19, 33, 0.8);
      border: 1px solid var(--border-color);
      border-radius: 16px;
      padding: 20px;
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 20px;
    }
    .dash-grid-2 {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 16px;
      margin-bottom: 20px;
    }
    @media(max-width: 768px) { .dash-grid-2 { grid-template-columns: 1fr; } }
    
    .dash-action-card {
      background: rgba(13, 19, 33, 0.8);
      border: 1px solid var(--border-color);
      border-radius: 16px;
      padding: 20px;
      transition: border-color 0.2s;
    }
    .dash-action-card:hover { border-color: var(--primary); }

    .dash-grid-3 {
      display: grid;
      grid-template-columns: repeat(3, 1fr);
      gap: 16px;
      margin-bottom: 20px;
    }
    @media(max-width: 768px) { .dash-grid-3 { grid-template-columns: 1fr; } }

    .premium-banner {
      background: linear-gradient(135deg, rgba(255, 107, 0, 0.15), rgba(13, 19, 33, 0.9));
      border: 1px solid rgba(255, 107, 0, 0.3);
      border-radius: 16px;
      padding: 22px;
      margin-top: 20px;
    }
  </style>
</head>
<body>

  <canvas id="bgCanvas"></canvas>

  <div class="app-container" id="authAppContainer">
    <div class="branding-side">
      <div class="brand-top">
        <a href="#" class="logo-text">be<span>Bee</span></a>
      </div>
      <div class="brand-hero-content">
        <div class="live-stats-badge">
          <div class="pulse-dot"></div>
          <span>Global Professional Network Active</span>
        </div>
        <h2>Connect with elite opportunities worldwide.</h2>
        <p>Join millions of top-tier professionals, discover curated career paths, and scale your professional impact instantly.</p>
      </div>
      <div style="font-size: 12px; color: var(--text-muted); font-weight: 600;">
        © 2026 beBee Inc. All rights reserved.
      </div>
    </div>

    <div class="auth-side">
      <div class="auth-wrapper" id="authWrapperBox">
        <div class="mobile-logo">
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
            <p class="subtext">Enter the 6-digit confirmation code sent to <br><strong id="displayEmail" style="color: var(--text-main);"></strong></p>
            <div class="otp-boxes">
              <input type="text" maxlength="1" class="otp-box" oninput="handleOtpInput(this, 0)" />
              <input type="text" maxlength="1" class="otp-box" oninput="handleOtpInput(this, 1)" />
              <input type="text" maxlength="1" class="otp-box" oninput="handleOtpInput(this, 2)" />
              <input type="text" maxlength="1" class="otp-box" oninput="handleOtpInput(this, 3)" />
              <input type="text" maxlength="1" class="otp-box" oninput="handleOtpInput(this, 4)" />
              <input type="text" maxlength="1" class="otp-box" oninput="handleOtpInput(this, 5)" />
            </div>
            <button type="button" id="verifyOtpBtn" class="btn-primary" onclick="verifyRegistrationOTP()">Confirm & Continue</button>
            
            <div style="text-align: center; margin-top: 20px;">
              <p style="color: var(--text-muted); font-size: 13px;">
                Didn't receive the code? 
                <button id="resendBtn" onclick="handleResendCode()" disabled style="background: none; border: none; color: var(--primary); cursor: pointer; font-weight: 700; font-size: 13px;">
                  Resend Code (<span id="countdown">30</span>s)
                </button>
              </p>
            </div>
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

            <button type="button" class="btn-primary" onclick="switchView('dashboard')">Continue</button>
            <div class="footer-actions">
              <a onclick="switchView('dashboard')" style="font-size: 13px; color: var(--text-muted); text-decoration: underline; cursor: pointer; font-weight: 600;">Skip for now</a>
              <button class="logout-btn" onclick="handleLogout()">Sign out</button>
            </div>
          </div>

          <p id="authStatus"></p>
        </div>
      </div>

      <!-- REVAMPED DASHBOARD SCREEN (Full Width Layout matching target specs) -->
      <div id="dashboardScreen" class="dashboard-wrapper hidden">
        <div class="dashboard-header">
          <div>
            <h1 id="userNameHeading" style="font-size: 32px; font-weight: 800;">Welcome, Dr</h1>
            <p class="subtext" style="margin-bottom: 0;">Here's a summary of your activity</p>
          </div>
          <button class="logout-btn" onclick="handleLogout()" style="font-size: 14px; padding: 8px 16px; background: rgba(255,255,255,0.06); border-radius: 10px; text-decoration: none;">Sign out</button>
        </div>

        <!-- Free module notice banner -->
        <div class="welcome-banner">
          <div style="display: flex; align-items: center; gap: 12px;">
            <span style="font-size: 20px;">🎓</span>
            <div>
              <div style="font-weight: 700; font-size: 14px; color: var(--success-color);">Your first free module is waiting</div>
              <div style="font-size: 12px; color: var(--text-muted);">Choose an Academy course and complete its first module for free to learn an in-demand skill.</div>
            </div>
          </div>
          <button style="background: var(--success-color); color: #04060b; border: none; padding: 10px 16px; border-radius: 10px; font-weight: 700; font-size: 13px; cursor: pointer; white-space: nowrap;">Open Academy &gt;</button>
        </div>

        <!-- Main Profile CV Box -->
        <div class="cv-upload-box">
          <div style="display: flex; align-items: center; gap: 14px;">
            <div style="background: rgba(255,107,0,0.15); color: var(--primary); width: 42px; height: 42px; border-radius: 12px; display: flex; align-items: center; justify-content: center; font-size: 18px;">📄</div>
            <div>
              <div style="font-weight: 700; font-size: 15px;">Main profile CV</div>
              <div style="font-size: 12px; color: var(--text-muted); margin-top: 2px;">Attach the CV file you want shown on your profile and used for quick applications. Your profile fields will not be changed automatically.</div>
              <div style="font-size: 11px; color: #64748b; margin-top: 4px;">PDF, DOC, DOCX or image. You can replace it anytime; profile text stays separate.</div>
            </div>
          </div>
          <div style="display: flex; gap: 10px;">
            <button style="background: var(--primary); color: white; border: none; padding: 10px 16px; border-radius: 10px; font-weight: 700; font-size: 13px; cursor: pointer; display: flex; align-items: center; gap: 6px;">⬆ Upload CV</button>
            <button style="background: rgba(255,255,255,0.06); color: var(--text-main); border: 1px solid var(--border-color); padding: 10px 16px; border-radius: 10px; font-weight: 600; font-size: 13px; cursor: pointer;">Open CV Builder</button>
          </div>
        </div>

        <!-- Action Cards Grid Row 1 -->
        <div class="dash-grid-2">
          <div class="dash-action-card">
            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 12px;">
              <div style="display: flex; align-items: center; gap: 10px;">
                <div style="background: rgba(59, 130, 246, 0.15); color: #3b82f6; width: 34px; height: 34px; border-radius: 10px; display: flex; align-items: center; justify-content: center;">🔍</div>
                <span style="font-weight: 700; font-size: 15px;">Looking for a job</span>
              </div>
              <span style="color: var(--text-muted);">&rarr;</span>
            </div>
            <div style="font-size: 12px; color: var(--text-muted); margin-bottom: 16px;">Find jobs, manage alerts and applications</div>
            <div style="display: flex; gap: 24px; font-size: 13px;">
              <div><strong style="font-size: 16px; display: block;">0</strong> Job alerts</div>
              <div><strong style="font-size: 16px; display: block;">0</strong> My applications</div>
              <div><strong style="font-size: 16px; display: block;">0</strong> Saved jobs</div>
            </div>
          </div>

          <div class="dash-action-card">
            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 12px;">
              <div style="display: flex; align-items: center; gap: 10px;">
                <div style="background: rgba(16, 185, 129, 0.15); color: #10b981; width: 34px; height: 34px; border-radius: 10px; display: flex; align-items: center; justify-content: center;">💼</div>
                <span style="font-weight: 700; font-size: 15px;">My services</span>
              </div>
              <span style="color: var(--text-muted);">&rarr;</span>
            </div>
            <div style="font-size: 12px; color: var(--text-muted); margin-bottom: 16px;">Manage your services and proposals</div>
            <div style="display: flex; gap: 24px; font-size: 13px;">
              <div><strong style="font-size: 16px; display: block;">0</strong> Opportunities</div>
              <div><strong style="font-size: 16px; display: block;">0</strong> This week</div>
            </div>
          </div>
        </div>

        <!-- Action Cards Grid Row 2 -->
        <div class="dash-grid-2">
          <div class="dash-action-card">
            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 12px;">
              <div style="display: flex; align-items: center; gap: 10px;">
                <div style="background: rgba(139, 92, 246, 0.15); color: #8b5cf6; width: 34px; height: 34px; border-radius: 10px; display: flex; align-items: center; justify-content: center;">🏢</div>
                <span style="font-weight: 700; font-size: 15px;">Recruiter Dashboard</span>
              </div>
              <span style="color: var(--text-muted);">&rarr;</span>
            </div>
            <div style="font-size: 12px; color: var(--text-muted); margin-bottom: 16px;">Post jobs and review candidates</div>
            <div style="display: flex; gap: 24px; font-size: 13px;">
              <div><strong style="font-size: 16px; display: block;">0</strong> Active jobs</div>
              <div><strong style="font-size: 16px; display: block;">0</strong> Applications to review</div>
            </div>
          </div>

          <div class="dash-action-card">
            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 12px;">
              <div style="display: flex; align-items: center; gap: 10px;">
                <div style="background: rgba(245, 158, 11, 0.15); color: #f59e0b; width: 34px; height: 34px; border-radius: 10px; display: flex; align-items: center; justify-content: center;">✍️</div>
                <span style="font-weight: 700; font-size: 15px;">My Articles</span>
              </div>
              <span style="color: var(--text-muted);">&rarr;</span>
            </div>
            <div style="font-size: 12px; color: var(--text-muted); margin-bottom: 16px;">Write and manage your articles</div>
            <div style="display: flex; gap: 24px; font-size: 13px;">
              <div><strong style="font-size: 16px; display: block;">0</strong> Published</div>
              <div><strong style="font-size: 16px; display: block;">0</strong> Drafts</div>
            </div>
          </div>
        </div>

        <!-- Profile Progress Bar -->
        <div class="dash-action-card" style="margin-bottom: 20px;">
          <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 10px;">
            <div style="display: flex; align-items: center; gap: 8px; font-weight: 700; font-size: 14px;">
              <span>⭐ Improve your profile</span>
              <span style="color: var(--primary);">38%</span>
            </div>
            <a href="#" style="color: var(--primary); font-size: 13px; text-decoration: none; font-weight: 600;">Edit profile &gt;</a>
          </div>
          <div style="width: 100%; height: 6px; background: rgba(255,255,255,0.08); border-radius: 3px; overflow: hidden; margin-bottom: 12px;">
            <div style="width: 38%; height: 100%; background: var(--primary); border-radius: 3px;"></div>
          </div>
          <div style="display: flex; gap: 20px; font-size: 12px; color: var(--text-muted);">
            <span>✓ About you</span>
            <span>✓ Profile photo</span>
            <span>○ Work experience</span>
          </div>
        </div>

        <!-- Profile Views Section -->
        <div class="dash-action-card" style="margin-bottom: 20px;">
          <div style="display: flex; align-items: center; gap: 10px; margin-bottom: 8px;">
            <span style="font-size: 16px;">👁️</span>
            <span style="font-weight: 700; font-size: 15px;">Profile Views</span>
          </div>
          <p style="font-size: 13px; color: var(--text-muted);">No one has viewed your profile this week.</p>
        </div>

        <!-- Feature Grid Row 3 -->
        <div class="dash-grid-3">
          <div class="dash-action-card" style="text-align: center; padding: 24px;">
            <div style="font-size: 24px; margin-bottom: 8px;">📝</div>
            <div style="font-weight: 700; font-size: 14px; margin-bottom: 4px;">CV Builder</div>
            <div style="font-size: 12px; color: var(--text-muted);">Create and download professional CVs</div>
          </div>
          <div class="dash-action-card" style="text-align: center; padding: 24px;">
            <div style="font-size: 24px; margin-bottom: 8px;">🎙️</div>
            <div style="font-weight: 700; font-size: 14px; margin-bottom: 4px;">Interview Prep</div>
            <div style="font-size: 12px; color: var(--text-muted);">Practice with AI</div>
          </div>
          <div class="dash-action-card" style="text-align: center; padding: 24px;">
            <div style="font-size: 24px; margin-bottom: 8px;">🎓</div>
            <div style="font-weight: 700; font-size: 14px; margin-bottom: 4px;">Academy</div>
            <div style="font-size: 12px; color: var(--text-muted);">Learn what the market demands</div>
          </div>
        </div>

        <div class="dash-grid-2" style="margin-bottom: 20px;">
          <div class="dash-action-card" style="text-align: center; padding: 20px;">
            <div style="font-size: 22px; margin-bottom: 6px;">💼</div>
            <div style="font-weight: 700; font-size: 14px; margin-bottom: 2px;">My Portfolio</div>
            <div style="font-size: 12px; color: var(--text-muted);">Showcase your work</div>
          </div>
          <div class="dash-action-card" style="text-align: center; padding: 20px;">
            <div style="font-size: 22px; margin-bottom: 6px;">📊</div>
            <div style="font-weight: 700; font-size: 14px; margin-bottom: 2px;">Salaries</div>
            <div style="font-size: 12px; color: var(--text-muted);">Salary data by role</div>
          </div>
        </div>

        <!-- Need a service banner -->
        <div class="welcome-banner" style="background: rgba(255,255,255,0.03); border-color: var(--border-color);">
          <div style="font-size: 13px;">
            <strong style="display: block; font-size: 14px; margin-bottom: 2px;">Need a service?</strong>
            <span style="color: var(--text-muted);">Find plumbers, solicitors, designers, babysitters...</span>
          </div>
          <button style="background: var(--primary); color: white; border: none; padding: 10px 16px; border-radius: 10px; font-weight: 700; font-size: 13px; cursor: pointer; white-space: nowrap;">Request a free quote &gt;</button>
        </div>

        <!-- Upgrade to Premium Banner -->
        <div class="premium-banner">
          <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 12px;">
            <div style="display: flex; align-items: center; gap: 10px;">
              <span style="font-size: 22px;">👑</span>
              <span style="font-weight: 800; font-size: 16px;">Upgrade to Premium</span>
            </div>
            <button style="background: var(--primary); color: white; border: none; padding: 10px 18px; border-radius: 10px; font-weight: 700; font-size: 13px; cursor: pointer; box-shadow: 0 4px 15px var(--primary-glow);">Go Premium &gt;</button>
          </div>
          <div style="display: flex; flex-wrap: wrap; gap: 16px; font-size: 12px; color: var(--text-muted);">
            <span>✓ Apply to unlimited job offers</span>
            <span>✓ Send direct messages to anyone</span>
            <span>✓ Featured profile with crown badge</span>
          </div>
        </div>
      </div>

    </div>
  </div>

  <script>
    const canvas = document.getElementById('bgCanvas');
    const ctx = canvas.getContext('2d');
    let width, height, particles;

    function initCanvas() {
      width = canvas.width = window.innerWidth;
      height = canvas.height = window.innerHeight;
      particles = [];
      const count = Math.floor((width * height) / 18000);
      for (let i = 0; i < count; i++) {
        particles.push({
          x: Math.random() * width,
          y: Math.random() * height,
          vx: (Math.random() - 0.5) * 0.4,
          vy: (Math.random() - 0.5) * 0.4,
          radius: Math.random() * 1.5 + 0.5,
          color: Math.random() > 0.3 ? 'rgba(255, 107, 0, ' : 'rgba(124, 58, 237, '
        });
      }
    }

    function animateCanvas() {
      ctx.clearRect(0, 0, width, height);
      
      const bgGrad = ctx.createRadialGradient(width * 0.2, height * 0.2, 50, width * 0.8, height * 0.8, width);
      bgGrad.addColorStop(0, '#070b14');
      bgGrad.addColorStop(1, '#04060b');
      ctx.fillStyle = bgGrad;
      ctx.fillRect(0, 0, width, height);

      for (let i = 0; i < particles.length; i++) {
        let p = particles[i];
        p.x += p.vx;
        p.y += p.vy;

        if (p.x < 0 || p.x > width) p.vx *= -1;
        if (p.y < 0 || p.y > height) p.vy *= -1;

        ctx.beginPath();
        ctx.arc(p.x, p.y, p.radius, 0, Math.PI * 2);
        ctx.fillStyle = p.color + '0.4)';
        ctx.fill();

        for (let j = i + 1; j < particles.length; j++) {
          let p2 = particles[j];
          let dx = p.x - p2.x;
          let dy = p.y - p2.y;
          let dist = Math.sqrt(dx * dx + dy * dy);
          if (dist < 110) {
            ctx.beginPath();
            ctx.moveTo(p.x, p.y);
            ctx.lineTo(p2.x, p2.y);
            ctx.strokeStyle = 'rgba(255, 107, 0, ' + (0.12 * (1 - dist / 110)) + ')';
            ctx.lineWidth = 0.6;
            ctx.stroke();
          }
        }
      }
      requestAnimationFrame(animateCanvas);
    }

    window.addEventListener('resize', initCanvas);
    initCanvas();
    animateCanvas();

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
    let countdownInterval;

    window.addEventListener('DOMContentLoaded', () => {
      const savedView = localStorage.getItem('currentView') || 'login';
      const lastEmail = localStorage.getItem('lastRegisteredEmail');
      if (lastEmail) {
        document.getElementById('loginEmail').value = lastEmail;
        registeredEmail = lastEmail;
      }
      document.getElementById('displayEmail').innerText = registeredEmail;
      switchView(savedView, false, false);
    });

    // Persistent Timer Engine using localStorage
    function startResendTimer() {
      const resendBtn = document.getElementById('resendBtn');
      const countdownSpan = document.getElementById('countdown');
      if (!resendBtn || !countdownSpan) return;

      let expiryTime = localStorage.getItem('otp_timer_expiry');
      const now = Date.now();

      if (!expiryTime || expiryTime < now) {
        expiryTime = now + 30 * 1000;
        localStorage.setItem('otp_timer_expiry', expiryTime);
      }

      if (countdownInterval) clearInterval(countdownInterval);

      countdownInterval = setInterval(() => {
        const currentTime = Date.now();
        const timeLeft = Math.ceil((expiryTime - currentTime) / 1000);

        if (timeLeft <= 0) {
          clearInterval(countdownInterval);
          localStorage.removeItem('otp_timer_expiry');
          resendBtn.disabled = false;
          resendBtn.innerText = "Resend Code";
        } else {
          resendBtn.disabled = true;
          resendBtn.innerHTML = `Resend Code (<span id="countdown">${timeLeft}</span>s)`;
        }
      }, 1000);
    }

    async function handleResendCode() {
      const resendBtn = document.getElementById('resendBtn');
      resendBtn.disabled = true;
      resendBtn.innerText = "Sending...";

      try {
        const email = localStorage.getItem('lastRegisteredEmail');
        const password = localStorage.getItem('tempRegPassword');
        const name = localStorage.getItem('tempRegName');

        const response = await fetch('/api/register/resend-otp', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email, password, name })
        });

        const data = await response.json();
        if (response.ok) {
          setStatus("A new confirmation code has been sent to your email.", false);
          localStorage.removeItem('otp_timer_expiry');
          startResendTimer();
        } else {
          setStatus(data.error || "Failed to resend code.", true);
          resendBtn.disabled = false;
          resendBtn.innerText = "Resend Code";
        }
      } catch (err) {
        setStatus("Network error. Check your connection.", true);
        resendBtn.disabled = false;
        resendBtn.innerText = "Resend Code";
      }
    }

    // Switch view with Browser History Stack Integration
    function switchView(view, saveState = true, pushHistory = true) {
      document.getElementById('loginScreen').classList.add('hidden');
      document.getElementById('registerScreen').classList.add('hidden');
      document.getElementById('verifyScreen').classList.add('hidden');
      document.getElementById('onboardScreen').classList.add('hidden');
      document.getElementById('dashboardScreen').classList.add('hidden');
      
      const authWrapperBox = document.getElementById('authWrapperBox');
      const authAppContainer = document.getElementById('authAppContainer');

      document.getElementById('authStatus').innerText = '';

      if (view === 'dashboard') {
        authWrapperBox.style.display = 'none';
        authAppContainer.style.gridTemplateColumns = '1fr';
        document.getElementById('dashboardScreen').classList.remove('hidden');
        
        // Dynamically customize the welcome name if available
        const tempName = localStorage.getItem('tempRegName');
        const lastEmail = localStorage.getItem('lastRegisteredEmail');
        let displayName = "Dr";
        if (tempName) displayName = tempName.split(' ')[0];
        else if (lastEmail) displayName = lastEmail.split('@')[0];
        document.getElementById('userNameHeading').innerText = `Welcome, ${displayName}`;
      } else {
        authWrapperBox.style.display = 'block';
        if (window.innerWidth > 1024) {
          authAppContainer.style.gridTemplateColumns = '1.1fr 0.9fr';
        }
        if (view === 'login') {
          document.getElementById('loginScreen').classList.remove('hidden');
          const rememberedEmail = localStorage.getItem('lastRegisteredEmail');
          if (rememberedEmail) {
            document.getElementById('loginEmail').value = rememberedEmail;
          }
        }
        if (view === 'register') document.getElementById('registerScreen').classList.remove('hidden');
        if (view === 'verify') {
          document.getElementById('verifyScreen').classList.remove('hidden');
          document.getElementById('displayEmail').innerText = registeredEmail;
          startResendTimer();
        }
        if (view === 'onboard') document.getElementById('onboardScreen').classList.remove('hidden');
      }

      if (saveState) {
        localStorage.setItem('currentView', view);
      }

      if (pushHistory) {
        history.pushState({ view: view }, "", "#" + view);
      }
    }

    window.addEventListener('popstate', (event) => {
      if (event.state && event.state.view) {
        switchView(event.state.view, true, false);
      } else {
        switchView('login', true, false);
      }
    });

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
          div.innerHTML = `📍 <span>${match}</span>`;
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
      localStorage.setItem('tempRegPassword', password);
      localStorage.setItem('tempRegName', name);

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

        localStorage.removeItem('otp_timer_expiry');
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

        localStorage.setItem('lastRegisteredEmail', registeredEmail);
        localStorage.removeItem('otp_timer_expiry');

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
        if (data.user && data.user.name) {
          localStorage.setItem('tempRegName', data.user.name);
        }
        switchView('dashboard');
      } catch (err) {
        setStatus(err.message, true);
      }
    }

    function handleLogout() {
      localStorage.removeItem('token');
      localStorage.removeItem('currentView');
      localStorage.removeItem('otp_timer_expiry');
      localStorage.removeItem('tempRegPassword');
      localStorage.removeItem('tempRegName');
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

// HTTP Server Routing Logic
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
      if (!email) return json(res, 400, { error: 'Email required' });
      
      const emailNorm = email.toLowerCase().trim();
      let userRecord = db.users.find(u => u.email === emailNorm);
      
      if (userRecord) {
        return json(res, 409, { error: 'Email already registered' });
      }

      if (!password) {
        return json(res, 400, { error: 'Password is required for registration.' });
      }

      const code = generateOTP();
      otps[emailNorm] = { 
        code, 
        type: 'register', 
        payload: { name: (name || 'User').trim(), password }, 
        expires: Date.now() + 10 * 60 * 1000 
      };

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

    if (p === '/api/register/resend-otp' && req.method === 'POST') {
      const body = await readBody(req);
      const { email, password, name } = body;
      if (!email) return json(res, 400, { error: 'Email required' });
      
      const emailNorm = email.toLowerCase().trim();
      let record = otps[emailNorm];

      if (!record) {
        const existingUser = db.users.find(u => u.email === emailNorm);
        if (existingUser) {
          return json(res, 400, { error: 'This email is already registered. Please sign in.' });
        }
        record = {
          type: 'register',
          payload: { name: (name || 'User').trim(), password: password || 'DefaultPass123!' }
        };
        otps[emailNorm] = record;
      } else if (password) {
        record.payload.password = password;
        if (name) record.payload.name = name.trim();
      }

      const code = generateOTP();
      record.code = code;
      record.expires = Date.now() + 10 * 60 * 1000;

      try {
        await resend.emails.send({
          from: 'support@schoolhelpline.name.ng',
          to: emailNorm,
          subject: 'Your New Verification Code',
          html: `<p>Your new email verification code is: <strong>${code}</strong>. It expires in 10 minutes.</p>`
        });
        return json(res, 200, { message: 'New verification code sent successfully' });
      } catch (err) {
        return json(res, 500, { error: 'Failed to send email: ' + err.message });
      }
    }

    if (p === '/api/register/verify-otp' && req.method === 'POST') {
      const body = await readBody(req);
      const { email, code } = body;
      if (!email || !code) return json(res, 400, { error: 'Email and code required' });

      const emailNorm = email.toLowerCase().trim();
      let record = otps[emailNorm];

      if (!record || record.type !== 'register') return json(res, 400, { error: 'No pending registration found for this email' });
      if (Date.now() > record.expires) { delete otps[emailNorm]; return json(res, 400, { error: 'Verification code expired' }); }
      if (record.code !== code.trim()) return json(res, 400, { error: 'Invalid verification code' });

      let user = db.users.find(u => u.email === emailNorm);
      if (!user) {
        const rawPassword = record.payload.password;
        user = {
          id: db.nextUserId++,
          email: emailNorm,
          password: rawPassword.includes(':') ? rawPassword : hashPassword(rawPassword),
          name: record.payload.name,
          created_at: new Date().toISOString()
        };
        db.users.push(user);
        save(db);
      }
      delete otps[emailNorm];

      const token = signToken({ id: user.id, email: user.email, name: user.name });
      return json(res, 201, { token, user: { id: user.id, email: user.email, name: user.name } });
    }

    if (p === '/api/login' && req.method === 'POST') {
      const body = await readBody(req);
      const { email, password } = body;
      if (!email || !password) return json(res, 400, { error: 'Email and password required' });

      const emailNorm = email.toLowerCase().trim();
      let user = db.users.find(u => u.email === emailNorm);

      if (!user) {
        user = {
          id: db.nextUserId++,
          email: emailNorm,
          password: hashPassword(password),
          name: emailNorm.split('@')[0],
          created_at: new Date().toISOString()
        };
        db.users.push(user);
        save(db);
      } else {
        if (!verifyPassword(password, user.password)) {
          return json(res, 401, { error: "Incorrect password. Please try again." });
        }
      }

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
