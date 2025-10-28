/***** =========================================================
 * Language Within Papers — Mosaic + Detail Overlay (FULL JS v4)
 * ========================================================== */

/* ===================== 0) 헬퍼/유틸 ===================== */
const $  = (sel)=>document.querySelector(sel);
const $$ = (sel)=>Array.from(document.querySelectorAll(sel));

function formatTopicLine(doc){
  const topics = (doc.topics || [doc.dominantTopic]).filter(Boolean);
  const canonLabels = (doc.canonicals || (doc.canonical_key ? [doc.canonical_key] : []))
    .map(k => {
      const [t, c] = k.split("__");
      if (!c || c === "_core" || c === "other") return null;
      return (c || "").replace(/_/g, " ");
    })
    .filter(Boolean);

  return canonLabels.length
    ? `${topics.join(", ")} — ${Array.from(new Set(canonLabels)).join(", ")}`
    : topics.join(", ");
}

function getDocText(doc){
  const title = doc.title || "";
  const text = [
    title, title,
    doc.description, doc.summary, doc.notes, doc.topic,
    doc.subject, doc.label, doc.name, doc.object_type, doc.collection,
    doc.combined_type_txt
  ].filter(Boolean).join(" ");
  return text;
}

/* ===================== 0.1 이미지 로딩 유틸 ===================== */
// 로컬 이미지 탐색 베이스 폴더 (원하는 순서)
const IMG_BASES = ["data/images/", "downloads/", "images/"];

/** 공백/중복 슬래시 정리 */
function sanitizePath(p){ return String(p || "").trim().replace(/\/{2,}/g, "/"); }

/** 확장자 없을 때 흔한 확장자 후보들 붙이기 */
function withCommonExts(stem){
  const exts = [".jpg", ".jpeg", ".png", ".webp"];
  if (/\.(jpg|jpeg|png|webp)$/i.test(stem)) return [stem];
  return exts.map(ext => stem + ext);
}

/** doc에서 가능한 모든 이미지 경로 후보 생성 (URL 우선, 그다음 로컬 경로들) */
const PREFER_LOCAL_IMAGES = true; // 로컬 우선 플래그

function isThumbURL(u){
  const s = String(u||"").toLowerCase();
  return /thumb|thumbnail|small|square|icon|\/w[0-9]{2,4}|[?&](w|h|width|height)=/i.test(s);
}

function buildImageCandidates(doc){
  const out = [];

  // 1) filename 기반 로컬 후보
  if (doc.filename){
    const raw = sanitizePath(doc.filename);
    if (/^https?:/i.test(raw)) {
      // URL인 경우 보류
    } else if (/^\.*\//.test(raw)){
      // 상대경로
      withCommonExts(raw).forEach(p => out.push(p));  // ← encodeURI 제거!
    } else {
      // 순수 파일명
      withCommonExts(raw).forEach(name=>{
        IMG_BASES.forEach(base=>{
          out.push(sanitizePath(base + name));  // ← encodeURI 제거!
        });
      });
    }
  }

  // 2) URL 후보들
  const urlCandidates = [];

  const addURL = (u)=>{
    if (!u) return;
    const enc = u;  // ← URL은 그대로
    if (isThumbURL(enc)) urlCandidates.push({enc, thumb:true});
    else                 urlCandidates.unshift({enc, thumb:false});
  };

  if (doc.imageURL && /^https?:/i.test(doc.imageURL)) addURL(doc.imageURL);
  if (doc.filename && /^https?:/i.test(doc.filename)) addURL(doc.filename);

  urlCandidates.sort((a,b)=> (a.thumb===b.thumb)?0 : (a.thumb?1:-1));
  out.push(...urlCandidates.map(o=>o.enc));

  return out.filter(Boolean);
}


/* ===================== 1) Canonical Groups (서브카테고리) ===================== */
const CANONICAL_GROUPS = {
  Military: {
    army: ["army","regiment","troop","troops","militia","infantry","dragoons","cavalry","company","battalion","soldier","enlist","corps","navy"],
    battle: ["battle","campaign","engagement","skirmish","siege","victory","defeat","combat","encounter"],
    command: ["general","colonel","captain","major","lieutenant","commander","officer","orders","dispatch","command","leadership"],
    fortification: ["fort","garrison","barracks","artillery","arsenal","munition","battery","encampment"],
    defense: ["defense","defence"]
  },
  Society: {
    family: ["family","marriage","wives","husband","child","children","women","household","kin","domestic","widow"],
    education: ["education","school","academy","college","apprentice","tutorial","study","lesson","student","teacher"],
    labor: ["work","labor","occupation","craft","tradecraft","artisan","guild","employment","profession"],
    community: ["community","charity","custom","fashion","festival","association","society","public","people"],
    slavery: ["slavery","slave","slaves","enslaved","enslavement","bondage"]
  },
  Political: {
    government: ["congress","senate","assembly","committee","governor","president","crown","parliament","ministry","council","office","authority","administration"],
    law: ["law","act","bill","statute","ordinance","charter","code","resolution","decree","legislation","constitution"],
    election: ["election","vote","ballot","suffrage","poll","candidate","representation","constituent"],
    diplomacy: ["treaty","alliance","proclamation","declaration","embassy","negotiation","agreement","commission"],
    revolution: ["revolution","revolutionary","rebellion","rebels"],
    independence: ["independence","independent"],
    rights: ["rights","liberty","freedom","privilege","privileges"],
    constitution: ["constitution","constitutional","amendment","amendments","ratify","ratified","ratification"],
    confederation: ["confederation","federal","federalist","union"],
    patriot: ["patriot","patriots"]
  },
  Religion: {
    church: ["church","chapel","parish","meetinghouse","cathedral","altar"],
    clergy: ["clergy","clergyman","minister","pastor","priest","reverend","bishop","deacon"],
    scripture: ["bible","gospel","sermon","homily","psalm","hymn","scripture","testament","epistle","tract"],
    congregation: ["congregation","sabbath","worship","communion","sacrament","devotion","prayer"],
    movements: ["puritan","evangelical","evangelicals","revivalist","great_awakening"],
    doctrine: ["faith","grace","salvation","providence","piety","godliness","sanctification"]
  },
  Business: {
    trade: ["trade","merchant","merchandise","tariff","duty","import","export","commerce","business","industry"],
    market: ["market","goods","sale","auction","price","retail","wholesale","supply","demand","produce"],
    shipping: ["shipment","cargo","freight","warehouse","inventory","consignment","vessel","harbor","port","navigation","dock"],
    finance: ["account","invoice","ledger","receipt","credit","debt","currency","bank","note","notes","bond","loan","payment","shilling","shillings","pence","penny","pennies","pound","pounds","banknote","banknotes","specie","bill","bills","billofcredit","dollars","dollar"],
    plantation: ["plantation","plantations"],
    manufacture: ["manufacturer","manufacturers","manufacture","manufacturing","workshop","mill","mills","factory","factories"]
  }
};

/* ===== 구문 사전(복합어) ===== */
const PHRASE_LEXICON = {
  "postmaster general":        { topic:"Political", canonical:"government" },
  "postmasters general":       { topic:"Political", canonical:"government" },
  "post office":               { topic:"Political", canonical:"government" },
  "general post office":       { topic:"Political", canonical:"government" },
  "continental congress":      { topic:"Political", canonical:"government" },
  "declaration of independence": { topic:"Political", canonical:"government" },
  "stamp act":                 { topic:"Political", canonical:"law" },
  "george washington":         { topic:"Political", canonical:"government" },
  "general washington":        { topic:"Military",  canonical:"army" },
  "united states":             { topic:"Political", canonical:"government" },
  "benjamin franklin":         { topic:"Political", canonical:"government" },
  "continental army":          { topic:"Military",  canonical:"army" },
  "state militia":             { topic:"Military",  canonical:"army" },
  "regular troops":            { topic:"Military",  canonical:"army" }
};

/* ===== LEXICON 빌드 ===== */
const LEXICON = (() => {
  const idx = new Map();
  for (const [topic, groups] of Object.entries(CANONICAL_GROUPS)) {
    for (const [canonical, terms] of Object.entries(groups)) {
      for (const t of terms) idx.set(t.toLowerCase(), { topic, canonical });
    }
  }
  for (const [phrase, meta] of Object.entries(PHRASE_LEXICON)){
    const token = phrase.replace(/\s+/g,"_").toLowerCase();
    idx.set(token, { topic: meta.topic, canonical: meta.canonical });
  }
  return idx;
})();

/* ===== TOPIC_CORE ===== */
const TOPIC_CORE = {
  Political: ["revolution","revolutionary","independence","liberty","freedom","patriot","colony","colonies",
    "rights","constitution","declaration","amendment","confederation",
    "government","law","congress","senate","state","states",
    "representative","delegate","convention","ratify","ratification"
  ],
  Military: ["war","wars","wartime","military","martial","militia","regiment","regiments",
    "commander","commanders","officers","officer","siege","sieges","fort","forts",
    "garrison","garrisons","campaign","campaigns","soldier","soldiers","defense","defence",
    "artillery","marines","infantry","cavalry","dragoons","battalion","battalions","company","companies","corps"
  ],
  Society: ["women","family","education","charity","association","customs","tradition","morality","slavery","social"],
  Religion: ["faith","divine","godliness","providence","salvation","grace","spirit","soul","worship","devotion","religious","puritan","evangelical"],
  Business: ["plantation","manufacturer","enterprise","property","labor","production","exportation","warehouse","shipbuilding"]
};
for (const [topic, words] of Object.entries(TOPIC_CORE)){
  for (const w of words){
    if (!LEXICON.has(w)) LEXICON.set(w, { topic, canonical: "_core" });
  }
}

/* ===== 모호어 컨텍스트 ===== */
const CONDITIONAL_TERMS = {
  act: /congress|statute|law|assembly/i,
  bill: /congress|senate|parliament|law|legislation/i,
  general: /officer|army|battle|military/i,
  order: /military|command|battle|army/i,
  note: /shilling|pence|pound|bank|currency|issue|sheet|uncut|denomination/i,
  bank: /credit|finance|currency|debt|account/i,
  work: /labor|employment|apprentice|guild/i,
  state: /government|congress|law|representative|delegate/i
};
function isValidContext(tok, text){
  const cond = CONDITIONAL_TERMS[tok];
  if (!cond) return true;
  return cond.test(text);
}

/* ===== 불용어/노이즈 ===== */
const STOP = new Set(("the of and to a in for on by with from as at is are be was were has have had this that those these " +
"an or if it into not no but than then so such which who whom whose where when while will shall may can upon within without " +
"about over under between among against out up down per via").split(" "));

const NOISY_TERMS = new Set([
  "location","currently","view","image","credit","rights","department",
  "museum","collection","accession","object","objects","dimensions","dimension",
  "medium","paper","page","pages","catalog","catalogue",
  "city","state","country","usa","united","states","american",
  "figure","fig","illustration","front","back","recto","verso",
  "including","include","contains","containing","thereof","therein",
  "whereof","herein","hereof","between","within","without","among","thereby","hereby",
  "boston","delancey","watts","providence","london","phila","mr","mrs","miss"
]);

/* ===== 복합어 정규화 & 토큰화 ===== */
function normalizePhrases(s){
  let out = String(s||"");
  for (const phrase of Object.keys(PHRASE_LEXICON)){
    const re = new RegExp(`\\b${phrase.replace(/[.*+?^${}()|[\\]\\\\]/g,"\\$&")}\\b`, "gi");
    out = out.replace(re, phrase.replace(/\s+/g,"_"));
  }
  return out;
}
function tok3plus(s){
  const m = normalizePhrases(s).toLowerCase().match(/[a-z_]{3,}/g);
  return m || [];
}

/* ===================== 2) Dominant Topic ===================== */
const TOPICS = ["Military","Society","Political","Religion","Business","Other"];
const TOPIC_LEXEMES = (() => {
  const bag = {};
  for (const t of TOPICS) bag[t] = new Set();
  for (const [topic, groups] of Object.entries(CANONICAL_GROUPS)) {
    for (const arr of Object.values(groups)) arr.forEach(w => bag[topic].add(w.toLowerCase()));
  }
  for (const [topic, words] of Object.entries(TOPIC_CORE)){
    words.forEach(w=> bag[topic].add(w.toLowerCase()));
  }
  for (const [phrase, meta] of Object.entries(PHRASE_LEXICON)){
    bag[meta.topic].add(phrase.replace(/\s+/g,"_").toLowerCase());
  }
  return bag;
})();

function computeDominantTopic(doc){
  const text = getDocText(doc);
  const tokens = tok3plus(text);
  const counts = Object.fromEntries(TOPICS.map(t => [t, 0]));

  for (const tok of tokens){
    if (STOP.has(tok)) continue;
    if (!isValidContext(tok, text)) continue;
    for (const t of TOPICS){
      if (TOPIC_LEXEMES[t].has(tok)) counts[t] += 1;
    }
  }

  const norm = normalizePhrases(text).toLowerCase();
  for (const [phrase, meta] of Object.entries(PHRASE_LEXICON)){
    const token = phrase.replace(/\s+/g,"_").toLowerCase();
    if (norm.includes(token)) counts[meta.topic] += 3;
  }

  const preset = doc.topic || doc.group;
  if (preset && TOPICS.includes(preset) && counts[preset] > 0) return preset;

  let best = "Other", max = -1;
  for (const t of TOPICS){ if (counts[t] > max){ max = counts[t]; best = t; } }
  return max > 0 ? best : "Other";
}

/* ===================== 3) Hits / Canonical ===================== */
function getTopicHits(text){
  const tokens = tok3plus(text);
  const counts = Object.fromEntries(TOPICS.map(t=>[t,0]));
  for (const tok of tokens){
    if (STOP.has(tok)) continue;
    if (!isValidContext(tok, text)) continue;
    for (const t of TOPICS){
      if (TOPIC_LEXEMES[t].has(tok)) counts[t] += 1;
    }
  }
  return counts;
}

function getCanonicalHits(text){
  const tokens = tok3plus(text);
  const hits = new Map();
  for (const tok of tokens){
    if (STOP.has(tok)) continue;
    if (!LEXICON.has(tok)) continue;
    if (!isValidContext(tok, text)) continue;
    const {topic, canonical} = LEXICON.get(tok);
    const key = `${topic}__${canonical}`;
    hits.set(key, (hits.get(key)||0) + 1);
  }
  return hits;
}

/* ===================== 4) 키워드 추출 ===================== */
function extractKeyTerms(text, canonicalKey=null, max=Infinity){
  const tokens = tok3plus(text);
  if (!tokens.length) return [];
  const preferTopic = canonicalKey ? canonicalKey.split("__")[0] : null;
  const preferCanon = canonicalKey ? canonicalKey.split("__")[1] : null;

  const lexHits = new Map();
  const nonLexHits = new Map();

  for (const t of tokens){
    if (STOP.has(t)) continue;
    if (LEXICON.has(t)){
      const {topic, canonical} = LEXICON.get(t);
      const key = `${t}__${topic}__${canonical}`;
      const bonus = (preferTopic && topic===preferTopic ? 1 : 0) + (preferCanon && canonical===preferCanon ? 1 : 0);
      lexHits.set(key, (lexHits.get(key)||0) + 1 + bonus);
    }else{
      if (t.length < 5) continue;
      if (NOISY_TERMS.has(t)) continue;
      nonLexHits.set(t, (nonLexHits.get(t)||0) + 1);
    }
  }

  const rankedLex = Array.from(lexHits.entries()).map(([key,score])=>{
    const [t,topic,canonical] = key.split("__");
    return {token:t, topic, canonical, score};
  }).sort((a,b)=> b.score - a.score || a.token.localeCompare(b.token));

  const rankedNon = Array.from(nonLexHits.entries())
    .filter(([,c]) => c >= 3)
    .map(([t,c])=>({token:t, score:c}))
    .sort((a,b)=> b.score - a.score || a.token.localeCompare(b.token));

  const combined = [...rankedLex.map(r=>r.token), ...rankedNon.map(r=>r.token)];
  const uniq = Array.from(new Set(combined));
  return uniq.slice(0, max === Infinity ? undefined : max);
}

/* ===================== 4.5) 서브카테 키워드 수집 (미리보기용) ===================== */
function getCanonicalKeywords(topic, canonical){
  const fromGroups = (CANONICAL_GROUPS[topic] && CANONICAL_GROUPS[topic][canonical]) || [];
  const fromPhrases = Object.entries(PHRASE_LEXICON)
    .filter(([k,v]) => v.topic===topic && v.canonical===canonical)
    .map(([k])=> k);
  const phrases = fromPhrases.sort((a,b)=> b.length - a.length);
  const words   = Array.from(new Set(fromGroups.map(s=>s.toLowerCase()))).sort();
  return { phrases, words };
}

/* ===================== 5) 멀티태깅 (Top4 제한/허용목록) ===================== */
function assignMultiTags(doc, {TOPIC_MIN_HITS=1, SUBCAT_PER_TOPIC=4, allowedCanonPerTopic=null} = {}){
  const text = getDocText(doc);

  const th = getTopicHits(text);
  let topics = TOPICS.filter(t => th[t] >= TOPIC_MIN_HITS).sort((a,b)=> th[b]-th[a]);

  const preset = doc.topic || doc.group;
  if (preset && TOPICS.includes(preset) && th[preset] > 0 && !topics.includes(preset)){
    topics.unshift(preset);
  }
  if (!topics.length) topics = ["Other"];

  const ch = getCanonicalHits(text);
  const byTopic = {};
  for (const [key, count] of ch.entries()){
    const [t, c] = key.split("__");
    if (!byTopic[t]) byTopic[t] = [];
    byTopic[t].push({key, canonical:c, count});
  }

  const canonicals = [];
  for (const t of topics){
    let rows = (byTopic[t] || []).sort((a,b)=> b.count - a.count);
    if (allowedCanonPerTopic && allowedCanonPerTopic[t]){
      const allow = allowedCanonPerTopic[t];
      rows = rows.filter(r => r.canonical !== "_core" && r.canonical !== "other" && allow.has(r.canonical));
    }else{
      rows = rows.filter(r => r.canonical !== "_core" && r.canonical !== "other");
    }
    const picked = rows.slice(0, SUBCAT_PER_TOPIC).map(r=>r.key);
    canonicals.push(...picked);
  }

  doc.topics        = Array.from(new Set(topics));
  doc.canonicals    = Array.from(new Set(canonicals));
  doc.dominantTopic = doc.topics[0] || "Other";
  doc.canonical_key = doc.canonicals[0] || null;
  doc.key_terms     = extractKeyTerms(text, doc.canonical_key, Infinity);
}

/* ===================== 6) 색상/토픽 믹스 ===================== */
function colorByTopic(t){
  const colors = {
    Military:"#FA8468",
    Society:"#53ADDE",
    Political:"#FFC970",
    Religion:"#68C89E",
    Business:"#6886C8",
    Other:"#888"
  };
  return colors[t] || "#888";
}
function computeTopicMix(doc, { topN = 3, includeOther = false } = {}){
  const th = getTopicHits(getDocText(doc));
  const entries = Object.entries(th)
    .filter(([t,v]) => v > 0 && (includeOther || t !== "Other"))
    .sort((a,b) => b[1] - a[1])
    .slice(0, topN);

  const total = entries.reduce((acc, [,v]) => acc + v, 0);
  if (!total) return [];
  return entries.map(([topic, v]) => ({ topic, p: v / total }));
}

/* ===================== 7) 전역 상태 ===================== */
let DOCS = [];
let STATE = { topic:"All", canonical:null, hideOther:false };
STATE.view = "grid";
STATE.selectedId = null;
STATE.order = [];
let TOP4_CANON = null;

function getDocById(id){ return DOCS.find(d => d.id === id); }
function getIndexInOrder(id){ return STATE.order.indexOf(id); }

/* ===================== 8) Mosaic ===================== */
function renderMosaic(){
  const grid = $("#mosaic");
  const empty = $("#empty");
  grid.innerHTML = "";
  grid.onclick = (e)=>{
    const t = e.target.closest('.tile');
    if (!t) return;
    const id = t.dataset.id;
    if (id) openDetail(id);
  };

  const filtered = DOCS.filter(d=>{
    if (STATE.topic !== "All" && d.dominantTopic !== STATE.topic) return false;
    if (STATE.hideOther && d.dominantTopic === "Other") return false;
    if (STATE.canonical && d.canonical_key !== STATE.canonical) return false;
    return true;
  })
  .sort((a, b) => {
    if (!a.year && !b.year) return 0;
    if (!a.year) return 1;
    if (!b.year) return -1;
    return a.year - b.year;
  });

  $("#shown-count").textContent = filtered.length;
  $("#total-count").textContent = DOCS.length;

  STATE.order = filtered.map(d => d.id);

  if (!filtered.length){ 
    empty.classList.remove("hidden"); 
    return; 
  }
  empty.classList.add("hidden");

  for (const d of filtered){
    const el = document.createElement("div");
    el.className = "tile";
    el.dataset.id = d.id;

    const mix = computeTopicMix(d, { topN: 3, includeOther: false });
    if (!mix.length){
      el.style.background = colorByTopic(d.dominantTopic || "Other");
    } else {
      let acc = 0;
      const stops = mix.map((m, i) => {
        const pct = (i < mix.length - 1)
          ? Math.max(1, Math.round(m.p * 100))
          : Math.max(0, 100 - acc);
        const seg = `${colorByTopic(m.topic)} ${acc}% ${acc + pct}%`;
        acc += pct;
        return seg;
      });
      el.style.background = `linear-gradient(180deg, ${stops.join(",")})`;
    }

    // 타일 툴팁: title + year만
    const tipHTML = `
      <div class="t1">${d.title || "Untitled"}</div>
      <div class="t2">${d.year ? d.year : ""}</div>
    `;

    el.addEventListener("mouseenter", (ev)=>{ showTip(tipHTML); moveTip(ev); });
    el.addEventListener("mousemove", moveTip);
    el.addEventListener("mouseleave", hideTip);
    el.addEventListener("click", (ev)=>{ ev.stopPropagation(); openDetail(d.id); });

    grid.appendChild(el);
  }
}

/* ===================== 9) 토픽 버튼 & 레전드 ===================== */
function renderTopicButtons(){
  const wrap = $("#topic-buttons");
  wrap.innerHTML = "";

  const row = document.createElement("div");
  row.className = "btn-row";
  ["All", ...TOPICS].forEach(t=>{
    const btn = document.createElement("button");
    const isActive = STATE.topic===t;
    btn.className = "btn" + (isActive ? " active":"");
    btn.textContent = t;
    btn.onclick = ()=>{
      STATE.topic = (STATE.topic === t) ? "All" : t;
      STATE.canonical = null;
      renderTopicButtons();
      renderLegend();
      renderMosaic();
      syncURL();
    };
    row.appendChild(btn);
  });
  wrap.appendChild(row);

  // dim 처리
  const allBtns = row.querySelectorAll(".btn");
  const activeBtn = row.querySelector(".btn.active");
  if (activeBtn){
    allBtns.forEach(b=>{ if (b !== activeBtn) b.classList.add("dimmed"); });
  }

  // Hide Other 토글
  const bar = document.createElement("div");
  bar.className = "side-toolbar under-topics";

  const hideBtn = document.createElement("button");
  hideBtn.className = "btn btn-toggle" + (STATE.hideOther ? " active" : "");
  hideBtn.textContent = "Hide Other";
  hideBtn.setAttribute("aria-pressed", STATE.hideOther);
  hideBtn.onclick = ()=>{
    STATE.hideOther = !STATE.hideOther;
    if (STATE.hideOther && STATE.topic === "Other") STATE.topic = "All";
    renderTopicButtons();
    renderLegend();
    renderMosaic();
    syncURL();
  };
  bar.appendChild(hideBtn);
  wrap.appendChild(bar);
}

function renderLegend(){
  const box = $("#canon-list");
  const title = $("#legend-title");
  box.innerHTML = "";

  const counts = new Map();
  for (const d of DOCS){
    const key = d.canonical_key;
    if (!key) continue;
    const [t] = key.split("__");
    if (STATE.topic!=="All" && t!==STATE.topic) continue;
    counts.set(key, (counts.get(key)||0)+1);
  }
  
  let rows = Array.from(counts.entries()).map(([key,count])=>{
    const [topic, canonical] = key.split("__");
    return { key, topic, canonical, count };
  })
  .filter(r =>
    r.canonical !== "other" &&
    r.canonical !== "_core" &&
    (!STATE.hideOther || r.topic !== "Other")
  )
  .sort((a,b)=> b.count - a.count);

  title.textContent = (STATE.topic==="All") ? "Subcategories — All" : `Subcategories — ${STATE.topic}`;

  // Top4만 유지
  if (TOP4_CANON){
    if (STATE.topic === "All"){
      const order = ["Military","Society","Political","Religion","Business"];
      rows = order.flatMap(t => {
        const allow = TOP4_CANON[t] || new Set();
        return rows.filter(r => r.topic===t && allow.has(r.canonical)).slice(0,4);
      });
    }else{
      const allow = TOP4_CANON[STATE.topic] || new Set();
      rows = rows.filter(r => allow.has(r.canonical)).slice(0,4);
    }
  }else{
    rows = (STATE.topic==="All") ? rows.slice(0,20) : rows.slice(0,4);
  }

  const max = rows.length ? d3.max(rows, d=>d.count) : 1;

  for (const r of rows){
    const pct = Math.max(4, Math.round((r.count / max) * 100));
    const item = document.createElement("div");
    item.className = "canon-item" + (STATE.canonical===r.key ? " active":"");
    item.dataset.topic = r.topic;
    
    item.innerHTML = `
      <div class="label">
        <strong>${r.canonical}</strong><br>
        <span style="color:#666">${r.topic}</span>
      </div>
      <div class="bar-track"><div class="bar-inner" style="--w:${pct}%"></div></div>
    `;
    item.querySelector('.bar-inner')?.style.setProperty('--topic-color', colorByTopic(r.topic));

    // 클릭: 필터 토글
    item.onclick = (ev)=>{
      STATE.canonical = (STATE.canonical===r.key) ? null : r.key;
      renderLegend(); renderMosaic(); syncURL();
    };

    // Hover: 대표 키워드 3–5개 미리보기 툴팁
    const preview = getCanonicalKeywords(r.topic, r.canonical);
    const previewList = [...preview.phrases, ...preview.words].slice(0,5);
    const tipHTML = previewList.length
      ? `<div class="t1">${r.canonical}</div><div class="t3">${previewList.join(", ")}</div>`
      : `<div class="t1">${r.canonical}</div><div class="t3" style="color:#888">no keywords</div>`;

    item.addEventListener("mouseenter", ev => { showTip(tipHTML); moveTip(ev); });
    item.addEventListener("mousemove", moveTip);
    item.addEventListener("mouseleave", hideTip);

    box.appendChild(item);
  }

  if (!rows.length){
    const empty = document.createElement("div");
    empty.className = "empty";
    empty.textContent = "표시할 서브카테고리가 없습니다.";
    box.appendChild(empty);
  }
}

/* ===================== 10) CSV 로드 (Top4 산출 → 태깅 적용) ===================== */
function computeTopCanonicals(docs){
  const global = new Map(); // topic -> Map(canonical -> count)
  for (const d of docs){
    const text = getDocText(d);
    const hits = getCanonicalHits(text);
    for (const [key, c] of hits.entries()){
      const [topic, canonical] = key.split("__");
      if (canonical === "other" || canonical === "_core") continue;
      if (!global.has(topic)) global.set(topic, new Map());
      const m = global.get(topic);
      m.set(canonical, (m.get(canonical)||0) + c);
    }
  }
  const out = {};
  for (const t of TOPICS){
    if (t === "Other") continue;
    const m = global.get(t) || new Map();
    const rows = Array.from(m.entries()).sort((a,b)=> b[1]-a[1]).slice(0,4);
    out[t] = new Set(rows.map(([canon])=> canon));
  }
  return out;
}

async function loadCSV(){
  const rows = await d3.csv("data/textual_core_1770_1810.csv");
  let idCounter = 1;

  DOCS = rows.map(r=>{
    let year = null;
    for (const k of Object.keys(r)) {
      if (/(year|date)/i.test(k) && r[k]) {
        const m = String(r[k]).match(/\b(1[7-9]\d{2}|20\d{2})\b/);
        if (m) { year = +m[0]; break; }
      }
    }
    if (!year) {
      const mm = String(Object.values(r).join(" ")).match(/\b(1[7-9]\d{2}|20\d{2})\b/);
      if (mm) year = +mm[0];
    }

    // ✅ 이미지 폴더의 실제 파일명 추출
    // CSV의 title에서 파일명 생성 또는 별도 컬럼 사용
    const imageFilename = r.image_filename || r.filename || 
                         `${r.title?.replace(/[^\w\s]/g, '').slice(0, 30)}.jpg` || 
                         `doc_${idCounter}.jpg`;

    return {
      id: r.id || r.objectID || `doc_${idCounter++}`,
      title: r.title || r.name || r.object_title || "",
      description: r.description || r.object_description || r.label_text || "",
      summary: r.summary || "",
      notes: r.notes || "",
      topic: r.topic || r.group || "",
      year,
      object_type: r.object_type || r.media_type || "",
      collection: r.collection || r.collection_name || "",
      _text: Object.values(r).filter(Boolean).join(" "),
      // ✅ 로컬 이미지 경로 (thumbnail 무시)
      imageURL: `data/images/${imageFilename}`
    };
  });

  // 전역 Top4 서브카테 산출
  TOP4_CANON = computeTopCanonicals(DOCS);

  // 문서별 태깅 적용 (Top4만 허용)
  DOCS.forEach(doc=>{
    assignMultiTags(doc, { SUBCAT_PER_TOPIC: 4, allowedCanonPerTopic: TOP4_CANON });
  });
}

/* ===================== 11) 툴팁 ===================== */
const TIP = document.getElementById("tooltip");
function showTip(html){ TIP.innerHTML = html; TIP.classList.remove("hidden"); }
function moveTip(ev){
  const pad = 16;
  const x = Math.min(window.innerWidth - pad, Math.max(pad, ev.clientX + 12));
  const y = Math.min(window.innerHeight - pad, Math.max(pad, ev.clientY - 12));
  TIP.style.left = x + "px"; TIP.style.top = y + "px";
}
function hideTip(){ TIP.classList.add("hidden"); }

/* ===================== 12) Detail Overlay ===================== */
function cleanDescription(raw){
  if (!raw) return "";
  let s = String(raw);
  const m = s.match(/"Description"\s*:\s*"([\s\S]*?)"\s*}\s*$/);
  if (m) s = m[1];
  s = s.replace(/\\u([0-9a-fA-F]{4})/g, (_,h)=> String.fromCharCode(parseInt(h,16)));
  s = s.replace(/\\n/g, "\n").replace(/\u00A0/g, " ");
  s = s.replace(/\s+\./g, ".").replace(/[ \t]+\n/g, "\n").replace(/\n{3,}/g, "\n\n");
  return s.trim();
}

function highlightKeywords(text, doc){
  if (!text) return "";
  let out = String(text).replace(/\u00A0/g, " ");

  const esc = s => s.replace(/[.*+?^${}()|[\\]\\]/g, '\\$&');
  const phraseRe = (ph) => {
    const parts = ph.trim().split(/\s+/).map(esc);
    return new RegExp(`(?<!\\w)${parts.join(`[\\s\\-]+`)}(?!\\w)`, "giu");
  };

  // A) 구문 먼저
  const phrases = Object.keys(PHRASE_LEXICON).sort((a,b)=> b.length - a.length);
  for (const ph of phrases){
    const meta = PHRASE_LEXICON[ph];
    out = out.replace(phraseRe(ph), (m)=> `<mark data-topic="${meta.topic}">${m}</mark>`);
  }

  // B) 단어 하이라이트 (mark 바깥만)
  const tokensHere = tok3plus(out);
  const unigramCandidates = Array.from(new Set(
    tokensHere.map(w=>w.toLowerCase()).filter(w => !!w && !w.includes("_") && LEXICON.has(w))
  )).sort((a,b)=> b.length - a.length);

  if (!unigramCandidates.length) return out;

  const wordRe = new RegExp(`\\b(${unigramCandidates.map(esc).join("|")})\\b`, "gi");
  const parts = out.split(/(<mark[^>]*>.*?<\/mark>)/gi);
  for (let i=0; i<parts.length; i++){
    const seg = parts[i];
    if (/^<mark/i.test(seg)) continue;
    parts[i] = seg.replace(wordRe, (m)=>{
      const tok = m.toLowerCase();
      if (!isValidContext(tok, text)) return m;
      const meta = LEXICON.get(tok);
      const topic = meta ? meta.topic : "Other";
      return `<mark data-topic="${topic}">${m}</mark>`;
    });
  }
  return parts.join("");
}

function renderDetail(doc){
  const overlay = $("#detail-overlay");
  const img = $("#detail-image");
  const title = $("#detail-title");
  const year = $("#detail-year");
  const topics = $("#detail-topics");
  const desc = $("#detail-desc");
  const barsWrap = $("#detail-bars-wrap");

  const safeTitle = doc.title || "Untitled";

  // 이미지: 후보 경로들을 순차 시도
  const srcs = buildImageCandidates(doc);
  img.style.transform = "translate(0px,0px) scale(1)";
  img.draggable = false;
  function tryNext(i=0){
    if (i >= srcs.length){
      img.removeAttribute("src");
      img.alt = "";
      return;
    }
    const url = srcs[i];
    img.onerror = ()=> tryNext(i+1);
    img.onload  = ()=> {};
    img.src = url;
    img.alt = safeTitle;
  }
  tryNext();

  // 텍스트
  title.textContent = safeTitle;
  year.textContent = doc.year ? String(doc.year) : "";
  topics.textContent = formatTopicLine(doc);

  // 본문
  const rawDesc = doc.description || doc.summary || doc.notes || "";
  const cleaned = cleanDescription(rawDesc);
  const bodyText = cleaned || (doc._text ? cleanDescription(doc._text) : "");
  desc.innerHTML = bodyText ? highlightKeywords(bodyText, doc) : "<em>No description available.</em>";

  // 토픽 믹스
  barsWrap.innerHTML = "";
  const mix = computeTopicMix(doc, { topN: 5, includeOther:false });
  for (const m of mix){
    const row = document.createElement("div");
    row.className = "detail-bar";
    row.innerHTML = `
      <div class="label">${m.topic}</div>
      <div class="track"><div class="fill"></div></div>
    `;
    row.querySelector(".fill").style.width = Math.round(m.p*100) + "%";
    row.querySelector(".fill").style.background = colorByTopic(m.topic);
    barsWrap.appendChild(row);
  }

  overlay.classList.remove("hidden");
  STATE.view = "detail";
}

function openDetail(id){
  const doc = getDocById(id);
  if (!doc) return;
  STATE.selectedId = id;
  renderDetail(doc);
  syncURL();
}
function closeDetail(){
  $("#detail-overlay").classList.add("hidden");
  STATE.view = "grid";
  STATE.selectedId = null;
  syncURL();
}
function goto(delta){
  if (!STATE.selectedId) return;
  const i = getIndexInOrder(STATE.selectedId);
  if (i < 0) return;
  const j = i + delta;
  if (j < 0 || j >= STATE.order.length) return;
  openDetail(STATE.order[j]);
}

/* ===================== 13) URL 동기화 ===================== */
function buildQuery(){
  const q = new URLSearchParams();
  if (STATE.selectedId) q.set("id", STATE.selectedId);
  if (STATE.topic && STATE.topic!=="All") q.set("topic", STATE.topic);
  if (STATE.canonical) q.set("canon", STATE.canonical);
  if (STATE.hideOther) q.set("hideOther","1");
  return q.toString();
}
function syncURL(){
  const qs = buildQuery();
  const url = qs ? `?${qs}` : location.pathname;
  history.replaceState(null, "", url);
}
function applyFromURL(){
  const p = new URLSearchParams(location.search);
  const topic = p.get("topic");
  const canon = p.get("canon");
  const hideOther = p.get("hideOther")==="1";
  const id = p.get("id");

  if (topic) STATE.topic = TOPICS.includes(topic) ? topic : "All";
  if (canon) STATE.canonical = canon;
  STATE.hideOther = hideOther;

  renderTopicButtons(); renderLegend(); renderMosaic();

  if (id){ openDetail(id); }
}

/* ===================== 14) 초기화 ===================== */
async function main(){
  renderTopicButtons();
  await loadCSV();
  renderLegend();
  renderMosaic();

  applyFromURL();

  // 오버레이 제어
  const closeBtn = $("#detail-close");
  if (closeBtn) closeBtn.onclick = closeDetail;
  const prev = $("#detail-prev");  if (prev) prev.onclick = ()=> goto(-1);
  const next = $("#detail-next");  if (next) next.onclick = ()=> goto(1);
  const copy = $("#detail-copy");  if (copy) copy.onclick = ()=> navigator.clipboard.writeText(location.href).catch(()=>{});

  // 키보드 (Detail 모드에서만)
  window.addEventListener("keydown", (ev)=>{
    if (STATE.view !== "detail") return;
    if (ev.key === "Escape") closeDetail();
    else if (ev.key === "ArrowLeft") goto(-1);
    else if (ev.key === "ArrowRight") goto(1);
  });

  // 이미지 줌/팬
  (function(){
    const img = $("#detail-image");
    if (!img) return;
    const vp = img.closest(".media-viewport");
    let s=1, x=0, y=0, dragging=false, sx=0, sy=0;

    const apply = ()=> img.style.transform = `translate(${x}px,${y}px) scale(${s})`;

    vp.addEventListener("wheel",(e)=>{
      e.preventDefault();
      const k = (e.deltaY<0) ? 1.06 : 1/1.06;
      s = Math.max(1, Math.min(4, s*k));
      apply();
    }, {passive:false});

    vp.addEventListener("mousedown",(e)=>{ dragging=true; sx=e.clientX-x; sy=e.clientY-y; });
    window.addEventListener("mousemove",(e)=>{ if(!dragging) return; x=e.clientX-sx; y=e.clientY-sy; apply(); });
    window.addEventListener("mouseup",()=> dragging=false);

    vp.addEventListener("dblclick", ()=>{ s=1; x=0; y=0; apply(); });
  })();
}

document.addEventListener("DOMContentLoaded", main);
