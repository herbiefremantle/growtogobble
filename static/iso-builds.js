// The Build It guides as 3D models (drawn by iso.js). Each guide: a model() with every piece in mm, grouped, and a list of
// stages (one per step): which groups appear (add), which go away (drop) and any callouts. A stage's new parts are
// highlighted; everything built so far is shown a little pale. units: mm. x = left-right, y = back-front, z = up.
const BUILD3D = (() => {
  const { box, path, sheet } = ISO;
  const CANE = "#c9a35a", STRING = "#7a5230", GREEN = [102, 36, 42], LEAF2 = [96, 32, 50], SOIL = [28, 30, 20], CARD = [34, 38, 64];
  const leaf = (g, x, y, z, s = 90, c = GREEN) => box(g, [x, y, z], [s, s, s * 0.8], { mat: "prop", color: c, tone: 0.5 });
  const bloom = (g, x, y, z, c, s = 56) => box(g, [x, y, z], [s, s, s], { mat: "prop", color: c, tone: 0.5 });
  const peg = (g, x, y) => box(g, [x - 15, y - 15, 0], [30, 30, 220], { mat: "frame", tone: 0.4 });
  const ground = (x0, y0, x1, y1) => box("room", [x0 - 9000, y0 - 9000, -60], [x1 - x0 + 18000, y1 - y0 + 18000, 60], { mat: "grass", tone: 0.5 });
  const ring = (cx, cy, r, z, n = 28) => Array.from({ length: n + 1 }, (_, i) => [cx + r * Math.cos((i / n) * Math.PI * 2), cy + r * Math.sin((i / n) * Math.PI * 2), z]);
  const tie = (g, x, y, z, s = 46) => box(g, [x - s / 2, y - s / 2, z - s / 2], [s, s, s], { mat: "prop", color: [20, 55, 30], tone: 0.5 });

  // ---- wigwams: beans (8 canes in a ring in the ground) and sweet peas (6 canes in a pot) ------------------
  function wigwam({ n, R, H, pot, flowers }) {
    const cx = 1000, cy = 1000, boxes = [ground(-300, -300, 2300, 2300)], paths = [], sheets = [];
    const base = (i, r = R) => [cx + r * Math.cos((i / n) * Math.PI * 2 + 0.3), cy + r * Math.sin((i / n) * Math.PI * 2 + 0.3), pot ? 440 : 0];
    if (pot) {
      boxes.push(box("pot", [cx - 230, cy - 230, 0], [460, 460, 380], { mat: "prop", color: [18, 58, 48], tone: 0.5 }),
                 box("pot", [cx - 255, cy - 255, 380], [510, 510, 55], { mat: "prop", color: [18, 55, 54], tone: 0.5 }),
                 box("pot", [cx - 215, cy - 215, 432], [430, 430, 12], { mat: "prop", color: SOIL, tone: 0.5 }));
    } else sheets.push(sheet("mark", ring(cx, cy, R, 4), { fill: "#ffffff", alpha: 0.25, stroke: "#ffffff" }));
    const top = [cx, cy, H], spread = (i) => { const b = base(i); return [cx + (b[0] - cx) * 0.55, cy + (b[1] - cy) * 0.55, H - 240]; };
    for (let i = 0; i < n; i++) {
      const b = base(i), back = b[0] + b[1] < cx + cy;
      paths.push(path("loose", [b, spread(i)], { w: 26, back }), path("canes", [b, [top[0] + (b[0] - cx) * 0.06, top[1] + (b[1] - cy) * 0.06, H]], { w: 26, back }));
    }
    boxes.push(tie("knot", cx, cy, H - 30, 62));
    const sz = pot ? 420 : 600;
    if (pot) { for (let k = 0; k < 3; k++) paths.push(path("string", ring(cx, cy, R * (1 - (k + 1) * 0.2), H * (0.25 + k * 0.22) , 24), { w: 6, color: STRING })); }
    else paths.push(path("string", ring(cx, cy, R * 0.72, H * 0.3, 24), { w: 8, color: STRING }));
    // spiral string for sweet peas
    if (pot) { const pts = []; for (let t = 0; t <= 1.001; t += 0.02) pts.push([cx + R * 0.95 * (1 - t * 0.85) * Math.cos(t * 30), cy + R * 0.95 * (1 - t * 0.85) * Math.sin(t * 30), 450 + t * (H - 560)]); paths.push(path("spiral", pts, { w: 7, color: STRING })); }
    // plants climbing the canes at the front
    for (let i = 0; i < n; i++) {
      const b = base(i); if (b[0] + b[1] < cx + cy - 150) continue;
      const a = [b[0], b[1], b[2] + 20], z2 = [top[0] + (b[0] - cx) * 0.12, top[1] + (b[1] - cy) * 0.12, H * 0.85];
      const lvl = pot ? 1 : 1;
      paths.push(path("plants", [a, [(a[0] + z2[0]) / 2 + 20, (a[1] + z2[1]) / 2 - 20, (a[2] + z2[2]) / 2], z2], { w: 12, color: "#3f8f3a", keep: true }));
      for (let k = 1; k <= 5; k++) { const t = k / 6; boxes.push(leaf("plants", a[0] + (z2[0] - a[0]) * t + (k % 2 ? 36 : -36), a[1] + (z2[1] - a[1]) * t + (k % 2 ? -30 : 30), a[2] + (z2[2] - a[2]) * t, 78, k % 2 ? GREEN : LEAF2)); }
      if (flowers) [0.45, 0.62, 0.78].forEach((t, k) => { const c = [[335, 62, 66], [272, 45, 60], [0, 0, 94]][(i + k) % 3]; boxes.push(bloom("flowers", a[0] + (z2[0] - a[0]) * t + 30, a[1] + (z2[1] - a[1]) * t - 30, a[2] + (z2[2] - a[2]) * t + 10, c, 74)); });
      else boxes.push(bloom("pods", a[0] + (z2[0] - a[0]) * 0.55 + 28, a[1] + (z2[1] - a[1]) * 0.55 - 26, a[2] + (z2[2] - a[2]) * 0.55, [4, 70, 52], 58));
    }
    return { boxes, paths, sheets, center: [cx, cy] };
  }

  const M = {};
  M.bean_wigwam = {
    model: () => wigwam({ n: 8, R: 560, H: 2100 }),
    stages: [
      { add: ["mark"], ann: [{ type: "label", at: [1000, 1560, 4], text: "about 1m across", dx: 1.2, dy: 1 }] },
      { add: ["loose"], drop: ["mark"], keepMark: true },
      { add: ["canes", "knot"], drop: ["loose"], ann: [{ type: "label", at: [1000, 1000, 2060], text: "tie tight here", dx: 1.4, dy: -1 }] },
      { add: ["string"] },
      { add: ["plants", "pods"] },
    ],
  };
  M.sweet_pea_wigwam = {
    model: () => wigwam({ n: 6, R: 170, H: 1800, pot: true, flowers: true }),
    stages: [
      { add: ["pot"], ann: [{ type: "label", at: [1255, 1000, 300], text: "a pot 40cm or wider", dx: 1.6, dy: 1.2 }] },
      { add: ["loose"] },
      { add: ["canes", "knot"], drop: ["loose"], ann: [{ type: "label", at: [1000, 1000, 1760], text: "tie tight here", dx: 1.4, dy: -1 }] },
      { add: ["spiral"], drop: [], ann: [{ type: "label", at: [1130, 1000, 900], text: "wind string round", dx: 1.4, dy: 0.4 }] },
      { add: ["plants"], hideKeep: ["flowers"], ann: [{ type: "label", at: [1180, 1000, 600], text: "2 plants per cane", dx: 1.4, dy: 1.2 }] },
      { add: ["flowers"], ann: [{ type: "label", at: [1100, 1050, 1300], text: "pick every few days", dx: 1.4, dy: -0.4 }] },
    ],
  };

  // ---- raised bed ------------------------------------------------------------------------------------------
  M.raised_bed = {
    model: () => {
      const W = 2400, D = 1200, T = 38, BWD = 150, H = 2 * BWD, P = 50;
      const boxes = [ground(-1500, -900, W + 1200, D + 1900)], paths = [], sheets = [];
      // 1. pegs and string
      [[0, 0], [W, 0], [W, D], [0, D]].forEach(([x, y]) => boxes.push(peg("mark", x, y)));
      paths.push(path("mark", [[0, 0, 150], [W, 0, 150], [W, D, 150], [0, D, 150], [0, 0, 150]], { w: 7, color: "#f4efe4", keep: true }));
      // 2. the cut pieces, laid out in the grass in front
      const px = 0, py0 = D + 420;
      for (let i = 0; i < 4; i++) boxes.push(box("pieces", [px, py0 + i * 180, 0], [W, BWD, T], { tone: 0.2 + i * 0.2 }));
      for (let i = 0; i < 4; i++) boxes.push(box("pieces", [(i % 2) * 1180, py0 + (4 + Math.floor(i / 2)) * 180, 0], [D - 76, BWD, T], { tone: 0.3 + i * 0.15 }));
      for (let i = 0; i < 4; i++) boxes.push(box("pieces", [i * 330, py0 + 6 * 180, 0], [P, P, 300], { mat: "frame", tone: 0.4 }));
      // 3. the ends (two boards high, posts inside the corners), 4. the long sides
      for (const x of [0, W - T]) for (let r = 0; r < 2; r++) boxes.push(box("ends", [x, T, r * BWD], [T, D - 2 * T, BWD], { tone: 0.35 + r * 0.2 + (x ? 0.1 : 0) }));
      for (const x of [x0 => T, x0 => W - T - P]) for (const y of [T, D - T - P]) boxes.push(box("ends", [x(), y, 0], [P, P, H], { mat: "frame", tone: 0.5 }));
      for (const y of [0, D - T]) for (let r = 0; r < 2; r++) boxes.push(box("long", [0, y, r * BWD], [W, T, BWD], { tone: 0.25 + r * 0.25 + (y ? 0.12 : 0) }));
      // 5. a spirit level on top
      boxes.push(box("level", [800, D - T - 60, H], [620, 52, 26], { mat: "prop", color: [44, 90, 55], tone: 0.5 }), box("level", [1070, D - T - 52, H + 26], [70, 36, 12], { mat: "prop", color: [100, 55, 70], tone: 0.5 }));
      // 6. cardboard, compost and the first plants
      boxes.push(box("card", [T, T, 8], [W - 2 * T, D - 2 * T, 8], { mat: "prop", color: CARD, tone: 0.5 }),
                 box("soil", [T, T, 16], [W - 2 * T, D - 2 * T, H - 40], { mat: "prop", color: SOIL, tone: 0.5 }));
      for (let i = 0; i < 6; i++) boxes.push(leaf("plants", 330 + (i % 3) * 700, 360 + Math.floor(i / 3) * 440, H - 30, 150, i % 2 ? GREEN : LEAF2));
      return { boxes, paths, sheets, center: [W / 2, D / 2] };
    },
    stages: [
      { add: ["mark"], ann: [{ type: "dim", from: [0, 0, 150], to: [2400, 0, 150], offset: [0, -240, 0], label: "2.4m" }, { type: "dim", from: [2400, 0, 150], to: [2400, 1200, 150], offset: [260, 0, 0], label: "1.2m" }] },
      { add: ["pieces"], drop: ["mark"], ann: [{ type: "label", at: [1200, 1700, 38], text: "cut all the pieces first", dx: 0.4, dy: 1.6 }] },
      { add: ["ends"], drop: ["pieces"], ann: [{ type: "label", at: [19, 600, 150], text: "2 boards + a post each end", dx: -1, dy: -1.4 }] },
      { add: ["long"], ann: [{ type: "cut", from: [0, 0, 300], to: [2400, 1200, 300], label: "same both ways = square", dx: -0.6, dy: -2 }, { type: "cut", from: [2400, 0, 300], to: [0, 1200, 300] }] },
      { add: ["level"], ann: [{ type: "label", at: [1100, 1130, 330], text: "check it's level", dx: 1, dy: 1.6 }] },
      { add: ["card", "soil", "plants"], drop: ["level"], ann: [{ type: "label", at: [1200, 600, 270], text: "cardboard, then compost to the top", dx: 0.4, dy: -2.2 }] },
    ],
  };


  // a climbing plant up a line from a to z: a wiggly stem, leaf cubes, then flowers or pods
  const climber = (g, a, z, o = {}) => {
    const boxes = [], mid = [(a[0] + z[0]) / 2 + 18, (a[1] + z[1]) / 2 - 18, (a[2] + z[2]) / 2];
    const paths = [path(g, [a, mid, z], { w: 14, color: "#3f8f3a", keep: true, back: o.back })];
    const n = o.leaves || 5;
    for (let k = 1; k <= n; k++) { const t = k / (n + 1); boxes.push(leaf(g, a[0] + (z[0] - a[0]) * t + (k % 2 ? 34 : -34), a[1] + (z[1] - a[1]) * t + (k % 2 ? -26 : 26), a[2] + (z[2] - a[2]) * t, 84, k % 2 ? GREEN : LEAF2)); }
    (o.blooms || []).forEach((c, k) => { const t = 0.4 + k * 0.17; boxes.push(bloom(g, a[0] + (z[0] - a[0]) * t + 30, a[1] + (z[1] - a[1]) * t - 28, a[2] + (z[2] - a[2]) * t + 8, c, o.bs || 62)); });
    return { boxes, paths };
  };
  const stem = (g, x, y, h, w = 44) => box(g, [x - w / 2, y - w / 2, 0], [w, w, h], { mat: "prop", color: [100, 38, 36], tone: 0.5 });
  const bush = (g, x, y, h, fruit) => {
    const out = [stem(g, x, y, h)];
    for (let z = 260, k = 0; z < h; z += 210, k++) { out.push(leaf(g, x - 120, y - 20 + (k % 2) * 40, z, 110, GREEN), leaf(g, x + 40, y - 40 + (k % 2) * 30, z + 60, 110, LEAF2)); }
    out.push(leaf(g, x - 60, y - 60, h - 30, 130, GREEN));
    if (fruit) for (let z = 380, k = 0; z < h - 150; z += 340, k++) out.push(bloom("fruit", x + 40 + (k % 2) * -150, y + 10, z, [4, 74, 50], 84), bloom("fruit", x + 120 + (k % 2) * -170, y - 10, z - 50, [4, 74, 50], 70));
    return out;
  };

  M.bean_aframe = {
    model: () => {
      const xs = [0, 500, 1000, 1500, 2000], boxes = [ground(-400, -600, 2600, 1200)], paths = [];
      for (const y of [0, 600]) { paths.push(path("mark", [[-120, y, 12], [2320, y, 12]], { w: 12, color: "#f4efe4", keep: true })); boxes.push(peg("mark", -120, y), peg("mark", 2320, y)); }
      xs.forEach((x) => {
        paths.push(path("upright", [[x, 0, 0], [x, 90, 1900]], { w: 30, back: true }), path("upright", [[x, 600, 0], [x, 510, 1900]], { w: 30, back: false }));
        paths.push(path("crossed", [[x, 0, 0], [x + 60, 400, 1950]], { w: 30, back: true }), path("crossed", [[x, 600, 0], [x + 60, 200, 1950]], { w: 30, back: false }));
        boxes.push(tie("ties", x + 45, 300, 1460, 54));
        boxes.push(tie("ridgeties", x + 52, 300, 1730, 54));
        for (const [row, ya, yb] of [[0, 0, 400], [1, 600, 200]]) {
          const c = climber("plants", [x + (row ? 8 : 6), row ? 560 : 40, 40], [x + 54, ya === 0 ? 330 : 270, 1600], { leaves: 5, blooms: [[4, 70, 52], [4, 70, 52]], back: row === 0 });
          boxes.push(...c.boxes); paths.push(...c.paths);
        }
      });
      paths.push(path("ridge", [[-140, 300, 1730], [2240, 300, 1730]], { w: 38, back: false }));
      return { boxes, paths, sheets: [], center: [1000, 300] };
    },
    stages: [
      { add: ["mark"], ann: [{ type: "dim", from: [-120, 0, 12], to: [-120, 600, 12], offset: [-240, 0, 0], label: "45-60cm" }] },
      { add: ["upright"], drop: ["mark"], ann: [{ type: "label", at: [0, 600, 1500], text: "a cane every 40cm", dx: -1.2, dy: -0.6 }] },
      { add: ["crossed", "ties"], drop: ["upright"], ann: [{ type: "label", at: [1045, 300, 1460], text: "cross and tie", dx: 1.4, dy: -1.6 }] },
      { add: ["ridge", "ridgeties"], ann: [{ type: "label", at: [2240, 300, 1730], text: "a cane along the top", dx: 1, dy: -1.5 }] },
      { add: ["plants"] },
    ],
  };

  M.pea_frame = {
    model: () => {
      const xs = [0, 1000, 2000, 3000], boxes = [ground(-500, -500, 3500, 600), box("bed", [-120, -260, 0], [3240, 520, 70], { mat: "prop", color: SOIL, tone: 0.5 })], paths = [], sheets = [];
      xs.forEach((x) => paths.push(path("canes", [[x, 0, 0], [x, 0, 1800]], { w: 36, back: false })));
      paths.push(path("topcane", [[-60, 0, 1760], [3060, 0, 1760]], { w: 36, back: false }));
      sheets.push(sheet("net", [[0, 0, 280], [3000, 0, 280], [3000, 0, 1740], [0, 0, 1740]], { fill: "#2f6b2a", alpha: 0.65, hatch: true, stroke: "#2f6b2a" }));
      [250, 600, 950, 1300, 1650, 2000, 2350, 2700].forEach((x, i) => { const c = climber("plants", [x, -80 - (i % 2) * 60, 70], [x + 60, -30, 1500 + (i % 3) * 80], { leaves: 6, blooms: [[0, 0, 96], [0, 0, 96]], bs: 52 }); boxes.push(...c.boxes); paths.push(...c.paths); });
      return { boxes, paths, sheets, center: [1500, 0] };
    },
    stages: [
      { add: ["bed", "canes"], ann: [{ type: "label", at: [1000, 0, 1500], text: "a cane every 1m", dx: -1.4, dy: -1 }] },
      { add: ["topcane"], ann: [{ type: "label", at: [3060, 0, 1760], text: "joins them up", dx: 0.6, dy: -1.6 }] },
      { add: ["net"], ann: [{ type: "label", at: [3000, 0, 1000], text: "tie the net on", dx: 1, dy: 0 }] },
      { add: ["plants"], ann: [] },
    ],
  };

  M.broad_bean_string = {
    model: () => {
      const boxes = [ground(-600, -600, 1800, 1200), box("soil", [-200, -200, 0], [1600, 1000, 60], { mat: "prop", color: SOIL, tone: 0.5 })], paths = [];
      const spots = [[0, 0], [600, 0], [1200, 0], [1200, 600], [600, 600], [0, 600]];
      spots.forEach(([x, y]) => paths.push(path("canes", [[x, y, 60], [x, y, 1260]], { w: 42, back: x + y < 900 })));
      const loop = (z) => [...spots, spots[0]].map(([x, y]) => [x, y, z]);
      paths.push(path("string1", loop(320), { w: 11, color: STRING, keep: false }));
      paths.push(path("string2", loop(660), { w: 11, color: STRING }), path("string2", loop(1000), { w: 11, color: STRING }));
      for (const y of [200, 400]) for (let i = 0; i < 5; i++) boxes.push(...bush("plants", 100 + i * 250, y, 900, false));
      return { boxes, paths, sheets: [], center: [600, 300] };
    },
    stages: [
      { add: ["soil", "canes"], ann: [{ type: "label", at: [1200, 600, 1000], text: "a cane at each corner and every metre", dx: 1.4, dy: -1 }] },
      { add: ["string1"], ann: [{ type: "label", at: [1200, 0, 320], text: "string round, 30cm up", dx: 1.4, dy: -1 }] },
      { add: ["string2"], ann: [{ type: "label", at: [1200, 0, 1000], text: "then 60cm and 90cm", dx: 1.4, dy: -1.2 }] },
      { add: ["plants"], ann: [] },
    ],
  };

  M.tomato_stakes = {
    model: () => {
      const xs = [400, 1100, 1800], boxes = [ground(-600, -700, 2800, 700), box("soil", [0, -300, 0], [2200, 600, 60], { mat: "prop", color: SOIL, tone: 0.5 })], paths = [];
      xs.forEach((x) => {
        paths.push(path("canes", [[x + 90, -20, 60], [x + 90, -20, 1850]], { w: 40, back: false }));
        boxes.push(stem("small", x, 0, 520), leaf("small", x - 90, -40, 300, 100), leaf("small", x + 20, -30, 400, 100, LEAF2), leaf("small", x - 40, -50, 500, 120));
        boxes.push(...bush("plants", x, 0, 1500, false));
        boxes.push(...bush("fruitplants", x, 0, 1500, true).filter((b) => b.group === "fruit"));
        for (const z of [520, 920, 1320]) boxes.push(box("ties", [x + 28, -30, z], [92, 40, 40], { mat: "prop", color: [20, 55, 30], tone: 0.5 }));
      });
      return { boxes, paths, sheets: [], center: [1100, 0] };
    },
    stages: [
      { add: ["soil", "canes"], ann: [{ type: "label", at: [490, -20, 1500], text: "cane in first - 30cm deep", dx: -1.6, dy: -1 }] },
      { add: ["small"], ann: [] },
      { add: ["plants", "ties"], drop: ["small"], ann: [{ type: "label", at: [1170, -30, 940], text: "loose figure-of-eight", dx: 1.4, dy: 0.6 }] },
      { add: ["fruit"], ann: [{ type: "label", at: [1100, 0, 1000], text: "pinch out side shoots", dx: -1.6, dy: -1.4 }] },
    ],
  };

  M.tomato_strings = {
    model: () => {
      const xs = [500, 1200, 1900], boxes = [ground(-600, -700, 3000, 700)], paths = [];
      boxes.push(box("frame", [-30, 0, 0], [60, 60, 2300], { mat: "frame", tone: 0.5 }), box("frame", [2370, 0, 0], [60, 60, 2300], { mat: "frame", tone: 0.5 }), box("frame", [-60, 0, 2300], [2580, 60, 60], { mat: "frame", tone: 0.6 }));
      boxes.push(box("bags", [150, -160, 0], [2100, 330, 100], { mat: "prop", color: [220, 8, 16], tone: 0.5 }));
      xs.forEach((x) => {
        paths.push(path("strings", [[x, 30, 2300], [x, 30, 100]], { w: 12, color: STRING, back: false }));
        boxes.push(...bush("plants", x + 40, 10, 900, false).map((b) => ({ ...b, group: "plants" })));
        boxes.push(...bush("tall", x + 40, 10, 1700, true).map((b) => ({ ...b, group: b.group === "fruit" ? "fruit" : "tall" })));
        const tw = []; for (let z = 150; z <= 1900; z += 80) tw.push([x + 40 + 70 * Math.sin(z / 90), 10 + 50 * Math.cos(z / 90), z]);
        paths.push(path("twist", tw, { w: 10, color: "#6b4a2b", back: false }));
      });
      return { boxes, paths, sheets: [], center: [1100, 30] };
    },
    stages: [
      { add: ["frame"], ann: [{ type: "label", at: [1200, 30, 2330], text: "a bar overhead", dx: 0.3, dy: -1.6 }] },
      { add: ["strings", "bags"], ann: [{ type: "label", at: [1200, 30, 1500], text: "string tied to the bar", dx: 1.5, dy: -0.4 }] },
      { add: ["plants"], ann: [{ type: "label", at: [1240, 10, 200], text: "loop round the stem base", dx: 1.4, dy: 1.4 }] },
      { add: ["tall", "fruit", "twist"], drop: ["plants"], ann: [{ type: "label", at: [1200, 30, 1100], text: "twist it round weekly", dx: 1.6, dy: 0.4 }] },
    ],
  };

  M.hoop_tunnel = {
    model: () => {
      const xs = [100, 700, 1300, 1900, 2300], boxes = [ground(-600, -700, 3200, 2400), box("bed", [0, 0, 0], [2400, 1200, 240], { mat: "prop", color: SOIL, tone: 0.5 })], paths = [], sheets = [];
      const arc = (x, n = 12) => Array.from({ length: n + 1 }, (_, i) => { const t = i / n; return [x, -70 + 1340 * t, 260 + 800 * Math.sin(Math.PI * t)]; });
      for (let i = 0; i < 5; i++) paths.push(path("pipes", [[0, 1500 + i * 120, 30], [1700, 1500 + i * 120, 30]], { w: 44, color: "#2e2e2e", back: false }));
      xs.forEach((x) => { paths.push(path("hoops", arc(x), { w: 46, color: "#2e2e2e", back: false })); for (const y of [-70, 1270]) paths.push(path("stubs", [[x, y, 0], [x, y, 380]], { w: 34, back: y < 0 })); });
      for (let i = 0; i < 12; i++) boxes.push(leaf("seedlings", 150 + (i % 6) * 400, 250 + Math.floor(i / 6) * 600, 240, 90, i % 2 ? GREEN : LEAF2));
      sheets.push(sheet("cover", [...arc(100), ...arc(2300).reverse()], { fill: "#7fb86a", alpha: 0.34, hatch: true, stroke: "#ffffff" }));
      for (let i = 0; i < 7; i++) for (const y of [-120, 1270]) boxes.push(box("edges", [i * 400 - 60, y, 0], [160, 70, 70], { mat: "prop", color: [10, 52, 44], tone: 0.5 }));
      return { boxes, paths, sheets, center: [1200, 600] };
    },
    stages: [
      { add: ["bed", "pipes"], ann: [{ type: "label", at: [850, 1620, 30], text: "cut pipe into 1.6m lengths", dx: 0.4, dy: 1.6 }] },
      { add: ["stubs", "seedlings"], drop: ["pipes"], ann: [{ type: "label", at: [700, -70, 380], text: "canes every 1m, both sides", dx: -1.3, dy: -1.6 }] },
      { add: ["hoops"], ann: [{ type: "label", at: [1300, 600, 1060], text: "pipe slides over the canes", dx: 0.6, dy: -2 }] },
      { add: ["cover"], ann: [{ type: "label", at: [1200, 1270, 700], text: "pull it taut - no gaps", dx: 1.2, dy: 1.4 }] },
      { add: ["edges"], ann: [{ type: "label", at: [1500, 1270, 70], text: "bricks hold the edges down", dx: 0.8, dy: 1.6 }] },
    ],
  };

  M.bottle_cloche = {
    model: () => {
      const boxes = [ground(-800, -800, 1600, 1600)], paths = [];
      const blue = [205, 70, 78];
      const bottle = (g, x, y, cut) => [
        box(g, [x - 120, y - 120, 0], [240, 240, cut ? 190 : 330], { mat: "prop", color: blue, tone: 0.5, alpha: 0.45 }),
        ...(cut ? [] : [box(g, [x - 55, y - 55, 330], [110, 110, 85], { mat: "prop", color: blue, tone: 0.5, alpha: 0.5 }), box(g, [x - 40, y - 40, 415], [80, 80, 40], { mat: "prop", color: [215, 80, 52], tone: 0.5 })]),
      ];
      boxes.push(box("soil", [-380, -380, 0], [760, 760, 90], { mat: "prop", color: SOIL, tone: 0.5 }), leaf("seedling", -45, -35, 90, 90), leaf("seedling", 20, 5, 100, 70, LEAF2));
      boxes.push(...bottle("b1", 800, -250), box("b1", [682, -372, 90], [236, 236, 130], { mat: "prop", color: [48, 75, 66], tone: 0.5 }));
      boxes.push(...bottle("b2", 800, -250).slice(0, 1).map((b) => ({ ...b, group: "b2", dz: 190 })), box("b2", [680, -370, 190], [240, 240, 30], { mat: "prop", color: blue, tone: 0.5, alpha: 0.25 }));
      boxes.push(box("b2", [680, 30, 0], [240, 240, 140], { mat: "prop", color: blue, tone: 0.5, alpha: 0.45 }));
      boxes.push(box("cloche", [-130, -130, 90], [260, 260, 330], { mat: "prop", color: blue, tone: 0.5, alpha: 0.4 }), box("cloche", [-60, -60, 420], [120, 120, 70], { mat: "prop", color: blue, tone: 0.5, alpha: 0.45 }));
      boxes.push(box("lid", [-42, -42, 490], [84, 84, 38], { mat: "prop", color: [215, 80, 52], tone: 0.5 }));
      boxes.push(box("lidoff", [330, 120, 90], [90, 90, 38], { mat: "prop", color: [215, 80, 52], tone: 0.5 }));
      paths.push(path("cane", [[250, -250, 90], [250, -250, 640]], { w: 36, back: false }), path("cut", [[680, -370, 190], [920, -370, 190], [920, -130, 190], [680, -130, 190], [680, -370, 190]], { w: 8, color: "#c0392b", keep: true }));
      return { boxes, paths, sheets: [], center: [0, 0] };
    },
    stages: [
      { add: ["soil", "seedling", "b1"], ann: [{ type: "label", at: [800, -250, 250], text: "peel the label off", dx: 1.2, dy: -1.4 }] },
      { add: ["b2"], drop: ["b1"], ann: [{ type: "cut", from: [680, -370, 190], to: [920, -370, 190], label: "cut the bottom off", dx: 0.8, dy: -1.8 }] },
      { add: ["cloche", "lid"], drop: ["b2"], ann: [{ type: "label", at: [130, 130, 200], text: "2cm into the soil", dx: 1.6, dy: 1.2 }] },
      { add: ["lidoff", "cane"], drop: ["lid"], ann: [{ type: "label", at: [375, 165, 130], text: "lid off on warm days", dx: 1.4, dy: 1.4 }] },
    ],
  };

  M.cold_frame = {
    model: () => {
      const W = 1200, D = 600, boxes = [ground(-800, -1000, 2000, 2200)], paths = [], sheets = [];
      const wood = [[4, 0, 0], [3, 0, 0]];
      // 1. the cut pieces
      for (let i = 0; i < 3; i++) boxes.push(box("pieces", [0, D + 400 + i * 175, 0], [W, 150, 22], { tone: 0.3 + i * 0.2 }));
      for (let i = 0; i < 4; i++) boxes.push(box("pieces", [1400 + (i % 2) * 330, D + 400 + Math.floor(i / 2) * 175, 0], [D - 50, 150, 22], { tone: 0.35 + i * 0.1 }));
      for (let i = 0; i < 4; i++) boxes.push(box("pieces", [-500, i * 130 - 250, 0], [i < 2 ? 300 : 150, 50, 50], { mat: "frame", tone: 0.5 }));
      // 2. corner posts (taller at the back)
      for (const [x, y, h] of [[0, 22, 300], [W - 50, 22, 300], [0, D - 72, 150], [W - 50, D - 72, 150]]) boxes.push(box("posts", [x, y, 0], [50, 50, h], { mat: "frame", tone: 0.5 }));
      // 3. the box: two boards at the back, one at the front, sloped sides
      for (let r = 0; r < 2; r++) boxes.push(box("box", [0, 0, r * 150], [W, 22, 150], { tone: 0.3 + r * 0.2 }));
      boxes.push(box("box", [0, D - 22, 0], [W, 22, 150], { tone: 0.45 }));
      for (const x of [0, W]) sheets.push(sheet("box", [[x, 0, 0], [x, D, 0], [x, D, 150], [x, 0, 300]], { fill: "#c79a62", alpha: 1, stroke: "#8e6838", keep: true }));
      boxes.push(box("soilbox", [22, 22, 0], [W - 44, D - 44, 120], { mat: "prop", color: SOIL, tone: 0.5 }));
      for (let i = 0; i < 6; i++) boxes.push(leaf("seedlings", 150 + (i % 3) * 400, 160 + Math.floor(i / 3) * 260, 120, 100, i % 2 ? GREEN : LEAF2));
      // 4. the lid, closed; 5. propped open
      const lid = (o) => [[0, 0, 300], [W, 0, 300], [W, D, 150], [0, D, 150]].map((p) => p);
      sheets.push(sheet("lid", lid(), { fill: "#bfe3f2", alpha: 0.5, stroke: "#c79a62" }));
      for (const [a, b] of [[[0, 0, 300], [W, 0, 300]], [[W, 0, 300], [W, D, 150]], [[W, D, 150], [0, D, 150]], [[0, D, 150], [0, 0, 300]]]) paths.push(path("lid", [a, b], { w: 46, color: "#c79a62", back: false }));
      const open = [[0, 0, 300], [W, 0, 300], [W, -280, 800], [0, -280, 800]];
      sheets.push(sheet("lidopen", open, { fill: "#bfe3f2", alpha: 0.5, stroke: "#c79a62", back: true }));
      for (const [a, b] of [[open[0], open[1]], [open[1], open[2]], [open[2], open[3]], [open[3], open[0]]]) paths.push(path("lidopen", [a, b], { w: 46, color: "#c79a62", back: true }));
      paths.push(path("lidopen", [[900, 40, 300], [900, -170, 640]], { w: 30, color: CANE, back: true }));
      return { boxes, paths, sheets, center: [W / 2, D / 2] };
    },
    stages: [
      { add: ["pieces"], ann: [{ type: "label", at: [600, 1100, 22], text: "3 x 120cm and 4 x 60cm boards", dx: 0.6, dy: 1.6 }] },
      { add: ["posts"], drop: ["pieces"], ann: [{ type: "label", at: [25, 22, 300], text: "taller at the back", dx: -1.4, dy: -1.4 }] },
      { add: ["box", "soilbox"], ann: [{ type: "label", at: [1200, 300, 225], text: "sides slope: 30cm to 15cm", dx: 1.2, dy: -1.6 }] },
      { add: ["lid"], ann: [{ type: "label", at: [600, 300, 225], text: "frame + clear sheet", dx: 0.4, dy: -2 }] },
      { add: ["lidopen", "seedlings"], drop: ["lid"], ann: [{ type: "label", at: [600, 150, 130], text: "low side faces south", dx: 0.4, dy: 1.8 }] },
    ],
  };

  M.staging = {
    model: () => {
      const W = 1200, D = 500, H = 750, boxes = [ground(-800, -800, 2200, 1900)], paths = [];
      const P = 50;
      for (let i = 0; i < 4; i++) boxes.push(box("pieces", [i * 90, D + 350, 0], [P, P, H], { mat: "frame", tone: 0.4 }));   // legs, laid out
      for (let i = 0; i < 4; i++) boxes.push(box("pieces", [500, D + 350 + i * 80, 0], [W, P, 40], { mat: "frame", tone: 0.5 }));
      for (let i = 0; i < 6; i++) boxes.push(box("pieces", [i * 90 + 100, D + 1050, 0], [70, D, 25], { tone: 0.3 + i * 0.1 }));
      const legs = [[0, 0], [W - P, 0], [0, D - P], [W - P, D - P]];
      for (const [x, y] of legs) boxes.push(box("ends", [x, y, 0], [P, P, H], { mat: "frame", tone: 0.5 }));
      for (const x of [0, W - P]) for (const z of [250, H - 50]) boxes.push(box("ends", [x, P, z], [P, D - 2 * P, 40], { mat: "frame", tone: 0.55 }));
      for (const y of [0, D - P]) for (const z of [250, H - 50]) boxes.push(box("longs", [P, y, z], [W - 2 * P, P, 40], { mat: "frame", tone: 0.5 }));
      for (let i = 0; i < 12; i++) boxes.push(box("top", [i * 100 + 5, -10, H - 10], [70, D + 20, 25], { tone: 0.25 + (i % 5) * 0.12 }));
      for (let i = 0; i < 12; i++) boxes.push(box("shelf", [i * 100 + 5, -10, 230], [70, D + 20, 22], { tone: 0.3 + (i % 5) * 0.1 }));
      for (const [x, y] of [[80, 60], [650, 90]]) { boxes.push(box("trays", [x, y, H + 15], [430, 300, 40], { mat: "prop", color: [220, 6, 20], tone: 0.5 })); for (let k = 0; k < 6; k++) boxes.push(leaf("trays", x + 40 + (k % 3) * 125, y + 50 + Math.floor(k / 3) * 120, H + 55, 70, k % 2 ? GREEN : LEAF2)); }
      for (const [x, y] of [[150, 120], [600, 160], [900, 120]]) boxes.push(box("trays", [x, y, 252], [180, 180, 190], { mat: "prop", color: [16, 58, 46], tone: 0.5 }));
      return { boxes, paths, sheets: [], center: [W / 2, D / 2] };
    },
    stages: [
      { add: ["pieces"], ann: [{ type: "label", at: [60, 850, 750], text: "4 legs, 75cm", dx: -1, dy: -1.4 }, { type: "label", at: [1100, 1100, 20], text: "34 slats, 50cm", dx: 1, dy: 1.2 }] },
      { add: ["ends"], drop: ["pieces"], ann: [{ type: "label", at: [0, 250, 750], text: "two end frames", dx: -1.2, dy: -1.4 }] },
      { add: ["longs"], ann: [{ type: "label", at: [600, 0, 700], text: "join them with long rails", dx: 0, dy: -2.4 }] },
      { add: ["top"], ann: [{ type: "label", at: [1100, 250, 780], text: "finger-width gaps", dx: 1.2, dy: -1.6 }] },
      { add: ["shelf", "trays"], ann: [{ type: "label", at: [700, 300, 250], text: "shelf for pots", dx: 1.4, dy: 1.6 }] },
    ],
  };

  M.compost_bin = {
    model: () => {
      const A = 1000, boxes = [ground(-1200, -1200, 2200, 2400)], paths = [];
      const pallet = (g, axis, at) => {
        const out = [];
        for (let i = 0; i < 5; i++) {
          const z = 50 + i * 180;
          out.push(axis === "x" ? box(g, [0, at, z], [A, 24, 105], { tone: 0.2 + (i % 3) * 0.2 }) : box(g, [at, 0, z], [24, A, 105], { tone: 0.2 + (i % 3) * 0.2 }));
        }
        for (const o of [0, A / 2 - 45, A - 90]) out.push(axis === "x" ? box(g, [o, at - 40, 0], [90, 40, 900], { mat: "frame", tone: 0.4 }) : box(g, [at - 40, o, 0], [40, 90, 900], { mat: "frame", tone: 0.4 }));
        return out;
      };
      boxes.push(box("spot", [-120, -120, 0], [A + 240, A + 240, 14], { mat: "prop", color: [26, 28, 24], tone: 0.5 }));
      boxes.push(...pallet("back", "x", 40), ...pallet("left", "z", 40), ...pallet("right", "z", A - 24), ...pallet("gate", "x", A - 24).map((b) => ({ ...b, y: b.y + 760, x: b.x + 520 })));
      for (const z of [120, 450, 780]) boxes.push(box("ties", [40, 40, z], [50, 50, 40], { mat: "prop", color: [0, 0, 12], tone: 0.5 }), box("ties", [A - 70, 40, z], [50, 50, 40], { mat: "prop", color: [0, 0, 12], tone: 0.5 }));
      for (const x of [130, A - 130]) boxes.push(box("stakes", [x - 25, A - 60, 0], [50, 50, 800], { mat: "frame", tone: 0.5 }));
      paths.push(path("gate", [[A - 60, A, 450], [A + 480, A + 780, 450]], { w: 12, color: STRING, back: false }));
      ["#6fae4a", "#a77b4d", "#6fae4a", "#a77b4d", "#6fae4a"].forEach((c, i) => boxes.push(box("fill", [70, 70, 20 + i * 150], [A - 140, A - 140, 150], { mat: "prop", color: i % 2 ? [32, 46, 34] : [100, 40, 44], tone: 0.5 })));
      boxes.push(box("lid", [-60, -60, 780], [A + 120, A + 120, 36], { mat: "prop", color: [350, 30, 28], tone: 0.5 }));
      return { boxes, paths, sheets: [], center: [A / 2, A / 2] };
    },
    stages: [
      { add: ["spot"], ann: [{ type: "label", at: [500, 1100, 14], text: "bare soil, part shade", dx: 0.4, dy: 1.8 }] },
      { add: ["back", "left", "ties"], ann: [{ type: "label", at: [60, 60, 600], text: "3 ties per corner", dx: -1.6, dy: -1.4 }] },
      { add: ["right", "stakes"], ann: [{ type: "label", at: [1000, 500, 800], text: "stakes hold the front corners", dx: 1, dy: -1.8 }] },
      { add: ["gate"], ann: [{ type: "label", at: [1480, 1780, 500], text: "tied on one side - it opens", dx: 1.2, dy: 0.2 }] },
      { add: ["fill", "lid"], drop: ["gate"], ann: [{ type: "label", at: [500, 500, 816], text: "half green, half brown, then a lid", dx: 0.4, dy: -2.2 }] },
    ],
  };

  M.water_butt = {
    model: () => {
      const PX = 1900, boxes = [ground(-1800, -1500, 3800, 2200), box("room", [-1500, -420, 0], [4600, 420, 2400], { mat: "prop", color: [28, 24, 82], tone: 0.5 })], paths = [];
      const pipe = (g, z0, z1) => box(g, [PX, 0, z0], [90, 90, z1 - z0], { mat: "prop", color: [210, 4, 40], tone: 0.5 });
      boxes.push(box("spot", [1100, 120, 0], [900, 560, 20], { mat: "prop", color: [30, 8, 66], tone: 0.5 }));
      boxes.push(pipe("pipe", 0, 2300), pipe("pipetop", 1760, 2300), pipe("pipelow", 0, 1380), box("diverter", [PX - 20, -20, 1380], [130, 130, 380], { mat: "prop", color: [210, 6, 16], tone: 0.5 }));
      for (let l = 0; l < 2; l++) for (let i = 0; i < 2; i++) for (let j = 0; j < 2; j++) boxes.push(box("blocks", [1180 + i * 440, 160 + j * 215, l * 215], [440, 215, 215], { mat: "prop", color: [40, 6, 66 + ((i + j + l) % 2) * 5], tone: 0.5 }));
      boxes.push(box("butt", [1230, 190, 430], [560, 400, 800], { mat: "prop", color: [140, 34, 26], tone: 0.5 }), box("butt", [1215, 175, 1230], [590, 430, 50], { mat: "prop", color: [140, 36, 22], tone: 0.5 }), box("butt", [1430, 592, 560], [120, 70, 70], { mat: "prop", color: [0, 0, 8], tone: 0.5 }));
      boxes.push(box("lid", [1245, 205, 1280], [530, 370, 40], { mat: "prop", color: [140, 38, 18], tone: 0.5 }));
      boxes.push(box("can", [1340, 800, 0], [220, 160, 200], { mat: "prop", color: [210, 70, 52], tone: 0.5 }), box("can", [1520, 840, 90], [200, 40, 30], { mat: "prop", color: [210, 70, 52], tone: 0.5 }));
      paths.push(path("hose", [[PX - 30, 50, 1500], [1700, 120, 1500], [1560, 300, 1340]], { w: 36, color: "#1d1d1d", back: false }));
      for (const [x, z] of [[2300, 2100], [2600, 1700], [900, 2000], [500, 1500], [200, 2100], [2400, 900]]) paths.push(path("rain", [[x, 30, z], [x - 40, 30, z - 150]], { w: 14, color: "#5b9bc4", keep: true }));
      paths.push(path("markline", [[PX - 110, -20, 1380], [PX + 200, -20, 1380]], { w: 14, color: "#c0392b", keep: true, back: false }));
      return { boxes, paths, sheets: [], center: [1500, 300] };
    },
    stages: [
      { add: ["pipe", "spot"], ann: [{ type: "label", at: [1500, 400, 20], text: "a level spot by the pipe", dx: -1, dy: 1.6 }] },
      { add: ["blocks"], ann: [{ type: "label", at: [1180, 380, 400], text: "room for a can under the tap", dx: -1, dy: 1.2 }] },
      { add: ["butt", "lid"], ann: [{ type: "label", at: [1800, 20, 1380], text: "mark the butt's top on the pipe", dx: -1.2, dy: -1.8 }] },
      { add: ["pipetop", "pipelow", "diverter"], drop: ["pipe"], ann: [{ type: "label", at: [1945, 45, 1560], text: "cut a gap, fit the diverter", dx: 1.1, dy: -1.4 }] },
      { add: ["hose", "can", "rain"], ann: [{ type: "label", at: [1700, 120, 1500], text: "full? rain carries on down", dx: -1.2, dy: -1.8 }] },
    ],
  };

  // ---- the render: which groups show at a stage -------------------------------------------------------------
  function render(id, stage, plain) {
    const spec = M[id]; if (!spec) return "";
    ISO.resetTones(11);
    const m = spec.model(), stages = spec.stages, n = Math.min(Math.max(1, stage), stages.length);
    const groups = new Set([...m.boxes, ...m.paths, ...m.sheets].map((x) => x.group));
    const shown = new Set(["room"]);
    for (let i = 0; i < n; i++) { (stages[i].add || []).forEach((g) => shown.add(g)); (stages[i].drop || []).forEach((g) => { if (!(stages[i].keepMark && g === "mark")) shown.delete(g); }); }
    if (plain) { for (const g of ["mark", "pieces", "loose", "level"]) shown.delete(g); }
    const cur = stages[n - 1];
    const hide = [...groups].filter((g) => !shown.has(g));
    const focus = plain ? null : (cur.focus || cur.add || []).filter((g) => shown.has(g));
    const [cx, cy] = m.center || [0, 0];
    const paths = m.paths.map((p) => (p.back !== undefined || p.pts.length > 2 ? p : { ...p, back: p.pts[0][0] + p.pts[0][1] < cx + cy }));
    // frame every step of a guide the same: round everything that ever appears in it
    return ISO.scene({ frame: plain ? null : [...groups], boxes: m.boxes, paths, sheets: m.sheets, hide, focus: focus && focus.length ? focus : null, annotations: plain ? [] : cur.ann || [], title: spec.title || id, pad: plain ? 0.06 : 0.07 });
  }
  return { models: M, render, has: (id) => !!M[id] };
})();
