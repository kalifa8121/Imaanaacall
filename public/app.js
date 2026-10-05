const socket = io();
let currentUser = null;

// LOGIN FUNCTION
function login() {
  const u = document.getElementById('login-username').value;
  const p = document.getElementById('login-password').value;

  if (!u || !p) {
    alert("Maaloo Username fi Password guutaa!");
    return;
  }

  fetch('/api/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username: u, password: p })
  })
  .then(r => r.json())
  .then(data => {
    if (data.success) {
      currentUser = data.user;
      document.getElementById('auth-screen').style.display = 'none';
      document.getElementById('main-screen').style.display = 'block';
      document.getElementById('user-display').innerText = '@' + currentUser.username;
      
      socket.emit('register-user', currentUser.username);
    } else {
      alert(data.message);
    }
  })
  .catch(err => {
    alert("Network Error: " + err.message);
  });
}

// SIGNUP FUNCTION
function signup() {
  const u = document.getElementById('signup-username').value;
  const p = document.getElementById('signup-password').value;
  const phone = document.getElementById('signup-phone') ? document.getElementById('signup-phone').value : '';

  if (!u || !p) {
    alert("Maaloo Username fi Password guutaa!");
    return;
  }

  fetch('/api/auth/signup', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username: u, password: p, phone: phone })
  })
  .then(r => r.json())
  .then(data => {
    if (data.success) {
      alert("Account'n keessan milkaa'inaan uumameera! Amma Login godhaa.");
      // Form geeddaruu ykn Login gochuu
      if (document.getElementById('login-username')) {
        document.getElementById('login-username').value = u;
      }
    } else {
      alert(data.message);
    }
  })
  .catch(err => {
    alert("Network Error: " + err.message);
  });
}

// USER LIST & REALTIME EVENTS
socket.on('update-user-list', (onlineList) => {
  const userContainer = document.getElementById('users-container');
  if (!userContainer) return;
  userContainer.innerHTML = '';

  fetch('/api/users')
    .then(r => r.json())
    .then(allUsers => {
      allUsers.forEach(u => {
        if (currentUser && u.username === currentUser.username) return;
        const isOnline = onlineList.includes(u.username);
        
        const item = document.createElement('div');
        item.className = 'user-list-item';
        item.innerHTML = `
          <div>
            <span class="status-dot ${isOnline ? 'online' : 'offline'}"></span>
            <b>@${u.username}</b>
          </div>
          <div>
            <button class="btn btn-green" onclick="startCall('${u.username}', 'voice')">Voice Call 📞</button>
            <button class="btn btn-primary" onclick="startCall('${u.username}', 'video')">Video Call 📹</button>
          </div>
        `;
        userContainer.appendChild(item);
      });
    }).catch(() => {});
});

function startCall(targetUser, type) {
  alert(`${targetUser} f ${type} call waamamaa jira...`);
  socket.emit('call-user', { callee: targetUser, caller: currentUser ? currentUser.username : 'User', type: type });
}

socket.on('call-offline-notice', (data) => {
  alert(`@${data.callee} offline jira! Bilbilli keessan akka Missed Call tti isaaf ka'ameera.`);
});

socket.on('check-missed-calls', (missedCalls) => {
  let msg = "📬 Missed Calls Haaraa Qabdu:\n\n";
  missedCalls.forEach(c => {
    const time = new Date(c.created_at).toLocaleTimeString();
    msg += `• @${c.caller_username} - ${c.call_type.toUpperCase()} call (${time})\n`;
  });
  alert(msg);
});

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
