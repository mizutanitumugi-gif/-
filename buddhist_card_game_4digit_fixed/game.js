
"use strict";

const GOAL = 49;
const ALL_SECTS = CARD_DATA.allSects.slice();
const DIFF = {
  easy: {
    label: "初級　小田チビオ",
    cpu: "初級　小田チビオ",
    intro: "実際に遊んで遊び方を覚えよう！"
  },
  normal: {
    label: "中級　中山チュウタロウ",
    cpu: "中級　中山チュウタロウ",
    intro: "交換をうまく使い、強いカードを有効に使おう！"
  },
  master: {
    label: "上級　上野ジョー",
    cpu: "上級　上野ジョー",
    intro: "強いカードを使い終わったら、その宗派を手放すのもテクニック！"
  },
  ray: {
    label: "超級　カードマスター水谷RAY",
    cpu: "超級　カードマスター水谷RAY",
    intro: "最も悟りに近づいた伝説の男、マジで強いです"
  }
};

let currentDifficulty = "normal";
let state = emptyState();

function isOnlineMode(){ return !!(window.ONLINE && window.ONLINE.enabled); }
function localKey(){ return isOnlineMode() ? window.ONLINE.role : "player"; }
function enemyKey(){ return localKey() === "player" ? "cpu" : "player"; }
function nameOf(who){
  if(isOnlineMode()){
    const n = window.ONLINE?.names?.[who] || "";
    if(n) return n + "さん";
    return who === localKey() ? "あなた" : "相手";
  }
  return who === "player" ? "あなた" : "相手";
}
function canLocalAct(){ return !isOnlineMode() || state.turn === localKey(); }

const $ = id => document.getElementById(id);

function emptyState(){
  return {
    difficulty:"normal",
    deck:[], discard:[], founderPool:[], played:[],
    player:{founders:[], hand:[], score:0},
    cpu:{founders:[], hand:[], score:0},
    turn:"player", drawn:false, over:false, winner:null, winCardId:null,
    lastCutin:null,
    gameOverId:null
  };
}

function shuffle(a){
  for(let i=a.length-1;i>0;i--){
    const j=Math.floor(Math.random()*(i+1));
    [a[i],a[j]]=[a[j],a[i]];
  }
  return a;
}

function uniq(arr){ return [...new Set((arr || []).filter(Boolean))]; }

const SECT_CODE = {
  "浄土宗":"JODO",
  "浄土真宗":"SHIN",
  "時宗":"JI",
  "融通念仏宗":"YUZU",
  "天台宗":"TENDAI",
  "真言宗":"SHINGON",
  "臨済宗":"RINZAI",
  "曹洞宗":"SOTO",
  "黄檗宗":"OBAKU",
  "日蓮宗":"NICHIREN",
  "法相宗":"HOSSO",
  "華厳宗":"KEGON",
  "律宗":"RITSU"
};
const CODE_SECT = Object.fromEntries(Object.entries(SECT_CODE).map(([k,v])=>[v,k]));
function sectCode(sect){ return SECT_CODE[sect] || ""; }
function sectName(code){ return CODE_SECT[code] || ""; }
function exactSectNames(list){
  return uniq((list || []).filter(s => Object.prototype.hasOwnProperty.call(SECT_CODE, s)));
}

function msg(t){ $("message").innerHTML = t; }

function cloneCard(c){ return JSON.parse(JSON.stringify(c)); }

function cardSects(card){
  // 宗派判定は日本語の部分一致ではなく、必ず宗派コード化して完全一致で行う。
  // これにより「浄土宗」と「浄土真宗」が混ざる事故を防ぐ。
  return exactSectNames(card.allowedSects || card.sects);
}

function cardSectCodes(card){
  return uniq(cardSects(card).map(sectCode).filter(Boolean));
}

function founderSect(founder){
  const sect = founder && founder.sect ? founder.sect : (founder?.allowedSects?.[0] || founder?.sects?.[0] || "");
  return Object.prototype.hasOwnProperty.call(SECT_CODE, sect) ? sect : "";
}

function founderSectCode(founder){
  return sectCode(founderSect(founder));
}

function playerSects(player){
  return uniq(player.founders.map(founderSect).filter(Boolean));
}

function playerSectCodes(player){
  return uniq(player.founders.map(founderSectCode).filter(Boolean));
}

function matchingSects(player, card){
  const ownCodes = playerSectCodes(player);
  return cardSectCodes(card).filter(code => ownCodes.includes(code)).map(sectName);
}

function hasMatch(player, card){
  return matchingSects(player, card).length > 0;
}

function isFreeChoiceCard(card){
  const label = String(card.sectLabel || "");
  return label.includes("13宗派") || label.includes("１３宗派") || label.includes("浄土真宗以外") || card.name === "引導";
}

function canChooseExchangeEvenWhenMatched(card){
  // 宗派が2つ以上あるカードは、すでに一致していても、あえてお布施を払って交換できる。
  // 単一宗派カードは従来通り、一致していれば交換不可。
  return cardSects(card).length >= 2;
}

function img(card, cls="cardImg"){
  const im = document.createElement("img");
  im.src = card.image;
  im.alt = card.name;
  im.title = `${card.name}｜${card.sectLabel || cardSects(card).join("/")}`;
  im.className = cls;
  return im;
}

function sectHTML(founders){
  return `<div class="sectTags">${playerSects({founders}).map(s=>`<span>${s}</span>`).join("")}</div>`;
}

function renderSects(id, founders){
  $(id).innerHTML = sectHTML(founders);
}

function renderFounders(id, arr){
  const el = $(id); el.innerHTML = "";
  arr.forEach(c => {
    const box = document.createElement("div");
    box.className = "founderBox";
    box.appendChild(img(c));
    const meta = document.createElement("div");
    meta.className = "founderMeta";
    meta.innerHTML = `<b>${c.name}</b><span>${c.sect || (c.allowedSects && c.allowedSects[0]) || ""}</span>`;
    box.appendChild(meta);
    el.appendChild(box);
  });
}

function renderPlayed(){
  const el = $("playedPile"); el.innerHTML = "";
  const played = state.played || [];
  if(!played.length){
    el.innerHTML = '<span class="emptyPlayed">まだカードは使われていません</span>';
    return;
  }
  const indexed = played.map((item, index)=>({...item, index}));
  const playerCards = indexed.filter(x=>x.who === "player").slice(-3);
  const cpuCards = indexed.filter(x=>x.who === "cpu").slice(-3);
  const makeColumn = (who, title, cards) => {
    const col = document.createElement("div");
    col.className = "playedColumn " + who;
    const head = document.createElement("b");
    head.textContent = title;
    col.appendChild(head);
    const list = document.createElement("div");
    list.className = "playedList";
    if(!cards.length){
      const none = document.createElement("span");
      none.className = "emptyPlayed small";
      none.textContent = "なし";
      list.appendChild(none);
    }else{
      cards.forEach(item=>{
        const cardImg = img(item.card);
        cardImg.classList.add("playedClickable");
        cardImg.onclick = () => showPlayedViewer(item.index);
        if(state.over && state.winner === item.who && state.winCardId === item.card.id){
          cardImg.classList.add("winGlow");
        }
        list.appendChild(cardImg);
      });
    }
    col.appendChild(list);
    return col;
  };
  el.appendChild(makeColumn("player", "あなた", playerCards));
  el.appendChild(makeColumn("cpu", "相手", cpuCards));
}


function updateScoreGauge(who, score){
  const bar = $(who + "Bar");
  if(!bar) return;
  const pct = Math.max(0, Math.min(100, score / GOAL * 100));
  bar.style.width = "100%";
  bar.style.height = pct + "%";
  bar.classList.remove("glow1","glow2","glow3","glow4","glowMax");
  const wrap = bar.parentElement;
  if(wrap) wrap.classList.remove("pulseGauge");
  if(score >= 49){
    bar.classList.add("glowMax");
    if(wrap) wrap.classList.add("pulseGauge");
  }else if(score >= 41){
    bar.classList.add("glow4");
    if(wrap) wrap.classList.add("pulseGauge");
  }else if(score >= 31){
    bar.classList.add("glow3");
  }else if(score >= 21){
    bar.classList.add("glow2");
  }else if(score >= 11){
    bar.classList.add("glow1");
  }
}

function render(){
  $("deckCount").textContent = state.deck?.length || 0;
  const me = localKey();
  const enemy = enemyKey();
  $("playerScore").textContent = `${state[me].score} / 49`;
  $("cpuScore").textContent = `${state[enemy].score} / 49`;
  updateScoreGauge("player", state[me].score);
  updateScoreGauge("cpu", state[enemy].score);
  const myTitle = document.querySelector(".board.player h2");
  const enemyTitle = document.querySelector(".board.enemy h2");
  if(myTitle && myTitle.firstChild) myTitle.firstChild.nodeValue = isOnlineMode() ? nameOf(me) + " " : "あなた ";
  if(enemyTitle && enemyTitle.firstChild) enemyTitle.firstChild.nodeValue = isOnlineMode() ? nameOf(enemy) + " " : "相手 ";
  const mySectLabel = document.querySelector(".mySect b");
  const enemySectLabel = document.querySelector(".board.enemy .sectPanel b");
  if(mySectLabel) mySectLabel.textContent = isOnlineMode() ? `${nameOf(me)}の宗派` : "あなたの宗派";
  if(enemySectLabel) enemySectLabel.textContent = isOnlineMode() ? `${nameOf(enemy)}の宗派` : "相手の宗派";
  $("yourTurn").innerHTML = state.turn === me ? '<span class="turnMark">あなたの番</span>' : "";
  $("cpuTurn").innerHTML = state.turn === enemy ? '<span class="turnMark">相手の番</span>' : "";
  $("cpuName").textContent = isOnlineMode() ? "" : `（${DIFF[state.difficulty]?.cpu || ""}）`;

  renderSects("playerSects", state[me].founders);
  renderSects("cpuSects", state[enemy].founders);
  renderFounders("playerFounders", state[me].founders);
  renderFounders("cpuFounders", state[enemy].founders);
  renderPlayed();

  const hand = $("hand");
  hand.innerHTML = "";
  state[localKey()].hand.forEach((c, idx)=>{
    const box = document.createElement("div");
    box.className = "cardBox";
    const im = img(c);
    im.onclick = () => previewHandCard(idx);
    if(hasMatch(state[localKey()], c)) im.classList.add("matchCard");
    box.appendChild(im);
    hand.appendChild(box);
  });

  $("drawBtn").disabled = !(state.turn === localKey() && !state.drawn && !state.over);
  if(window.onlineMaybeCommit) window.onlineMaybeCommit(state);
}

function chooseModal(title, text, items, onPick, isSect=false, backLabel="", onBack=null){
  $("modalTitle").textContent = title;
  $("modalText").textContent = text;
  const ops = $("modalOptions");
  ops.innerHTML = "";
  ops.className = "optionGrid";
  items.forEach((it, i)=>{
    const el = isSect ? document.createElement("button") : img(it);
    if(isSect){
      el.textContent = it;
      el.className = "sectBtn";
    }
    el.onclick = () => {
      $("modal").classList.add("hidden");
      onPick(it, i);
    };
    ops.appendChild(el);
  });
  if(backLabel){
    const back = document.createElement("button");
    back.textContent = backLabel;
    back.className = "sectBtn backPickBtn";
    back.onclick = () => {
      $("modal").classList.add("hidden");
      if(onBack) onBack();
    };
    ops.appendChild(back);
  }
  $("modal").classList.remove("hidden");
}

function closeModal(){
  $("modal").classList.add("hidden");
}


function previewHandCard(idx){
  const me = localKey();
  if(state.turn !== me || state.over) return;
  if(!state.drawn){
    msg("先に山札から1枚引いてください。");
    return;
  }
  const card = state[me].hand[idx];
  if(!card) return;
  $("modalTitle").textContent = card.name;
  $("modalText").textContent = `${card.type || "カード"}｜${card.sectLabel || cardSects(card).join("/")}\nこのカードを使いますか？`;
  const ops = $("modalOptions");
  ops.innerHTML = "";
  ops.className = "cardDetailBox playPreviewBox";
  ops.appendChild(img(card, "previewCardImg"));
  const row = document.createElement("div");
  row.className = "detailBtns";
  const use = document.createElement("button");
  use.textContent = "このカードを使う";
  use.onclick = () => { closeModal(); playPlayer(idx); };
  const back = document.createElement("button");
  back.textContent = "選びなおす";
  back.className = "backPickBtn";
  back.onclick = closeModal;
  row.appendChild(use);
  row.appendChild(back);
  ops.appendChild(row);
  $("modal").classList.remove("hidden");
}

function showPlayedViewer(index){
  const played = state.played || [];
  if(!played.length) return;
  let i = Math.max(0, Math.min(index, played.length - 1));
  const item = played[i];
  const card = item.card;
  $("modalTitle").textContent = `${item.who === "player" ? "あなた" : "相手"}が使用：${card.name}`;
  $("modalText").textContent = `${i + 1} / ${played.length}枚目｜${card.type || "カード"}｜${card.sectLabel || cardSects(card).join("/")}`;
  const ops = $("modalOptions");
  ops.innerHTML = "";
  ops.className = "cardDetailBox playedViewerBox";
  ops.appendChild(img(card, "previewCardImg"));
  const row = document.createElement("div");
  row.className = "detailBtns";
  const prev = document.createElement("button");
  prev.textContent = "前のカード";
  prev.disabled = i <= 0;
  prev.onclick = () => showPlayedViewer(i - 1);
  const next = document.createElement("button");
  next.textContent = "次のカード";
  next.disabled = i >= played.length - 1;
  next.onclick = () => showPlayedViewer(i + 1);
  const close = document.createElement("button");
  close.textContent = "閉じる";
  close.onclick = closeModal;
  row.appendChild(prev);
  row.appendChild(next);
  row.appendChild(close);
  ops.appendChild(row);
  $("modal").classList.remove("hidden");
}

function showCardCutin(card, who){
  const layer = getFxLayer();
  const isMine = who === localKey();
  const side = isOnlineMode() ? (isMine ? `${nameOf(who)}の使用カード` : `${nameOf(who)}の使用カード`) : (who === "player" ? "あなたの使用カード" : "相手の使用カード");
  const duration = (!isOnlineMode() && who === "cpu") ? 4000 : 2500;
  layer.innerHTML = "";
  layer.className = "fxActive cardCutinLayer";
  const wrap = document.createElement("div");
  wrap.className = "cardCutin " + (who === localKey() ? "playerCutin" : "cpuCutin");
  wrap.style.animationDuration = duration + "ms";
  const label = document.createElement("div");
  label.className = "cutinLabel";
  label.textContent = side;
  const cardName = document.createElement("div");
  cardName.className = "cutinName";
  cardName.textContent = card.name;
  wrap.appendChild(label);
  if(isGohonzonCard(card)){
    const rare = document.createElement("div");
    rare.className = "rareText";
    rare.textContent = "レアカード！！！";
    wrap.appendChild(rare);
  }
  wrap.appendChild(img(card, "cutinCardImg"));
  wrap.appendChild(cardName);
  layer.appendChild(wrap);
  clearFxLayerSoon(duration);
  return duration;
}

function showTurnCutin(who){
  const layer = getFxLayer();
  layer.innerHTML = "";
  layer.className = "fxActive turnCutinLayer " + (who === localKey() ? "playerTurnCutin" : "cpuTurnCutin");
  const box = document.createElement("div");
  box.className = "turnCutinBox";
  const small = document.createElement("div");
  small.className = "turnCutinSmall";
  small.textContent = who === localKey() ? "YOUR TURN" : "RIVAL TURN";
  const main = document.createElement("div");
  main.className = "turnCutinMain";
  main.textContent = who === localKey() ? "自分の番" : "相手の番";
  box.appendChild(small);
  box.appendChild(main);
  layer.appendChild(box);
  clearFxLayerSoon(1500);
}

function transitionToTurn(who){
  state.turn = who;
  state.drawn = false;
  render();
  showTurnCutin(who);
  if(isOnlineMode()){
    msg(who === localKey() ? "あなたの番です。山札から1枚引いてください。" : "相手の番です。相手の操作を待っています……");
    return;
  }
  if(who === "cpu"){
    msg("相手の番です。相手がカードを選んでいます……");
    setTimeout(cpuTurn, 4000);
  }else{
    msg("あなたの番です。山札から1枚引いてください。");
  }
}

function resultTextFor(winner){
  if(isOnlineMode()){
    return winner === localKey()
      ? "おめでとうございます。49ポイントぴったり到達で勝利です。"
      : `${nameOf(winner)}が49ポイントぴったりに到達しました。`;
  }
  const win = winner === "player";
  const d = state.difficulty;
  if(d === "easy") return win ? "おめでとう！ナイスフルボッコだ！" : "何度もチャレンジしよう！";
  if(d === "normal") return win ? "おめでとう！素晴らしい勝負だった！" : "惜しい戦いだ！";
  if(d === "master") return win ? "すごい！仏教カードの名人です！" : "悔しい戦いだ！ジョーは強い！！";
  if(d === "ray") return win ? "さすがに悟りすぎ！！！参りました！！！！！！" : "これはさすがに相手が悪い！水谷はいつでも挑戦を待っている！";
  return win ? "勝利です！" : "敗北です！";
}

function showResultModal(winner){
  const win = winner === localKey();
  const text = resultTextFor(winner);
  $("modalTitle").textContent = win ? "勝利！" : "敗北…";
  $("modalText").textContent = text;
  const ops = $("modalOptions");
  ops.innerHTML = "";
  ops.className = state.difficulty === "ray" && win ? "resultBox creditResult" : "resultBox";
  if(state.difficulty === "ray" && win){
    const credit = document.createElement("div");
    credit.className = "staffRoll";
    credit.innerHTML = `<b>スタッフロール</b><span>水谷玲</span>`;
    ops.appendChild(credit);
  }
  const retry = document.createElement("button");
  retry.textContent = "もう一度勝負する";
  retry.onclick = () => { closeModal(); if(isOnlineMode()){ msg("オンライン対戦では、タイトルへ戻って新しい部屋を作成してください。"); }else{ start(currentDifficulty); } };
  const title = document.createElement("button");
  title.textContent = "タイトルへ";
  title.onclick = () => { closeModal(); $("titleScreen").classList.remove("titleHidden"); };
  ops.appendChild(retry);
  ops.appendChild(title);
  $("modal").classList.remove("hidden");
}

function addPlayed(who, card){
  state.played.push({who, card});
  // スマホでも自分3枚・相手3枚を見られるよう、少し多めに履歴を保持する。
  if(state.played.length > 14) state.played.shift();
}

function makeDeckByDifficulty(){
  // 山札は共通。Excelのカード一覧51枚から開祖カードを除いたカードのみで作成する。
  return shuffle(CARD_DATA.deck.map(cloneCard));
}

function drawCard(who){
  if(state.over) return;
  if(!state.deck.length){
    if(state.discard.length){
      state.deck = shuffle(state.discard.splice(0));
      msg("捨て札を混ぜ直して山札にしました。");
    }else{
      msg("山札がありません。");
      return;
    }
  }
  const c = drawFromDeckFor(who);
  state[who].hand.push(c);
  const deckCard = document.querySelector(".deckCard");
  if(deckCard){
    deckCard.classList.add("flash");
    setTimeout(()=>deckCard.classList.remove("flash"), 700);
  }
  state.drawn = true;
  msg(who === "player" ? "山札からカードを1枚引きました。使うカードを選んでください。" : "相手が山札からカードを1枚引きました。");
  render();
  if(who === "player"){
    const imgs = $("hand").querySelectorAll(".cardImg");
    if(imgs.length) imgs[imgs.length-1].classList.add("drawAnim");
  }
}

function evaluateCpuCardPower(card){
  const match = hasMatch(state.cpu, card);
  let val = match ? card.power : card.power - card.donation;
  const need = GOAL - state.cpu.score;
  const bounceScore = (() => {
    let raw = state.cpu.score + val;
    if(raw > GOAL) raw = GOAL - (raw - GOAL);
    return raw;
  })();
  if(val === need) val += 1000;
  if(card.power >= 10) val += 80;
  if(match) val += 40;
  if(card.power >= 7) val += 20;
  val += bounceScore * 0.25;
  return val;
}

function drawFromDeckFor(who){
  // 最難関「カードキング水谷RAY」は、理不尽なほど強い引きをする。
  // ただし山札というルールは守り、山札内から最も強そうな1枚を引く。
  if(who === "cpu" && state.difficulty === "ray" && state.deck.length){
    let bestIndex = state.deck.length - 1;
    let bestVal = -Infinity;
    state.deck.forEach((card, i)=>{
      const val = evaluateCpuCardPower(card) + Math.random() * 0.01;
      if(val > bestVal){ bestVal = val; bestIndex = i; }
    });
    return state.deck.splice(bestIndex, 1)[0];
  }
  return state.deck.pop();
}

function addScore(player, delta, who){
  let raw = player.score + delta;
  if(raw > GOAL) raw = GOAL - (raw - GOAL);
  if(raw < 0) raw = 0;
  player.score = raw;
  pop(delta, who);
}

function pop(delta, who){
  const layer = $("effectLayer");
  if(!layer) return;
  const p = document.createElement("div");
  p.className = "scorePop";
  p.textContent = (delta >= 0 ? "+" : "") + delta;
  p.style.left = who === "player" ? "22%" : "78%";
  p.style.top = "48%";
  layer.appendChild(p);
  setTimeout(()=>p.remove(), 1000);
}

function getFxLayer(){
  let layer = document.getElementById("fullFxLayer");
  if(!layer){
    layer = document.createElement("div");
    layer.id = "fullFxLayer";
    document.body.appendChild(layer);
  }
  return layer;
}

function clearFxLayerSoon(delay=1800){
  const layer = getFxLayer();
  setTimeout(()=>{ layer.innerHTML = ""; layer.className = ""; }, delay);
}

function triggerGohonzonEffect(){
  const layer = getFxLayer();
  layer.innerHTML = "";
  layer.className = "fxActive gohonzonLightning";
  for(let i=0;i<10;i++){
    const bolt = document.createElement("i");
    bolt.className = "fxBolt";
    bolt.style.left = (8 + Math.random()*84) + "%";
    bolt.style.top = (6 + Math.random()*76) + "%";
    bolt.style.transform = `rotate(${ -35 + Math.random()*70 }deg) scale(${ .8 + Math.random()*1.15 })`;
    bolt.style.animationDelay = (Math.random()*0.28) + "s";
    layer.appendChild(bolt);
  }
  clearFxLayerSoon(1250);
}

function triggerGoalEffect(){
  const layer = getFxLayer();
  layer.innerHTML = "";
  layer.className = "fxActive goalStorm";
  for(let i=0;i<18;i++){
    const bolt = document.createElement("i");
    bolt.className = "fxBolt goalBolt";
    bolt.style.left = (Math.random()*100) + "%";
    bolt.style.top = (Math.random()*86) + "%";
    bolt.style.transform = `rotate(${ -50 + Math.random()*100 }deg) scale(${ .9 + Math.random()*1.6 })`;
    bolt.style.animationDelay = (Math.random()*0.9) + "s";
    layer.appendChild(bolt);
  }
  const kinds = ["light","fire","water","leaf"];
  for(let i=0;i<95;i++){
    const p = document.createElement("b");
    const kind = kinds[i % kinds.length];
    p.className = "fxParticle " + kind;
    p.style.left = (Math.random()*100) + "%";
    p.style.top = (Math.random()*100) + "%";
    p.style.setProperty("--dx", (-240 + Math.random()*480) + "px");
    p.style.setProperty("--dy", (-220 + Math.random()*440) + "px");
    p.style.animationDelay = (Math.random()*0.65) + "s";
    p.style.animationDuration = (1.2 + Math.random()*1.7) + "s";
    layer.appendChild(p);
  }
  clearFxLayerSoon(3200);
}

function isGohonzonCard(card){
  return (card.type || "") === "ご本尊";
}

function findFounderHolderBySect(sect){
  // 交換先検索も宗派コードで完全一致。
  const targetCode = sectCode(sect);
  if(!targetCode) return null;
  let i = state.player.founders.findIndex(f => founderSectCode(f) === targetCode);
  if(i >= 0) return {zone:"player", index:i, founder:state.player.founders[i]};
  i = state.cpu.founders.findIndex(f => founderSectCode(f) === targetCode);
  if(i >= 0) return {zone:"cpu", index:i, founder:state.cpu.founders[i]};
  i = state.founderPool.findIndex(f => founderSectCode(f) === targetCode);
  if(i >= 0) return {zone:"pool", index:i, founder:state.founderPool[i]};
  return null;
}

function exchangeableSectsFor(player, card){
  const ownCodes = playerSectCodes(player);
  return cardSects(card).filter(s => !ownCodes.includes(sectCode(s)));
}

function swapFounder(who, ownIndex, targetSect){
  const actor = state[who];
  const ownFounder = actor.founders[ownIndex];
  if(!ownFounder) return {ok:false, text:"交換に出す開祖カードが見つかりませんでした。"};

  const target = findFounderHolderBySect(targetSect);
  if(!target) return {ok:false, text:`${targetSect}の開祖カードが見つかりませんでした。`};
  if(target.zone === who){
    return {ok:false, text:"すでに自分が持っている宗派のため交換できません。"};
  }

  actor.founders[ownIndex] = target.founder;

  if(target.zone === "player" || target.zone === "cpu"){
    state[target.zone].founders[target.index] = ownFounder;
    return {
      ok:true,
      text:`${target.zone === "player" ? "あなた" : "相手"}の「${target.founder.name}（${founderSect(target.founder)}）」と「${ownFounder.name}（${founderSect(ownFounder)}）」を交換しました。`
    };
  }

  if(target.zone === "pool"){
    state.founderPool[target.index] = ownFounder;
    return {
      ok:true,
      text:`場の開祖カード「${target.founder.name}（${founderSect(target.founder)}）」と「${ownFounder.name}（${founderSect(ownFounder)}）」を交換しました。`
    };
  }

  return {ok:false, text:"交換先が不明です。"};
}

function resolvePlay(who, card, handIndex, mode, opts={}){
  const player = state[who];
  player.hand.splice(handIndex, 1);
  addPlayed(who, card);
  state.discard.push(card);

  const allowed = cardSects(card);
  const matches = matchingSects(player, card);
  let delta = 0;
  let text = "";

  if(mode === "match"){
    const chosen = opts.sect && matches.includes(opts.sect) ? opts.sect : matches[0];
    if(!chosen){
      // 不正な呼び出しを防ぐ。ここに入ったら絶対に得点しない。
      msg(`「${card.name}」は現在の開祖カードと宗派が一致しません。交換処理に戻します。`);
      // 手札に戻す
      state.discard.pop();
      state.played.pop();
      player.hand.splice(handIndex, 0, card);
      render();
      return;
    }
    delta = card.power;
    text = `${nameOf(who)}は「${card.name}」を${chosen}として使用。宗派一致のため、お布施なし。${card.power}ポイント獲得。`;
  }else if(mode === "exchange"){
    const targetSect = opts.targetSect;
    const ownIndex = opts.ownIndex;
    if(!allowed.includes(targetSect)){
      msg(`「${card.name}」は${targetSect}として使えません。処理を中止しました。`);
      state.discard.pop();
      state.played.pop();
      player.hand.splice(handIndex, 0, card);
      render();
      return;
    }
    if(matches.includes(targetSect)){
      msg(`${targetSect}はすでに自分の開祖カードにあります。交換ではなく宗派一致として使ってください。`);
      state.discard.pop();
      state.played.pop();
      player.hand.splice(handIndex, 0, card);
      render();
      return;
    }
    const swap = swapFounder(who, ownIndex, targetSect);
    if(!swap.ok){
      msg(`交換できませんでした。${swap.text}`);
      state.discard.pop();
      state.played.pop();
      player.hand.splice(handIndex, 0, card);
      render();
      return;
    }
    delta = card.power - card.donation;
    text = `${nameOf(who)}は「${card.name}」を${targetSect}として使用。${swap.text}<br>お布施${card.donation}を支払い、${delta}ポイント進みます。`;
  }else{
    msg("処理モードが不正です。");
    return;
  }

  msg(text);
  addScore(player, delta, who);
  state.lastCutin = {
    id: Date.now() + "-" + who + "-" + card.id + "-" + Math.random().toString(36).slice(2, 7),
    who,
    card: cloneCard(card)
  };
  render();
  const last = $("playedPile").querySelectorAll(".cardImg");
  if(last.length) last[last.length-1].classList.add("useAnim");
  const cutinDuration = showCardCutin(card, who);
  if(isGohonzonCard(card)) setTimeout(triggerGohonzonEffect, cutinDuration + 100);

  if(player.score === GOAL){
    setTimeout(()=>{
      state.over = true;
      state.winner = who;
      state.winCardId = card.id;
      state.gameOverId = Date.now() + "-" + who + "-" + card.id;
      msg(nameOf(who) + "の勝利です。49ポイントぴったり到達しました。<br>" + resultTextFor(who));
      triggerGoalEffect();
      render();
      setTimeout(()=>showResultModal(who), 900);
    }, cutinDuration + 200);
    return;
  }

  const next = who === "player" ? "cpu" : "player";
  setTimeout(()=>transitionToTurn(next), cutinDuration + 150);
}

function askExchange(card, handIndex){
  const options = exchangeableSectsFor(state[localKey()], card);
  if(!options.length){
    msg(`「${card.name}」は交換できる宗派がありません。自分の宗派で使ってください。`);
    return;
  }
  const pickFounder = (sect) => {
    chooseModal(
      "交換に出す開祖カードを選択",
      `「${card.name}」を${sect}として使用します。自分の開祖カードを1枚選び、${sect}の開祖カードと交換します。相手が持っていれば相手と交換します。`,
      state[localKey()].founders,
      (f, fi) => resolvePlay(localKey(), card, handIndex, "exchange", {ownIndex:fi, targetSect:sect}),
      false,
      "選びなおす"
    );
  };
  if(options.length === 1) pickFounder(options[0]);
  else chooseModal("交換する宗派を選択", "このカードで交換したい宗派を選んでください。", options, pickFounder, true, "選びなおす");
}

function playPlayer(idx){
  const me = localKey();
  if(state.turn !== me || state.over) return;
  if(!state.drawn){
    msg("先に山札から1枚引いてください。");
    return;
  }

  const card = state[me].hand[idx];
  const matches = matchingSects(state[me], card);

  // 13宗派・浄土真宗以外に加え、宗派が2つ以上あるカードは、
  // 一致していても「お布施なしで使う」か「あえて交換する」か選べる。
  const exchangeOptions = exchangeableSectsFor(state[me], card);
  if(matches.length && canChooseExchangeEvenWhenMatched(card) && exchangeOptions.length){
    const choices = ["自分の宗派で使う（お布施なし）", "お布施を支払い、別の宗派と交換する"];
    chooseModal("使い方を選択", `「${card.name}」は${card.sectLabel || cardSects(card).join("/")}のカードです。`, choices, choice=>{
      if(choice.includes("自分の宗派")){
        if(matches.length > 1){
          chooseModal("使用する宗派を選択", "どの開祖宗派として使うか選んでください。", matches, s=>resolvePlay(me, card, idx, "match", {sect:s}), true);
        }else{
          resolvePlay(me, card, idx, "match", {sect:matches[0]});
        }
      }else{
        askExchange(card, idx);
      }
    }, true);
    return;
  }

  // 13宗派・引導などで一致はないが交換先が複数ある場合は、交換先を選べる。
  if(isFreeChoiceCard(card) && !matches.length){
    askExchange(card, idx);
    return;
  }

  // 単一宗派カードは一致していたら必ず一致処理。交換画面は出さない。
  if(matches.length){
    resolvePlay(me, card, idx, "match", {sect:matches[0]});
  }else{
    askExchange(card, idx);
  }
}

function chooseCpuCard(){
  let best = 0, bestVal = -Infinity;
  state.cpu.hand.forEach((c, i)=>{
    let match = hasMatch(state.cpu, c);
    let val = match ? c.power : c.power - c.donation;
    const need = GOAL - state.cpu.score;
    if(val === need) val += 100;
    if(state.difficulty === "easy") val = val - c.power * 0.65 + Math.random() * 4;
    if(state.difficulty === "normal") val += Math.random() * 2;
    if(state.difficulty === "master") val += c.power * 1.25 + (match ? 12 : 0) + (c.power >= 10 ? 15 : 0);
    if(state.difficulty === "ray") val = evaluateCpuCardPower(c) + c.power * 2 + (match ? 35 : 0);
    if(val > bestVal){ bestVal = val; best = i; }
  });
  return best;
}

function chooseCpuExchange(card){
  const options = exchangeableSectsFor(state.cpu, card);
  if(!options.length) return null;

  let bestSect = options[0], bestScore = -Infinity;
  options.forEach(s=>{
    const holder = findFounderHolderBySect(s);
    let score = 0;
    score += state.cpu.hand.filter(c => cardSectCodes(c).includes(sectCode(s))).length * 3;
    if(holder?.zone === "player") score += 5;
    if(state.difficulty === "master" || state.difficulty === "ray"){
      score += state.cpu.hand.filter(c => cardSectCodes(c).includes(sectCode(s)) && c.power >= 7).length * 5;
      if(holder?.zone === "player") score += 5;
    }
    if(state.difficulty === "ray"){
      score += state.cpu.hand.filter(c => cardSectCodes(c).includes(sectCode(s)) && c.power >= 10).length * 12;
      score += CARD_DATA.deck.filter(c => cardSectCodes(c).includes(sectCode(s)) && c.power >= 10).length * 2;
      if(holder?.zone === "player") score += 12;
    }
    if(score > bestScore){ bestScore = score; bestSect = s; }
  });

  // 今後使える手札が最も少ない自分の開祖を手放す。
  let ownIndex = 0, low = Infinity;
  state.cpu.founders.forEach((f, i)=>{
    const fs = founderSect(f);
    const usable = state.cpu.hand.filter(c => cardSects(c).includes(fs)).length;
    if(usable < low){ low = usable; ownIndex = i; }
  });

  return {ownIndex, targetSect:bestSect};
}

function cpuTurn(){
  if(state.over) return;
  if(!state.drawn){
    drawCard("cpu");
    setTimeout(cpuTurn, 650);
    return;
  }

  const idx = chooseCpuCard();
  const card = state.cpu.hand[idx];
  const matches = matchingSects(state.cpu, card);

  if(matches.length){
    // CPUは一致カードを優先。フリーカードでも原則一致利用。
    resolvePlay("cpu", card, idx, "match", {sect:matches[0]});
    return;
  }

  const ex = chooseCpuExchange(card);
  if(ex){
    resolvePlay("cpu", card, idx, "exchange", ex);
  }else{
    // 交換不能の場合は最低限の保険としてカードを使わずターン終了は避け、手札に残す。
    msg(`相手は「${card.name}」を使える宗派がありませんでした。`);
    setTimeout(()=>transitionToTurn("player"), 1200);
  }
}

function start(diff=currentDifficulty){
  currentDifficulty = diff;
  const founders = shuffle(CARD_DATA.founders.map(cloneCard));
  state = {
    difficulty: diff,
    deck: makeDeckByDifficulty(diff),
    discard: [],
    founderPool: founders.slice(6),
    played: [],
    player: {founders:founders.slice(0,3), hand:[], score:0},
    cpu: {founders:founders.slice(3,6), hand:[], score:0},
    turn: "player",
    drawn: false,
    over: false,
    winner: null,
    winCardId: null
  };

  const pMin = Math.min(...state.player.founders.map(f=>f.year));
  const cMin = Math.min(...state.cpu.founders.map(f=>f.year));
  state.turn = pMin <= cMin ? "player" : "cpu";

  for(let i=0; i<(state.turn === "player" ? 4 : 5); i++){
    const c = state.deck.pop();
    if(c) state.player.hand.push(c);
  }
  for(let i=0; i<(state.turn === "cpu" ? 4 : 5); i++){
    const c = state.deck.pop();
    if(c) state.cpu.hand.push(c);
  }

  const diffInfo = DIFF[diff];
  const firstText = `難易度「${diffInfo.label}」で開始。<br>${diffInfo.intro}<br>歴史が早い開祖を持つ${state.turn === "player" ? "あなた" : "相手"}が先攻です。`;
  msg(firstText);
  render();
  chooseModal(
    diffInfo.label,
    `${diffInfo.intro}

歴史が早い開祖を持つ${state.turn === "player" ? "あなた" : "相手"}が先攻です。`,
    ["ゲーム開始"],
    ()=>{ transitionToTurn(state.turn); },
    true
  );
}

function rules(){
  chooseModal(
    "基本ルール",
    "開祖カードを3枚ずつ受け取り、歴史の早い開祖を持つ側が先攻。先攻4枚、後攻5枚の手札で開始。自分の番に山札から1枚引き、1枚使用します。宗派が一致すればお布施なしで力ポイント獲得。不一致なら自分の開祖カードを1枚選び、使用カードに該当する宗派の開祖カードと交換します。相手が持っている開祖カードなら相手と交換です。宗派が2つ以上あるカードは、宗派が一致していても、お布施なしで使うか、あえてお布施を払って別の該当宗派と交換するか選べます。13宗派カードは好きな宗派で使用できます。引導は「13宗派から浄土真宗を除いたカード」として、浄土真宗以外の宗派と交換・一致利用できます。49ポイントぴったり到達で勝利。超過分は跳ね返ります。",
    ["閉じる"],
    ()=>{},
    true
  );
}


function bookAllCards(){
  return [...CARD_DATA.founders, ...CARD_DATA.deck];
}

let bookFilter = {mode:"all", value:"all"};

function cardMatchesBookFilter(card){
  if(bookFilter.mode === "all") return true;
  if(bookFilter.mode === "sect") return cardSects(card).includes(bookFilter.value);
  if(bookFilter.mode === "type") return (card.type || "カード") === bookFilter.value;
  return true;
}

function showCardBook(filter=bookFilter){
  bookFilter = filter || {mode:"all", value:"all"};
  const allCards = bookAllCards();
  const visibleCards = allCards.filter(cardMatchesBookFilter);
  const types = uniq(allCards.map(c => c.type || "カード"));

  $("modalTitle").textContent = "カード図鑑";
  $("modalText").textContent = "宗派別・カード種類別に表示できます。カードを押すと大きく表示できます。";
  const ops = $("modalOptions");
  ops.innerHTML = "";
  ops.className = "cardBookBox";

  const controls = document.createElement("div");
  controls.className = "bookControls";

  const allBtn = document.createElement("button");
  allBtn.textContent = "すべて";
  allBtn.className = bookFilter.mode === "all" ? "bookFilterBtn active" : "bookFilterBtn";
  allBtn.onclick = () => showCardBook({mode:"all", value:"all"});
  controls.appendChild(allBtn);

  const sectLabel = document.createElement("span");
  sectLabel.textContent = "宗派別";
  sectLabel.className = "bookFilterLabel";
  controls.appendChild(sectLabel);
  ALL_SECTS.forEach(sect=>{
    const b = document.createElement("button");
    b.textContent = sect;
    b.className = bookFilter.mode === "sect" && bookFilter.value === sect ? "bookFilterBtn active" : "bookFilterBtn";
    b.onclick = () => showCardBook({mode:"sect", value:sect});
    controls.appendChild(b);
  });

  const typeLabel = document.createElement("span");
  typeLabel.textContent = "種類別";
  typeLabel.className = "bookFilterLabel";
  controls.appendChild(typeLabel);
  types.forEach(type=>{
    const b = document.createElement("button");
    b.textContent = type;
    b.className = bookFilter.mode === "type" && bookFilter.value === type ? "bookFilterBtn active" : "bookFilterBtn";
    b.onclick = () => showCardBook({mode:"type", value:type});
    controls.appendChild(b);
  });
  ops.appendChild(controls);

  const count = document.createElement("div");
  count.className = "bookCount";
  count.textContent = `${visibleCards.length}枚表示`;
  ops.appendChild(count);

  const grid = document.createElement("div");
  grid.className = "cardBookGrid";
  visibleCards.forEach(card=>{
    const wrap = document.createElement("button");
    wrap.className = "bookCardBtn";
    const im = img(card, "bookCardImg");
    const cap = document.createElement("span");
    cap.textContent = card.name;
    const meta = document.createElement("small");
    meta.textContent = `${card.type || "カード"}｜${card.sectLabel || cardSects(card).join("/")}`;
    wrap.appendChild(im);
    wrap.appendChild(cap);
    wrap.appendChild(meta);
    wrap.onclick = () => showCardDetail(card);
    grid.appendChild(wrap);
  });
  ops.appendChild(grid);

  const close = document.createElement("button");
  close.textContent = "閉じる";
  close.className = "sectBtn cardBookClose";
  close.onclick = closeModal;
  ops.appendChild(close);
  $("modal").classList.remove("hidden");
}

function showCardDetail(card){
  $("modalTitle").textContent = card.name;
  $("modalText").textContent = `${card.type || "カード"}｜${card.sectLabel || cardSects(card).join("/")}`;
  const ops = $("modalOptions");
  ops.innerHTML = "";
  ops.className = "cardDetailBox";
  const im = img(card, "detailCardImg");
  ops.appendChild(im);
  const row = document.createElement("div");
  row.className = "detailBtns";
  const back = document.createElement("button");
  back.textContent = "図鑑に戻る";
  back.onclick = () => showCardBook(bookFilter);
  row.appendChild(back);
  ops.appendChild(row);
  $("modal").classList.remove("hidden");
}

function runRuleSelfTest(){
  // 画面には出さない簡易テスト。コンソールで確認可能。
  const byName = name => CARD_DATA.deck.find(c => c.name === name);
  const fake = sects => ({founders: sects.map((s,i)=>({name:"test"+i, sect:s, sects:[s], allowedSects:[s]}))});
  const tests = [
    ["阿弥陀如来", ["浄土宗"], true],
    ["阿弥陀如来", ["法相宗"], false],
    ["毘盧遮那如来", ["華厳宗"], true],
    ["毘盧遮那如来", ["浄土宗"], false],
    ["大日如来", ["真言宗"], true],
    ["大日如来", ["臨済宗"], false],
    ["引導", ["浄土真宗"], false],
    ["引導", ["浄土宗"], true],
    ["引導", ["真言宗"], true],
    ["他力本願", ["浄土宗"], false],
    ["他力本願", ["浄土真宗"], true],
    ["西本願寺", ["浄土宗"], false],
    ["西本願寺", ["浄土真宗"], true],
    ["知恩院", ["浄土真宗"], false],
    ["知恩院", ["浄土宗"], true],
    ["般若心経", ["黄檗宗"], true]
  ];
  const failed = tests.filter(([name,sects,expected]) => hasMatch(fake(sects), byName(name)) !== expected);
  if(failed.length){
    console.error("宗派判定セルフテスト失敗", failed);
  }else{
    console.log("宗派判定セルフテストOK（PDF黒帯基準）");
  }
}

function createOnlineInitialState(diff=currentDifficulty){
  currentDifficulty = diff;
  const founders = shuffle(CARD_DATA.founders.map(cloneCard));
  state = {
    difficulty: diff,
    deck: makeDeckByDifficulty(diff),
    discard: [],
    founderPool: founders.slice(6),
    played: [],
    player: {founders:founders.slice(0,3), hand:[], score:0},
    cpu: {founders:founders.slice(3,6), hand:[], score:0},
    turn: "player",
    drawn: false,
    over: false,
    winner: null,
    winCardId: null
  };
  const pMin = Math.min(...state.player.founders.map(f=>f.year));
  const cMin = Math.min(...state.cpu.founders.map(f=>f.year));
  state.turn = pMin <= cMin ? "player" : "cpu";
  for(let i=0; i<(state.turn === "player" ? 4 : 5); i++){ const c = state.deck.pop(); if(c) state.player.hand.push(c); }
  for(let i=0; i<(state.turn === "cpu" ? 4 : 5); i++){ const c = state.deck.pop(); if(c) state.cpu.hand.push(c); }
  render();
  return JSON.parse(JSON.stringify(state));
}

let lastOnlineCutinId = "";
let lastOnlineResultId = "";
let lastOnlineTurn = "";

function applyOnlineState(nextState){
  const prevOver = !!state.over;
  const prevTurn = state && state.turn;
  state = JSON.parse(JSON.stringify(nextState));
  currentDifficulty = state.difficulty || currentDifficulty;
  render();

  // 相手の操作でターンが自分に戻ってきた時にも「自分の番」カットインを表示します。
  if(!state.over && state.turn && state.turn !== prevTurn && state.turn !== lastOnlineTurn){
    lastOnlineTurn = state.turn;
    showTurnCutin(state.turn);
    if(state.turn === localKey()){
      msg("あなたの番です。山札から1枚引いてください。");
    }
  }

  const fx = state.lastCutin;
  if(fx && fx.id && fx.id !== lastOnlineCutinId){
    lastOnlineCutinId = fx.id;
    if(fx.who !== localKey() && fx.card){
      const d = showCardCutin(fx.card, fx.who);
      if(isGohonzonCard(fx.card)) setTimeout(triggerGohonzonEffect, d + 100);
    }
  }

  if(state.over && state.winner){
    const resultId = state.gameOverId || `${state.winner}-${state.winCardId || ""}`;
    if(resultId !== lastOnlineResultId){
      lastOnlineResultId = resultId;
      msg(nameOf(state.winner) + "の勝利です。49ポイントぴったり到達しました。<br>" + resultTextFor(state.winner));
      if(!prevOver) triggerGoalEffect();
      setTimeout(()=>showResultModal(state.winner), 900);
    }
  }
}

window.createOnlineInitialState = createOnlineInitialState;
window.applyOnlineState = applyOnlineState;

$("drawBtn").onclick = () => drawCard(localKey());
$("newGame").onclick = () => {
  if(isOnlineMode()){
    alert("オンライン対戦の再戦は、タイトルに戻って新しい部屋を作成してください。");
    return;
  }
  start(currentDifficulty);
};
$("showRules").onclick = rules;
$("titleRules").onclick = rules;
$("cardBook").onclick = showCardBook;
$("backTitle").onclick = () => $("titleScreen").classList.remove("titleHidden");
document.querySelectorAll(".difficultyBtns button").forEach(b=>{
  b.onclick = () => {
    $("titleScreen").classList.add("titleHidden");
    start(b.dataset.diff);
  };
});

render();
runRuleSelfTest();
