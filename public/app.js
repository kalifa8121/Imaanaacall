const socket=io();

let token=localStorage.getItem("imaanaa_token"),
    me=null,
    isSignup=false,
    peer=null,
    stream=null,
    incoming=null,
    currentChat=null;

const $=id=>document.getElementById(id);

async function api(url,opt={}){
  opt.headers={
    ...(opt.headers||{}),
    Authorization:"Bearer "+token,
    "Content-Type":"application/json"
  };

  const r=await fetch(url,opt);
  const d=await r.json();

  if(!r.ok) throw Error(d.message||"Error");

  return d;
}

function toggleAuth(){
  isSignup=!isSignup;

  $("authTitle").textContent=
    isSignup?"Signup":"Login";

  $("authBtn").textContent=
    isSignup?"Signup":"Login";

  $("signupFields")
    .classList
    .toggle("hidden",!isSignup);
}

async function auth(){
  try{
    let body={
      username:$("username").value,
      password:$("password").value
    };

    if(isSignup){
      Object.assign(body,{
        full_name:$("fullName").value,
        phone:$("phone").value,
        city:$("city").value,
        gender:$("gender").value,
        bio:$("bio").value
      });
    }

    const d=await fetch(
      isSignup
        ?"/api/auth/signup"
        :"/api/auth/login",
      {
        method:"POST",
        headers:{
          "Content-Type":
            "application/json"
        },
        body:JSON.stringify(body)
      }
    ).then(r=>r.json());

    if(!d.success)
      return alert(d.message);

    token=d.token;

    localStorage.setItem(
      "imaanaa_token",
      token
    );

    me=d.user;

    boot();

  }catch(e){
    alert(e.message);
  }
}

async function boot(){
  try{
    const d=await api("/api/me");

    me=d.user;

    $("auth").classList.add("hidden");
    $("app").classList.remove("hidden");

    $("head").innerHTML=
      `@${me.username} ${
        me.is_admin?"🛡️":""
      }<button class="btn red"
      onclick="logout()">Logout</button>`;

    loadConfig();
    loadPosts();
    loadUsers();
    loadRequests();
    loadNotifications();

    socket.emit(
      "register-user",
      {token}
    );

  }catch(e){
    localStorage.removeItem(
      "imaanaa_token"
    );
  }
}

async function logout(){
  try{
    await api(
      "/api/auth/logout",
      {method:"POST"}
    );
  }catch{}

  localStorage.removeItem(
    "imaanaa_token"
  );

  location.reload();
}

function show(id){
  [
    "home",
    "people",
    "chat",
    "profile",
    "saved"
  ].forEach(
    x=>$(x).classList.toggle(
      "hidden",
      x!==id
    )
  );

  if(id==="saved")
    loadSaved();

  if(id==="chat")
    loadUsers(true);
}

async function loadConfig(){
  const c=
    await fetch("/api/config")
    .then(r=>r.json());

  $("vip").innerHTML=
    `<b>⭐ VIP</b> — Bitachuuf Admin:
    <b>${c.vipPhone}</b> |
    User: <b>${c.vipUsername}</b>`;
}

async function loadPosts(){
  const ps=
    await api("/api/posts");

  $("feed").innerHTML=
    ps.map(renderPost).join("");
}

function renderPost(p){
  let media=
    p.media_type==="video"
      ?`<video src="${p.media_url}"
        controls></video>`
      :p.media_type==="audio"
      ?`<audio src="${p.media_url}"
        controls
        style="width:100%"></audio>`
      :p.media_url
      ?`<img src="${p.media_url}">`
      :"";

  return `
  <div class="card post">
    <div class="row">
      <b>@${esc(p.username)}</b>
      <span class="small">
        ${new Date(p.created_at)
          .toLocaleString()}
      </span>
    </div>

    <p>${esc(p.content||"")}</p>

    ${media}

    <div>
      <button class="btn gray"
        onclick="like(${p.id})">
        👍 ${p.likes||0}
      </button>

      <button class="btn gray"
        onclick="comment(${p.id})">
        💬 Comment
      </button>

      <button class="btn gray"
        onclick="save(${p.id})">
        🔖 Save
      </button>

      ${
        p.media_url
        ?`<a class="btn gray"
          href="${p.media_url}"
          download>
          ⬇ Download
        </a>`
        :""
      }
    </div>

    <div id="c${p.id}"></div>
  </div>`;
}

async function createPost(){
  const f=$("media").files[0];

  let media_url=null,
      media_type=null;

  if(f){
    media_url=
      await dataURL(f);

    media_type=
      f.type.startsWith("video")
      ?"video"
      :f.type.startsWith("audio")
      ?"audio"
      :"image";
  }

  try{
    await api(
      "/api/posts",
      {
        method:"POST",
        body:JSON.stringify({
          content:$("postText").value,
          media_url,
          media_type
        })
      }
    );

    $("postText").value="";
    $("media").value="";

    alert("Post submitted.");

  }catch(e){
    alert(e.message);
  }
}

function dataURL(f){
  return new Promise(
    (res,rej)=>{
      let r=new FileReader();

      r.onload=()=>res(r.result);
      r.onerror=rej;

      r.readAsDataURL(f);
    }
  );
}

async function like(id){
  await api(
    "/api/posts/"+id+"/like",
    {method:"POST"}
  );

  loadPosts();
}

async function save(id){
  await api(
    "/api/posts/"+id+"/save",
    {method:"POST"}
  );

  alert("Saved");
}

async function comment(id){
  let c=prompt(
    "Comment keessan:"
  );

  if(!c)return;

  await api(
    "/api/posts/"+id+"/comments",
    {
      method:"POST",
      body:JSON.stringify({
        comment:c
      })
    }
  );

  alert("Comment added");
}

async function loadUsers(forChat=false){
  const us=
    await api("/api/users");

  $("users").innerHTML=
    us
    .filter(u=>u.id!==me.id)
    .map(
      u=>`
      <div class="card">
        <div class="row">
          <span class="status ${
            u.isOnline?"on":""
          }"></span>

          <b>@${esc(u.username)}</b>

          ${u.is_vip?"⭐":""}

          <span class="small">
            ${
              u.isOnline
              ?"Online"
              :"Offline"
            }
          </span>
        </div>

        <button class="btn primary"
          onclick="follow(${u.id})">
          Follow
        </button>

        <button class="btn green"
          onclick="friend(${u.id})">
          Add Friend
        </button>

        <button class="btn gray"
          onclick="startCall(
            '${esc(u.username)}',
            true
          )">
          📹
        </button>

        <button class="btn gray"
          onclick="startCall(
            '${esc(u.username)}',
            false
          )">
          📞
        </button>
      </div>`
    ).join("");

  if(forChat){
    $("chatUser").innerHTML=
      us
      .filter(u=>u.id!==me.id)
      .map(
        u=>`
        <option value="${u.id}">
          @${esc(u.username)}
          ${
            u.isOnline
            ?"🟢"
            :"⚪"
          }
        </option>`
      ).join("");

    if(currentChat)
      $("chatUser").value=
        currentChat;
  }
}

async function follow(id){
  await api(
    "/api/follow/"+id,
    {method:"POST"}
  );

  alert("Follow updated");
}

async function friend(id){
  await api(
    "/api/friends/request/"+id,
    {method:"POST"}
  );

  alert("Friend request sent");
}

async function loadRequests(){
  const r=
    await api(
      "/api/friends/requests"
    );

  $("requests").innerHTML=
    r.map(
      x=>`
      <div class="card">
        @${esc(x.username)}

        <button class="btn green"
          onclick="friendAction(
            ${x.id},
            'confirm'
          )">
          Confirm
        </button>

        <button class="btn red"
          onclick="friendAction(
            ${x.id},
            'reject'
          )">
          Reject
        </button>
      </div>`
    ).join("");
}

async function friendAction(id,a){
  await api(
    "/api/friends/"+id+"/"+a,
    {method:"POST"}
  );

  loadRequests();
}

async function loadChat(){
  currentChat=
    Number($("chatUser").value);

  if(!currentChat)return;

  const r=
    await api(
      "/api/chat/"+currentChat
    );

  $("chatbox").innerHTML=
    r.map(
      m=>`
      <div class="bubble ${
        m.sender_id===me.id
        ?"mine"
        :""
      }">
        <b>
          @${esc(m.sender_name)}
        </b>
        <br>
        ${esc(m.body||"")}
      </div>`
    ).join("");

  $("chatbox").scrollTop=
    999999;
}

async function sendChat(){
  if(!currentChat)
    return alert(
      "Nama maamilaa filadhu"
    );

  const body=
    $("chatText").value.trim();

  if(!body)return;

  await api(
    "/api/chat/"+currentChat,
    {
      method:"POST",
      body:JSON.stringify({
        body
      })
    }
  );

  $("chatText").value="";

  loadChat();
}

async function loadSaved(){
  const ps=
    await api("/api/saved");

  $("savedFeed").innerHTML=
    ps.map(renderPost).join("");
}

async function loadNotifications(){
  const n=
    await api(
      "/api/notifications"
    );

  if(n.length)
    console.log(n);
}

async function saveProfile(){
  let avatar=me.avatar,
      cover=me.cover;

  if($("avatar").files[0])
    avatar=
      await dataURL(
        $("avatar").files[0]
      );

  if($("cover").files[0])
    cover=
      await dataURL(
        $("cover").files[0]
      );

  const d=
    await api(
      "/api/profile",
      {
        method:"PUT",
        body:JSON.stringify({
          full_name:$("pname").value,
          phone:$("pphone").value,
          city:$("pcity").value,
          bio:$("pbio").value,
          avatar,
          cover
        })
      }
    );

  me=d.user;

  alert(
    "Profile updated"
  );
}

function esc(s){
  return String(s).replace(
    /[&<>"']/g,
    m=>({
      "&":"&amp;",
      "<":"&lt;",
      ">":"&gt;",
      '"':"&quot;",
      "'":"&#039;"
    }[m])
  );
}

socket.on(
  "update-user-list",
  ()=>{
    if(
      !$("app")
        .classList
        .contains("hidden")
    )
      loadUsers(
        $("chat")
          .classList
          .contains("hidden")===false
      );
  }
);

socket.on(
  "new-message",
  m=>{
    if(currentChat===m.sender_id)
      loadChat();
    else
      alert(
        "Ergaa haaraa siif dhufe."
      );
  }
);

socket.on(
  "notification",
  n=>{
    if(n.type==="missed_call")
      alert(
        n.title+": "+n.body
      );
    else
      console.log(
        n.title,
        n.body
      );
  }
);

socket.on(
  "missed-calls",
  cs=>{
    if(cs.length)
      alert(
        "📞 Missed calls: "+
        cs
          .map(x=>"@"+x.caller)
          .join(", ")
      );
  }
);

async function startCall(
  user,
  isVideo
){
  try{
    stream=
      await navigator
        .mediaDevices
        .getUserMedia({
          audio:true,
          video:isVideo
        });

    $("local").srcObject=
      stream;

    $("callScreen")
      .style.display="flex";

    peer=new SimplePeer({
      initiator:true,
      trickle:false,
      stream
    });

    peer.on(
      "signal",
      s=>{
        socket.emit(
          "call-user",
          {
            userToCall:user,
            signalData:s,
            callerName:me.username,
            isVideo
          }
        );
      }
    );

    peer.on(
      "stream",
      s=>{
        $("remote").srcObject=s;
      }
    );

  }catch(e){
    alert(
      "Camera/Microphone permission barbaachisa"
    );
  }
}
// ==========================================
// CALL & WEBRTC LOGIC (SIRREEFFAME)
// ==========================================

// 1. Waamicha Jalqabsiisuu (Outbound Call)
async function startCall(user, isVideo) {
  try {
    stream = await navigator.mediaDevices.getUserMedia({
      audio: true,
      video: isVideo
    });

    $("local").srcObject = stream;
    
    // Class 'show' dabali akka Modal Flex ta'ee mul'atuuf
    $("callScreen").classList.add("show");

    peer = new SimplePeer({
      initiator: true,
      trickle: false,
      stream
    });

    peer.on("signal", s => {
      socket.emit("call-user", {
        userToCall: user,
        signalData: s,
        callerName: me.username,
        isVideo
      });
    });

    peer.on("stream", s => {
      $("remote").srcObject = s;
    });

  } catch (e) {
    alert("Eyama Camera/Microphone keessan hayyamaa!");
  }
}

// 2. Waamicha Ol-seenu (Incoming Call Event)
socket.on("incoming-call", d => {
  incoming = d;

  $("caller").textContent = "@" + d.callerName + " si waamaa jira...";

  // Class 'show' dabali (CSS `.modal.show` akka hojjetuuf)
  $("callModal").classList.add("show");

  const ringtone = $("ringtone");
  if (ringtone) {
    ringtone.play().catch(e => console.log("Audio play error:", e));
  }
});

// 3. Waamicha Fuudhuu (Accept Call)
async function acceptCall() {
  hideCallModal();

  $("callScreen").classList.add("show");

  try {
    stream = await navigator.mediaDevices.getUserMedia({
      audio: true,
      video: incoming.isVideo
    });

    $("local").srcObject = stream;

    peer = new SimplePeer({
      initiator: false,
      trickle: false,
      stream
    });

    peer.on("signal", s => {
      socket.emit("accept-call", {
        to: incoming.from,
        signal: s
      });
    });

    peer.on("stream", s => {
      $("remote").srcObject = s;
    });

    peer.signal(incoming.signal);

  } catch (e) {
    alert("Camera/Microphone meeshaa keessaniin wal-qunnamuu didee jira.");
    endCall();
  }
}

// 4. Waamicha Kutuuf (Reject Call)
function rejectCall() {
  hideCallModal();

  if (incoming && incoming.from) {
    socket.emit("reject-call", {
      to: incoming.from
    });
  }
}

// 5. Modal Waamichaa Cufuu & Ringtone Dhaabuu
function hideCallModal() {
  $("callModal").classList.remove("show");

  const ringtone = $("ringtone");
  if (ringtone) {
    ringtone.pause();
    ringtone.currentTime = 0;
  }
}

// 6. Waamicha Xumuruu (End Call)
function endCall() {
  if (peer) {
    peer.destroy();
    peer = null;
  }

  if (stream) {
    stream.getTracks().forEach(t => t.stop());
    stream = null;
  }

  hideCallModal();
  $("callScreen").classList.remove("show");
}

// 7. Waamicha Namni Dhabamnaan (Offline Call)
socket.on("call-offline", d => {
  alert("@" + d.username + " offline jira. Missed-call galmaa'era.");
  endCall();
});

// Boot check
if (token) boot();
