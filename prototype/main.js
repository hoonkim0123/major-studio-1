let rows = [];
const svg = d3.select("#trail");
const width = +svg.attr("width");
const height = +svg.attr("height");
const x = d3.scaleLinear().domain([1770, 1820]).range([60, width - 40]);
  const decades = d3.range(1770, 1820, 10).map(d => `${d}s`);
  const xBand = d3.scaleBand().domain(decades).range([60, width - 40]).padding(0.35);
const colorByTopic = {
  Politics: "#e45756",
  Military: "#4d9de0",
  Society:  "#a05eb5",
  Religion: "#f2a541",
  Other:    "#999"
};

d3.json("data.json").then(data => {
  rows = data
    .filter(d => Number.isFinite(d.year) && d.year >= 1770 && d.year <= 1820)
    .filter(d => ["Book","Pamphlet","Broadside","Print","Manuscript","Newspaper","Letter","Document","Map","Certificate","Receipt","Deed"].includes(d.objectType))
    .filter(d => d.topic !== "Portraits")
    .sort((a,b) => a.year - b.year);
  renderTrail(rows);
});

function renderTrail(data){
  svg.selectAll("*").remove();

  // X axis
  svg.append("g")
    .attr("transform", `translate(0,${height-36})`)
  const decadeKey = d => `${Math.floor(d.year/10)*10}s`;
  const grouped = d3.group(data, decadeKey);
  const box = 10;
  const gap = 4;
  const baseY = height - 44;


  for (const dec of decades){
    const itemsAll = grouped.get(dec) || [];
    const items = d3.shuffle(itemsAll.slice());
    const bw = xBand.bandwidth();
    const cols = Math.max(1, Math.floor((bw + gap) / (box + gap)));
    const usableH = baseY - 40;
    const rowsMax = Math.max(1, Math.floor((usableH + gap) / (box + gap)));
    const cap = cols * rowsMax;
    const arr = items.slice(0, cap);
    const contentW = cols*box + (cols-1)*gap;
    const left = xBand(dec) + (bw - contentW)/2;
    arr.forEach((d, i) => {
      const col = i % cols;
      const row = Math.floor(i / cols);
      const xPos = left + col * (box + gap); 
      const yPos = baseY - row * (box + gap) - box;
      svg.append("rect")
        .attr("x", xPos)
        .attr("y", yPos)
        .attr("width", box)
        .attr("height", box)
        .attr("rx", 3).attr("ry", 3)
        .attr("fill", "#eee")
        .attr("stroke", (colorByTopic?.[d.topic] || "#999"))
        .attr("stroke-width", 2)
        .style("cursor","pointer")
        .on("click", () => d.link && window.open(d.link, "_blank"))
        .append("title")
        .text(`${d.title} (${d.year}) · ${d.topic}`);
    });

    svg.append("text")
      .attr("x", xBand(dec) + xBand.bandwidth()/2)
      .attr("y", height-16)
      .attr("text-anchor","middle")
      .attr("font-size", 12)
      .text(dec);
  }
}

function filterByTopic(topic){
  if (topic === "All") return renderTrail(rows);
  renderTrail(rows.filter(d => d.topic === topic));
}

// Use of Generative Artificial Intelligence Tools:
// Tool/Software/Model: OpenAI ChatGPT (GPT-5)
// Use: Helped me write parts of the JavaScript code, fix errors when the code
// did not work, and simplify/reorganize the code to be clearer.
