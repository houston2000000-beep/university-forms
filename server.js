<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>beBee Style Job Board</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; font-family: Arial, sans-serif; }
    body { background-color: #f0f2f5; padding: 20px; color: #1c1e21; }
    .container { max-width: 700px; margin: 0 auto; }
    .card { background: #fff; padding: 20px; border-radius: 8px; margin-bottom: 20px; box-shadow: 0 1px 3px rgba(0,0,0,0.1); }
    input, select, textarea, button { width: 100%; margin-bottom: 10px; padding: 10px; border: 1px solid #ccc; border-radius: 6px; }
    button { background: #ff9900; color: #fff; border: none; font-size: 16px; font-weight: bold; cursor: pointer; }
    .auth-section { display: flex; gap: 10px; margin-bottom: 10px; }
    .job-item { background: #fff; padding: 16px; border-radius: 8px; margin-bottom: 12px; border-left: 5px solid #ff9900; box-shadow: 0 1px 2px rgba(0,0,0,0.05); }
    .job-item h3 { margin-bottom: 4px; }
    .job-meta { color: #65676b; font-size: 14px; margin-bottom: 8px; }
  </style>
</head>
<body>

  <div class="container">
    <!-- User Registration/Login Header -->
    <div class="card" id="authBox">
      <h2>1. Account Setup</h2>
      <p style="margin-bottom: 10px; color: #666; font-size: 14px;">Log in or register to post live jobs.</p>
      <input type="text" id="userName" placeholder="Your Name" />
      <input type="email" id="userEmail" placeholder="Email Address" />
      <input type="password" id="userPassword" placeholder="Password" />
      <div class="auth-section">
        <button onclick="handleRegister()">Register</button>
        <button onclick="handleLogin()" style="background: #4267b2;">Login</button>
      </div>
      <p id="authStatus" style="font-weight: bold; font-size: 14px;"></p>
    </div>

    <!-- Job Submission Form -->
    <div class="card">
      <h2>2. Post a Job (Instant Visibility)</h2>
      <form id="jobForm">
        <input type="text" id="title" placeholder="Job Title" required />
        <input type="text" id="company" placeholder="Company Name" required />
        <input type="text" id="location" placeholder="Location (e.g., Remote or New York)" required />
        <select id="type">
          <option value="Full-time">Full-time</option>
          <option value="Part-time">Part-time</option>
          <option value="Contract">Contract</option>
        </select>
        <textarea id="description" placeholder="Job Description..." rows="3" required></textarea>
        <button type="submit">Post Online Immediately</button>
      </form>
    </div>

    <!-- Live Public Feed -->
    <h2>Live Job Feed</h2>
    <div id="jobFeed"></div>
  </div>

  <script>
    let token = localStorage.getItem('jwt_token') || '';

    if (token) {
      document.getElementById('authStatus').innerText = 'Logged in!';
      document.getElementById('authStatus').style.color = 'green';
    }

    // Render job card UI
    function createJobHTML(job) {
      return `
        <div class="job-item">
          <h3>${job.title}</h3>
          <div class="job-meta"><strong>${job.company}</strong> • ${job.location} (${job.type})</div>
          <p>${job.description}</p>
          <small style="color: #888;">Posted by: ${job.poster_name || 'User'}</small>
        </div>
      `;
    }

    // Load initial feed
    async function loadFeed() {
      const res = await fetch('/api/jobs');
      const jobs = await res.json();
      document.getElementById('jobFeed').innerHTML = jobs.map(createJobHTML).join('');
    }

    // User Registration
    async function handleRegister() {
      const name = document.getElementById('userName').value;
      const email = document.getElementById('userEmail').value;
      const password = document.getElementById('userPassword').value;

      const res = await fetch('/api/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, email, password })
      });
      const data = await res.json();
      if (res.ok) {
        token = data.token;
        localStorage.setItem('jwt_token', token);
        document.getElementById('authStatus').innerText = 'Registered & Logged In!';
        document.getElementById('authStatus').style.color = 'green';
      } else {
        alert(data.error);
      }
    }

    // User Login
    async function handleLogin() {
      const email = document.getElementById('userEmail').value;
      const password = document.getElementById('userPassword').value;

      const res = await fetch('/api/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password })
      });
      const data = await res.json();
      if (res.ok) {
        token = data.token;
        localStorage.setItem('jwt_token', token);
        document.getElementById('authStatus').innerText = 'Logged In!';
        document.getElementById('authStatus').style.color = 'green';
      } else {
        alert(data.error);
      }
    }

    // Handle instant job submission
    document.getElementById('jobForm').addEventListener('submit', async (e) => {
      e.preventDefault();
      if (!token) {
        alert('Please register or log in first to post a job!');
        return;
      }

      const payload = {
        title: document.getElementById('title').value,
        company: document.getElementById('company').value,
        location: document.getElementById('location').value,
        type: document.getElementById('type').value,
        description: document.getElementById('description').value
      };

      const res = await fetch('/api/jobs', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify(payload)
      });

      if (res.ok) {
        const newJob = await res.json();
        // Insert new job instantly at top of feed
        document.getElementById('jobFeed').insertAdjacentHTML('afterbegin', createJobHTML(newJob));
        document.getElementById('jobForm').reset();
      } else {
        const err = await res.json();
        alert('Error: ' + err.error);
      }
    });

    loadFeed();
  </script>
</body>
</html>
