/***** =========================================================
 * Language Within Papers — Mosaic + Detail Overlay (FULL JS v5)
 * (Applied: 4) Sort switch, 5) Tooltip thumbnail)
 * ========================================================== */

/* ===================== 0) Helpers / Utilities ===================== */
const $  = (sel)=>document.querySelector(sel);
const $$ = (sel)=>Array.from(document.querySelectorAll(sel));

// Smithsonian API Key loader: read from `smithsonianapi.txt` at runtime (one-line file).
// This avoids committing secrets into the repository.
async function loadSmithsonianApiKey(){
  if (window.__SMITH_KEY_LOADED) return window.__SMITH_KEY || null;
  window.__SMITH_KEY_LOADED = true;
  try {
    const res = await fetch('smithsonianapi.txt');
    if (!res.ok) { window.__SMITH_KEY = null; return null; }
    const txt = (await res.text()).trim();
    window.__SMITH_KEY = txt || null;
    return window.__SMITH_KEY;
  } catch(e){
    console.warn('Could not load smithsonianapi.txt:', e);
    window.__SMITH_KEY = null;
    return null;
  }
}

// small HTML-escape helper used across functions to avoid XSS when
// inserting external text into innerHTML.
function escapeHtml(str){
  if (str === null || str === undefined) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/\"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

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
  // If _text field exists, use it first (already consolidated text)
  if (doc._text && doc._text.length > 10) return doc._text;
  
  // If absent or too short, build text from available fields
  const title = doc.title || "";
  const metadata = doc.metadata || {};
  
  // Include all relevant fields (title included twice to boost weight)
  const text = [
    title, title,
    doc.description,
    doc.notes,
    doc.summary,
    doc.topic,
    doc.collection,
    doc.object_type,
    doc.name,
    metadata.topic,
    metadata.object_type,
    metadata.associated_person,
    metadata.date_raw,
    metadata.location,
    metadata.maker
  ].filter(v => v && String(v).trim()).join(" ");
  
  return text;
}

/* ===================== 0.1 Image loading utilities ===================== */
const IMG_BASES = ["data/images/", "downloads/", "images/"];
function sanitizePath(p){ return String(p || "").trim().replace(/\/{2,}/g, "/"); }
function withCommonExts(stem){
  const exts = [".jpg", ".jpeg", ".png", ".webp"];
  if (/\.(jpg|jpeg|png|webp)$/i.test(stem)) return [stem];
  return exts.map(ext => stem + ext);
}
// const PREFER_LOCAL_IMAGES = true; // unused — removed to reduce dead code
function isThumbURL(u){
  const s = String(u||"").toLowerCase();
  return /thumb|thumbnail|small|square|icon|\/w[0-9]{2,4}|[?&](w|h|width|height)=/i.test(s);
}
function buildImageCandidates(doc){
  const out = [];
  if (doc.filename){
    const raw = sanitizePath(doc.filename);
    if (/^https?:/i.test(raw)) {
      // URLs are handled below
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

/* ===================== 1) Canonical Groups (subcategories) ===================== */
const CANONICAL_GROUPS = {
  Military: {
    army: ["army","regiment","troop","troops","militia","infantry","dragoons","cavalry","company","battalion","soldier","enlist","corps","navy","medic","marine"],
    battle: ["battle","campaign","engagement","skirmish","siege","victory","defeat","combat","encounter"],
    command: ["general","colonel","captain","major","lieutenant","commander","officer","orders","dispatch","command","leadership","Commodore"],
    fortification: ["fort","garrison","barracks","artillery","arsenal","munition","battery","encampment"],
    defense: ["defense","defence"]
  },
  Society: {
    family: ["family","marriage","wives","husband","child","children","women","household","kin","domestic","widow"],
    education: ["education","school","academy","college","apprentice","tutorial","study","lesson","student","teacher"],
    labor: ["work","labor","occupation","craft","tradecraft","artisan","guild","employment","profession"],
    community: ["community","charity","custom","fashion","festival","association","society","public",],
    slavery: ["slavery","slave","slaves","enslaved","enslavement","bondage","slavers","slaver"]
  },
  Political: {
    government: ["congress","senate","assembly","committee","governor","president","crown","parliament","ministry","council","authority","administration","Courthouse","deed","law","act","bill","statute","ordinance","charter","code","resolution","decree","legislation","constitution","constitutional","amendment","amendments","ratify","ratified","ratification","confederation","federal","federalist","union"],
    election: ["election","vote","ballot","suffrage","poll","candidate","representation","constituent"],
    diplomacy: ["treaty","alliance","proclamation","declaration","embassy","negotiation","agreement","commission","consul"],
    revolution: ["revolution","revolutionary","rebellion","rebels"],
    independence: ["independence","independent"],
    rights: ["rights","liberty","freedom","privilege","privileges","taxation","taxes","tax","citizenship","taxed"],
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
    trade: ["trade","merchant","merchandise","tariff","duty","import","export","commerce","business","industry","reciept","merchants"],
    market: ["market","goods","sale","auction","price","retail","wholesale","supply","demand","produce"],
    shipping: ["shipment","cargo","freight","warehouse","inventory","consignment","vessel","harbor","port","navigation","dock"],
    finance: ["account","invoice","ledger","receipt","credit","debt","currency","bank","note","notes","bond","loan","payment","shilling","shillings","pence","penny","pennies","pound","pounds","banknote","banknotes","specie","bill","bills","billofcredit","dollars","dollar"],
    plantation: ["plantation","plantations"],
    manufacture: ["manufacturer","manufacturers","manufacture","manufacturing","workshop","mill","mills","factory","factories"]
  }
};

/* ===== Phrase lexicon (compound phrases) ===== */
const PHRASE_LEXICON = {
  "postmaster general":        { topic:"Political", canonical:"government" },
  "postmasters general":       { topic:"Political", canonical:"government" },
  "general post office":       { topic:"Political", canonical:"government" },
  "continental congress":      { topic:"Political", canonical:"government" },
  "declaration of independence": { topic:"Political", canonical:"government" },
  "stamp act":                 { topic:"Political", canonical:"government" },
  "george washington":         { topic:"Political", canonical:"president" },
  "general washington":        { topic:"Military",  canonical:"army" },
  "general edward hand":       { topic:"Military",  canonical:"army" },
  "benjamin franklin":         { topic:"Political", canonical:"government" },
  "continental army":          { topic:"Military",  canonical:"army" },
  "state militia":             { topic:"Military",  canonical:"army" },
  "regular troops":            { topic:"Military",  canonical:"army" },
  "baptismal certificate":     { topic:"Religion",  canonical:"church"  },
  "Psalms of David":           { topic:"Religion",  canonical:"scripture"  },
  "Kings People":              { topic:"Political", canonical:"government"  },
  "War Office":                 { topic:"Military",  canonical:"army" },
  "Consul General":            { topic:"Political", canonical:"diplomacy" },
  "rate folded letter":        { topic:"Political", canonical:"government" },
  "Invitation to Ball":    { topic:"Society",   canonical:"community"  },
  "tiered rate systems": { topic:"Political", canonical:"government" },
  "Royal Standard English Dictionary": { topic:"Society", canonical:"education" },
  "William Henry Harrison": { topic:"Political", canonical:"president" },
  "Way to Wealth or Poor Richard Improved": { topic:"Society", canonical:"education" },
  "Valentine Card": { topic:"Society", canonical:"community" },
  "naturalization certificate": { topic:"Political", canonical:"government" },
  "Joel Barlow": { topic:"Political", canonical:"government" },
  "levying of fines": { topic:"Political", canonical:"government" },
  "account book": { topic:"Business", canonical:"finance" },
  "Jasper Yeates": { topic:"Political", canonical:"government" },
  "Deputy Post Master General,": { topic:"Political", canonical:"government" },
  "Thomas Jefferson": { topic:"Political", canonical:"president" },
  "James Madison": { topic:"Political", canonical:"president" },
  "Great Migration": { topic:"Society", canonical:"community" },
  "George Germain": { topic:"Political", canonical:"government" },
  "James Monroe": { topic:"Political", canonical:"president" },
  "john adams": { topic:"Political", canonical:"president" },
  "Public Service": { topic:"Political", canonical:"government" },
  "Membership Certificate": { topic:"Society", canonical:"community" },
};

/* ===== Build LEXICON ===== */
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
  Political: ["political","politics","revolution","revolutionary","independence","liberty","freedom","patriot","colony","colonies",
    "rights","constitution","declaration","amendment","confederation",
    "government","law","congress","senate",
    "representative","delegate","convention","ratify","ratification"
  ],
  Military: ["war","wars","wartime","military","martial","militia","regiment","regiments",
    "commander","commanders","officers","officer","siege","sieges","fort","forts",
    "garrison","garrisons","campaign","campaigns","soldier","soldiers","defense","defence",
    "artillery","marines","infantry","cavalry","dragoons","battalion","battalions","company","companies","corps"
  ],
  Society: ["women","family","education","charity","association","customs","tradition","slavery","social","inheritance","kinship","domestic","marriage","apprentice","guild","labor","occupation","craft","tradecraft","artisan","employment","profession"],
  Religion: ["faith","divine","godliness","providence","salvation","grace","spirit","soul","worship","devotion","religious","puritan","evangelical","moral","morality"],
  Business: ["plantation","manufacturer","enterprise","property","labor","production","exportation","warehouse","shipbuilding","cents","currency","finance","credit","debt","bank","invoice","ledger","receipt","tariff","duty","commerce","trade","merchant","merchandise"]
};
for (const [topic, words] of Object.entries(TOPIC_CORE)){
  for (const w of words){
    if (!LEXICON.has(w)) LEXICON.set(w, { topic, canonical: "_core" });
  }
}

/* ===== Ambiguous-term context ===== */
const CONDITIONAL_TERMS = {
  act: /congress|statute|law|assembly/i,
  bill: /congress|senate|parliament|law|legislation/i,
  general: /officer|army|battle|military/i,
  order: /military|command|battle|army/i,
  note: /shilling|pence|pound|bank|currency|issue|sheet|uncut|denomination/i,
  bank: /credit|finance|currency|debt|account/i,
  work: /labor|employment|apprentice|guild/i,
  providence: /divine|god|faith|grace|salvation|worship|church|lord|heaven|blessed|almighty/i
};
function isValidContext(tok, text){
  const cond = CONDITIONAL_TERMS[tok];
  if (!cond) return true;
  return cond.test(text);
}

/* ===== Stopwords / Noise ===== */
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
  "boston","delancey","watts","london","phila","mr","mrs","miss"
]);

/* ===== Compound normalization & tokenization ===== */
function normalizePhrases(s){
  let out = String(s||"");
  // normalize hyphen/dash connected words (e.g., "Post-Office" -> "Post Office")
  // only replace hyphens between alphanumeric characters to avoid breaking URLs
  out = out.replace(/([A-Za-z0-9])[-–—]([A-Za-z0-9])/g, '$1 $2');
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

/* ===================== 4) Keyword extraction ===================== */
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

/* ===================== 4.5) Subcategory keyword collection (preview) ===================== */
function getCanonicalKeywords(topic, canonical){
  const fromGroups = (CANONICAL_GROUPS[topic] && CANONICAL_GROUPS[topic][canonical]) || [];
  const fromPhrases = Object.entries(PHRASE_LEXICON)
    .filter(([k,v]) => v.topic===topic && v.canonical===canonical)
    .map(([k])=> k);
  const phrases = fromPhrases.sort((a,b)=> b.length - a.length);
  const words   = Array.from(new Set(fromGroups.map(s=>s.toLowerCase()))).sort();
  return { phrases, words };
}

/* ===================== 5) Multi-tagging ===================== */
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
      rows = rows.filter(r => r.canonical !== "_core" && r.canonical !== "other" && r.count >= 3);
    }
    const picked = rows.map(r=>r.key);
    canonicals.push(...picked);
  }

  doc.topics        = Array.from(new Set(topics));
  doc.canonicals    = Array.from(new Set(canonicals));
  doc.dominantTopic = doc.topics[0] || "Other";
  doc.canonical_key = doc.canonicals[0] || null;
  doc.key_terms     = extractKeyTerms(text, doc.canonical_key, Infinity);
}

/* ===================== 6) Color / Topic mix ===================== */
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

/* ===================== 7) Global state ===================== */
let DOCS = [];
let STATE = { topic:"All", canonical:null, hideOther:false, yearMin:1770, yearMax:1810, decade:"All" };
STATE.view = "grid";
STATE.selectedId = null;
STATE.order = [];
STATE.sortMode = "Chrono";   // ✅ (4) sort switch: "Topic" | "Chrono" | "Random"
let TOP4_CANON = null;

// Store a global reference to the detail view keyboard handler
let detailKeyHandler = null;

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
    // Year filtering: require a numeric year and check range
    const ymin = STATE.yearMin || 1770;
    const ymax = STATE.yearMax || 1810;
    if (!d.year) return false; // omit docs without a year when filtering
    if (d.year < ymin || d.year > ymax) return false;
    return true;
  });

  // ✅ (4) sort switch
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

    // ✅ (5) Tooltip thumbnail (when available)
    const imgSrc = (buildImageCandidates(d) || [])[0];
    const imgTag = imgSrc ? `<img class="tip-thumb" src="${imgSrc}" alt="" />` : "";
    
    // Show page tabs (for multi-page documents)
    const pageCount = d.imageURLs?.length || 1;
    const tabsHTML = pageCount > 1 
      ? `<div class="page-tabs">${Array.from({length: Math.min(pageCount, 5)}, (_, i) => 
          `<span class="tab">${i+1}</span>`
        ).join('')}${pageCount > 5 ? '<span class="tab">...</span>' : ''}</div>` 
      : '';

    // Multi-tag display (show dominant topic + other topics)
    const domTopic = d.dominantTopic || "Other";
    const topicHTML = `<div class="t3" style="font-size:11px; color:#cbd3e1; margin-top:4px;">${escapeHtml(domTopic)}</div>`;
    
    const otherTopics = (d.topics || []).filter(t => t !== domTopic && t !== "Other");
    const multiTagHTML = otherTopics.length > 0 
      ? `<div class="t4" style="font-size:10px; color:#999; margin-top:2px;">Also: ${escapeHtml(otherTopics.join(", "))}</div>` 
      : '';

    const tipHTML = `
      <div class="t1">${d.title || "Untitled"}</div>
      <div class="t2">${d.year ? d.year : ""}</div>
      ${tabsHTML}
      ${topicHTML}
      ${multiTagHTML}
      ${imgTag}
    `;

    el.addEventListener("mouseenter", (ev)=>{ showTip(tipHTML); moveTip(ev); });
    el.addEventListener("mousemove", moveTip);
    el.addEventListener("mouseleave", hideTip);
    el.addEventListener("click", (ev)=>{ ev.stopPropagation(); openDetail(d.id); });

    grid.appendChild(el);
  }

  // Update document count display
  const docCountEl = document.getElementById('doc-count');
  if (docCountEl) {
    const count = sorted.length;
    docCountEl.textContent = `${count} document${count !== 1 ? 's' : ''}`;
  }
}

// Apply a year range filter and re-render
function applyYearFilter(min, max){
  STATE.yearMin = Math.min(+min, +max);
  STATE.yearMax = Math.max(+min, +max);
  renderMosaic();
  syncURL();
}

// Set ordering mode programmatically
function setOrdering(mode){
  if (!["Chrono","Topic","Random"].includes(mode)) return;
  STATE.sortMode = mode;
  renderTopicButtons();
  renderLegend();
  renderMosaic();
  syncURL();
}

/* ===================== 9) Topic buttons & sidebar ===================== */
function renderTopicButtons(){
  const wrap = $("#topic-buttons");
  wrap.innerHTML = "";

  const row = document.createElement("div");
  row.className = "btn-row";
  ["All", ...TOPICS].forEach(t=>{
    const btn = document.createElement("button");
    const isActive = STATE.topic===t;
    btn.className = "btn" + (isActive ? " active":"");
    // small color dot (optional): uncomment below to add a dot to the button text
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

/* ===================== Decade Filter Buttons ===================== */
function renderDecadeButtons(){
  const wrap = $("#decade-buttons");
  if (!wrap) return;
  wrap.innerHTML = "";

  const decades = [
    { label: "All", min: 1770, max: 1810 },
    { label: "1770s", min: 1770, max: 1779 },
    { label: "1780s", min: 1780, max: 1789 },
    { label: "1790s", min: 1790, max: 1799 },
    { label: "1800–1810", min: 1800, max: 1810 }
  ];

  const row = document.createElement("div");
  row.className = "btn-row";
  
  decades.forEach(d => {
    const btn = document.createElement("button");
    const isActive = STATE.decade === d.label;
    btn.className = "btn" + (isActive ? " active" : "");
    btn.textContent = d.label;
    
    btn.onclick = () => {
      STATE.decade = d.label;
      STATE.yearMin = d.min;
      STATE.yearMax = d.max;
      renderDecadeButtons();
      renderLegend();
      renderMosaic();
      syncURL();
    };
    
    row.appendChild(btn);
  });
  
  wrap.appendChild(row);
}

/* ===================== 10) Legend (subcategories) ===================== */
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
    
    // Apply same filters as renderMosaic
    if (STATE.hideOther && d.dominantTopic === "Other") continue;
    const ymin = STATE.yearMin || 1770;
    const ymax = STATE.yearMax || 1810;
    if (!d.year) continue;
    if (d.year < ymin || d.year > ymax) continue;
    
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

/* ===================== 11) CSV Load ===================== */
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
    const rows = Array.from(m.entries())
      .sort((a,b)=> b[1]-a[1])
      .filter(([canon, count]) => count >= 3);
    out[t] = new Set(rows.map(([canon])=> canon));
  }
  return out;
}

async function loadCSV(){
  
  // 1. cleaned JSON (structured data)
  const cleanedDocs = await d3.json("data/cleaned_docs.json");
  
  // CSV loading removed - use cleaned_docs.json only
  
  // loaded counts (quiet)
  
  // Use cleaned_docs.json
  DOCS = cleanedDocs.map(doc => {
    const metadata = doc.metadata || {};
    
    // consolidated text for keyword analysis
    const _text = [
      doc.title, doc.title,  // title 2x for weighting
      doc.description,
      metadata.object_type,
      metadata.topic,
      metadata.associated_person,
      metadata.date_raw,
      metadata.location,
      metadata.maker
    ].filter(Boolean).join(" ");
    
    return {
      id: doc.id || `doc_${Math.random().toString(36).substr(2, 9)}`,
      title: doc.title || "Untitled",
      description: doc.description || "",
      year: doc.year || null,
      thumbnail: doc.thumbnail || "",
      sourceURL: doc.sourceURL || doc.link || "",
      metadata: metadata,
      // 🔍 consolidated field for keyword analysis
      _text: _text,
      // compatibility with old fields (used by topic analysis)
      name: metadata.associated_person || "",
      collection: metadata.object_type || "",
      objectType: doc.objectType || metadata.object_type || "",
      object_type: metadata.object_type || "",
      collectionsURL: doc.link || doc.sourceURL || "",
      imageURL: doc.thumbnail || "",
      filename: doc.thumbnail || "",
      topic: metadata.topic || "",
      date: doc.date || metadata.date_raw || "",
      notes: doc.description || "",
      summary: doc.description || ""
    };
  });
  
  TOP4_CANON = computeTopCanonicals(DOCS);

  // tagging diagnostics suppressed for quieter console

  DOCS.forEach(doc=>{
    assignMultiTags(doc, { SUBCAT_PER_TOPIC: 4, allowedCanonPerTopic: TOP4_CANON });
  });
  
  // tagging results suppressed
  
  // documents by dominant topic (quiet)
  const topicCounts = {};
  DOCS.forEach(d => {
    const t = d.dominantTopic || "Other";
    topicCounts[t] = (topicCounts[t] || 0) + 1;
  });
  // documents by topic (quiet)
  
  // Count documents with canonical_key
  const withCanonical = DOCS.filter(d => d.canonical_key).length;
  // documents with canonical key (quiet)
}

/* ===================== 12) Tooltip ===================== */
const TIP = document.getElementById("tooltip");
function showTip(html){ TIP.innerHTML = html; TIP.classList.remove("hidden"); }
function moveTip(ev){
  // only compute position when tooltip is visible
  if (TIP.classList.contains("hidden")) return;
  
  const pad = 16;
  const offset = 1;
  const rect = TIP.getBoundingClientRect();
  const tipW = rect.width || 360; // fallback: CSS max-width 값
  const tipH = rect.height || 100;
  
  let x = ev.clientX + offset;
  let y = ev.clientY - offset;
  
  // move left if exceeding right boundary
  if (x + tipW + pad > window.innerWidth) {
    x = ev.clientX - tipW - offset;
  }
  
  // move right if under left boundary
  if (x < pad) {
    x = pad;
  }
  
  // display above if exceeding bottom boundary
  if (y + tipH + pad > window.innerHeight) {
    y = ev.clientY - tipH - offset;
  }
  
  // move down if above top boundary
  if (y < pad) {
    y = pad;
  }
  
  TIP.style.left = Math.round(x) + "px";
  TIP.style.top = Math.round(y) + "px";
}
function hideTip(){ TIP.classList.add("hidden"); }

/* ===================== 13) Detail Overlay ===================== */
let detailImageIndex = 0; // index of currently viewed image

// Fetch additional images from Smithsonian API
async function fetchSmithsonianImages(doc) {
  const collectionURL = doc.sourceURL || doc.collectionsURL;
  
  // document info suppressed (quiet)
  
  // if collectionsURL is missing, return the primary image only
  if (!collectionURL) {
    console.warn('⚠️ No sourceURL found, using default image');
    const fallback = doc.thumbnail || doc.imageURL;
    return fallback ? [fallback] : [];
  }
  
  // extract Object ID from URL (e.g. edanmdm:npm_2025.2004.5)
  // flexible match: use if 'edanmdm:...' appears anywhere in the string
  const idMatch = collectionURL.match(/(edanmdm:[^\/\?#]+)/i);
  if (!idMatch) {
    console.warn('⚠️ Could not parse Object ID from:', collectionURL);
    const fallback = doc.thumbnail || doc.imageURL;
    return fallback ? [fallback] : [];
  }
  const objectId = idMatch[1];
  const key = await loadSmithsonianApiKey();
  if (!key) {
    console.warn('No Smithsonian API key available — skipping Smithsonian API fetch');
    const fallback = doc.thumbnail || doc.imageURL;
    return fallback ? [fallback] : [];
  }

  const apiUrl = `https://api.si.edu/openaccess/api/v1.0/content/${objectId}?api_key=${encodeURIComponent(key)}`;

  try {
    const response = await fetch(apiUrl);
    if (!response.ok) {
      console.error(`API response error: ${response.status} ${response.statusText}`);
      return doc.imageURLs || [doc.imageURL];
    }
    
    const data = await response.json();
    
    // extract all images from online_media
    const media = data.response?.content?.descriptiveNonRepeating?.online_media?.media;
    
    if (!media || media.length === 0) {
      console.warn('No additional images found in API response');
      return doc.imageURLs || [doc.imageURL];
    }
    
    // media list suppressed
    
    // 🔧 extract all image URLs (IIIF or deliveryService)
    const imageUrls = media
      .filter(m => {
        const hasImage = m.content && (
          m.content.includes('iiif') || 
          m.content.includes('deliveryService') ||
          m.content.includes('ids.si.edu')
        );
        return hasImage;
      })
      .map(m => {
        let url = m.content;
        // upgrade resolution for IIIF URLs
        if (url.includes('/full/')) {
          url = url.replace(/\/full\/[0-9,]+\//, '/full/800,/');
        }
        // add max=800 parameter for deliveryService URLs
        else if (url.includes('deliveryService')) {
          url = url.replace(/[?&]max=[0-9]+/, '');
          url += url.includes('?') ? '&max=800' : '?max=800';
        }
        return url;
      });
    
    // extracted image URLs (quiet)
    
    // improved fallback handling
    if (imageUrls.length > 0) {
      return imageUrls;
    }
    
    const fallback = doc.thumbnail || doc.imageURL;
    return fallback ? [fallback] : [];
    
  } catch (error) {
    console.error('❌ API fetch error:', error);
    const fallback = doc.thumbnail || doc.imageURL;
    return fallback ? [fallback] : [];
  }
}

function cleanDescription(raw){
  if (!raw) return "";
  let s = String(raw);
  
  // remove "No description available" (when it appears alone)
  s = s.replace(/\bNo description available\.?\b/gi, "");
  
  // if JSON-like, try to extract Description field
  if (s.trim().startsWith('{')) {
    try {
      const parsed = JSON.parse(s);
      if (parsed.Description) {
        s = parsed.Description;
      }
    } catch (e) {
      // JSON parse failed, try regex
      const m = s.match(/"Description"\s*:\s*"([^"]*(?:\\.[^"]*)*)"/);
      if (m) s = m[1];
    }
  }
  
  // remove URLs (starting with http/https)
  s = s.replace(/https?:\/\/[^\s]+/g, "");
  
  // remove JSON-formatted metadata (e.g. {"Type": "...", "Date": "..."})
  // remove JSON-like blobs that contain common metadata keys (case-insensitive)
  s = s.replace(/\{[^}]*"(?:Type|Date|Associated Person|Associated_Person|associated person|associated_person|Signer|Maker|Writer|Collection|Location|accession|rights|originator)"[^}]*\}/gi, "");
  // remove JSON-like fragments that start with { and run to the line end (incomplete blobs)
  s = s.replace(/\{[^\}\n]{0,400}"[^\n]{0,200}[^\n]*$/gim, "");
  
  // handle unicode escapes
  s = s.replace(/\\u([0-9a-fA-F]{4})/g, (_,h)=> String.fromCharCode(parseInt(h,16)));
  
  // handle backslash escapes
  s = s.replace(/\\\"/g, '"');   // \" → "
  s = s.replace(/\\\\/g, '\\'); // \\ → \\ 
  
  // Normalize line breaks
  s = s.replace(/\\n/g, "\n").replace(/\u00A0/g, " ");
  s = s.replace(/\s+\./g, ".").replace(/[ \t]+\n/g, "\n").replace(/\n{3,}/g, "\n\n");
  
  // Trim and normalize consecutive spaces
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
    out = out.replace(phraseRe(ph), (m)=> `<mark data-topic="${escapeHtml(meta.topic || '')}">${escapeHtml(m)}</mark>`);
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
      return `<mark data-topic="${escapeHtml(topic)}">${escapeHtml(m)}</mark>`;
    });
  }
  return parts.join("");
}

async function renderDetail(doc){
  const overlay = $("#detail-overlay");
  const img = $("#detail-image");
  const title = $("#detail-title");
  const year = $("#detail-year");
  const desc = $("#detail-desc");
  const barsWrap = $("#detail-bars-wrap");
  
  // Metadata fields
  const detailSubject = $("#detail-subject");
  const detailPeople = $("#detail-people");
  const detailCollection = $("#detail-collection");
  const detailType = $("#detail-type");
  const detailIdentifiers = $("#detail-identifiers");
  const detailRights = $("#detail-rights");
  const detailKeywords = $("#detail-keywords");
  const detailTranscription = $("#detail-transcription");

  const safeTitle = doc.title || "Untitled";

  // Fetch actual images from Smithsonian API
  // (Overlay is already open in openDetail)
  
  // Fetch images from API
  const imageURLs = await fetchSmithsonianImages(doc);
  
  const hasValidImages = imageURLs.length > 0 && imageURLs.some(url => url && url.trim());
  
  if (!hasValidImages) {
    console.warn('⚠️ No valid images, switching to text-only mode');
    overlay.classList.add('no-image-mode');
    
    const mediaElement = $('.detail-media');
    if (mediaElement) mediaElement.style.display = 'none';
  } else {
    console.debug(`🖼️ Total images: ${imageURLs.length}`);
    overlay.classList.remove('no-image-mode');
    
    const mediaElement = $('.detail-media');
    if (mediaElement) mediaElement.style.display = '';
  }
  
    // Initialize image slider
  detailImageIndex = 0;
  const hasMultiplePages = imageURLs.length > 1;
  
  console.debug(`Multi-page: ${hasMultiplePages}`);
  
  // button state update
  function updateButtons() {
    const prevBtn = $("#prev-page");
    const nextBtn = $("#next-page");
  console.debug(`🔘 Button update - Index: ${detailImageIndex}, Total: ${imageURLs.length}`);
    
    if (prevBtn) {
      prevBtn.disabled = detailImageIndex === 0;
      prevBtn.style.display = hasMultiplePages ? 'flex' : 'none';
      console.debug(`  Prev: display=${prevBtn.style.display}, disabled=${prevBtn.disabled}`);
    }
    if (nextBtn) {
      nextBtn.disabled = detailImageIndex >= imageURLs.length - 1;
      nextBtn.style.display = hasMultiplePages ? 'flex' : 'none';
      console.debug(`  Next: display=${nextBtn.style.display}, disabled=${nextBtn.disabled}`);
    }
  }
  function loadImage(index) {
    console.debug(`📄 Loading image ${index + 1}/${imageURLs.length}`);
    const imageUrl = imageURLs[index];
    console.debug(`🔗 Loading URL: ${imageUrl}`);
    
    const viewport = $("#media-viewport");
    img.classList.remove('zoomed');
    if (viewport) viewport.classList.remove('zoomed');
    img.style.transform = "";
    img.draggable = false;
    
    // Use URL directly from API (bypassing buildImageCandidates)
    img.onerror = () => {
      console.error(`❌ Failed to load image: ${imageUrl}`);
      img.alt = "Image failed to load";
    };
    img.onload = () => {
      console.debug(`✅ Image loaded successfully: ${imageUrl}`);
      // Set up zoom event after image load
      setupImageZoom();
    };
    img.src = imageUrl;
    img.alt = `${safeTitle} - Page ${index + 1}`;
    
    // Update page indicator
    updatePageIndicator();
    updateButtons();
    updateThumbnailActive();
  }
  
  // Image zoom functionality
  function setupImageZoom() {
    const viewport = $("#media-viewport");
    
    // Set onclick directly on image
    img.onclick = (e) => {
      e.stopPropagation();
      const isZoomed = img.classList.toggle('zoomed');
      
      // Toggle zoomed class on viewport as well
      if (viewport) {
        viewport.classList.toggle('zoomed', isZoomed);
        
        // Scroll to center image when zoomed in
        if (isZoomed) {
          setTimeout(() => {
            viewport.scrollLeft = (viewport.scrollWidth - viewport.clientWidth) / 2;
            viewport.scrollTop = (viewport.scrollHeight - viewport.clientHeight) / 2;
          }, 300);
        }
      }
    };
  }
  
  // Update page indicator
  function updatePageIndicator() {
    const indicator = $("#page-indicator");
    if (indicator) {
      indicator.textContent = hasMultiplePages 
        ? `${detailImageIndex + 1} / ${imageURLs.length}`
        : "";
      indicator.style.display = hasMultiplePages ? 'block' : 'none';
    }
  }
  
  // Create thumbnail gallery
  function createThumbnails() {
    const thumbContainer = $("#media-thumbnails");
    if (!thumbContainer) return;
    
    if (!hasMultiplePages) {
      thumbContainer.classList.add('hidden');
      return;
    }
    
    thumbContainer.classList.remove('hidden');
    thumbContainer.innerHTML = '';
    
    imageURLs.forEach((url, index) => {
      const thumbDiv = document.createElement('div');
      thumbDiv.className = 'thumb-item';
      thumbDiv.dataset.index = index;
      if (index === detailImageIndex) thumbDiv.classList.add('active');
      
      const thumbImg = document.createElement('img');
      // Small image for thumbnail (max=200)
      const thumbUrl = url.replace(/max=800/, 'max=200');
      thumbImg.src = thumbUrl;
      thumbImg.alt = `Page ${index + 1}`;
      
      thumbDiv.appendChild(thumbImg);
      thumbDiv.onclick = () => {
        console.debug(`📸 Thumbnail clicked: ${index + 1}`);
        detailImageIndex = index;
        loadImage(detailImageIndex);
        updateThumbnailActive();
      };
      
      thumbContainer.appendChild(thumbDiv);
    });
  }
  
  // Update thumbnail active state
  function updateThumbnailActive() {
    const thumbs = document.querySelectorAll('.thumb-item');
    thumbs.forEach((thumb, index) => {
      if (index === detailImageIndex) {
        thumb.classList.add('active');
        // Scroll to make the current thumbnail visible
        thumb.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' });
      } else {
        thumb.classList.remove('active');
      }
    });
  }
  
  // Run image-related functions only if images are present
  if (hasValidImages) {
    loadImage(detailImageIndex);
    createThumbnails();
  }

  // Highlight topic/key tokens in the title for the detail view
  try {
    title.innerHTML = highlightKeywords(safeTitle, doc) || escapeHtml(safeTitle);
  } catch (e) {
    title.textContent = safeTitle;
  }
  
  const metadata = doc.metadata || {};
  
  // Metadata: year + topic line (with topic keyword highlighting)
  const rawTopicLine = formatTopicLine(doc);
  // Topic line: render plain text without highlighted tokens
  const highlightedTopicLine = rawTopicLine || "";
  let metaHTML = `${doc.year ? `<span class="year">${doc.year}</span>` : ""}`;
  metaHTML += `<span class="topic-line">${escapeHtml(highlightedTopicLine)}</span>`;
  year.innerHTML = metaHTML;

  // === Field-specific section rendering ===
  
  // 0. Subject (from metadata)
  let subjectInfo = [];
  if (metadata.subject) {
    try {
      const parsed = typeof metadata.subject === 'string' ? JSON.parse(metadata.subject) : metadata.subject;
      if (typeof parsed === 'object' && parsed !== null) {
        // Extract all values from the Subject object
        Object.entries(parsed).forEach(([key, value]) => {
          if (value && String(value).trim()) {
            const label = key.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
            subjectInfo.push(`${label}: ${value}`);
          }
        });
      } else if (typeof parsed === 'string') {
        subjectInfo.push(parsed);
      }
    } catch (e) {
      // If not JSON, treat as plain string
      if (typeof metadata.subject === 'string' && metadata.subject.trim()) {
        subjectInfo.push(metadata.subject);
      }
    }
  }
  
  // Also check for related_event
  if (metadata.related_event) {
    try {
      const parsed = typeof metadata.related_event === 'string' ? JSON.parse(metadata.related_event) : metadata.related_event;
      if (typeof parsed === 'string' && parsed.trim()) {
        subjectInfo.push(`Related Event: ${parsed}`);
      } else if (Array.isArray(parsed)) {
        parsed.forEach(ev => {
          if (ev && String(ev).trim()) subjectInfo.push(`Related Event: ${ev}`);
        });
      }
    } catch (e) {
      if (typeof metadata.related_event === 'string' && metadata.related_event.trim()) {
        subjectInfo.push(`Related Event: ${metadata.related_event}`);
      }
    }
  }
  
  if (subjectInfo.length > 0) {
    const subjectContent = $("#detail-subject-content");
    if (subjectContent) {
      subjectContent.innerHTML = subjectInfo.map(s => `<p>${escapeHtml(s)}</p>`).join('');
    }
    if (detailSubject) detailSubject.classList.remove("hidden");
  } else {
    if (detailSubject) detailSubject.classList.add("hidden");
  }
  
  // 1. People/Name information
  const peopleContent = $("#detail-people-content");
  let ap = metadata.associated_person;
  let firstPerson = null;

  // If associated_person is a JSON string/object, try to extract the name value
  try {
    if (typeof ap === 'string') {
      const s = ap.trim();
      if ((s.startsWith('{') || s.startsWith('['))) {
        const parsed = JSON.parse(s);
        // parsed can be object or array
        if (Array.isArray(parsed) && parsed.length) {
          ap = parsed;
        } else if (parsed && typeof parsed === 'object') {
          // find a likely name field inside the object
          const nameKeys = ['associated_person','associated person','name','person','full_name','originator'];
          let found = false;
          for (const k of Object.keys(parsed)){
            const lk = String(k).toLowerCase().replace(/[_\s\(\)]+/g,'');
            for (const candidate of nameKeys){
              if (lk === candidate.replace(/[_\s]+/g,'')) {
                const v = parsed[k];
                if (v) { ap = v; found = true; }
                break;
              }
            }
            if (found) break;
          }
          // fallback: if no keyed name found, scan values for a name-like string
          if (!found) {
            const vals = Object.values(parsed);
            const nameLike = (t) => {
              if (!t || typeof t !== 'string') return false;
              const s = t.trim();
              if (s.length < 3 || s.length > 120) return false;
              if (/https?:\/\//i.test(s)) return false;
              if (/[,]\s*[A-Z]/.test(s)) return true; // Last, First
              if (/^[A-Z][a-z]+\s+[A-Z][a-z]+/.test(s)) return true; // First Last
              return false;
            };
            for (const v of vals){
              if (Array.isArray(v) && v.length){
                for (const vv of v){ if (typeof vv === 'string' && nameLike(vv)) { ap = vv; found = true; break; } }
              }
              if (found) break;
              if (typeof v === 'string' && nameLike(v)) { ap = v; found = true; break; }
            }
          }
        }
      }
    }
  } catch (e) {
    // ignore parse errors and fall back to raw value
    ap = metadata.associated_person;
  }

  if (ap) {
    if (Array.isArray(ap) && ap.length) {
      firstPerson = String(ap[0]).trim();
    } else {
      const s = String(ap || '');
      // keep commas inside names (e.g. "Last, First"), split only on semicolon/pipe/newline
      const parts = s.split(/\s*(?:;|\||\n)\s*/).map(p => p.trim()).filter(Boolean);
      firstPerson = parts.length ? parts[0] : null;
    }
  }

  if (firstPerson) {
    // avoid showing raw JSON strings
    // if firstPerson still looks like JSON or contains extra keys, try to extract a clean name
    const looksNoisy = /[\{\}\":]/.test(firstPerson);
    if (looksNoisy) {
        // find quoted strings inside the noisy text
        const q = Array.from(String(firstPerson).matchAll(/"([^\"]{2,200})"/g)).map(m=>m[1]);
        const rawMatches = String(firstPerson).match(/([A-Z][a-z]+,\s*[A-Z][a-z]+)|([A-Z][a-z]+\s+[A-Z][a-z]+)/g) || [];
        const candidates = q.length ? q : rawMatches;
        // If the raw firstPerson contains a comma and looks like a full name, prefer it whole
        if (/,/.test(firstPerson) && firstPerson.length < 120 && /[A-Za-z]/.test(firstPerson)) {
          const cleanedWhole = String(firstPerson).replace(/[\{\}\"]+/g,'').trim();
          if (cleanedWhole.split(',').length >= 2) {
            peopleContent.textContent = cleanedWhole;
            detailPeople.classList.remove('hidden');
          } else {
            // fall back to candidate selection below
            const isName = (t) => {
              if (!t) return false;
              if (t.length > 80) return false;
              if (/[:\{\}\[\]]/.test(t)) return false;
              if (/https?:\/\//i.test(t)) return false;
              if (/,\s*\w+/.test(t)) return true; // contains comma (Last, First)
              if (/^[A-Z][a-z]+\s+[A-Z][a-z]+$/.test(t)) return true; // Two capitalized words
              return false;
            };
            let chosen = candidates.find(isName) || candidates[0] || String(firstPerson).replace(/[\{\}"]+/g,'').trim();
            peopleContent.textContent = chosen;
            detailPeople.classList.remove('hidden');
          }
        } else {
          const isName = (t) => {
            if (!t) return false;
            if (t.length > 80) return false;
            if (/[:\{\}\[\]]/.test(t)) return false;
            if (/https?:\/\//i.test(t)) return false;
            if (/,\s*\w+/.test(t)) return true; // contains comma (Last, First)
            if (/^[A-Z][a-z]+\s+[A-Z][a-z]+$/.test(t)) return true; // Two capitalized words
            return false;
          };
          let chosen = candidates.find(isName) || candidates[0] || String(firstPerson).replace(/[\{\}"]+/g,'').trim();
          peopleContent.textContent = chosen;
          detailPeople.classList.remove('hidden');
        }
    } else {
      peopleContent.textContent = firstPerson;
    }
    detailPeople.classList.remove('hidden');
  } else {
    detailPeople.classList.add('hidden');
  }
  
  // 2. Collection/Source information
  const collectionInfo = [];
  if (metadata.object_type) collectionInfo.push(metadata.object_type);
  if (metadata.topic) collectionInfo.push(`Topic: ${metadata.topic}`);
  
  // Always show section if sourceURL exists
  if (collectionInfo.length > 0 || doc.sourceURL) {
    let collectionHTML = "<h4>Source / Collection</h4>";
    collectionInfo.forEach(info => {
      collectionHTML += `<p>${info}</p>`;
    });
    
    // Add link if sourceURL exists (even if no other info)
    if (doc.sourceURL && typeof doc.sourceURL === 'string') {
      collectionHTML += `<p><a href="${doc.sourceURL}" target="_blank" rel="noopener">View in Smithsonian Collections →</a></p>`;
    }
    
    if (detailCollection) {
      detailCollection.innerHTML = collectionHTML;
      detailCollection.classList.remove("hidden");
    } else {
      console.warn('detailCollection element missing; skipping collection rendering');
    }
  } else {
    if (detailCollection) detailCollection.classList.add("hidden");
  }
  
  // 3. Additional metadata (location, accession, etc.)
  const extraMeta = [];
  if (metadata.location) extraMeta.push(`Location: ${metadata.location}`);
  if (metadata.accession) extraMeta.push(`Accession: ${metadata.accession}`);
  if (metadata.maker) extraMeta.push(`Maker: ${metadata.maker}`);
  
  if (extraMeta.length > 0) {
    if (detailType) {
      detailType.innerHTML = `
        <h4>Additional Information</h4>
        ${extraMeta.map(m => `<p class="meta-detail">${m}</p>`).join('')}
      `;
      detailType.classList.remove("hidden");
    } else {
      console.warn('detailType element missing; skipping additional metadata rendering');
    }
  } else {
    if (detailType) detailType.classList.add("hidden");
  }

  // 4. Identifiers (ID, accession, collectionsURL)
  if ((doc.id && String(doc.id).trim()) || metadata.accession || doc.collectionsURL) {
    const ids = [];
    if (doc.id) ids.push(`<p><strong>ID:</strong> ${doc.id}</p>`);
    if (metadata.accession) ids.push(`<p><strong>Accession:</strong> ${metadata.accession}</p>`);
    if (doc.collectionsURL) ids.push(`<p><a href="${doc.collectionsURL}" target="_blank" rel="noopener">View collection record →</a></p>`);
    if (detailIdentifiers) {
      detailIdentifiers.innerHTML = ids.join('');
      detailIdentifiers.classList.remove('hidden');
    }
  } else {
    if (detailIdentifiers) detailIdentifiers.classList.add('hidden');
  }

  // 5. Rights / provenance
  const rightsParts = [];
  if (metadata.rights) rightsParts.push(`<p>${metadata.rights}</p>`);
  if (metadata.provenance) rightsParts.push(`<p>${metadata.provenance}</p>`);
  if (rightsParts.length) {
    if (detailRights) {
      detailRights.innerHTML = rightsParts.join('');
      detailRights.classList.remove('hidden');
    }
  } else {
    if (detailRights) detailRights.classList.add('hidden');
  }

  // 6. Keywords (from doc.key_terms or extracted on the fly)
  const keywords = (doc.key_terms && doc.key_terms.length) ? doc.key_terms.slice(0,10) : extractKeyTerms(getDocText(doc), doc.canonical_key, 10);
  if (keywords && keywords.length) {
    if (detailKeywords) {
      detailKeywords.innerHTML = `<p>${keywords.map(k => `<span class="kw">${k}</span>`).join(' ')}</p>`;
      detailKeywords.classList.remove('hidden');
    }
  } else {
    if (detailKeywords) detailKeywords.classList.add('hidden');
  }

  // 7. Transcription / Full text (if available)
  const trans = metadata.transcription || doc.transcription || doc._text || "";
  const cleanedTrans = cleanDescription(trans);
  if (cleanedTrans && cleanedTrans.trim().length > 20) {
    if (detailTranscription) {
      try {
        detailTranscription.innerHTML = `<div class="transcription-body">${highlightKeywords(cleanedTrans, doc)}</div>`;
      } catch (e) {
        detailTranscription.innerHTML = `<div class="transcription-body">${escapeHtml(cleanedTrans)}</div>`;
      }
      detailTranscription.classList.remove('hidden');
    }
  } else {
    if (detailTranscription) detailTranscription.classList.add('hidden');
  }

  // === Main description text ===
  let rawDesc = doc.description || "";
  
  // Convert description to string if it's an object
  if (typeof rawDesc === 'object' && rawDesc !== null) {
    rawDesc = JSON.stringify(rawDesc);
  }
  
  // Ignore placeholders like "No description available"
  if (rawDesc === "No description available." || rawDesc === "No description available") {
    rawDesc = "";
  }
  
  const cleaned = rawDesc;
  // ⚠️ If description is missing, use empty string instead of _text (to avoid repeating title)
  const bodyText = cleaned || "";

  // Text parsing: split by paragraphs (e.g., separated by \n\n)
  try {
    if (!desc) throw new Error('Missing #detail-desc element');
    if (bodyText) {
      const paragraphs = bodyText.split(/\n\n+/).filter(p => p.trim());
      if (paragraphs.length > 1) {
        const formattedText = paragraphs
            .map(p => `<p>${(highlightKeywords(p, doc) || escapeHtml(p))}</p>`)
            .join("");
          desc.innerHTML = formattedText;
      } else {
          try {
            desc.innerHTML = highlightKeywords(bodyText, doc) || escapeHtml(bodyText);
          } catch (e) {
            desc.textContent = bodyText;
          }
      }
    } else {
      desc.innerHTML = "<em>No description available.</em>";
    }
  } catch (err) {
    console.error('Error rendering detail description:', err);
    if (desc) desc.innerHTML = "<em>No description available.</em>";
  }

  // Topics mix section handling
  barsWrap.innerHTML = "";
  const detailBarsSection = document.querySelector('.detail-bars');
  
  // Hide Topics mix if no description and _text is only the title
  const hasDescription = doc.description && doc.description.trim();
  const textIsOnlyTitle = !doc._text || doc._text.trim().length < 50;
  
  if (!hasDescription && textIsOnlyTitle) {
    // Hide Topics mix section
    if (detailBarsSection) detailBarsSection.style.display = 'none';
  } else {
    // Show Topics mix section
    if (detailBarsSection) detailBarsSection.style.display = '';
    
    let mix = computeTopicMix(doc, { topN: 5, includeOther:false });
    // fallback: if no computed mix, show the document's dominant topic as a single bar
    if (!mix || !mix.length) {
      const dom = doc.dominantTopic || (doc.topics && doc.topics[0]) || "Other";
      mix = [{ topic: dom, p: 1 }];
    }
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
  }

  STATE.view = "detail";
  
  // Keyboard navigation (arrow keys)
  // Managed by global detailKeyHandler: remove previous handler before adding new one
  if (detailKeyHandler) {
    document.removeEventListener('keydown', detailKeyHandler);
    detailKeyHandler = null;
  }
  detailKeyHandler = (e) => {
    if (STATE.view !== "detail") return;
    if (e.key === 'ArrowLeft' && detailImageIndex > 0) {
      detailImageIndex--;
      loadImage(detailImageIndex);
    } else if (e.key === 'ArrowRight' && detailImageIndex < imageURLs.length - 1) {
      detailImageIndex++;
      loadImage(detailImageIndex);
    }
  };
  document.addEventListener('keydown', detailKeyHandler);
  console.debug('⌨️ Keyboard navigation enabled');
  
  overlay.classList.remove("hidden");
  
  // Close on overlay background click
  overlay.onclick = (e) => {
    if (e.target === overlay) {
      closeDetail();
    }
  };
}

async function openDetail(id){
  const doc = getDocById(id);
  if (!doc) return;
  STATE.selectedId = id;
  
  // Show overlay first, then show loading layer
  const overlay = $("#detail-overlay");
  const loadingLayer = $("#detail-loading");
  overlay.classList.remove("hidden");
  if (loadingLayer) loadingLayer.classList.remove("hidden");
  
  // Immediately initialize all fields
  const img = $("#detail-image");
  const title = $("#detail-title");
  const year = $("#detail-year");
  const desc = $("#detail-desc");
  const barsWrap = $("#detail-bars-wrap");
  
  if (img) {
    img.src = "";
    img.alt = "";
  }
  if (title) title.textContent = "";
  if (year) year.innerHTML = "";
  if (desc) desc.innerHTML = "";
  if (barsWrap) barsWrap.innerHTML = "";
  
  // Initialize page indicator
  const indicator = $("#page-indicator");
  if (indicator) indicator.textContent = "";
  
  // Initialize thumbnails
  const thumbContainer = $("#media-thumbnails");
  if (thumbContainer) {
    thumbContainer.innerHTML = "";
    thumbContainer.classList.add("hidden");
  }
  
  // Hide all field sections
  const fieldSections = [
    "#detail-subject",
    "#detail-people",
    "#detail-collection",
    "#detail-type",
    "#detail-identifiers",
    "#detail-rights",
    "#detail-keywords",
    "#detail-transcription"
  ];
  fieldSections.forEach(sel => {
    const el = $(sel);
    if (el) el.classList.add("hidden");
  });
  
  // Prevent background scrolling
  document.body.style.overflow = "hidden";
  
  // Now render the actual content
  await renderDetail(doc);
  
  // Hide loading layer
  if (loadingLayer) loadingLayer.classList.add("hidden");
  
  syncURL();
  
  // Update navigation button states
  const prevBtn = $("#detail-prev");
  const nextBtn = $("#detail-next");
  if (prevBtn && nextBtn) {
    const currentIndex = STATE.order.indexOf(STATE.selectedId);
    prevBtn.disabled = currentIndex <= 0;
    nextBtn.disabled = currentIndex >= STATE.order.length - 1;
  }
}
function closeDetail(){
  $("#detail-overlay").classList.add("hidden");
  STATE.view = "grid";
  STATE.selectedId = null;
  syncURL();
  // Allow background scrolling
  document.body.style.overflow = "";
  
  // Remove overlay click event
  const overlay = $("#detail-overlay");
  if (overlay) overlay.onclick = null;
  
  // Remove detail key handler (if registered)
  if (detailKeyHandler) {
    document.removeEventListener('keydown', detailKeyHandler);
    detailKeyHandler = null;
  }
}


/* ===================== 14) URL Synchronization ===================== */
function buildQuery(){
  const q = new URLSearchParams();
  if (STATE.selectedId) q.set("id", STATE.selectedId);
  if (STATE.topic && STATE.topic!=="All") q.set("topic", STATE.topic);
  if (STATE.canonical) q.set("canon", STATE.canonical);
  if (STATE.hideOther) q.set("hideOther","1");
  if (STATE.sortMode && STATE.sortMode!=="Topic") q.set("sort", STATE.sortMode);
  // include year range when not default
  if (STATE.yearMin && STATE.yearMin !== 1770) q.set('ymin', STATE.yearMin);
  if (STATE.yearMax && STATE.yearMax !== 1810) q.set('ymax', STATE.yearMax);
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
  const ymin = p.get('ymin');
  const ymax = p.get('ymax');

  if (topic) STATE.topic = TOPICS.includes(topic) ? topic : "All";
  if (canon) STATE.canonical = canon;
  STATE.hideOther = hideOther;
  if (sort && ["Topic","Chrono","Random"].includes(sort)) STATE.sortMode = sort;
  if (ymin && !isNaN(+ymin)) STATE.yearMin = +ymin;
  if (ymax && !isNaN(+ymax)) STATE.yearMax = +ymax;

  renderTopicButtons(); renderLegend(); renderMosaic();

  if (id){ openDetail(id); }
}

/* ===================== 15) Initialization ===================== */
async function main(){
  // ========== Landing Page logic ==========
  const landing = document.getElementById('landing');
  const app = document.querySelector('.container');
  const btn = document.getElementById('btn-explore');
  
  // Check skip status from localStorage (during development: to always show landing, uncomment below)
  // const hasVisited = localStorage.getItem('pt_visited') === 'true';
  const hasVisited = false; // During development: always show landing
  
  // Also check from URL parameters
  const urlParams = new URLSearchParams(location.search);
  const skipLanding = urlParams.get('skip') === '1';
  
  // Determine whether to show landing
  const mainHeader = document.querySelector('.main-header');
  if (hasVisited || skipLanding) {
    // Skip landing
    if (landing) landing.style.display = 'none';
    if (app) app.style.display = 'flex';
    if (mainHeader) mainHeader.style.display = 'flex';
  } else {
    // Show landing
    if (landing) landing.style.display = 'block';
    if (app) app.style.display = 'none';
    if (mainHeader) mainHeader.style.display = 'none';
  }
  
  // When Explore button is clicked (hero & howto sections)
  const enterProject = function() {
    localStorage.setItem('pt_visited', 'true');
    if (landing) landing.style.display = 'none';
    if (app) app.style.display = 'flex';
    const mainHeader = document.querySelector('.main-header');
    if (mainHeader) mainHeader.style.display = 'flex';
  };
  
  if (btn) {
    btn.addEventListener('click', enterProject);
  }
  
  const btnFromHowto = document.getElementById('btn-enter-from-howto');
  if (btnFromHowto) {
    btnFromHowto.addEventListener('click', enterProject);
  }
  
  // Back to Landing button
  const btnBack = document.getElementById('btn-back-to-landing');
  if (btnBack) {
    btnBack.addEventListener('click', function() {
      if (landing) landing.style.display = 'block';
      if (app) app.style.display = 'none';
      const mainHeader = document.querySelector('.main-header');
      if (mainHeader) mainHeader.style.display = 'none';
      // Scroll to top of landing page
      landing.scrollTo({ top: 0, behavior: 'smooth' });
      // Add Hero visible class
      landing.classList.add('hero-visible');
    });
  }
  
  // Show/hide scroll cue based on scroll detection
  if (landing) {
    landing.classList.add('hero-visible'); // Initial state
    
    landing.addEventListener('scroll', function() {
      const heroSection = document.querySelector('.hero');
      if (heroSection) {
        const heroRect = heroSection.getBoundingClientRect();
        // Show if Hero section is at least 50% visible
        if (heroRect.top > -heroRect.height * 0.5) {
          landing.classList.add('hero-visible');
        } else {
          landing.classList.remove('hero-visible');
        }
      }
    });
    
    landing.addEventListener('keydown', function(e) {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        btn?.click();
      }
    });
  }
  // ========== Landing Page logic end ==========

  // Initialize app
  renderTopicButtons();
  renderDecadeButtons();
  await loadCSV();
  renderLegend();
  renderMosaic();
  
  // Initialize About slideshow (after DOCS load)
  initAboutSlideshow();

  applyFromURL();

  // Year range slider UI removed — no inputs to wire. Year filtering remains
  // controlled by `STATE.yearMin` / `STATE.yearMax` if needed programmatically.

  // Document count is automatically updated in renderMosaic() function

  // Close detail button
  const closeBtn = $("#detail-close");
  if (closeBtn) {
    closeBtn.addEventListener("click", closeDetail);
  }

  // Detail navigation buttons (Previous/Next document)
  const prevBtn = $("#detail-prev");
  const nextBtn = $("#detail-next");
  
  function updateNavButtons() {
    if (!STATE.selectedId || !prevBtn || !nextBtn) return;
    const currentIndex = STATE.order.indexOf(STATE.selectedId);
    prevBtn.disabled = currentIndex <= 0;
    nextBtn.disabled = currentIndex >= STATE.order.length - 1;
  }
  
  if (prevBtn) {
    prevBtn.addEventListener("click", () => {
      const currentIndex = STATE.order.indexOf(STATE.selectedId);
      if (currentIndex > 0) {
        openDetail(STATE.order[currentIndex - 1]);
        updateNavButtons();
      }
    });
  }
  
  if (nextBtn) {
    nextBtn.addEventListener("click", () => {
      const currentIndex = STATE.order.indexOf(STATE.selectedId);
      if (currentIndex < STATE.order.length - 1) {
        openDetail(STATE.order[currentIndex + 1]);
        updateNavButtons();
      }
    });
  }

  window.addEventListener("keydown", (ev)=>{
    if (STATE.view !== "detail") return;
    if (ev.key === "Escape") closeDetail();
    
    // Image slider navigation (left/right arrows)
    // Changed to handle via button clicks (to avoid async issues)
    if (ev.key === "ArrowLeft") {
      const prevBtn = $("#prev-page");
      if (prevBtn && !prevBtn.disabled) prevBtn.click();
    } else if (ev.key === "ArrowRight") {
      const nextBtn = $("#next-page");
      if (nextBtn && !nextBtn.disabled) nextBtn.click();
    }
  });

  // NOTE: Removed legacy wheel/drag zoom IIFE to avoid conflicts with
  // the current click-to-zoom + viewport-scroll implementation.
}

/* ===================== Auto Slideshow in About Section ===================== */
function initAboutSlideshow(){
  const imgEl = $("#about-slideshow");
  if (!imgEl) return;

  // Use DOCS from cleaned_docs.json
  // Filter: Documents with thumbnails
  const paperDocs = DOCS.filter(doc => {
    const hasThumbnail = doc.thumbnail && doc.thumbnail.trim();
    return hasThumbnail;
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
}

document.addEventListener("DOMContentLoaded", main);