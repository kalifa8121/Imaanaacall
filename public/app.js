const socket = io();
let currentUser = null;

// Page Load - User Check
window.onload = () => {
  const savedUser = localStorage.getItem('imaanaa_user');
  if (savedUser) {
    currentUser = JSON.parse(savedUser);
    showMainApp();
  }
};

function toggleAuth(type) {
  if (type === 'signup') {
    document.getElementById('login-card').style.display = 'none';
    document.getElementById('signup-card').style.display = 'block';
  } else {
    document.getElementById('signup-card').style.display = 'none';
    document.getElementById('login-card').style.display = 'block';
  }
}

// Signup (UNTOUCHED)
async function handleSignup() {
  const username = document.getElementById('signup-username').value.trim();
  const password = document.getElementById('signup-password').value.trim();
  const phone = document.getElementById('signup-phone').value.trim();

  if (!username || !password) {
    alert("Maqaa fi Password galchaa!");
    return;
  }

  try {
    const res = await fetch('/api/auth/signup', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password, phone })
    });
    const data = await res.json();

    if (data.success) {
      currentUser = data.user;
      localStorage.setItem('imaanaa_user', JSON.stringify(currentUser));
      showMainApp();
    } else {
      alert(data.message);
    }
  } catch (err) {
    alert("Network Error!");
  }
}

// Login (UNTOUCHED)
async function handleLogin() {
  const username = document.getElementById('login-username').value.trim();
  const password = document.getElementById('login-password').value.trim();

  if (!username || !password) {
    alert("Maqaa fi Password galchaa!");
    return;
  }

  try {
    const res = await fetch('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password })
    });
    const data = await res.json();

    if (data.success) {
      currentUser = data.user;
      localStorage.setItem('imaanaa_user', JSON.stringify(currentUser));
      showMainApp();
    } else {
      alert(data.message);
    }
  } catch (err) {
    alert("Network Error!");
  }
}

// Logout
function handleLogout() {
  localStorage.removeItem('imaanaa_user');
  location.reload();
}

// Show Main App Screen
function showMainApp() {
  document.getElementById('auth-section').style.display = 'none';
  document.getElementById('app-section').style.display = 'block';
  document.getElementById('user-display').style.display = 'flex';
  document.getElementById('current-username').innerText = '@' + currentUser.username;

  socket.emit('user-connected', currentUser.username);
}

// Offline/Online Users Call Function
function makeCall(targetUsername, type) {
  alert(`Waamichi ${type.toUpperCase()} gara @${targetUsername} tti jalqabeera...`);
  socket.emit('start-call', {
    toUsername: targetUsername,
    type: type
  });
}

socket.on('call-status', data => alert(data.message));
socket.on('incoming-call', data => alert(`Waamicha ${data.type.toUpperCase()} @${data.from} irraa isiniif dhufaa jira!`));

// Missed Calls Alert (Yeroo Online Seenan)
socket.on('missed-calls-notification', missedCalls => {
  let msg = "Yeroo isin offline turtan waamicha isin jala darbe:\n";
  missedCalls.forEach(call => {
    msg += `- Waamicha ${call.call_type.toUpperCase()} nama @${call.caller_username} irraa!\n`;
  });
  alert(msg);
});

// Post Submit
function submitPost() {
  const content = document.getElementById('post-text').value;
  const file = document.getElementById('post-file').files[0];

  if (file) {
    const reader = new FileReader();
    reader.onload = e => {
      const type = file.type.startsWith('video') ? 'video' : 'image';
      socket.emit('create-post', { username: currentUser.username, content, mediaUrl: e.target.result, mediaType: type });
      document.getElementById('post-text').value = '';
    };
    reader.readAsDataURL(file);
  } else if (content.trim() !== '') {
    socket.emit('create-post', { username: currentUser.username, content });
    document.getElementById('post-text').value = '';
  }
}

// Feed realtime update
socket.on('new-post-created', post => {
  const feed = document.getElementById('feed-container');
  if (!feed) return;
  const postHtml = `
    <div class="post">
      <b>@${post.username}</b>
      <p>${post.content || ''}</p>
      ${post.media_type === 'image' ? `<img src="${post.media_url}">` : ''}
      ${post.media_type === 'video' ? `<video src="${post.media_url}" controls></video>` : ''}
    </div>`;
  feed.insertAdjacentHTML('afterbegin', postHtml);
});
