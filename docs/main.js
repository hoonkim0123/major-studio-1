/***** =========================================================
 * Language Within Papers — Mosaic + Detail Overlay (FULL JS v5)
 * (Applied: 4) Sort switch, 5) Tooltip thumbnail)
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
const IMG_BASES = ["data/images/", "downloads/", "images/"];
function sanitizePath(p){ return String(p || "").trim().replace(/\/{2,}/g, "/"); }
function withCommonExts(stem){
  const exts = [".jpg", ".jpeg", ".png", ".webp"];
  if (/\.(jpg|jpeg|png|webp)$/i.test(stem)) return [stem];
  return exts.map(ext => stem + ext);
}
const PREFER_LOCAL_IMAGES = true;
function isThumbURL(u){
  const s = String(u||"").toLowerCase();
  return /thumb|thumbnail|small|square|icon|\/w[0-9]{2,4}|[?&](w|h|width|height)=/i.test(s);
}
function buildImageCandidates(doc){
  const out = [];
  if (doc.filename){
    const raw = sanitizePath(doc.filename);
    if (/^https?:/i.test(raw)) {
      // URL은 아래에서 처리
    } else if (/^\.*\//.test(raw)){
      withCommonExts(raw).forEach(p => out.push(p));
    } else {
      withCommonExts(raw).forEach(name=>{
        IMG_BASES.forEach(base=>{
          out.push(sanitizePath(base + name));
        });
      });
    }
  }
  const urlCandidates = [];
  const addURL = (u)=>{
    if (!u) return;
    const enc = u;
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
  Society: ["women","family","education","charity","association","customs","tradition","slavery","social","inheritance","kinship","domestic","marriage","apprentice","guild","labor","occupation","craft","tradecraft","artisan","employment","profession"],
  Religion: ["faith","divine","godliness","providence","salvation","grace","spirit","soul","worship","devotion","religious","puritan","evangelical","moral","morality"],
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

/* ===================== 5) 멀티태깅 ===================== */
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
STATE.sortMode = "Chrono";   // ✅ (4) 정렬 스위치: "Topic" | "Chrono" | "Random"
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
  });

  // ✅ (4) 정렬 스위치
  let sorted = filtered;
  if (STATE.sortMode === "Chrono"){
    sorted = filtered.slice().sort((a,b)=>{
      if (!a.year && !b.year) return 0;
      if (!a.year) return 1;
      if (!b.year) return -1;
      return a.year - b.year;
    });
  } else if (STATE.sortMode === "Random"){
    sorted = d3.shuffle(filtered.slice());
  } else { // "Topic"
    const order = ["Military","Society","Political","Religion","Business","Other"];
    sorted = filtered.slice().sort((a,b)=>{
      const ia = order.indexOf(a.dominantTopic), ib = order.indexOf(b.dominantTopic);
      if (ia!==ib) return ia-ib;
      return (a.year||9999) - (b.year||9999);
    });
  }

  $("#shown-count").textContent = sorted.length;
  $("#total-count").textContent = DOCS.length;

  STATE.order = sorted.map(d => d.id);

  if (!sorted.length){ 
    empty.classList.remove("hidden"); 
    return; 
  }
  empty.classList.add("hidden");

  for (const d of sorted){
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

    // ✅ (5) 툴팁 썸네일 (가능할 때만)
    const imgSrc = (buildImageCandidates(d) || [])[0];
    const imgTag = imgSrc ? `<img class="tip-thumb" src="${imgSrc}" alt="" />` : "";

    const tipHTML = `
      <div class="t1">${d.title || "Untitled"}</div>
      <div class="t2">${d.year ? d.year : ""}</div>
      ${imgTag}
    `;

    el.addEventListener("mouseenter", (ev)=>{ showTip(tipHTML); moveTip(ev); });
    el.addEventListener("mousemove", moveTip);
    el.addEventListener("mouseleave", hideTip);
    el.addEventListener("click", (ev)=>{ ev.stopPropagation(); openDetail(d.id); });

    grid.appendChild(el);
  }
}

/* ===================== 9) 토픽 버튼 & 사이드바 ===================== */
function renderTopicButtons(){
  const wrap = $("#topic-buttons");
  wrap.innerHTML = "";

  const row = document.createElement("div");
  row.className = "btn-row";
  ["All", ...TOPICS].forEach(t=>{
    const btn = document.createElement("button");
    const isActive = STATE.topic===t;
    btn.className = "btn" + (isActive ? " active":"");
    // 작은 컬러 점(옵션): 버튼 텍스트에 dot 붙이고 싶으면 아래 주석 해제
    // btn.innerHTML = `<span class="dot" style="background:${colorByTopic(t)}"></span>${t}`;
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

  const allBtns = row.querySelectorAll(".btn");
  const activeBtn = row.querySelector(".btn.active");
  if (activeBtn){
    allBtns.forEach(b=>{ if (b !== activeBtn) b.classList.add("dimmed"); });
  }
}

/* ===================== 10) 레전드(서브카테) ===================== */
function renderLegend(){
  const box = $("#canon-list");
  const title = $("#legend-title");
  box.innerHTML = "";

  const counts = new Map();
  for (const d of DOCS){
    let key = d.canonical_key;
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

  const hasTop4 = TOP4_CANON && Object.keys(TOP4_CANON).length > 0;

  if (hasTop4){
    if (STATE.topic === "All"){
      rows = rows
        .filter(r => (TOP4_CANON[r.topic] || new Set()).has(r.canonical))
        .sort((a,b)=> b.count - a.count)
        .slice(0, 20);
    } else {
      const allow = TOP4_CANON[STATE.topic] || new Set();
      rows = rows
        .filter(r => allow.has(r.canonical))
        .sort((a,b)=> b.count - a.count)
        .slice(0, 8);
    }
  } else {
    rows = (STATE.topic==="All")
      ? rows.slice(0,20)
      : rows.slice(0,8);
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

    item.onclick = (ev)=>{
      STATE.canonical = (STATE.canonical===r.key) ? null : r.key;
      renderLegend(); renderMosaic(); syncURL();
    };

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
    empty.textContent = "empty";
    box.appendChild(empty);
  }
    ["Chrono", "Topic", "Random"].forEach(mode => {
    const btn = $(`#btn-${mode.toLowerCase()}`);
    if (!btn) return;
    
    btn.className = "btn" + (STATE.sortMode === mode ? " active" : "");
    btn.onclick = () => {
      STATE.sortMode = mode;
      renderTopicButtons();
      renderMosaic();
      syncURL();
    };
  });
}

/* ===================== 11) CSV 로드 ===================== */
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

    const imageFilename = r.image_filename || r.filename || 
                         `${r.title?.replace(/[^\w\s]/g, '').slice(0, 30)}.jpg` || 
                         `doc_${idCounter}.jpg`;

    // IIIF 이미지 URL 처리 (해상도 800으로 조절)
    let imageURL = r.imageURL || r.image_url || r.thumbnail || "";
    if (imageURL && imageURL.includes("/full/")) {
      // IIIF URL에서 해상도 부분을 250 → 800으로 변경
      imageURL = imageURL.replace(/\/full\/[0-9,]+\//, "/full/800,/");
    }

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
      name: r.name || "",
      objectType: r.objectType || "",
      collectionsURL: r.collectionsURL || "",
      // _text: 오직 의미있는 필드만 포함 (URL, 메타데이터 JSON 제외)
      _text: [
        r.title, r.description, r.summary, r.notes, r.topic,
        r.object_type, r.collection, r.name
      ].filter(Boolean).join(" "),
      imageURL: imageURL || `data/images/${imageFilename}`
    };
  });

  TOP4_CANON = computeTopCanonicals(DOCS);

  DOCS.forEach(doc=>{
    assignMultiTags(doc, { SUBCAT_PER_TOPIC: 4, allowedCanonPerTopic: TOP4_CANON });
  });
}

/* ===================== 12) 툴팁 ===================== */
const TIP = document.getElementById("tooltip");
function showTip(html){ TIP.innerHTML = html; TIP.classList.remove("hidden"); }
function moveTip(ev){
  // tooltip이 보이고 있는 상태에서만 위치 계산
  if (TIP.classList.contains("hidden")) return;
  
  const pad = 16;
  const offset = 1;
  const rect = TIP.getBoundingClientRect();
  const tipW = rect.width || 360; // fallback: CSS max-width 값
  const tipH = rect.height || 100;
  
  let x = ev.clientX + offset;
  let y = ev.clientY - offset;
  
  // 오른쪽 경계 초과 시 왼쪽으로 이동
  if (x + tipW + pad > window.innerWidth) {
    x = ev.clientX - tipW - offset;
  }
  
  // 왼쪽 경계 미만 시 오른쪽으로 이동
  if (x < pad) {
    x = pad;
  }
  
  // 아래쪽 경계 초과 시 위쪽에 표시
  if (y + tipH + pad > window.innerHeight) {
    y = ev.clientY - tipH - offset;
  }
  
  // 위쪽 경계 미만 시 아래쪽으로 이동
  if (y < pad) {
    y = pad;
  }
  
  TIP.style.left = Math.round(x) + "px";
  TIP.style.top = Math.round(y) + "px";
}
function hideTip(){ TIP.classList.add("hidden"); }

/* ===================== 13) Detail Overlay ===================== */
function cleanDescription(raw){
  if (!raw) return "";
  let s = String(raw);
  
  // "Description": "..." 형식에서 값만 추출
  const m = s.match(/"Description"\s*:\s*"([\s\S]*?)"\s*}\s*$/);
  if (m) s = m[1];
  
  // URL 제거 (http/https로 시작하는 모든 URL)
  s = s.replace(/https?:\/\/[^\s]+/g, "");
  
  // JSON 형식의 메타데이터 제거 (예: {"Type": "...", "Date": "..."})
  s = s.replace(/\{[^}]*"(?:Type|Date|Associated Person|Signer|Maker|Writer|Collection|Location)"[^}]*\}/g, "");
  
  // 유니코드 이스케이프 처리
  s = s.replace(/\\u([0-9a-fA-F]{4})/g, (_,h)=> String.fromCharCode(parseInt(h,16)));
  
  // 백슬래시 이스케이프 처리
  s = s.replace(/\\"/g, '"');   // \" → "
  s = s.replace(/\\\\/g, '\\'); // \\ → \
  
  // 줄바꿈 정리
  s = s.replace(/\\n/g, "\n").replace(/\u00A0/g, " ");
  s = s.replace(/\s+\./g, ".").replace(/[ \t]+\n/g, "\n").replace(/\n{3,}/g, "\n\n");
  
  // 앞뒤 공백 제거 및 연속 공백 정리
  s = s.trim().replace(/\s{2,}/g, " ");
  
  return s;
}

function highlightKeywords(text, doc){
  if (!text) return "";
  let out = String(text).replace(/\u00A0/g, " ");

  const esc = s => s.replace(/[.*+?^${}()|[\\]\\]/g, '\\$&');
  const phraseRe = (ph) => {
    const parts = ph.trim().split(/\s+/).map(esc);
    return new RegExp(`(?<!\\w)${parts.join(`[\\s\\-]+`)}(?!\\w)`, "giu");
  };

  const phrases = Object.keys(PHRASE_LEXICON).sort((a,b)=> b.length - a.length);
  for (const ph of phrases){
    const meta = PHRASE_LEXICON[ph];
    out = out.replace(phraseRe(ph), (m)=> `<mark data-topic="${meta.topic}">${m}</mark>`);
  }

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
  const desc = $("#detail-desc");
  const barsWrap = $("#detail-bars-wrap");
  
  // 필드 섹션들
  const detailPeople = $("#detail-people");
  const detailCollection = $("#detail-collection");
  const detailType = $("#detail-type");

  const safeTitle = doc.title || "Untitled";

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

  title.textContent = safeTitle;
  
  // 메타데이터: 연도 + 토픽라인 (수직 레이아웃)
  const metaHTML = `
    ${doc.year ? `<span class="year">${doc.year}</span>` : ""}
    <span class="topic-line">${formatTopicLine(doc)}</span>
  `;
  year.innerHTML = metaHTML;

  // === 필드별 섹션 렌더링 ===
  
  // 1. 사람/이름 정보
  if (doc.name && doc.name.trim()) {
    detailPeople.innerHTML = `
      <h4>People / Names</h4>
      <p>${doc.name}</p>
    `;
    detailPeople.classList.remove("hidden");
  } else {
    detailPeople.classList.add("hidden");
  }
  
  // 2. 컬렉션/출처 정보
  const collectionInfo = [];
  if (doc.collection) collectionInfo.push(doc.collection);
  if (doc.objectType) collectionInfo.push(doc.objectType);
  
  if (collectionInfo.length > 0) {
    let collectionHTML = "<h4>Source / Collection</h4>";
    collectionInfo.forEach(info => {
      collectionHTML += `<p>${info}</p>`;
    });
    
    // collectionsURL이 있으면 링크 추가
    if (doc.collectionsURL && typeof doc.collectionsURL === 'string') {
      collectionHTML += `<p><a href="${doc.collectionsURL}" target="_blank" rel="noopener">View in Smithsonian Collections →</a></p>`;
    }
    
    detailCollection.innerHTML = collectionHTML;
    detailCollection.classList.remove("hidden");
  } else {
    detailCollection.classList.add("hidden");
  }
  
  // 3. 객체 타입
  if (doc.object_type && doc.object_type.trim() && doc.object_type !== doc.objectType) {
    detailType.innerHTML = `
      <h4>Object Type</h4>
      <p>${doc.object_type}</p>
    `;
    detailType.classList.remove("hidden");
  } else {
    detailType.classList.add("hidden");
  }

  // === 메인 설명 텍스트 ===
  const rawDesc = doc.description || doc.summary || doc.notes || "";
  const cleaned = cleanDescription(rawDesc);
  const bodyText = cleaned || (doc._text ? cleanDescription(doc._text) : "");
  
  // 텍스트 파싱: 문단별 분리 (예: \n\n로 분리된 문단)
  if (bodyText) {
    const paragraphs = bodyText.split(/\n\n+/).filter(p => p.trim());
    if (paragraphs.length > 1) {
      const formattedText = paragraphs
        .map(p => `<p>${highlightKeywords(p, doc)}</p>`)
        .join("");
      desc.innerHTML = formattedText;
    } else {
      desc.innerHTML = highlightKeywords(bodyText, doc);
    }
  } else {
    desc.innerHTML = "<em>No description available.</em>";
  }

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
  // Prevent background scrolling
  document.body.style.overflow = "hidden";
}
function closeDetail(){
  $("#detail-overlay").classList.add("hidden");
  STATE.view = "grid";
  STATE.selectedId = null;
  syncURL();
  // Allow background scrolling
  document.body.style.overflow = "";
}


/* ===================== 14) URL 동기화 ===================== */
function buildQuery(){
  const q = new URLSearchParams();
  if (STATE.selectedId) q.set("id", STATE.selectedId);
  if (STATE.topic && STATE.topic!=="All") q.set("topic", STATE.topic);
  if (STATE.canonical) q.set("canon", STATE.canonical);
  if (STATE.hideOther) q.set("hideOther","1");
  if (STATE.sortMode && STATE.sortMode!=="Topic") q.set("sort", STATE.sortMode);
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
  const sort = p.get("sort");

  if (topic) STATE.topic = TOPICS.includes(topic) ? topic : "All";
  if (canon) STATE.canonical = canon;
  STATE.hideOther = hideOther;
  if (sort && ["Topic","Chrono","Random"].includes(sort)) STATE.sortMode = sort;

  renderTopicButtons(); renderLegend(); renderMosaic();

  if (id){ openDetail(id); }
}

/* ===================== 15) 초기화 ===================== */
async function main(){
  // ========== Landing Page 로직 ==========
  const landing = document.getElementById('landing');
  const app = document.querySelector('.container');
  const btn = document.getElementById('btn-explore');
  
  // localStorage에서 skip 여부 확인 (개발 중: 항상 landing 표시하려면 아래 주석 해제)
  // const hasVisited = localStorage.getItem('pt_visited') === 'true';
  const hasVisited = false; // 개발 중: landing 항상 표시
  
  // URL 파라미터에서도 확인
  const urlParams = new URLSearchParams(location.search);
  const skipLanding = urlParams.get('skip') === '1';
  
  // landing 표시 여부 결정
  if (hasVisited || skipLanding) {
    // 앱 표시
    if (landing) landing.style.display = 'none';
    if (app) app.style.display = 'flex';
  } else {
    // landing 표시
    if (landing) landing.style.display = 'block';
    if (app) app.style.display = 'none';
  }
  
  // Explore 버튼 클릭 시
  if (btn) {
    btn.addEventListener('click', function() {
      localStorage.setItem('pt_visited', 'true');
      if (landing) landing.style.display = 'none';
      if (app) app.style.display = 'flex';
    });
  }
  
  // Enter/Space 키로도 진행
  if (landing) {
    landing.addEventListener('keydown', function(e) {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        btn?.click();
      }
    });
  }
  // ========== Landing Page 로직 끝 ==========

  // 앱 초기화
  renderTopicButtons();
  await loadCSV();
  renderLegend();
  renderMosaic();

  applyFromURL();

  // Close detail button
  const closeBtn = $("#detail-close");
  if (closeBtn) {
    closeBtn.addEventListener("click", closeDetail);
  }

  window.addEventListener("keydown", (ev)=>{
    if (STATE.view !== "detail") return;
    if (ev.key === "Escape") closeDetail();
  });

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

/* ===================== Auto Slideshow in About Section ===================== */
(async function initAboutSlideshow(){
  const imgEl = $("#about-slideshow");
  if (!imgEl) return;

  // Load CSV and filter for paper documents with images
  const csv = await d3.csv("data/textual_core_1770_1810.csv");
  
  // Filter: Paper documents (Pamphlet, Broadside, Letter) + with thumbnail
  const paperDocs = csv.filter(doc => {
    const type = (doc.objectType || "").toLowerCase();
    const hasThumbnail = doc.thumbnail && doc.thumbnail.trim();
    const isPaper = /pamphlet|broadside|letter|book|newspaper|document/i.test(type);
    return hasThumbnail && isPaper;
  });

  if (!paperDocs.length) {
    console.warn("No paper documents with images found");
    return;
  }

  let current = 0;
  
  function updateSlide(){
    imgEl.src = paperDocs[current].thumbnail;
  }

  // Auto-rotate every 5 seconds
  setInterval(()=>{
    current = (current + 1) % paperDocs.length;
    updateSlide();
  }, 5000);

  updateSlide();
})();
document.addEventListener("DOMContentLoaded", main);