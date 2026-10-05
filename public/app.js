const socket = io();
let me = '', currentStream = null, peer = null, incomingData = null, mediaRecorder = null, recordedChunks = [];
const ringtone = document.getElementById('ringtone-audio');

function showVipInfo() {
  alert("VIP Banachuuf Lakkoofsa Bilbilaa: 0920689815 ykn Telegram: @Kaliifo_admin contact godhaa!");
}

async function registerAndLogin() {
  const username = document.getElementById('username-in').value.trim();
  const phone = document.getElementById('phone-in').value.trim();
  const bio = document.getElementById('bio-in').value.trim();

  if(!username) return alert("Maqaa galchaa!");

  me = username;

  await fetch('/api/profile/save', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username, phone, bio, avatar: '' })
  });

  socket.emit('register-user', username);
  document.getElementById('login-sec').style.display = 'none';
  document.getElementById('main-sec').style.display = 'block';
  loadPosts();
}

socket.on('banned-notice', msg => alert(msg));

socket.on('missed-calls-notice', calls => {
  calls.forEach(c => alert(`⚠️ Missed ${c.call_type} call from @${c.caller}`));
});

socket.on('update-user-list', users => {
  const container = document.getElementById('users-container');
  container.innerHTML = '';

  users.filter(u => u.username !== me).forEach(u => {
    const statusClass = u.isOnline ? 'online' : 'offline';
    const statusText = u.isOnline ? 'Online' : 'Offline';
    
    container.innerHTML += `
      <div class="user-row">
        <div>
          <span class="status-dot ${statusClass}"></span>
          <b>@${u.username}</b> <small style="color:#8696a0;">(${statusText})</small>
        </div>
        <div>
          ${u.isOnline ? `
            <button class="btn btn-green" onclick="makeCall('${u.username}', false)">Voice 📞</button>
            <button class="btn btn-blue" onclick="makeCall('${u.username}', true)">Video 📹</button>
          ` : '<small style="color:#ea4335;">Not Available</small>'}
        </div>
      </div>`;
  });
});

async function makeCall(userToCall, isVideo) {
  try {
    currentStream = await navigator.mediaDevices.getUserMedia({ audio: true, video: isVideo });
    peer = new SimplePeer({ initiator: true, trickle: false, stream: currentStream });

    peer.on('signal', signalData => {
      socket.emit('call-user', { userToCall, signalData, callerName: me, isVideo });
    });

    peer.on('stream', stream => attachMediaStream(stream, isVideo));
  } catch(e) { alert("Microphone/Camera permission required!"); }
}

socket.on('incoming-call', data => {
  incomingData = data;
  document.getElementById('caller-txt').innerText = `${data.callerName} is calling (${data.isVideo ? 'Video' : 'Voice'})...`;
  document.getElementById('call-modal').style.display = 'flex';
  ringtone.play().catch(e => console.log(e));
});

async function acceptCall() {
  ringtone.pause(); ringtone.currentTime = 0;
  document.getElementById('call-modal').style.display = 'none';

  currentStream = await navigator.mediaDevices.getUserMedia({ audio: true, video: incomingData.isVideo });
  peer = new SimplePeer({ initiator: false, trickle: false, stream: currentStream });

  peer.on('signal', signal => socket.emit('accept-call', { signal, to: incomingData.from }));
  peer.on('stream', stream => attachMediaStream(stream, incomingData.isVideo));
  peer.signal(incomingData.signal);
}

function rejectCall() {
  ringtone.pause(); ringtone.currentTime = 0;
  document.getElementById('call-modal').style.display = 'none';
  socket.emit('reject-call', { to: incomingData.from });
}

socket.on('call-accepted', signal => peer.signal(signal));
socket.on('call-failed-offline', () => alert("Maammilli offline waan ta'eef Missed Call ergameera."));

function attachMediaStream(stream, isVideo) {
  const elem = document.createElement(isVideo ? 'video' : 'audio');
  elem.srcObject = stream;
  elem.autoplay = true;
  document.body.appendChild(elem);
}

// LIVE CAMERA/VOICE RECORDING
async function startLiveRecord() {
  const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
  document.getElementById('live-preview').style.display = 'block';
  document.getElementById('live-preview').srcObject = stream;
  document.getElementById('stop-rec-btn').style.display = 'inline-block';

  recordedChunks = [];
  mediaRecorder = new MediaRecorder(stream);
  mediaRecorder.ondataavailable = e => { if (e.data.size > 0) recordedChunks.push(e.data); };
  mediaRecorder.start();
}

function stopLiveRecord() {
  mediaRecorder.stop();
  document.getElementById('live-preview').style.display = 'none';
  document.getElementById('stop-rec-btn').style.display = 'none';
  
  mediaRecorder.onstop = () => {
    const blob = new Blob(recordedChunks, { type: 'video/webm' });
    const reader = new FileReader();
    reader.onload = e => {
      socket.emit('create-post', { username: me, content: "Live Recorded Video", mediaUrl: e.target.result, mediaType: 'video' });
    };
    reader.readAsDataURL(blob);
  };
}

function submitPost() {
  const content = document.getElementById('post-text').value;
  const file = document.getElementById('post-file').files[0];

  if(file) {
    const reader = new FileReader();
    reader.onload = e => {
      const type = file.type.startsWith('image') ? 'image' : file.type.startsWith('video') ? 'video' : 'audio';
      socket.emit('create-post', { username: me, content, mediaUrl: e.target.result, mediaType: type });
    };
    reader.readAsDataURL(file);
  } else {
    socket.emit('create-post', { username: me, content });
  }
}

socket.on('post-submitted-silent', post => {
  document.getElementById('post-text').value = '';
  renderPost(post, true, true);
});

socket.on('new-post', post => renderPost(post, true, false));

async function loadPosts() {
  const res = await fetch('/api/posts');
  const posts = await res.json();
  posts.forEach(p => renderPost(p, false, false));
}

function renderPost(p, prepend, isPending) {
  const feed = document.getElementById('posts-feed');
  const div = document.createElement('div');
  div.className = 'post';

  let mediaHtml = '';
  if(p.media_url) {
    if(p.media_type === 'image') mediaHtml = `<img src="${p.media_url}">`;
    else if(p.media_type === 'video') mediaHtml = `<video src="${p.media_url}" controls></video>`;
    else mediaHtml = `<audio src="${p.media_url}" controls></audio>`;
    
    mediaHtml += `<br><a href="${p.media_url}" download="imaanaa_media" class="btn btn-secondary" style="display:inline-block; margin-top:5px; text-decoration:none;">Download 📥</a>`;
  }

  div.innerHTML = `
    <b>@${p.username}</b> ${isPending ? '<small style="color:#ffc107;">(Pending Review)</small>' : ''}
    <p>${p.content || ''}</p>
    ${mediaHtml}
    <div style="margin-top:8px;">
      <button class="btn btn-green" onclick="socket.emit('like-post', ${p.id})">👍 Like (<span id="likes-${p.id}">${p.likes || 0}</span>)</button>
    </div>
    <div class="comment-box" id="comments-${p.id}"></div>
    <div style="display:flex; gap:5px; margin-top:5px;">
      <input type="text" id="c-input-${p.id}" placeholder="Comment barreessi..." style="margin:0;">
      <button class="btn btn-blue" onclick="sendComment(${p.id})">Send</button>
    </div>`;

  if(prepend) feed.prepend(div); else feed.appendChild(div);
  loadComments(p.id);
}

async function loadComments(postId) {
  const res = await fetch(`/api/comments/${postId}`);
  const comments = await res.json();
  const div = document.getElementById(`comments-${postId}`);
  div.innerHTML = '';
  comments.forEach(c => div.innerHTML += `<div><b>@${c.username}:</b> ${c.comment}</div>`);
}

function sendComment(postId) {
  const input = document.getElementById(`c-input-${postId}`);
  if(!input.value) return;
  socket.emit('add-comment', { postId, username: me, comment: input.value });
  input.value = '';
}

socket.on('new-comment', c => {
  const div = document.getElementById(`comments-${c.post_id}`);
  if(div) div.innerHTML += `<div><b>@${c.username}:</b> ${c.comment}</div>`;
});

socket.on('update-likes', id => {
  const el = document.getElementById(`likes-${id}`);
  if(el) el.innerText = parseInt(el.innerText) + 1;
});
