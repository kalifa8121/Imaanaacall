import os
from flask import Flask, render_template_string
from flask_socketio import SocketIO, emit, join_room, leave_room

app = Flask(__name__)
app.config['SECRET_KEY'] = os.environ.get('SECRET_KEY', 'telegram_clone_secret_key_123')

# Real-time WebSocket connection
socketio = SocketIO(app, cors_allowed_origins="*", async_mode='gevent')

# HTML, CSS fi JavaScript (Frontend) Guutuu
HTML_TEMPLATE = """
<!DOCTYPE html>
<html lang="om">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Hojjattoota Internal App</title>
    <script src="https://cdn.socket.io/4.5.4/socket.io.min.js"></script>
    <style>
        * { box-sizing: border-box; margin: 0; padding: 0; font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; }
        body { background-color: #eef2f5; display: flex; justify-content: center; align-items: center; min-height: 100vh; padding: 10px; }
        .app-container { width: 100%; max-width: 800px; background: #fff; border-radius: 12px; box-shadow: 0 4px 20px rgba(0,0,0,0.1); overflow: hidden; display: flex; flex-direction: column; height: 90vh; }
        .header { background: #0088cc; color: white; padding: 15px; text-align: center; font-size: 1.2rem; font-weight: bold; }
        .setup-panel { padding: 15px; background: #f9f9f9; border-bottom: 1px solid #ddd; display: flex; gap: 10px; flex-wrap: wrap; }
        .setup-panel input { flex: 1; min-width: 150px; padding: 8px 12px; border: 1px solid #ccc; border-radius: 6px; font-size: 0.9rem; }
        .setup-panel button, .controls button { background: #0088cc; color: white; border: none; padding: 8px 15px; border-radius: 6px; cursor: pointer; font-weight: bold; }
        .setup-panel button:hover, .controls button:hover { background: #006699; }
        
        .video-container { display: flex; justify-content: space-around; background: #111; padding: 10px; gap: 10px; flex-wrap: wrap; }
        video { width: 48%; max-width: 350px; height: 200px; background: #222; border-radius: 8px; object-fit: cover; }
        
        .chat-box { flex: 1; padding: 15px; overflow-y: auto; background: #e5ddd5; display: flex; flex-direction: column; gap: 10px; }
        .message { background: #fff; padding: 10px 14px; border-radius: 8px; max-width: 75%; width: fit-content; box-shadow: 0 1px 2px rgba(0,0,0,0.15); font-size: 0.95rem; }
        .message.system { background: #fff3cd; color: #856404; align-self: center; font-size: 0.85rem; border: 1px solid #ffeeba; }
        .message .user { font-weight: bold; color: #0088cc; font-size: 0.8rem; margin-bottom: 3px; }
        
        .input-area { padding: 12px; background: #fff; border-top: 1px solid #ddd; display: flex; gap: 8px; align-items: center; }
        .input-area input { flex: 1; padding: 10px; border: 1px solid #ccc; border-radius: 20px; outline: none; }
        .btn-action { background: #25d366; color: white; border: none; padding: 10px 15px; border-radius: 20px; cursor: pointer; font-weight: bold; }
        .btn-record { background: #e74c3c; color: white; border: none; padding: 10px 15px; border-radius: 20px; cursor: pointer; font-weight: bold; }
    </style>
</head>
<body>

<div class="app-container">
    <div class="header">Telegram Clone - Internal Corporate Communication</div>
    
    <div class="setup-panel">
        <input type="text" id="username" placeholder="Maqaa Keessan Maqsuu...">
        <input type="text" id="room" placeholder="Kutaa Hojii (Room)" value="General">
        <button onclick="joinRoom()">Seeni (Join)</button>
        <button onclick="startCall()" style="background-color: #27ae60;">Bilbila Jalqabi (Call)</button>
    </div>

    <div class="video-container">
        <video id="localVideo" autoplay muted playsinline></video>
        <video id="remoteVideo" autoplay playsinline></video>
    </div>

    <div class="chat-box" id="chatBox"></div>

    <div class="input-area">
        <input type="text" id="messageInput" placeholder="Ergaa barreessi..." onkeypress="handleKeyPress(event)">
        <button class="btn-action" onclick="sendMessage()">Ergi</button>
        <button class="btn-record" id="recordBtn" onclick="toggleRecording()">Sagalee (Voice)</button>
    </div>
</div>

<script>
    const socket = io();
    let localStream;
    let peerConnection;
    let mediaRecorder;
    let audioChunks = [];
    let isRecording = false;

    const config = { iceServers: [{ urls: 'stun:stun.l.google.com:19302' }] };

    async function initMedia() {
        try {
            localStream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
            document.getElementById('localVideo').srcObject = localStream;
        } catch (err) {
            console.error("Kameraa/Malkaa banuun hin danda'amne:", err);
        }
    }

    function joinRoom() {
        const username = document.getElementById('username').value.trim();
        const room = document.getElementById('room').value.trim();
        if (username && room) {
            socket.emit('join', { username, room });
            initMedia();
        } else {
            alert("Maqaa fi Kutaa hojii guutaa!");
        }
    }

    function sendMessage() {
        const input = document.getElementById('messageInput');
        const text = input.value.trim();
        const room = document.getElementById('room').value.trim();
        const username = document.getElementById('username').value.trim();

        if (text && room && username) {
            socket.emit('message', { room, username, text, type: 'text' });
            input.value = '';
        }
    }

    function handleKeyPress(e) {
        if (e.key === 'Enter') sendMessage();
    }

    async function toggleRecording() {
        const btn = document.getElementById('recordBtn');
        if (!isRecording) {
            try {
                const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
                mediaRecorder = new MediaRecorder(stream);
                audioChunks = [];
                
                mediaRecorder.ondataavailable = e => audioChunks.push(e.data);
                mediaRecorder.onstop = () => {
                    const audioBlob = new Blob(audioChunks, { type: 'audio/webm' });
                    const reader = new FileReader();
                    reader.readAsDataURL(audioBlob);
                    reader.onloadend = () => {
                        const room = document.getElementById('room').value;
                        const username = document.getElementById('username').value;
                        socket.emit('message', { room, username, audio: reader.result, type: 'audio' });
                    };
                };
                
                mediaRecorder.start();
                isRecording = true;
                btn.innerText = "Dhaabi (Stop)";
                btn.style.background = "#34495e";
            } catch (err) {
                alert("Microphone banuun hin danda'amne!");
            }
        } else {
            mediaRecorder.stop();
            isRecording = false;
            btn.innerText = "Sagalee (Voice)";
            btn.style.background = "#e74c3c";
        }
    }

    socket.on('new_message', data => {
        const box = document.getElementById('chatBox');
        const msgDiv = document.createElement('div');
        msgDiv.className = 'message';

        if (data.type === 'text') {
            msgDiv.innerHTML = `<div class="user">${data.username}</div><div>${data.text}</div>`;
        } else if (data.type === 'audio') {
            msgDiv.innerHTML = `<div class="user">${data.username}</div><audio controls src="${data.audio}"></audio>`;
        }

        box.appendChild(msgDiv);
        box.scrollTop = box.scrollHeight;
    });

    socket.on('status', data => {
        const box = document.getElementById('chatBox');
        const msgDiv = document.createElement('div');
        msgDiv.className = 'message system';
        msgDiv.innerText = data.msg;
        box.appendChild(msgDiv);
        box.scrollTop = box.scrollHeight;
    });

    // WebRTC Real-time Call Signaling
    function createPeerConnection(room) {
        peerConnection = new RTCPeerConnection(config);
        if (localStream) {
            localStream.getTracks().forEach(track => peerConnection.addTrack(track, localStream));
        }
        peerConnection.ontrack = e => {
            document.getElementById('remoteVideo').srcObject = e.streams[0];
        };
        peerConnection.onicecandidate = e => {
            if (e.candidate) {
                socket.emit('signal', { room, candidate: e.candidate });
            }
        };
    }

    async function startCall() {
        const room = document.getElementById('room').value;
        if (!localStream) await initMedia();
        createPeerConnection(room);
        const offer = await peerConnection.createOffer();
        await peerConnection.setLocalDescription(offer);
        socket.emit('signal', { room, offer });
    }

    socket.on('signal', async data => {
        const room = document.getElementById('room').value;
        if (!peerConnection) createPeerConnection(room);

        if (data.offer) {
            await peerConnection.setRemoteDescription(new RTCSessionDescription(data.offer));
            const answer = await peerConnection.createAnswer();
            await peerConnection.setLocalDescription(answer);
            socket.emit('signal', { room, answer });
        } else if (data.answer) {
            await peerConnection.setRemoteDescription(new RTCSessionDescription(data.answer));
        } else if (data.candidate) {
            await peerConnection.addIceCandidate(new RTCIceCandidate(data.candidate));
        }
    });
</script>
</body>
</html>
"""

@app.route('/')
def index():
    return render_template_string(HTML_TEMPLATE)

@socketio.on('join')
def handle_join(data):
    username = data.get('username')
    room = data.get('room')
    join_room(room)
    emit('status', {'msg': f'{username} kutaa "{room}" seeneera.'}, room=room)

@socketio.on('message')
def handle_message(data):
    room = data.get('room')
    emit('new_message', data, room=room)

@socketio.on('signal')
def handle_signal(data):
    room = data.get('room')
    emit('signal', data, room=room, include_self=False)

if __name__ == '__main__':
    port = int(os.environ.get('PORT', 5000))
    socketio.run(app, host='0.0.0.0', port=port)
