let baseRows = [];
let rows = [];
const svg = d3.select("#trail");
const width  = +svg.attr("width");
const height = +svg.attr("height");
const decades = d3.range(1770, 1820, 10).map(d => `${d}s`);
const xBand   = d3.scaleBand().domain(decades).range([60, width - 40]).padding(0.35);


const colorByTopic = {
  Politics: "#e45756",
  Military: "#4d9de0",
  Society:  "#59a14f",
  Business: "#a05eb5",
  Religion: "#f2a541"
};


const tryParseJSON = (str) => {
  if (typeof str !== "string") return null;
  try { return JSON.parse(str); } catch { return null; }
};

const extractYear = (dateField) => {
  let txt = "";
  const j = tryParseJSON(dateField);
  if (j) { const k = Object.keys(j)[0]; txt = String(j[k] || ""); }
  else   { txt = String(dateField || ""); }
  const m = txt.match(/(17|18)\d{2}/);
  return m ? +m[0] : NaN;
};

const normalizeObjectType = (objField) => {
  let val = "";
  const j = tryParseJSON(objField);
  if (j) { const k = Object.keys(j)[0]; val = String(j[k] || ""); }
  else   { val = String(objField || ""); }
  const v = val.trim().toLowerCase();
  if (v.includes("pamphlet")) return "Pamphlet";
  if (v.includes("broadside")) return "Broadside";
  if (v.includes("manuscript")) return "Manuscript";
  if (v.includes("newspaper")) return "Newspaper";
  if (v.includes("map")) return "Map";
  if (v.includes("print")) return "Print";
  if (v.includes("sheet") || v.includes("document")) return "Document";
  if (v.includes("cover") || v.includes("letter")) return "Letter";
  return "Document";
};


const canonicalTopics = ["Politics","Military","Society","Business","Religion"];
const deriveTopics = (tags = [], fallback = []) => {
  const found = new Set();

  if (Array.isArray(tags)) {
    for (const t of tags) if (typeof t === "string") {
      const low = t.toLowerCase();
      for (const C of canonicalTopics) if (low.includes(C.toLowerCase())) found.add(C);
      if (/(business|commerce|trade|merchant|mercantile)/.test(low)) found.add("Business");
    }
  }
  if (Array.isArray(fallback)) {
    for (const t of fallback) if (typeof t === "string") {
      const j = tryParseJSON(t);
      const txt = (j ? Object.values(j).join(" ") : t).toLowerCase();
      for (const C of canonicalTopics) if (txt.includes(C.toLowerCase())) found.add(C);
      if (/(business|commerce|trade|merchant|mercantile)/.test(txt)) found.add("Business");
    }
  }
  return found.size ? Array.from(found) : ["Other"];
};

const allowedTypes = new Set([
  "Book","Pamphlet","Broadside","Print","Manuscript","Letter","Document"
]);


d3.json("data.json").then(raw => {
  baseRows = raw.map(d => ({
    title: d.title || "(untitled)",
    year: extractYear(d.date),
    objectType: normalizeObjectType(d.objectType),
    topics: deriveTopics(d.tags, d.topic),
    link: d.collectionsURL
  }))
  .filter(d => Number.isFinite(d.year) && d.year >= 1770 && d.year <= 1820)
  .filter(d => allowedTypes.has(d.objectType))
  .sort((a,b) => a.year - b.year);

  renderBy("All");
});


function makeViewData(topic){
  if (topic === "All") {
    return baseRows.flatMap(d => {
      const topics = (d.topics && d.topics.length) ? d.topics : ["Other"];
      return topics.map(t => ({ ...d, topic: t }));
    });
  } else {
    return baseRows
      .filter(d => (d.topics || []).includes(topic))
      .map(d => ({ ...d, topic }));
  }
}
function renderBy(topic){
  rows = makeViewData(topic);
  renderTrail(rows);
}



function renderTrail(data){
  svg.selectAll("*").remove();
  const clean = (data || []).filter(d =>
    d && Number.isFinite(d.year) && d.topic
  );

  const decadeKey = d => `${Math.floor(d.year/10)*10}s`;
  const grouped = d3.group(clean, decadeKey);
  const box = 32, gap = 8;
  const baseY = height - 44;
  for (const dec of decades){
    const itemsAll = grouped.get(dec) || [];
    const items    = itemsAll.slice();
    const bw = xBand.bandwidth();
    const cols = Math.max(1, Math.floor((bw + gap) / (box + gap)));
    const usableH = baseY - 40;
    const rowsMax = Math.max(1, Math.floor((usableH + gap) / (box + gap)));
    const cap = cols * rowsMax;
    const arr = items.slice(0, cap).filter(Boolean);
    const contentW = cols*box + (cols-1)*gap;
    const left = xBand(dec) + (bw - contentW)/2;
    const gDecade = svg.append("g").attr("transform", `translate(${left},0)`);
    gDecade.selectAll("rect").data(arr).join("rect")
      .attr("x", (_, i) => (i % cols) * (box + gap))
      .attr("y", (_, i) => baseY - Math.floor(i/cols) * (box + gap) - box)
      .attr("width", box).attr("height", box)
      .attr("rx", 3).attr("ry", 3)
      .attr("fill", d => colorByTopic[d?.topic] || "#ddd")
      .attr("stroke", "#fff").attr("stroke-width", 0.8)
      .style("cursor","pointer")
      .on("click", (ev, d) => d.link && window.open(d.link, "_blank"))
      .on("mouseenter", (ev, d) => showTip(ev, d))
      .on("mouseleave", hideTip);
    svg.append("text")
      .attr("x", xBand(dec) + xBand.bandwidth()/2)
      .attr("y", height-16)
      .attr("text-anchor","middle")
      .attr("font-size", 12)
      .text(dec);
  }
}


document.querySelector(".controls").addEventListener("click", (e) => {
  const topic = e.target?.dataset?.topic;
  if (!topic) return;
  renderBy(topic);
});


const tip = document.getElementById("tip");

function escapeHtml(s){
  return String(s || "").replace(/[&<>"']/g, m => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]));
}

function showTip(ev, d){
  const title = escapeHtml(d.title);
  const meta  = [
    String(d.year || "").trim(),
    (d.topics || [d.topic]).join(", "),
    d.objectType
  ].filter(Boolean).join(" · ");

  tip.innerHTML = `
    <div class="t-title">${title}</div>
    <div class="t-meta">${escapeHtml(meta)}</div>
  `;
  tip.style.display = "block";
  moveTip(ev);
}


function hideTip(){ tip.style.display = "none"; }
const TIP_OFFSET = 14;
function moveTip(ev){
  const { clientX: cx, clientY: cy } = ev;
  let left = cx + TIP_OFFSET;
  let top  = cy + TIP_OFFSET;

  const rect = tip.getBoundingClientRect();
  const vw = window.innerWidth, vh = window.innerHeight;

  if (left + rect.width > vw - 8)  left = cx - rect.width - TIP_OFFSET;
  if (top  + rect.height > vh - 8) top  = cy - rect.height - TIP_OFFSET;

  tip.style.left = left + "px";
  tip.style.top  = top  + "px";
}

