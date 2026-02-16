
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
