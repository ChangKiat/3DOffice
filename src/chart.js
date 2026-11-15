// A small pop-out card that draws a simple chart sent with a reply.
//
// A chart is { title, type: 'bar' | 'line', unit, labels: [...],
// series: [{ name, values: [...] }] } with one to three series (see the
// show_chart tool in server/chat.js). Bars are for comparing categories, lines
// for a trend over time. The card also has a table view of the same numbers.

const SVG_NS = 'http://www.w3.org/2000/svg';
const WIDTH = 304; // drawing width of the line chart, in SVG units
const HEIGHT = 150;
const PAD = { top: 10, right: 44, bottom: 20, left: 6 };

const svg = (tag, attrs = {}) => {
  const node = document.createElementNS(SVG_NS, tag);
  for (const [key, value] of Object.entries(attrs)) node.setAttribute(key, value);
  return node;
};
const el = (tag, className, text) => {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
};

function formatter(unit) {
  const number = new Intl.NumberFormat('en-MY', { maximumFractionDigits: 2 });
  const compact = new Intl.NumberFormat('en-MY', { notation: 'compact', maximumFractionDigits: 1 });
  const wrap = (text) => {
    if (!unit) return text;
    return /^(rm|myr|usd|\$)$/i.test(unit) ? `${unit} ${text}` : `${text} ${unit}`;
  };
  return {
    full: (value) => wrap(number.format(value)),
    short: (value) => (Math.abs(value) >= 10_000 ? compact.format(value) : number.format(value)),
    // One style for a whole axis: compact if its top reaches 10,000, in full otherwise.
    tick: (value, top) => (Math.abs(top) >= 10_000 ? compact.format(value) : number.format(value)),
  };
}

const STEPS = [1, 1.2, 1.5, 2, 2.5, 3, 4, 5, 6, 8, 10];

// A round number at or above `value`, for the top of an axis.
function niceCeiling(value) {
  if (value <= 0) return 1;
  const power = 10 ** Math.floor(Math.log10(value));
  return STEPS.find((step) => step * power >= value - 1e-9) * power;
}

// A round number at or below `value`, for the bottom of an axis.
function niceFloor(value) {
  if (value <= 0) return 0;
  const power = 10 ** Math.floor(Math.log10(value));
  return [...STEPS].reverse().find((step) => step * power <= value + 1e-9) * power;
}

function legend(series) {
  const box = el('div', 'chart-legend');
  series.forEach((item, i) => {
    const entry = el('span', 'chart-legend-item');
    entry.append(el('span', `chart-swatch series-${i + 1}`), document.createTextNode(item.name));
    box.append(entry);
  });
  return box;
}

// Horizontal bars: one row per label, one bar per series, value at the tip.
function drawBars(spec, format) {
  const root = el('div', 'chart-bars');
  const max = Math.max(...spec.series.flatMap((item) => item.values.map((v) => Math.max(0, v))), 0) || 1;

  spec.labels.forEach((label, row) => {
    const line = el('div', 'chart-row');
    const name = el('div', 'chart-row-label', label);
    name.title = label;
    const bars = el('div', 'chart-row-bars');
    spec.series.forEach((item, i) => {
      const value = item.values[row];
      const track = el('div', 'chart-track');
      const bar = el('div', `chart-bar series-${i + 1}`);
      bar.style.width = `${(Math.max(0, value) / max) * 100}%`;
      track.append(bar, el('span', 'chart-value', format.short(value)));
      track.title = `${label}${spec.series.length > 1 ? ` · ${item.name}` : ''}: ${format.full(value)}`;
      bars.append(track);
    });
    line.append(name, bars);
    root.append(line);
  });
  return root;
}

// Lines over time, with a crosshair and tooltip on hover.
function drawLines(spec, format) {
  const root = el('div', 'chart-lines');
  const count = spec.labels.length;
  const values = spec.series.flatMap((item) => item.values);
  const top = niceCeiling(Math.max(...values, 0));
  // A line shows change, so the axis starts near the lowest value when every
  // value is well above zero; otherwise the trend is squashed flat.
  const lowest = Math.min(...values);
  const bottom = lowest <= 0 ? lowest : lowest >= top * 0.5 ? niceFloor(lowest) : 0;
  const innerWidth = WIDTH - PAD.left - PAD.right;
  const innerHeight = HEIGHT - PAD.top - PAD.bottom;
  const x = (i) => PAD.left + (count === 1 ? innerWidth / 2 : (i / (count - 1)) * innerWidth);
  const y = (value) => PAD.top + (1 - (value - bottom) / (top - bottom || 1)) * innerHeight;

  const chart = svg('svg', { viewBox: `0 0 ${WIDTH} ${HEIGHT}`, class: 'chart-svg', role: 'img' });
  chart.setAttribute('aria-label', spec.title);

  // Recessive grid with value ticks on the right, where the lines end.
  for (const tick of [bottom, (top + bottom) / 2, top]) {
    chart.append(svg('line', { x1: PAD.left, x2: PAD.left + innerWidth, y1: y(tick), y2: y(tick), class: 'chart-grid' }));
    const label = svg('text', { x: WIDTH - 2, y: y(tick) + 3, class: 'chart-tick', 'text-anchor': 'end' });
    label.textContent = format.tick(tick, top);
    chart.append(label);
  }
  // First, middle and last labels along the bottom.
  const ticks = count > 2 ? [0, Math.floor((count - 1) / 2), count - 1] : [...Array(count).keys()];
  for (const i of ticks) {
    const anchor = i === 0 ? 'start' : i === count - 1 ? 'end' : 'middle';
    const label = svg('text', { x: x(i), y: HEIGHT - 5, class: 'chart-tick', 'text-anchor': anchor });
    label.textContent = spec.labels[i];
    chart.append(label);
  }

  spec.series.forEach((item, s) => {
    const points = item.values.map((value, i) => `${x(i).toFixed(1)},${y(value).toFixed(1)}`).join(' ');
    chart.append(svg('polyline', { points, class: `chart-line series-${s + 1}` }));
    // End dot with a ring in the surface colour so it stays clear of the line.
    const last = count - 1;
    chart.append(svg('circle', { cx: x(last), cy: y(item.values[last]), r: 4, class: `chart-dot series-${s + 1}` }));
  });

  // Hover layer: a crosshair and a dot per series at the nearest point.
  const cross = svg('line', { y1: PAD.top, y2: PAD.top + innerHeight, class: 'chart-cross', visibility: 'hidden' });
  const dots = spec.series.map((_, s) => svg('circle', { r: 4, class: `chart-dot series-${s + 1}`, visibility: 'hidden' }));
  const hit = svg('rect', { x: 0, y: 0, width: WIDTH, height: HEIGHT, fill: 'transparent' });
  chart.append(cross, ...dots, hit);

  const tip = el('div', 'chart-tip');
  tip.hidden = true;
  const hide = () => {
    tip.hidden = true;
    cross.setAttribute('visibility', 'hidden');
    dots.forEach((dot) => dot.setAttribute('visibility', 'hidden'));
  };
  hit.addEventListener('pointermove', (event) => {
    const box = chart.getBoundingClientRect();
    const at = ((event.clientX - box.left) / box.width) * WIDTH;
    const i = Math.min(count - 1, Math.max(0, Math.round(((at - PAD.left) / innerWidth) * (count - 1))));
    cross.setAttribute('x1', x(i));
    cross.setAttribute('x2', x(i));
    cross.setAttribute('visibility', 'visible');
    tip.replaceChildren(el('div', 'chart-tip-title', spec.labels[i]));
    spec.series.forEach((item, s) => {
      dots[s].setAttribute('cx', x(i));
      dots[s].setAttribute('cy', y(item.values[i]));
      dots[s].setAttribute('visibility', 'visible');
      const row = el('div', 'chart-tip-row');
      row.append(el('span', `chart-swatch series-${s + 1}`), document.createTextNode(
        `${spec.series.length > 1 ? `${item.name}: ` : ''}${format.full(item.values[i])}`,
      ));
      tip.append(row);
    });
    tip.hidden = false;
    // Keep the tooltip on the side of the crosshair that has room.
    const px = (x(i) / WIDTH) * box.width;
    tip.style.left = px < box.width / 2 ? `${px + 10}px` : '';
    tip.style.right = px < box.width / 2 ? '' : `${box.width - px + 10}px`;
  });
  hit.addEventListener('pointerleave', hide);

  root.append(chart, tip);
  return root;
}

function drawTable(spec, format) {
  const table = el('table', 'chart-table');
  const head = el('tr');
  head.append(el('th', '', ''), ...spec.series.map((item) => el('th', '', item.name)));
  table.append(head);
  spec.labels.forEach((label, row) => {
    const line = el('tr');
    line.append(el('td', '', label), ...spec.series.map((item) => el('td', 'number', format.full(item.values[row]))));
    table.append(line);
  });
  const wrap = el('div', 'chart-table-wrap');
  wrap.append(table);
  return wrap;
}

export function createChartPopout() {
  const card = el('aside', 'chart-pop');
  card.hidden = true;
  document.body.append(card);

  function show(spec, speaker) {
    const format = formatter(spec.unit);
    const header = el('header', 'chart-head');
    const titles = el('div');
    titles.append(el('div', 'chart-title', spec.title));
    const subtitle = [speaker, spec.unit && `in ${spec.unit}`].filter(Boolean).join(' · ');
    if (subtitle) titles.append(el('div', 'chart-subtitle', subtitle));

    const tableButton = el('button', 'chart-button', 'Table');
    tableButton.type = 'button';
    const close = el('button', 'chart-button', '×');
    close.type = 'button';
    close.setAttribute('aria-label', 'Close chart');
    header.append(titles, tableButton, close);

    const body = el('div', 'chart-body');
    const plot = spec.type === 'line' ? drawLines(spec, format) : drawBars(spec, format);
    const table = drawTable(spec, format);
    table.hidden = true;
    body.append(plot, table);

    tableButton.addEventListener('click', () => {
      table.hidden = !table.hidden;
      plot.hidden = !table.hidden;
      tableButton.textContent = table.hidden ? 'Table' : 'Chart';
    });
    close.addEventListener('click', () => {
      card.hidden = true;
    });

    card.replaceChildren(header);
    // One series is named by the title; two or more need a legend.
    if (spec.series.length > 1) card.append(legend(spec.series));
    card.append(body);
    card.hidden = false;
    // Restart the pop-in animation.
    card.classList.remove('pop');
    void card.offsetWidth;
    card.classList.add('pop');
  }

  return { show, hide: () => (card.hidden = true) };
}
