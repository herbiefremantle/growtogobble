// Isometric drawings for Build It: every piece of wood is a real 3D box, drawn with three shaded faces, wood grain that
// follows the piece, a soft ground shadow and callout labels - the same look as Mill Makes. (Ported from its renderer.)
//
// Units are mm. Axes: x = left to right, y = back (0) to front, z = up. The viewer looks from the front-right, above.
//   box(group, [x,y,z], [dx,dy,dz], opts)   one piece: opts.mat 'board' | 'frame' | 'prop' | 'grass' | 'steel', opts.color [h,s,l]
//   path(group, [[x,y,z],...], opts)        a cane, string or hoop: opts.w (width), opts.color, opts.back (draw behind the boxes)
//   sheet(group, [[x,y,z],...], opts)       a flat sheet: netting, fleece, glass. opts.fill, opts.alpha, opts.hatch
//   ISO.scene({boxes, paths, sheets, focus, hide, annotations, ...}) returns the picture as an SVG string.
const ISO = (() => {
  const C = Math.cos(Math.PI / 6), S = 0.5;
  const proj = (x, y, z) => [(x - y) * C, (x + y) * S - z];
  let seed = 1;
  const rand = () => { seed = (seed * 16807) % 2147483647; return (seed - 1) / 2147483646; };
  const resetTones = (n = 7) => { seed = n; };
  const box = (group, pos, size, o = {}) => ({ group, x: pos[0], y: pos[1], z: pos[2], dx: size[0], dy: size[1], dz: size[2],
    mat: o.mat || "board", tone: o.tone ?? rand(), color: o.color, alpha: o.alpha, bands: o.bands });
  const path = (group, pts, o = {}) => ({ group, pts, w: o.w || 22, color: o.color || "#c9a35a", alpha: o.alpha, back: o.back, dash: o.dash, keep: !!o.keep });
  const sheet = (group, pts, o = {}) => ({ group, pts, fill: o.fill || "#ffffff", alpha: o.alpha ?? 0.45, hatch: o.hatch, stroke: o.stroke, back: !!o.back, keep: !!o.keep });
  const add = (a, b, s = 1) => [a[0] + b[0] * s, a[1] + b[1] * s, a[2] + b[2] * s];
  const num = (v) => (Math.round(v * 100) / 100);

  const corners = (b) => { const out = []; for (const x of [b.x, b.x + b.dx]) for (const y of [b.y, b.y + b.dy]) for (const z of [b.z, b.z + b.dz]) out.push(proj(x, y, z)); return out; };
  const screenBox = (b) => { let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    for (const [x, y] of corners(b)) { x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y); } return { x0, y0, x1, y1 }; };
  // A is behind B (draw first) if it is entirely on the far side along any axis
  const behind = (a, b) => a.x + a.dx <= b.x + 0.01 || a.y + a.dy <= b.y + 0.01 || a.z + a.dz <= b.z + 0.01;
  function depthSort(boxes) {
    const n = boxes.length, sb = boxes.map(screenBox);
    const key = boxes.map((b) => b.x + b.dx / 2 + b.y + b.dy / 2 + b.z + b.dz / 2);
    const incoming = Array.from({ length: n }, () => []);
    for (let i = 0; i < n; i++) for (let j = i + 1; j < n; j++) {
      const A = sb[i], B = sb[j];
      if (A.x1 <= B.x0 || B.x1 <= A.x0 || A.y1 <= B.y0 || B.y1 <= A.y0) continue;
      const ij = behind(boxes[i], boxes[j]), ji = behind(boxes[j], boxes[i]);
      if (ij && !ji) incoming[j].push(i); else if (ji && !ij) incoming[i].push(j);
    }
    const done = new Array(n).fill(false), order = [];
    for (let k = 0; k < n; k++) {
      let pick = -1;
      for (let i = 0; i < n; i++) if (!done[i] && incoming[i].every((p) => done[p]) && (pick < 0 || key[i] < key[pick])) pick = i;
      if (pick < 0) for (let i = 0; i < n; i++) if (!done[i] && (pick < 0 || key[i] < key[pick])) pick = i;  // a cycle: nearest-centre order
      done[pick] = true; order.push(boxes[pick]);
    }
    return order;
  }

  function palette(b, ghost) {
    let h, s, l; const t = b.tone - 0.5;
    if (b.mat === "board") { h = 29 + t * 9; s = 40 + b.tone * 10; l = 57 + t * 12; }
    else if (b.mat === "frame") { h = 26 + t * 4; s = 42; l = 47 + t * 6; }
    else if (b.mat === "grass") { h = 96 + t * 6; s = 34; l = 64; }
    else if (b.mat === "steel") { h = 215; s = 5; l = 30; }
    else [h, s, l] = b.color || [30, 10, 60];
    if (ghost) { s *= 0.25; l = Math.min(90, l + 22); }
    const f = (dl) => `hsl(${h.toFixed(1)} ${s.toFixed(1)}% ${Math.max(4, Math.min(96, l + dl)).toFixed(1)}%)`;
    return { top: f(9), front: f(0), right: f(-12), edge: `hsl(${h.toFixed(1)} ${s.toFixed(1)}% ${Math.max(5, l - 32).toFixed(1)}%)` };
  }
  const longAxis = (b) => (b.dx >= b.dy && b.dx >= b.dz ? "x" : b.dy >= b.dx && b.dy >= b.dz ? "y" : "z");

  function face(m, w, h, fill, ua, va, la, b, id, k, focus, ghost, edge, kind) {
    const isWood = b.mat === "board" || b.mat === "frame";
    const pat = !isWood || ghost ? null : ua === la ? "gu" : va === la ? "gv" : "ge";
    const off = Math.round(b.tone * 900);
    let extras = "";
    if (isWood && !ghost && pat === "gu" && kind !== "right") {
      if (b.tone > 0.62 && w > 600) extras += `<ellipse cx="${num(w * (0.2 + b.tone * 0.5))}" cy="${num(h * 0.5)}" rx="${num(Math.min(26, h * 0.18) * 1.6)}" ry="${num(Math.min(12, h * 0.12))}" fill="${edge}" opacity="0.35"/>`;
      if (b.mat === "board" && kind === "top" && w > 500) {
        const n = 2 + Math.floor(b.tone * 3);
        for (let i = 0; i < n; i++) {
          const u = ((i + 1) / (n + 1)) * w + Math.sin(i * 7 + b.tone * 20) * 40, v = h * (0.25 + 0.5 * ((i * 0.37 + b.tone) % 1));
          extras += `<circle cx="${num(u)}" cy="${num(v)}" r="${num(3.2 * k)}" fill="#2a1a0c" opacity="0.55"/>`;
        }
      }
    }
    const room = b.mat === "grass";
    return `<g transform="matrix(${m.map(num).join(" ")})"><rect width="${num(w)}" height="${num(h)}" fill="${fill}"${b.alpha ? ` fill-opacity="${b.alpha}"` : ""}/>`
      + (b.mat === "grass" && kind === "top" ? `<rect width="${num(w)}" height="${num(h)}" fill="url(#${id}-lawn)"/>` : "")
      + (pat ? `<g transform="${pat === "gv" ? `translate(0 ${-off})` : `translate(${-off} 0)`}"><rect x="${pat === "gv" ? 0 : off}" y="${pat === "gv" ? off : 0}" width="${num(w)}" height="${num(h)}" fill="url(#${id}-${pat})"/></g>` : "")
      + extras
      + (kind === "front" && !ghost && !room ? `<rect width="${num(w)}" height="${num(h)}" fill="url(#${id}-shade)"/>` : "")
      + (!room ? `<rect width="${num(w)}" height="${num(h)}" fill="none" stroke="${focus ? "#b4532a" : edge}" stroke-opacity="${focus ? 1 : ghost ? 0.25 : 0.55}" stroke-width="${focus ? 1.05 : 0.6}" vector-effect="non-scaling-stroke"/>` : "")
      + "</g>";
  }
  function boxShape(b, id, k, focus, ghost) {
    const c = palette(b, ghost), la = longAxis(b);
    const x1 = b.x + b.dx, y1 = b.y + b.dy, z1 = b.z + b.dz;
    const top = [C, S, -C, S, (b.x - b.y) * C, (b.x + b.y) * S - z1];
    const front = [C, S, 0, 1, (b.x - y1) * C, (b.x + y1) * S - z1];
    const right = [-C, S, 0, 1, (x1 - b.y) * C, (x1 + b.y) * S - z1];
    return `<g opacity="${ghost ? 0.6 : 1}">`
      + face(right, b.dy, b.dz, c.right, "y", "z", la, b, id, k, focus, ghost, c.edge, "right")
      + face(front, b.dx, b.dz, c.front, "x", "z", la, b, id, k, focus, ghost, c.edge, "front")
      + face(top, b.dx, b.dy, c.top, "x", "y", la, b, id, k, focus, ghost, c.edge, "top") + "</g>";
  }

  const esc = (t) => String(t).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
  function label(x, y, text, fs, dx = 1, dy = -1) {
    const lx = x + dx * fs * 2.2, ly = y + dy * fs * 2.2, w = text.length * fs * 0.56 + fs * 0.9, left = dx >= 0;
    return `<g><line x1="${num(x)}" y1="${num(y)}" x2="${num(lx)}" y2="${num(ly)}" stroke="#3a332c" stroke-width="1" vector-effect="non-scaling-stroke"/>`
      + `<rect x="${num(left ? lx : lx - w)}" y="${num(ly - fs * 0.8)}" width="${num(w)}" height="${num(fs * 1.6)}" rx="${num(fs * 0.5)}" fill="#fffaf2" stroke="#3a332c" stroke-opacity="0.35" vector-effect="non-scaling-stroke"/>`
      + `<text x="${num(left ? lx + fs * 0.45 : lx - fs * 0.45)}" y="${num(ly + fs * 0.32)}" font-size="${num(fs * 0.9)}" text-anchor="${left ? "start" : "end"}" fill="#2b2620" font-family="Figtree, sans-serif" font-weight="700">${esc(text)}</text></g>`;
  }
  function annotations(items, id, fs) {
    return items.map((a) => {
      if (a.type === "arrow") {
        const [x0, y0] = proj(...a.from), [x1, y1] = proj(...a.to);
        return `<g><line x1="${num(x0)}" y1="${num(y0)}" x2="${num(x1)}" y2="${num(y1)}" stroke="#b4532a" stroke-width="2" stroke-dasharray="6 4" vector-effect="non-scaling-stroke" marker-end="url(#${id}-arrow)"/>${a.label ? label(x1, y1, a.label, fs, a.dx, a.dy) : ""}</g>`;
      }
      if (a.type === "label") { const [x, y] = proj(...a.at); return `<g><circle cx="${num(x)}" cy="${num(y)}" r="${num(fs * 0.18)}" fill="#b4532a"/>${label(x, y, a.text, fs, a.dx, a.dy)}</g>`; }
      if (a.type === "cut") {
        const [x0, y0] = proj(...a.from), [x1, y1] = proj(...a.to);
        return `<g><line x1="${num(x0)}" y1="${num(y0)}" x2="${num(x1)}" y2="${num(y1)}" stroke="#c0392b" stroke-width="2.2" stroke-dasharray="8 5" vector-effect="non-scaling-stroke"/>${a.label ? label((x0 + x1) / 2, (y0 + y1) / 2, a.label, fs, a.dx, a.dy ?? -1.6) : ""}</g>`;
      }
      if (a.type === "dim") {
        const p0 = add(a.from, a.offset || [0, 0, 0]), p1 = add(a.to, a.offset || [0, 0, 0]), [x0, y0] = proj(...p0), [x1, y1] = proj(...p1);
        return `<g stroke="#3a332c" fill="#3a332c"><line x1="${num(x0)}" y1="${num(y0)}" x2="${num(x1)}" y2="${num(y1)}" stroke-width="1" vector-effect="non-scaling-stroke" marker-start="url(#${id}-tick)" marker-end="url(#${id}-tick)"/>`
          + `<text x="${num((x0 + x1) / 2)}" y="${num((y0 + y1) / 2 - fs * 0.4)}" font-size="${num(fs * 0.9)}" text-anchor="middle" stroke="none" font-family="Figtree, sans-serif" font-weight="700">${esc(a.label)}</text></g>`;
      }
      return "";
    }).join("");
  }

  let counter = 0;
  function scene(o) {
    const id = "iso" + ++counter;
    const focusSet = o.focus ? new Set(o.focus) : null, hidden = new Set(o.hide || []);
    const keep = (g) => !hidden.has(g);
    const move = o.move || {};
    const boxes = (o.boxes || []).filter((b) => keep(b.group)).map((b) => { const mv = move[b.group] || [0, 0, 0];
      return { ...b, x: b.x + mv[0], y: b.y + mv[1], z: b.z + mv[2], _focus: focusSet ? focusSet.has(b.group) : false,
               _ghost: focusSet ? !focusSet.has(b.group) && b.mat !== "prop" && b.mat !== "grass" && !b.keep : false }; });
    const paths = (o.paths || []).filter((p) => keep(p.group)).map((p) => ({ ...p, _focus: focusSet ? focusSet.has(p.group) : false, _ghost: focusSet ? !focusSet.has(p.group) && !p.keep : false }));
    const sheets = (o.sheets || []).filter((s) => keep(s.group)).map((s) => ({ ...s, _focus: focusSet ? focusSet.has(s.group) : false, _ghost: focusSet ? !focusSet.has(s.group) && !s.keep : false }));
    const room = boxes.filter((b) => b.group === "room"), items = boxes.filter((b) => b.group !== "room");
    const sorted = depthSort(items), roomSorted = depthSort(room);
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    const grow = ([x, y]) => { x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y); };
    // the frame: what's showing now, plus (so every step of a guide is framed the same) the groups in o.frame
    const framed = new Set(o.frame || []);
    const inFrame = (g) => keep(g) || framed.has(g);
    for (const b of (o.boxes || [])) if (b.group !== "room" && inFrame(b.group)) corners(b).forEach(grow);
    for (const p of (o.paths || [])) if (inFrame(p.group)) for (const q of p.pts) grow(proj(...q));
    for (const s of (o.sheets || [])) if (inFrame(s.group)) for (const q of s.pts) grow(proj(...q));
    const ann = o.annotations || [];
    for (const a of ann) for (const k of ["from", "to", "at"]) if (a[k]) grow(proj(...a[k]));
    const fs = Math.max(x1 - x0, (y1 - y0) * 1.3) / 24;
    for (const a of ann) {   // make room for every label so none is clipped
      const text = a.label || a.text; if (!text || a.type === "dim") continue;
      const at = a.type === "arrow" ? proj(...a.to) : a.type === "cut" ? [(proj(...a.from)[0] + proj(...a.to)[0]) / 2, (proj(...a.from)[1] + proj(...a.to)[1]) / 2] : proj(...a.at);
      const dx = a.dx ?? 1, dy = a.dy ?? (a.type === "cut" ? -1.6 : -1);
      const lx = at[0] + dx * fs * 2.2, ly = at[1] + dy * fs * 2.2, lw = text.length * fs * 0.56 + fs * 0.9;
      grow([dx >= 0 ? lx + lw : lx - lw, ly - fs]); grow([lx, ly + fs]);
    }
    if (!isFinite(x0)) { x0 = y0 = 0; x1 = y1 = 100; }
    const w = x1 - x0, h = y1 - y0, size = Math.max(w, h), p = size * (o.pad ?? 0.08), k = size / 1400, g = Math.max(0.35, k);
    // a soft shadow under everything that touches the ground
    const ground = items.filter((b) => b.z <= 1 && b.mat !== "prop");
    let shadow = "";
    if (o.shadow !== false && ground.length) {
      let gx0 = Infinity, gy0 = Infinity, gx1 = -Infinity, gy1 = -Infinity;
      for (const b of ground) { gx0 = Math.min(gx0, b.x); gy0 = Math.min(gy0, b.y); gx1 = Math.max(gx1, b.x + b.dx); gy1 = Math.max(gy1, b.y + b.dy); }
      const m = size * 0.02, pts = (arr) => arr.map(([x, y]) => proj(x, y, 0).map(num).join(",")).join(" ");
      shadow = `<polygon points="${pts([[gx0 - m, gy0 - m], [gx1 + m * 4, gy0 - m], [gx1 + m * 4, gy1 + m * 2], [gx0 - m, gy1 + m * 2]])}" fill="#3b2a18" opacity="0.22" filter="url(#${id}-blur)"/>`
        + ground.map((b) => `<polygon points="${pts([[b.x, b.y], [b.x + b.dx, b.y], [b.x + b.dx, b.y + b.dy], [b.x, b.y + b.dy]])}" fill="#2a1d10" opacity="0.35" filter="url(#${id}-blur2)"/>`).join("");
    }
    // canes, strings and hoops: back ones go behind the boxes, front ones in front
    const cx = (x0 + x1) / 2;
    const drawPath = (q) => { const pts = q.pts.map((pt) => proj(...pt).map(num).join(",")).join(" ");
      return `<polyline points="${pts}" fill="none" stroke="${q._ghost ? "#d8cdb8" : q.color}" stroke-width="${num(q.w * 1.5)}" stroke-linecap="round" stroke-linejoin="round" opacity="${q.alpha ?? (q._ghost ? 0.7 : 1)}"${q.dash ? ` stroke-dasharray="${q.dash}"` : ""}${q._focus ? ` data-focus="1"` : ""}/>`
        + (q._focus ? `<polyline points="${pts}" fill="none" stroke="#b4532a" stroke-width="${num(q.w * 1.5 + 14)}" stroke-linecap="round" stroke-opacity=".28"/>` : ""); };
    const drawSheet = (q) => `<polygon points="${q.pts.map((pt) => proj(...pt).map(num).join(",")).join(" ")}" fill="${q.fill}" fill-opacity="${q._ghost ? q.alpha * 0.5 : q.alpha}" stroke="${q._focus ? "#b4532a" : q.stroke || "#ffffff"}" stroke-opacity="${q._focus ? 1 : 0.8}" stroke-width="${q._focus ? 1.8 : 1}" vector-effect="non-scaling-stroke"${q.hatch ? ` style="fill:url(#${id}-net)"` : ""}/>`;
    const backs = paths.filter((q) => q.back).sort((a, b) => a.pts[0][0] + a.pts[0][1] - b.pts[0][0] - b.pts[0][1]);
    const fronts = paths.filter((q) => !q.back);
    return `<svg viewBox="${[x0 - p, y0 - p, w + 2 * p, h + 2 * p].map(num).join(" ")}" class="iso" role="img" aria-label="${esc(o.title || "")}" preserveAspectRatio="xMidYMid meet"><title>${esc(o.title || "")}</title>`
      + `<defs>
        <pattern id="${id}-gu" patternUnits="userSpaceOnUse" width="1200" height="64" patternTransform="scale(${num(g)})"><path d="M0 6 C220 2 380 12 620 7 S1000 3 1200 6" stroke="#5a3415" stroke-opacity=".16" stroke-width="2.2" fill="none"/><path d="M0 19 C180 24 420 14 640 20 S980 25 1200 19" stroke="#5a3415" stroke-opacity=".11" stroke-width="3.5" fill="none"/><path d="M0 31 C260 27 460 37 700 31 S1020 27 1200 31" stroke="#5a3415" stroke-opacity=".15" stroke-width="1.6" fill="none"/><path d="M0 44 C200 49 440 39 660 45 S960 50 1200 44" stroke="#5a3415" stroke-opacity=".09" stroke-width="5" fill="none"/><path d="M0 55 C240 51 400 60 640 55 S1040 51 1200 55" stroke="#5a3415" stroke-opacity=".14" stroke-width="1.8" fill="none"/><path d="M300 38 C420 33 520 33 640 38" stroke="#fff6e6" stroke-opacity=".12" stroke-width="4" fill="none"/></pattern>
        <pattern id="${id}-gv" patternUnits="userSpaceOnUse" width="64" height="1200" patternTransform="scale(${num(g)})"><path d="M6 0 C2 220 12 380 7 620 S3 1000 6 1200" stroke="#5a3415" stroke-opacity=".16" stroke-width="2.2" fill="none"/><path d="M19 0 C24 180 14 420 20 640 S25 980 19 1200" stroke="#5a3415" stroke-opacity=".11" stroke-width="3.5" fill="none"/><path d="M31 0 C27 260 37 460 31 700 S27 1020 31 1200" stroke="#5a3415" stroke-opacity=".15" stroke-width="1.6" fill="none"/><path d="M44 0 C49 200 39 440 45 660 S50 960 44 1200" stroke="#5a3415" stroke-opacity=".09" stroke-width="5" fill="none"/><path d="M55 0 C51 240 60 400 55 640 S51 1040 55 1200" stroke="#5a3415" stroke-opacity=".14" stroke-width="1.8" fill="none"/></pattern>
        <pattern id="${id}-ge" patternUnits="userSpaceOnUse" width="240" height="120" patternTransform="scale(${num(g)})">${[14, 30, 46, 62, 80, 98].map((r) => `<circle cx="120" cy="130" r="${r}" fill="none" stroke="#5a3415" stroke-opacity=".22" stroke-width="2"/>`).join("")}</pattern>
        <pattern id="${id}-lawn" patternUnits="userSpaceOnUse" width="900" height="300"><rect width="900" height="150" fill="#fff" fill-opacity=".05"/><path d="M40 60 l30 -40 M260 190 l30 -40 M520 80 l30 -40 M740 230 l30 -40 M360 250 l30 -40" stroke="#2f5e22" stroke-opacity=".25" stroke-width="5" stroke-linecap="round"/></pattern>
        <pattern id="${id}-net" patternUnits="userSpaceOnUse" width="90" height="90"><path d="M0 0 L90 90 M90 0 L0 90" stroke="#2f6b2a" stroke-opacity=".5" stroke-width="3"/></pattern>
        <linearGradient id="${id}-shade" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#fff" stop-opacity=".06"/><stop offset="1" stop-color="#000" stop-opacity=".14"/></linearGradient>
        <filter id="${id}-blur" x="-30%" y="-30%" width="160%" height="160%"><feGaussianBlur stdDeviation="${num(size * 0.018)}"/></filter>
        <filter id="${id}-blur2" x="-30%" y="-30%" width="160%" height="160%"><feGaussianBlur stdDeviation="${num(size * 0.005)}"/></filter>
        <marker id="${id}-arrow" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0 0 L10 5 L0 10 z" fill="#b4532a"/></marker>
        <marker id="${id}-tick" viewBox="0 0 10 10" refX="5" refY="5" markerWidth="8" markerHeight="8" orient="auto"><path d="M5 0 L5 10" stroke="#3a332c" stroke-width="1.5"/></marker></defs>`
      + roomSorted.map((b) => boxShape(b, id, k, false, false)).join("")
      + shadow
      + sheets.filter((q) => q.back).map(drawSheet).join("") + backs.map(drawPath).join("")
      + sorted.map((b) => boxShape(b, id, k, b._focus, b._ghost)).join("")
      + fronts.map(drawPath).join("") + sheets.filter((q) => !q.back).map(drawSheet).join("")
      + annotations(ann, id, fs) + "</svg>";
  }
  return { scene, box, path, sheet, proj, resetTones, add };
})();
