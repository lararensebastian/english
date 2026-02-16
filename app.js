
const $ = (sel)=>document.querySelector(sel);
const $$ = (sel)=>Array.from(document.querySelectorAll(sel));

const STORAGE_KEY = "englishDeepPractice_v1";
const defaultState = {
  completed: {}, // moduleId -> true
  moduleProgress: {}, // moduleId -> {partIndex, scores...}
  stats: { points:0, sessions:0, accuracy: {correct:0,total:0} }
};

let DATA = null;
let state = null;
let currentModuleId = null;
let currentPartIndex = 0;

// ---------- State ----------
function loadState(){
  try{
    const raw = localStorage.getItem(STORAGE_KEY);
    state = raw ? JSON.parse(raw) : structuredClone(defaultState);
  }catch{
    state = structuredClone(defaultState);
  }
}
function saveState(){
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}
function resetAll(){
  if(!confirm("Reset ALL progress?")) return;
  state = structuredClone(defaultState);
  saveState();
  renderHome();
  showView("home");
}

function getModuleProgress(moduleId){
  if(!state.moduleProgress[moduleId]) state.moduleProgress[moduleId] = {
    partIndex:0,
    partDone: {},
    lastAccuracy: null
  };
  return state.moduleProgress[moduleId];
}

function addPoints(n){ state.stats.points += n; }
function addAccuracy(isCorrect){
  state.stats.accuracy.total += 1;
  if(isCorrect) state.stats.accuracy.correct += 1;
}

// ---------- UI helpers ----------
function showView(id){
  $$(".view").forEach(v=>v.classList.remove("active"));
  $("#"+id).classList.add("active");
  window.scrollTo({top:0, behavior:"instant"});
}
function esc(s){
  return String(s).replace(/[&<>"']/g, m=>({ "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;" }[m]));
}
function pct(n){ return Math.max(0, Math.min(100, Math.round(n))); }

function globalAccuracy(){
  const a = state.stats.accuracy;
  return a.total ? Math.round((a.correct/a.total)*100) : 0;
}

// ---------- Render Home ----------
function renderHome(){
  const mods = DATA.modules;
  const doneCount = Object.keys(state.completed).length;
  const progressPct = pct((doneCount / mods.length) * 100);

  $("#points").textContent = state.stats.points;
  $("#sessions").textContent = state.stats.sessions;
  $("#accuracy").textContent = globalAccuracy() + "%";
  $("#overallBar").style.width = progressPct + "%";

  const grid = $("#moduleGrid");
  grid.innerHTML = mods.map(m=>{
    const isDone = !!state.completed[m.id];
    const mp = getModuleProgress(m.id);
    const badge = isDone ? `<span class="badge good">Klar</span>` :
      (mp.partIndex>0 ? `<span class="badge warn">Pågår</span>` : `<span class="badge">Ny</span>`);
    return `
      <div class="card">
        <div class="row" style="justify-content:space-between; align-items:flex-start">
          <div>
            <div style="font-size:30px">${esc(m.icon||"📘")}</div>
            <h3>${esc(m.title)}</h3>
            <div class="small">${esc(m.desc||"")}</div>
          </div>
          <div style="text-align:right">
            ${badge}
            <div class="small" style="margin-top:6px">${esc(m.level||"")}</div>
            <div class="small">${esc(m.time||"")}</div>
          </div>
        </div>
        <hr/>
        <div class="row">
          <button class="btn" data-open="${esc(m.id)}">Starta</button>
          <button class="btn secondary" data-resetmod="${esc(m.id)}">Återställ modul</button>
        </div>
      </div>
    `;
  }).join("");

  $$("button[data-open]").forEach(b=>b.addEventListener("click", ()=>openModule(b.dataset.open)));
  $$("button[data-resetmod]").forEach(b=>b.addEventListener("click", ()=>resetModule(b.dataset.resetmod)));
}

function resetModule(moduleId){
  if(!confirm("Reset progress for this module?")) return;
  delete state.moduleProgress[moduleId];
  delete state.completed[moduleId];
  saveState();
  renderHome();
}

// ---------- Module Engine ----------
function openModule(moduleId){
  currentModuleId = moduleId;
  const m = DATA.modules.find(x=>x.id===moduleId);
  const mp = getModuleProgress(moduleId);
  currentPartIndex = mp.partIndex || 0;

  $("#modTitle").textContent = m.title;
  $("#modMeta").textContent = `${m.level||""} • ${m.time||""}`;
  $("#modDesc").textContent = m.desc || "";
  $("#modIcon").textContent = m.icon || "📘";

  renderPart();
  showView("module");
}

function renderPart(){
  const m = DATA.modules.find(x=>x.id===currentModuleId);
  const mp = getModuleProgress(currentModuleId);
  const parts = m.parts;
  const part = parts[currentPartIndex];

  $("#partIndex").textContent = `${currentPartIndex+1} / ${parts.length}`;
  $("#partName").textContent = part.title;

  const modPct = pct(((currentPartIndex) / parts.length) * 100);
  $("#moduleBar").style.width = modPct + "%";

  const container = $("#partContainer");
  container.innerHTML = "";

  // navigation buttons
  $("#prevBtn").disabled = currentPartIndex === 0;
  $("#nextBtn").disabled = false;

  // render by type
  if(part.type==="lesson"){
    container.innerHTML = `
      <div class="box">
        ${ (part.content||[]).map(x=>`<div>• ${esc(x)}</div>`).join("") }
      </div>
      ${renderCompleteBox("Markera denna del som klar", "completeLesson")}
    `;
    $("#completeLesson").addEventListener("click", ()=>markPartDone());
  }

  if(part.type==="mc"){
    container.innerHTML = `
      <div class="box small">Välj svar. Klicka <b>Check</b> för feedback. Du får poäng för rätt svar.</div>
      <div id="mcWrap"></div>
      <div class="row" style="margin-top:12px">
        <button class="btn" id="mcCheck">Check</button>
        <button class="btn secondary" id="mcClear">Clear</button>
      </div>
      <div class="footer">Mål: 70%+ innan du går vidare.</div>
    `;
    const wrap = $("#mcWrap");
    const items = part.items || [];
    const answers = new Array(items.length).fill(null);

    wrap.innerHTML = items.map((it,i)=>`
      <div class="q" data-i="${i}">
        <p><b>${i+1}.</b> ${esc(it.q)}</p>
        <div class="opts">
          ${it.opts.map((o,ix)=>`<div class="opt" data-ix="${ix}">${esc(o)}</div>`).join("")}
        </div>
        <div class="fb" id="fb_${i}"></div>
      </div>
    `).join("");

    $$(".q .opt").forEach(opt=>{
      opt.addEventListener("click", ()=>{
        const q = opt.closest(".q");
        const i = Number(q.dataset.i);
        if(q.dataset.locked==="1") return;
        q.querySelectorAll(".opt").forEach(x=>x.classList.remove("selected"));
        opt.classList.add("selected");
        answers[i] = Number(opt.dataset.ix);
      });
    });

    $("#mcClear").addEventListener("click", ()=>{
      $$(".q").forEach(q=>{
        q.dataset.locked="0";
        q.querySelectorAll(".opt").forEach(x=>x.className="opt");
        const fb = $("#fb_"+q.dataset.i);
        fb.className="fb";
        fb.textContent="";
      });
      for(let i=0;i<answers.length;i++) answers[i]=null;
    });

    $("#mcCheck").addEventListener("click", ()=>{
      let correct = 0;
      items.forEach((it,i)=>{
        const q = $(`.q[data-i="${i}"]`);
        const user = answers[i];
        const fb = $("#fb_"+i);
        if(user===null){
          fb.className="fb show";
          fb.textContent="Välj ett svar.";
          return;
        }
        // mark
        q.dataset.locked="1";
        const opts = q.querySelectorAll(".opt");
        opts[user].classList.add(user===it.a ? "correct":"incorrect");
        opts[it.a].classList.add("correct");
        const ok = user===it.a;
        if(ok) correct++;
        addAccuracy(ok);
        if(ok) addPoints(10);
        fb.className = "fb show " + (ok ? "good":"bad");
        fb.innerHTML = ok ? `✓ Rätt. ${esc(it.exp||"")}` : `✗ Inte riktigt. ${esc(it.exp||"")}`;
      });
      const score = Math.round((correct/items.length)*100);
      mp.lastAccuracy = score;
      saveState();
      $("#mcCheck").disabled = true;
      $("#mcClear").disabled = false;
      // show completion suggestion
      const doneBox = document.createElement("div");
      doneBox.className = "box";
      doneBox.style.marginTop = "14px";
      doneBox.innerHTML = `<b>Score:</b> ${score}%<br>${score>=70 ? "Bra! Du kan gå vidare." : "Jobba om: klicka Clear och försök igen tills du når 70%."}`;
      container.appendChild(doneBox);
      if(score>=70){
        const btn = document.createElement("button");
        btn.className = "btn";
        btn.textContent = "Mark as done";
        btn.style.marginTop = "10px";
        btn.addEventListener("click", ()=>markPartDone());
        doneBox.appendChild(document.createElement("div")).appendChild(btn);
      }
    });
  }

  if(part.type==="fix"){
    container.innerHTML = `
      <div class="box small">Skriv om meningarna så att de blir korrekt engelska.</div>
      <div id="fixWrap"></div>
      <button class="btn" id="fixShow" style="margin-top:12px">Show answers</button>
      ${renderCompleteBox("När du har jämfört – markera delen som klar", "completeFix")}
    `;
    const wrap = $("#fixWrap");
    wrap.innerHTML = (part.items||[]).map((it,i)=>`
      <div class="q">
        <p><b>${i+1}.</b> ${esc(it.bad)}</p>
        <textarea id="fix_${i}" placeholder="Write the corrected sentence..."></textarea>
        <div class="fb" id="fixfb_${i}"></div>
      </div>
    `).join("");

    $("#fixShow").addEventListener("click", ()=>{
      (part.items||[]).forEach((it,i)=>{
        const fb = $("#fixfb_"+i);
        fb.className = "fb show";
        fb.innerHTML = `<b>Correct:</b> ${esc(it.good)}<br><span class="small">${esc(it.why||"")}</span>`;
      });
    });
    $("#completeFix").addEventListener("click", ()=>markPartDone());
  }

  if(part.type==="build"){
    container.innerHTML = `
      <div class="box small">Bygg meningar. Skriv en mening för varje rad. Jämför med exempel.</div>
      <div id="buildWrap"></div>
      <button class="btn secondary" id="buildShow" style="margin-top:12px">Show examples</button>
      ${renderCompleteBox("När du har jämfört – markera delen som klar", "completeBuild")}
    `;
    const wrap = $("#buildWrap");
    wrap.innerHTML = (part.items||[]).map((it,i)=>`
      <div class="q">
        <p><b>${i+1}.</b> ${esc(it.words.join(" "))}</p>
        <textarea id="build_${i}" placeholder="Write the sentence..."></textarea>
        <div class="fb" id="buildfb_${i}"></div>
      </div>
    `).join("");
    $("#buildShow").addEventListener("click", ()=>{
      (part.items||[]).forEach((it,i)=>{
        const fb = $("#buildfb_"+i);
        fb.className = "fb show";
        fb.innerHTML = `<b>Example:</b> ${esc(it.example)}`;
      });
    });
    $("#completeBuild").addEventListener("click", ()=>markPartDone());
  }

  if(part.type==="reading"){
    container.innerHTML = `
      <div class="box"><b>Text</b><br>${esc(part.text)}</div>
      <div id="readWrap"></div>
      <button class="btn secondary" id="readShow" style="margin-top:12px">Show model answers</button>
      ${renderCompleteBox("När du är klar – markera delen som klar", "completeRead")}
    `;
    const wrap = $("#readWrap");
    wrap.innerHTML = (part.questions||[]).map((it,i)=>`
      <div class="q">
        <p><b>${i+1}.</b> ${esc(it.q)}</p>
        <input type="text" id="read_${i}" placeholder="Write your answer...">
        <div class="fb" id="readfb_${i}"></div>
      </div>
    `).join("");
    $("#readShow").addEventListener("click", ()=>{
      (part.questions||[]).forEach((it,i)=>{
        const fb = $("#readfb_"+i);
        fb.className = "fb show";
        fb.innerHTML = `<b>Model:</b> ${esc(it.a)}<br><span class="small">Hint: ${esc(it.hint||"")}</span>`;
      });
    });
    $("#completeRead").addEventListener("click", ()=>markPartDone());
  }

  if(part.type==="writing"){
    container.innerHTML = `
      <div class="box">
        <b>Task</b><br>
        <pre style="white-space:pre-wrap;margin:10px 0 0;color:var(--muted)">${esc(part.prompt)}</pre>
      </div>
      <div class="q">
        <p><b>Your writing:</b></p>
        <textarea id="writingText" placeholder="Write here..."></textarea>
      </div>
      <div class="box">
        <b>Checklist</b>
        ${ (part.checklist||[]).map((x,i)=>`
          <div><label><input type="checkbox" class="ck" data-i="${i}"> ${esc(x)}</label></div>
        `).join("")}
      </div>
      ${renderCompleteBox("När du har bockat av checklistan – markera delen som klar", "completeWrite")}
    `;
    $("#completeWrite").addEventListener("click", ()=>{
      // require at least 2 checklist ticks to reduce "skip"
      const checked = $$(".ck").filter(x=>x.checked).length;
      if(checked < Math.min(2, (part.checklist||[]).length)){
        alert("Bocka av minst 2 punkter i checklistan innan du går vidare.");
        return;
      }
      markPartDone();
    });
  }


  if(part.type==="placement"){
    // Adaptive placement test (A1.1–C1)
    const cfg = part.config;
    const LEVELS = cfg.levels;
    const RULES = cfg.rules;
    const targets = cfg.targets;
    const weights = cfg.weights;
    const bank = part.bank;

    const now = ()=>Date.now();
    const startedAt = now();
    const timeLimitMs = (cfg.timeLimitMinutes||60) * 60 * 1000;

    const session = {
      stage:"grammar",
      stageOrder:["grammar","vocab","reading","writing","report"],
      levelIndex:{
        grammar: LEVELS.indexOf(targets.grammar.startLevel || "A2.1"),
        vocab: LEVELS.indexOf(targets.vocab.startLevel || "A2.1"),
        reading: LEVELS.indexOf(targets.reading.startLevel || "A2.1"),
      },
      streak:{ grammar:{c:0,w:0}, vocab:{c:0,w:0}, reading:{c:0,w:0} },
      asked:{ grammar:new Set(), vocab:new Set(), reading:new Set() },
      stableCount:{ grammar:0, vocab:0, reading:0 },
      lastLevelIndex:{ grammar:null, vocab:null, reading:null },
      results:{
        grammar:{correct:0,total:0, history:[]},
        vocab:{correct:0,total:0, history:[]},
        reading:{texts:[], score:0, history:[]}, // score 0..100
        writing:{text:"", words:0, metrics:{}},
        final:{}
      }
    };

    // helpers
    const clamp = (x,a,b)=>Math.max(a,Math.min(b,x));
    const levelName = (idx)=>LEVELS[clamp(idx,0,LEVELS.length-1)];
    const tokenize = (s)=>String(s).trim().split(/\s+/).filter(Boolean);

    function timeLeftMs(){ return Math.max(0, timeLimitMs - (now()-startedAt)); }
    function timeLeftLabel(){
      const ms = timeLeftMs();
      const m = Math.floor(ms/60000);
      const s = Math.floor((ms%60000)/1000);
      return `${m}:${String(s).padStart(2,"0")}`;
    }

    function pickMC(category){
      const idx = session.levelIndex[category];
      const target = levelName(idx);
      const arr = (bank[category]||[]);
      const unused = arr.filter((q,i)=>q.level===target && !session.asked[category].has(i));
      let pool = unused.length ? unused : arr.filter((q,i)=>!session.asked[category].has(i));
      if(!pool.length) pool = arr; // fallback
      // choose an index from pool
      const chosen = pool[Math.floor(Math.random()*pool.length)];
      const chosenIndex = arr.indexOf(chosen);
      session.asked[category].add(chosenIndex);
      return {q:chosen, i:chosenIndex};
    }

    function updateAdaptive(category, isCorrect){
      const st = session.streak[category];
      const before = session.levelIndex[category];
      if(isCorrect){ st.c++; st.w=0; }
      else { st.w++; st.c=0; }

      // stability tracking
      if(session.lastLevelIndex[category] === before) session.stableCount[category] += 1;
      else session.stableCount[category] = 0;
      session.lastLevelIndex[category] = before;

      if(st.c >= RULES.upAfter){
        session.levelIndex[category] = clamp(before + (RULES.maxJump||1), 0, LEVELS.length-1);
        st.c = 0;
      }
      if(st.w >= RULES.downAfter){
        session.levelIndex[category] = clamp(before - (RULES.maxJump||1), 0, LEVELS.length-1);
        st.w = 0;
      }
    }

    function stageDone(category){
      const r = session.results[category];
      const t = targets[category];
      if(category==="reading"){
        return session.results.reading.texts.length >= t.minTexts;
      }
      const total = r.total;
      const stableEnough = session.stableCount[category] >= (RULES.stabilityWindow||6);
      const minOk = total >= (t.min||18);
      const maxReached = total >= (t.max||26);
      return (minOk && stableEnough) || maxReached;
    }

    function calcReadingScore(){
      // average across texts
      const texts = session.results.reading.texts;
      if(!texts.length) return 0;
      const avg = texts.reduce((a,t)=>a+t.pct,0)/texts.length;
      return Math.round(avg);
    }

    function estimateLevelFromHistory(category){
      // Weighted average of level indices of correct answers
      const h = session.results[category].history;
      if(!h.length) return LEVELS[0];
      let num=0, den=0;
      h.forEach(x=>{
        const w = x.correct ? 1.0 : 0.35; // wrong still informative but weaker
        num += x.levelIndex * w;
        den += w;
      });
      const avg = num/den;
      const idx = clamp(Math.round(avg), 0, LEVELS.length-1);
      return levelName(idx);
    }

    function overallLevel(levelsByCat){
      // Convert levels to indices and average with weights (exclude writing here; writing will be heuristic)
      const gi = LEVELS.indexOf(levelsByCat.grammar);
      const vi = LEVELS.indexOf(levelsByCat.vocab);
      const ri = LEVELS.indexOf(levelsByCat.reading);
      // writing index computed later
      const wi = LEVELS.indexOf(levelsByCat.writing);

      const idx = (gi*weights.grammar + vi*weights.vocab + ri*weights.reading + wi*weights.writing) /
                  (weights.grammar+weights.vocab+weights.reading+weights.writing);
      return levelName(Math.round(idx));
    }

    function analyzeWriting(text){
      const words = tokenize(text);
      const wc = words.length;
      const sentences = text.split(/[.!?]+/).map(x=>x.trim()).filter(Boolean);
      const sc = sentences.length;
      const avgLen = sc ? (wc/sc) : 0;

      const hasBecause = /\bbecause\b/i.test(text);
      const hasBut = /\bbut\b/i.test(text);
      const hasPast = /\b(went|was|were|did|had)\b/i.test(text) || /\b\w+ed\b/i.test(text);
      const hasFuture = /\b(will|going to)\b/i.test(text);
      const hasPerfect = /\b(have|has)\s+\w+ed\b/i.test(text) || /\b(have|has)\s+(been|gone|done|seen)\b/i.test(text);
      const hasIf = /\bif\b/i.test(text);

      // Heuristic mapping to level
      let idx = 0; // A1.1
      if(wc >= 40 && sc >= 6) idx = Math.max(idx, 1); // A1.2
      if(wc >= 70 && sc >= 8 && (hasPast || hasFuture)) idx = Math.max(idx, 2); // A2.1
      if(wc >= 90 && sc >= 10 && hasPast && (hasBecause || hasBut)) idx = Math.max(idx, 3); // A2.2
      if(wc >= 130 && sc >= 10 && hasIf && (hasBecause || hasBut) && avgLen >= 9) idx = Math.max(idx, 4); // B1.1
      if(wc >= 160 && sc >= 12 && hasPerfect && hasIf && avgLen >= 10) idx = Math.max(idx, 5); // B1.2
      if(wc >= 190 && sc >= 14 && hasPerfect && avgLen >= 11) idx = Math.max(idx, 6); // B2
      if(wc >= 220 && sc >= 16 && hasPerfect && avgLen >= 12) idx = Math.max(idx, 7); // C1

      return {words:wc, sentences:sc, avgWordsPerSentence:Math.round(avgLen*10)/10, flags:{hasBecause,hasBut,hasPast,hasFuture,hasPerfect,hasIf}, level: levelName(idx)};
    }

    function renderTimer(){
      $("#partContainer").querySelector("#timer").textContent = timeLeftLabel();
      if(timeLeftMs()<=0){
        alert("Tiden är slut. Vi sammanställer resultatet.");
        session.stage = "report";
        renderStage();
      } else {
        setTimeout(renderTimer, 1000);
      }
    }

    function renderStage(){
      const container = $("#partContainer");
      const stage = session.stage;

      // header
      container.innerHTML = `
        <div class="box">
          <div class="row" style="justify-content:space-between; align-items:center">
            <div><b>Kartläggning</b> • Adaptivt test</div>
            <div class="badge">⏳ <span id="timer"></span></div>
          </div>
          <div class="small" style="margin-top:8px">
            Du får lättare frågor om du svarar fel och svårare om du svarar rätt. Jobba lugnt.
          </div>
        </div>
        <div id="stageBody" style="margin-top:12px"></div>
      `;
      renderTimer();

      const body = container.querySelector("#stageBody");

      if(stage==="grammar" || stage==="vocab"){
        const pick = pickMC(stage);
        const q = pick.q;
        const lvlIdx = session.levelIndex[stage];
        body.innerHTML = `
          <div class="q">
            <div class="row" style="justify-content:space-between">
              <div><b>${stage==="grammar" ? "Grammar" : "Vocabulary"}</b></div>
              <div class="small">Nivå just nu: <b>${levelName(lvlIdx)}</b> • Fråga ${session.results[stage].total+1}</div>
            </div>
            <p style="margin-top:10px">${esc(q.q)}</p>
            <div class="opts">
              ${q.opts.map((o,i)=>`<div class="opt" data-ix="${i}">${esc(o)}</div>`).join("")}
            </div>
            <div class="fb" id="mcFb"></div>
            <div class="row" style="margin-top:12px">
              <button class="btn" id="checkBtn">Check</button>
              <button class="btn secondary" id="skipBtn">Skip</button>
            </div>
            <div class="footer">Mål: ca ${targets[stage].min}-${targets[stage].max} frågor.</div>
          </div>
        `;

        let selected = null;
        body.querySelectorAll(".opt").forEach(el=>{
          el.addEventListener("click", ()=>{
            body.querySelectorAll(".opt").forEach(x=>x.classList.remove("selected"));
            el.classList.add("selected");
            selected = Number(el.dataset.ix);
          });
        });

        body.querySelector("#skipBtn").addEventListener("click", ()=>{
          // count as wrong but do not punish too hard
          session.results[stage].total += 1;
          session.results[stage].history.push({levelIndex:lvlIdx, correct:false, skipped:true});
          updateAdaptive(stage, false);
          saveState();
          if(stageDone(stage)){
            session.stage = stage==="grammar" ? "vocab" : "reading";
          }
          renderStage();
        });

        body.querySelector("#checkBtn").addEventListener("click", ()=>{
          if(selected===null){ alert("Välj ett alternativ."); return; }
          const ok = selected===q.a;
          session.results[stage].total += 1;
          if(ok) session.results[stage].correct += 1;
          session.results[stage].history.push({levelIndex:lvlIdx, correct:ok});
          addAccuracy(ok);
          if(ok) addPoints(10);

          // lock options
          body.querySelectorAll(".opt").forEach((el,i)=>{
            el.classList.remove("selected");
            const cls = (i===q.a) ? "correct" : ((i===selected) ? "incorrect" : null);
            if(cls) el.classList.add(cls);
          });
          const fb = body.querySelector("#mcFb");
          fb.className = "fb show " + (ok ? "good":"bad");
          fb.innerHTML = ok ? `✓ Rätt. ${esc(q.exp||"")}` : `✗ Inte riktigt. ${esc(q.exp||"")}`;

          updateAdaptive(stage, ok);
          saveState();

          // next after short pause
          setTimeout(()=>{
            if(stageDone(stage)){
              session.stage = stage==="grammar" ? "vocab" : "reading";
            }
            renderStage();
          }, 550);
        });

        return;
      }

      if(stage==="reading"){
        const currentIdx = session.levelIndex.reading;
        const targetLvl = levelName(currentIdx);
        const passages = (bank.reading||[]);
        // pick passage closest to current level not used
        const unused = passages.filter(p=>p.level===targetLvl && !session.asked.reading.has(p.id));
        let pool = unused.length ? unused : passages.filter(p=>!session.asked.reading.has(p.id));
        if(!pool.length) pool = passages;
        const p = pool[Math.floor(Math.random()*pool.length)];
        session.asked.reading.add(p.id);

        // Render passage + questions (short)
        const qs = p.qs || [];
        body.innerHTML = `
          <div class="q">
            <div class="row" style="justify-content:space-between">
              <div><b>Reading</b></div>
              <div class="small">Textnivå: <b>${esc(p.level)}</b> • Text ${session.results.reading.texts.length+1}</div>
            </div>
            <div class="box" style="margin-top:10px">${esc(p.text)}</div>
            <div id="rqWrap" style="margin-top:10px">
              ${qs.map((x,i)=>`
                <div class="q" style="margin:10px 0">
                  <p><b>${i+1}.</b> ${esc(x.q)}</p>
                  <input type="text" id="rq_${i}" placeholder="Write a short answer...">
                </div>
              `).join("")}
            </div>
            <div class="row" style="margin-top:12px">
              <button class="btn" id="readCheck">Check</button>
              <button class="btn secondary" id="readShow">Show model</button>
            </div>
            <div class="fb" id="readFb"></div>
          </div>
        `;

        body.querySelector("#readShow").addEventListener("click", ()=>{
          const fb = body.querySelector("#readFb");
          fb.className = "fb show";
          fb.innerHTML = qs.map((x,i)=>`<div><b>${i+1}.</b> ${esc(x.a)} <span class="small">(${esc(x.hint||"")})</span></div>`).join("");
        });

        body.querySelector("#readCheck").addEventListener("click", ()=>{
          // Simple keyword match scoring (lenient): count non-empty as attempt, and include a few keywords from model
          let correct=0, total=qs.length;
          qs.forEach((x,i)=>{
            const user = (body.querySelector("#rq_"+i).value||"").trim().toLowerCase();
            const model = (x.a||"").toLowerCase();
            if(!user){ return; }
            // keyword overlap
            const u = new Set(user.split(/\W+/).filter(Boolean));
            const m = new Set(model.split(/\W+/).filter(Boolean));
            let overlap = 0;
            m.forEach(w=>{ if(u.has(w)) overlap++; });
            if(overlap >= Math.min(2, Math.max(1, Math.floor(m.size*0.35)))) correct++;
          });
          const pctScore = total ? Math.round((correct/total)*100) : 0;
          session.results.reading.texts.push({id:p.id, level:p.level, pct:pctScore});
          session.results.reading.score = calcReadingScore();
          // adaptive adjustment: treat >=60% as correct "text"
          const ok = pctScore >= 60;
          session.results.reading.history.push({levelIndex:currentIdx, correct:ok, pct:pctScore});
          updateAdaptive("reading", ok);

          const fb = body.querySelector("#readFb");
          fb.className = "fb show " + (ok ? "good":"bad");
          fb.innerHTML = `Score på texten: <b>${pctScore}%</b> (modellsvar finns i “Show model”).`;

          // Move on if enough texts
          setTimeout(()=>{
            if(stageDone("reading")){
              session.stage = "writing";
            }
            renderStage();
          }, 650);
        });

        return;
      }

      if(stage==="writing"){
        // Determine target prompt based on estimated levels so far (grammar/vocab/reading)
        const gL = estimateLevelFromHistory("grammar");
        const vL = estimateLevelFromHistory("vocab");
        const rL = estimateLevelFromHistory("reading");
        const gI = LEVELS.indexOf(gL), vI = LEVELS.indexOf(vL), rI = LEVELS.indexOf(rL);
        const avgI = Math.round((gI+vI+rI)/3);
        const target = levelName(avgI);
        const prompt = (bank.writingPrompts||{})[target] || (bank.writingPrompts||{})["A2.1"];

        body.innerHTML = `
          <div class="q">
            <div class="row" style="justify-content:space-between">
              <div><b>Writing</b></div>
              <div class="small">Din skriv-nivå just nu: <b>${esc(target)}</b></div>
            </div>
            <div class="box" style="margin-top:10px"><b>Task</b><br><span class="small">${esc(prompt)}</span></div>
            <div style="margin-top:10px">
              <textarea id="wText" placeholder="Write here...">${esc(session.results.writing.text||"")}</textarea>
              <div class="row" style="justify-content:space-between; margin-top:8px">
                <div class="small">Words: <b id="wCount">0</b></div>
                <button class="btn secondary" id="wAnalyze">Analyze</button>
              </div>
              <div class="fb" id="wFb"></div>
            </div>
            <div class="row" style="margin-top:12px">
              <button class="btn" id="toReport">Finish & report</button>
            </div>
          </div>
        `;

        const updateCount = ()=>{
          const t = body.querySelector("#wText").value;
          const wc = tokenize(t).length;
          body.querySelector("#wCount").textContent = wc;
        };
        updateCount();
        body.querySelector("#wText").addEventListener("input", updateCount);

        body.querySelector("#wAnalyze").addEventListener("click", ()=>{
          const t = body.querySelector("#wText").value;
          const analysis = analyzeWriting(t);
          session.results.writing.text = t;
          session.results.writing.words = analysis.words;
          session.results.writing.metrics = analysis;
          const fb = body.querySelector("#wFb");
          fb.className = "fb show";
          fb.innerHTML = `
            Estimated writing level: <b>${esc(analysis.level)}</b><br>
            Sentences: <b>${analysis.sentences}</b> • Avg words/sentence: <b>${analysis.avgWordsPerSentence}</b><br>
            Signals: <span class="small">
              because=${analysis.flags.hasBecause ? "✓":"–"} • but=${analysis.flags.hasBut ? "✓":"–"} • past=${analysis.flags.hasPast ? "✓":"–"} • future=${analysis.flags.hasFuture ? "✓":"–"} • perfect=${analysis.flags.hasPerfect ? "✓":"–"} • if=${analysis.flags.hasIf ? "✓":"–"}
            </span>
          `;
          saveState();
        });

        body.querySelector("#toReport").addEventListener("click", ()=>{
          // If no analyze yet, still analyze
          const t = body.querySelector("#wText").value;
          const analysis = analyzeWriting(t);
          session.results.writing.text = t;
          session.results.writing.words = analysis.words;
          session.results.writing.metrics = analysis;
          session.stage = "report";
          renderStage();
        });

        return;
      }

      if(stage==="report"){
        const g = estimateLevelFromHistory("grammar");
        const v = estimateLevelFromHistory("vocab");
        const r = estimateLevelFromHistory("reading");
        const w = (session.results.writing.metrics && session.results.writing.metrics.level) ? session.results.writing.metrics.level : "A1.1";
        const overall = overallLevel({grammar:g, vocab:v, reading:r, writing:w});

        const gPct = session.results.grammar.total ? Math.round((session.results.grammar.correct/session.results.grammar.total)*100) : 0;
        const vPct = session.results.vocab.total ? Math.round((session.results.vocab.correct/session.results.vocab.total)*100) : 0;
        const rPct = session.results.reading.score || 0;

        const report = {
          overall,
          grammar:{level:g, score:gPct, n:session.results.grammar.total},
          vocab:{level:v, score:vPct, n:session.results.vocab.total},
          reading:{level:r, score:rPct, texts:session.results.reading.texts.length},
          writing:{level:w, words:session.results.writing.words||0},
          timestamp: new Date().toISOString()
        };
        session.results.final = report;

        // store as completion
        state.completed[currentModuleId] = true;
        state.stats.sessions += 1;
        addPoints(100);
        saveState();

        const txt = `PLACEMENT RESULT\nOverall: ${overall}\nGrammar: ${g} (${gPct}%, n=${report.grammar.n})\nVocab: ${v} (${vPct}%, n=${report.vocab.n})\nReading: ${r} (${rPct}%, texts=${report.reading.texts})\nWriting: ${w} (words=${report.writing.words})\nTime: ${report.timestamp}`;

        body.innerHTML = `
          <div class="q">
            <div class="row" style="justify-content:space-between">
              <div><b>Resultat</b></div>
              <div class="badge good">Overall: ${esc(overall)}</div>
            </div>
            <div class="grid" style="margin-top:12px">
              <div class="card">
                <h3>Grammar</h3>
                <div class="small">Nivå: <b>${esc(g)}</b></div>
                <div class="small">Score: <b>${gPct}%</b> (n=${report.grammar.n})</div>
              </div>
              <div class="card">
                <h3>Vocabulary</h3>
                <div class="small">Nivå: <b>${esc(v)}</b></div>
                <div class="small">Score: <b>${vPct}%</b> (n=${report.vocab.n})</div>
              </div>
              <div class="card">
                <h3>Reading</h3>
                <div class="small">Nivå: <b>${esc(r)}</b></div>
                <div class="small">Score: <b>${rPct}%</b> (texts=${report.reading.texts})</div>
              </div>
              <div class="card">
                <h3>Writing</h3>
                <div class="small">Nivå: <b>${esc(w)}</b></div>
                <div class="small">Words: <b>${report.writing.words}</b></div>
              </div>
            </div>

            <div class="box" style="margin-top:14px">
              <b>Förslag:</b>
              <div class="small" style="margin-top:6px">
                • Om Overall är A1.x → börja med A1/A2-grunder och mycket “chunks”.<br>
                • Om Overall är A2.x → kör moduler + skriv varje pass.<br>
                • Om Overall är B1.x → mer texter + argumenterande skrivande.
              </div>
            </div>

            <div class="box" style="margin-top:14px">
              <b>Kopiera rapport</b>
              <textarea id="repText" style="min-height:140px">${esc(txt)}</textarea>
              <div class="row" style="margin-top:10px">
                <button class="btn" id="copyRep">Copy</button>
                <button class="btn secondary" id="doneRep">Back to home</button>
              </div>
            </div>
          </div>
        `;

        body.querySelector("#copyRep").addEventListener("click", async ()=>{
          const t = body.querySelector("#repText").value;
          try{ await navigator.clipboard.writeText(t); alert("Kopierat!"); }
          catch{ body.querySelector("#repText").select(); document.execCommand("copy"); alert("Kopierat!"); }
        });
        body.querySelector("#doneRep").addEventListener("click", ()=>{
          renderHome();
          showView("home");
        });

        return;
      }
    }

    // initial render
    renderStage();
    return;
  }


  if(part.type==="reflection"){
    container.innerHTML = `
      <div class="box small">Svara kort. Det här hjälper hjärnan att komma ihåg.</div>
      <div id="refWrap"></div>
      ${renderCompleteBox("Markera delen som klar", "completeRef")}
    `;
    const wrap = $("#refWrap");
    wrap.innerHTML = (part.qs||[]).map((q,i)=>`
      <div class="q">
        <p><b>${i+1}.</b> ${esc(q)}</p>
        <textarea id="ref_${i}" placeholder="Write here..."></textarea>
      </div>
    `).join("");
    $("#completeRef").addEventListener("click", ()=>markPartDone());
  }

  // save position
  mp.partIndex = currentPartIndex;
  saveState();
}

function renderCompleteBox(text, id){
  return `<div class="box" style="margin-top:14px">
    <div class="row" style="justify-content:space-between">
      <div>${esc(text)}</div>
      <button class="btn" id="${id}">Done</button>
    </div>
  </div>`;
}

function markPartDone(){
  const m = DATA.modules.find(x=>x.id===currentModuleId);
  const mp = getModuleProgress(currentModuleId);
  mp.partDone[currentPartIndex] = true;

  // if last part completed -> complete module
  if(currentPartIndex >= m.parts.length - 1){
    state.completed[currentModuleId] = true;
    state.stats.sessions += 1;
    addPoints(50); // completion bonus
    saveState();
    alert("🎉 Klart! Du har slutfört modulen.");
    renderHome();
    showView("home");
    return;
  }

  // otherwise go next
  currentPartIndex += 1;
  mp.partIndex = currentPartIndex;
  saveState();
  renderPart();
}

function prevPart(){
  if(currentPartIndex===0) return;
  currentPartIndex -= 1;
  const mp = getModuleProgress(currentModuleId);
  mp.partIndex = currentPartIndex;
  saveState();
  renderPart();
}
function nextPart(){
  const m = DATA.modules.find(x=>x.id===currentModuleId);
  if(currentPartIndex >= m.parts.length - 1) return;
  currentPartIndex += 1;
  const mp = getModuleProgress(currentModuleId);
  mp.partIndex = currentPartIndex;
  saveState();
  renderPart();
}

// ---------- Boot ----------
async function boot(){
  const res = await fetch("./data.json", {cache:"no-store"});
  DATA = await res.json();
  loadState();
  renderHome();

  $("#resetAll").addEventListener("click", resetAll);
  $("#backHome").addEventListener("click", ()=>{ renderHome(); showView("home"); });
  $("#prevBtn").addEventListener("click", prevPart);
  $("#nextBtn").addEventListener("click", nextPart);

  // Keyboard: N/P
  window.addEventListener("keydown", (e)=>{
    if(!$("#module").classList.contains("active")) return;
    if(e.key.toLowerCase()==="n") nextPart();
    if(e.key.toLowerCase()==="p") prevPart();
  });
}

boot();
