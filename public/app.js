const socket = io();
let currentUser = '';
let incomingCallData = null;
let peer = null;
let localStream = null;

const ringtone = document.getElementById('ringtone-audio');

function register() {
  const username = document.getElementById('username-input').value.trim();
  if (!username) return alert('Maqaa galchaa!');
  currentUser = username;
  socket.emit('register-user', username);
  document.getElementById('login-section').style.display = 'none';
  document.getElementById('app-section').style.display = 'block';
  document.getElementById('status-badge').innerText = '● Online';
}

socket.on('update-user-list', (users) => {
  const container = document.getElementById('users-container');
  container.innerHTML = '';
  
  const otherUsers = users.filter(u => u.id !== socket.id);
  if (otherUsers.length === 0) {
    container.innerHTML = '<small style="color: #8696a0;">Maammilli biraa onlaayinii hin jiru...</small>';
    return;
  }

  otherUsers.forEach(u => {
    const div = document.createElement('div');
    div.className = 'user-card';
    div.innerHTML = `
      <span>${u.username}</span>
      <button class="btn btn-call" onclick="startCall('${u.id}')">Bilbili 📞</button>
    `;
    container.appendChild(div);
  });
});

function sendMessage() {
  const msgInput = document.getElementById('msg-input');
  const message = msgInput.value.trim();
  if (!message) return;

  socket.emit('send-message', { username: currentUser, message });
  msgInput.value = '';
}

socket.on('new-message', (data) => {
  const chatBox = document.getElementById('chat-box');
  const div = document.createElement('div');
  div.className = 'msg-bubble';
  div.innerHTML = `<div class="msg-user">${data.username}</div><div>${data.message}</div>`;
  chatBox.appendChild(div);
  chatBox.scrollTop = chatBox.scrollHeight;
});

// START CALL
async function startCall(userToCall) {
  try {
    localStream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
    peer = new SimplePeer({ initiator: true, trickle: false, stream: localStream });

    peer.on('signal', (signalData) => {
      socket.emit('call-user', { userToCall, signalData, callerName: currentUser });
    });

    peer.on('stream', (remoteStream) => {
      const audio = new Audio();
      audio.srcObject = remoteStream;
      audio.play();
    });
  } catch (err) {
    alert("Microphone permission required to call.");
  }
}

// INCOMING CALL
socket.on('incoming-call', (data) => {
  incomingCallData = data;
  document.getElementById('caller-name-text').innerText = `${data.callerName} bilbilaa jira...`;
  document.getElementById('call-modal').style.display = 'flex';
  ringtone.play().catch(e => console.log("Audio waiting for user click"));
});

async function acceptCall() {
  ringtone.pause();
  ringtone.currentTime = 0;
  document.getElementById('call-modal').style.display = 'none';

  localStream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
  peer = new SimplePeer({ initiator: false, trickle: false, stream: localStream });

  peer.on('signal', (signal) => {
    socket.emit('accept-call', { signal, to: incomingCallData.from });
  });

  peer.on('stream', (remoteStream) => {
    const audio = new Audio();
    audio.srcObject = remoteStream;
    audio.play();
  });

  peer.signal(incomingCallData.signal);
}

function rejectCall() {
  ringtone.pause();
  ringtone.currentTime = 0;
  document.getElementById('call-modal').style.display = 'none';
  socket.emit('reject-call', { to: incomingCallData.from });
}

socket.on('call-accepted', (signal) => peer.signal(signal));
socket.on('call-rejected', () => alert('Bilbilli reject godhameera.'));
