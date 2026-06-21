"use strict";

// ここを Firebase Console の「ウェブアプリ設定」に置き換えてください。
// apiKey は公開される前提の値です。安全性は Firestore Rules で守ります。
const firebaseConfig = {
  apiKey: "AIzaSyBikff64FlvySKSzeNw9LN6Q75AxstPMxg",
  authDomain: "bukkyouonn.firebaseapp.com",
  projectId: "bukkyouonn",
  storageBucket: "bukkyouonn.firebasestorage.app",
  messagingSenderId: "129506011095",
  appId: "1:129506011095:web:75a92fb32ae9fdf9750d92",
  measurementId: "G-V7LZV9V82S"
};

window.ONLINE = {
  enabled: false,
  roomId: "",
  role: "player",       // player = 先に部屋を作った人、cpu = 参加した人
  uid: "",
  myName: "",
  names: { player: "", cpu: "" },
  db: null,
  unsubscribe: null,
  applyingRemote: false,
  lastJson: "",
  commitTimer: null
};

const online$ = id => document.getElementById(id);

function onlineMessage(text){
  const el = online$("onlineStatus");
  if(el) el.innerHTML = text;
}

async function makeRoomId(db){
  // 0000〜9999の4桁数字。既存の部屋と重なった場合は作り直します。
  for(let i = 0; i < 80; i++){
    const code = Math.floor(Math.random() * 10000).toString().padStart(4, "0");
    const snap = await db.collection("rooms").doc(code).get();
    if(!snap.exists) return code;
  }
  throw new Error("room-code-full");
}

function normalizeRoomCode(input){
  return String(input || "")
    .replace(/[０-９]/g, s => String.fromCharCode(s.charCodeAt(0) - 0xFEE0))
    .replace(/\D/g, "")
    .slice(0, 4)
    .padStart(4, "0");
}
function getPlayerName(){
  const saved = localStorage.getItem("buddhistOnlinePlayerName") || "";
  const name = prompt("オンライン対戦で相手に表示する名前を入力してください", saved);
  if(name === null) return "";
  const clean = name.trim().slice(0, 12);
  if(!clean){
    alert("名前を入力してください。");
    return getPlayerName();
  }
  localStorage.setItem("buddhistOnlinePlayerName", clean);
  ONLINE.myName = clean;
  return clean;
}

function onlineName(role){
  return ONLINE.names?.[role] || (role === "player" ? "部屋を作った人" : "参加者");
}

window.getOnlineOpponentName = function(){
  if(!ONLINE.enabled) return "";
  return onlineName(ONLINE.role === "player" ? "cpu" : "player");
};

async function initFirebase(){
  if(firebaseConfig.apiKey.includes("PASTE_")){
    alert("online.js の firebaseConfig を、Firebase Console の設定値に置き換えてください。");
    throw new Error("firebaseConfig is not set");
  }
  if(!firebase.apps.length) firebase.initializeApp(firebaseConfig);
  const auth = firebase.auth();
  if(!auth.currentUser) await auth.signInAnonymously();
  ONLINE.uid = auth.currentUser.uid;
  ONLINE.db = firebase.firestore();
  return ONLINE.db;
}

function listenRoom(roomId){
  if(ONLINE.unsubscribe) ONLINE.unsubscribe();
  ONLINE.unsubscribe = ONLINE.db.collection("rooms").doc(roomId).onSnapshot(snap => {
    if(!snap.exists){
      onlineMessage("部屋が見つかりませんでした。");
      return;
    }
    const data = snap.data();
    if(data.players?.player === ONLINE.uid) ONLINE.role = "player";
    if(data.players?.cpu === ONLINE.uid) ONLINE.role = "cpu";
    ONLINE.names = data.playerNames || { player: "", cpu: "" };
    ONLINE.enabled = true;
    ONLINE.roomId = roomId;

    if(data.state){
      ONLINE.applyingRemote = true;
      window.applyOnlineState(data.state);
      ONLINE.lastJson = JSON.stringify(data.state);
      ONLINE.applyingRemote = false;
    }

    const waiting = !data.players?.cpu;
    const myRoleName = onlineName(ONLINE.role);
    const enemyRoleName = onlineName(ONLINE.role === "player" ? "cpu" : "player");
    onlineMessage(waiting
      ? `${myRoleName}さんでオンライン部屋を作成しました。<b>合言葉：${roomId}</b><br>相手にこの合言葉を伝えてください。`
      : `オンライン対戦中です。<br>${myRoleName}さん vs ${enemyRoleName}さん<br>合言葉：<b>${roomId}</b>`);
    if(typeof render === "function") render();
  });
}

async function createOnlineRoom(){
  try{
    const playerName = getPlayerName();
    if(!playerName) return;
    const db = await initFirebase();
    const roomId = await makeRoomId(db);
    ONLINE.enabled = true;
    ONLINE.role = "player";
    ONLINE.roomId = roomId;
    const initialState = window.createOnlineInitialState("normal");
    await db.collection("rooms").doc(roomId).set({
      createdAt: firebase.firestore.FieldValue.serverTimestamp(),
      updatedAt: firebase.firestore.FieldValue.serverTimestamp(),
      expireAt: firebase.firestore.Timestamp.fromDate(
  new Date(Date.now() + 24 * 60 * 60 * 1000)
),
      status: "waiting",
      players: { player: ONLINE.uid, cpu: null },
      playerNames: { player: playerName, cpu: "" },
      state: initialState
    });
    document.getElementById("titleScreen").classList.add("titleHidden");
    listenRoom(roomId);
  }catch(e){
    console.error(e);
    onlineMessage("オンライン部屋の作成に失敗しました。設定を確認してください。");
  }
}

async function joinOnlineRoom(){
  const playerName = getPlayerName();
  if(!playerName) return;
  const roomIdInput = prompt("相手から聞いた4桁の合言葉を入力してください");
  if(!roomIdInput) return;
  const roomId = normalizeRoomCode(roomIdInput);
  if(roomId.length !== 4){
    alert("4桁の数字を入力してください。");
    return;
  }
  try{
    const db = await initFirebase();
    const ref = db.collection("rooms").doc(roomId);
    await db.runTransaction(async tx => {
      const snap = await tx.get(ref);
      if(!snap.exists) throw new Error("room-not-found");
      const data = snap.data();
      if(data.players?.cpu && data.players.cpu !== ONLINE.uid) throw new Error("room-full");
      tx.update(ref, {
        "players.cpu": ONLINE.uid,
        "playerNames.cpu": playerName,
        status: "active",
        updatedAt: firebase.firestore.FieldValue.serverTimestamp()
      });
    });
    ONLINE.enabled = true;
    ONLINE.role = "cpu";
    ONLINE.roomId = roomId;
    document.getElementById("titleScreen").classList.add("titleHidden");
    listenRoom(ONLINE.roomId);
  }catch(e){
    console.error(e);
    alert(e.message === "room-full" ? "この部屋はすでに満員です。" : "部屋に参加できませんでした。合言葉を確認してください。");
  }
}

window.onlineMaybeCommit = function(nextState){
  if(!ONLINE.enabled || ONLINE.applyingRemote || !ONLINE.db || !ONLINE.roomId) return;
  const json = JSON.stringify(nextState);
  if(json === ONLINE.lastJson) return;
  clearTimeout(ONLINE.commitTimer);
  ONLINE.commitTimer = setTimeout(async () => {
    try{
      ONLINE.lastJson = json;
      await ONLINE.db.collection("rooms").doc(ONLINE.roomId).update({
        state: JSON.parse(json),
        updatedAt: firebase.firestore.FieldValue.serverTimestamp()
      });
    }catch(e){
      console.error(e);
      onlineMessage("通信エラーがありました。画面を更新せず、少し待ってください。");
    }
  }, 250);
};

function addOnlineButtons(){
  const box = document.querySelector(".titleMenuBtns");
  if(!box) return;
  const create = document.createElement("button");
  create.className = "subBtn";
  create.textContent = "オンライン部屋を作る";
  create.onclick = createOnlineRoom;
  const join = document.createElement("button");
  join.className = "subBtn";
  join.textContent = "合言葉で参加";
  join.onclick = joinOnlineRoom;
  box.appendChild(create);
  box.appendChild(join);

  const status = document.createElement("p");
  status.id = "onlineStatus";
  status.className = "onlineStatus";
  status.textContent = "オンライン対戦はFirebase設定後に使えます。";
  box.parentElement.appendChild(status);
}

addOnlineButtons();
