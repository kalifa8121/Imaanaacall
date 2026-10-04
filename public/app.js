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
}

socket.on('update-user-list', (users) => {
  const container = document.getElementById('users-container');
  container.innerHTML = '';
  users.forEach(u => {
    if (u.id !== socket.id) {
      const div = document.createElement('div');
      div.className = 'user-item';
      div.innerHTML = `
        <span>${u.username}</span>
        <button class="btn btn-call" onclick="startCall('${u.id}', 'voice')">Bilbili 📞</button>
      `;
      container.appendChild(div);
    }
  });
});

// Start Call
async function startCall(userToCall, callType) {
  localStream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
  peer = new SimplePeer({ initiator: true, trickle: false, stream: localStream });

  peer.on('signal', (signalData) => {
    socket.emit('call-user', {
      userToCall,
      signalData,
      callerName: currentUser,
      callType
    });
  });

  peer.on('stream', (remoteStream) => {
    const audio = new Audio();
    audio.srcObject = remoteStream;
    audio.play();
  });
}

// Handle Incoming Call
socket.on('incoming-call', (data) => {
  incomingCallData = data;
  document.getElementById('caller-name-text').innerText = `${data.callerName} bilbilaa jira...`;
  document.getElementById('call-modal').style.display = 'flex';
  
  // Ringtone Play
  ringtone.play().catch(e => console.log("Audio play blocked until user interaction"));
});

// Accept Call
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

// Reject Call
function rejectCall() {
  ringtone.pause();
  ringtone.currentTime = 0;
  document.getElementById('call-modal').style.display = 'none';
  socket.emit('reject-call', { to: incomingCallData.from });
}

socket.on('call-accepted', (signal) => {
  peer.signal(signal);
});

socket.on('call-rejected', () => {
  alert('Bilbilli keessan citeera/Reject godhameera.');
});
