const socket = io();
let me = '', currentSocketId = '', peer = null, incomingData = null, localStream = null;

function login() {
  const username = document.getElementById('username-in').value.trim();
  if(!username) return alert("Maqaa galchaa!");
  me = username;
  socket.emit('register-user', username);
  document.getElementById('login-sec').style.display = 'none';
  document.getElementById('main-sec').style.display = 'block';
  loadPosts();
}

socket.on('banned-notice', () => {
  alert("Akkasumas accountin keessan Blocked godhameera!");
  location.reload();
});

socket.on('update-user-list', (users) => {
  const div = document.getElementById('users-list');
  div.innerHTML = '';
  users.filter(u => u.username !== me).forEach(u => {
    div.innerHTML += `
      <div class="user-item">
        <span><b>${u.username}</b> ${u.is_vip ? '⭐ VIP' : ''}</span>
        <div>
          <button class="btn btn-green" onclick="makeCall('${u.id}', false)">Voice 📞</button>
          <button class="btn btn-blue" onclick="makeCall('${u.id}', true)">Video 📹</button>
        </div>
      </div>`;
  });
});

async function makeCall(userToCall, isVideo) {
  try {
    localStream = await navigator.mediaDevices.getUserMedia({ audio: true, video: isVideo });
    peer = new SimplePeer({ initiator: true, trickle: false, stream: localStream });

    peer.on('signal', data => {
      socket.emit('call-user', { userToCall, signalData: data, callerName: me, isVideo });
    });

    peer.on('stream', stream => attachMediaStream(stream, isVideo));
  } catch(e) { alert("Mic/Camera Permission Required!"); }
}

socket.on('incoming-call', data => {
  incomingData = data;
  document.getElementById('caller-txt').innerText = `${data.callerName} calls (${data.isVideo ? 'Video' : 'Voice'})...`;
  document.getElementById('call-modal').style.display = 'flex';
});

async function acceptCall() {
  document.getElementById('call-modal').style.display = 'none';
  localStream = await navigator.mediaDevices.getUserMedia({ audio: true, video: incomingData.isVideo });
  peer = new SimplePeer({ initiator: false, trickle: false, stream: localStream });

  peer.on('signal', signal => socket.emit('accept-call', { signal, to: incomingData.from }));
  peer.on('stream', stream => attachMediaStream(stream, incomingData.isVideo));
  peer.signal(incomingData.signal);
}

function rejectCall() {
  document.getElementById('call-modal').style.display = 'none';
  socket.emit('reject-call', { to: incomingData.from });
}

socket.on('call-accepted', signal => peer.signal(signal));

function attachMediaStream(stream, isVideo) {
  const elem = document.createElement(isVideo ? 'video' : 'audio');
  elem.srcObject = stream;
  elem.autoplay = true;
  document.body.appendChild(elem);
}

// POSTS
function submitPost() {
  const content = document.getElementById('post-text').value;
  const file = document.getElementById('post-file').files[0];

  if(file) {
    const reader = new FileReader();
    reader.onload = function(e) {
      const type = file.type.startsWith('image') ? 'image' : file.type.startsWith('video') ? 'video' : 'audio';
      socket.emit('create-post', { username: me, content, mediaUrl: e.target.result, mediaType: type });
    };
    reader.readAsDataURL(file);
  } else {
    socket.emit('create-post', { username: me, content });
  }
}

socket.on('post-pending-notice', () => alert('Post keessan Admin biratti ergameera, ilaalee erga approve godhee booda ni dhihaata.'));

socket.on('new-post', post => renderPost(post, true));

async function loadPosts() {
  const res = await fetch('/api/posts');
  const posts = await res.json();
  posts.forEach(p => renderPost(p, false));
}

function renderPost(p, prepend) {
  const feed = document.getElementById('posts-feed');
  const div = document.createElement('div');
  div.className = 'post';
  let mediaHtml = '';
  if(p.media_url) {
    if(p.media_type === 'image') mediaHtml = `<img src="${p.media_url}">`;
    else if(p.media_type === 'video') mediaHtml = `<video src="${p.media_url}" controls></video>`;
    else mediaHtml = `<audio src="${p.media_url}" controls></audio>`;
  }
  div.innerHTML = `
    <b>@${p.username}</b>
    <p>${p.content || ''}</p>
    ${mediaHtml}
    <div style="margin-top:8px;">
      <button class="btn btn-green" onclick="socket.emit('like-post', ${p.id})">👍 Like (<span id="likes-${p.id}">${p.likes || 0}</span>)</button>
      <button class="btn btn-blue" onclick="navigator.share({title:'ImaanaaCall Post', url: window.location.href})">🔗 Share</button>
    </div>`;
  if(prepend) feed.prepend(div); else feed.appendChild(div);
}

socket.on('update-likes', id => {
  const el = document.getElementById(`likes-${id}`);
  if(el) el.innerText = parseInt(el.innerText) + 1;
});
