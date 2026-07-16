/*
 * diagram.js
 * ------------------------------------------------------------------
 * Live schematic of the IBIS I/O-buffer model. Redraws in real time
 * (before the user clicks Generate) from a lightweight summary of the
 * current inputs, labelling every component with its present value:
 *   PMOS pull-up, NMOS pull-down, PAD node, C_comp, POWER/GND clamp
 *   diodes, package R/L/C, external pin -- plus a mini pull-up/pull-
 *   down I-V preview.
 *
 * Pure rendering: app.js assembles the `data` summary and calls
 * Diagram.render(data). data === null renders a neutral placeholder.
 * ------------------------------------------------------------------
 */
(function () {
  "use strict";

  function eng(x, unit) {
    if (x == null || !isFinite(x)) return "?";
    const a = Math.abs(x);
    const p = [
      [1e-15, "f"], [1e-12, "p"], [1e-9, "n"], [1e-6, "µ"], [1e-3, "m"],
      [1, ""], [1e3, "k"], [1e6, "M"]
    ];
    let best = p[5];
    for (let i = 0; i < p.length; i++) if (a >= p[i][0]) best = p[i];
    if (a === 0) best = p[5];
    const v = x / best[0];
    return (Math.abs(v) >= 100 ? v.toFixed(0) : v.toFixed(2)) + " " + best[1] + (unit || "");
  }
  const ns = function (t) { return isFinite(t) ? (t * 1e9).toFixed(2) + " ns" : "?"; };

  // ---------- SVG primitives ----------
  function wire(x1, y1, x2, y2) {
    return '<line x1="' + x1 + '" y1="' + y1 + '" x2="' + x2 + '" y2="' + y2 + '" class="w"/>';
  }
  function dot(x, y) { return '<circle cx="' + x + '" cy="' + y + '" r="3.5" class="node"/>'; }
  function txt(x, y, s, cls) { return '<text x="' + x + '" y="' + y + '" class="' + (cls || "lbl") + '">' + s + '</text>'; }

  // Horizontal resistor between (x1) and (x2) at y.
  function resistorH(x1, x2, y) {
    const n = 6, step = (x2 - x1) / n; let d = "M" + x1 + " " + y;
    for (let i = 0; i < n; i++) {
      const xa = x1 + step * i, xb = x1 + step * (i + 0.5), xc = x1 + step * (i + 1);
      d += " L" + xb + " " + (y + (i % 2 ? 7 : -7)) + " L" + xc + " " + y;
    }
    return '<path d="' + d + '" class="comp"/>';
  }
  // Horizontal inductor (loops) between x1..x2 at y.
  function inductorH(x1, x2, y) {
    const n = 4, w = (x2 - x1) / n; let d = "M" + x1 + " " + y;
    for (let i = 0; i < n; i++) {
      const cx = x1 + w * i;
      d += " A" + (w / 2) + " " + (w / 2) + " 0 0 1 " + (cx + w) + " " + y;
    }
    return '<path d="' + d + '" class="comp"/>';
  }
  // Vertical capacitor centred at x, plates around y (top plate near yTop).
  function capV(x, yTop, yBot) {
    const midT = (yTop + yBot) / 2 - 5, midB = (yTop + yBot) / 2 + 5;
    return wire(x, yTop, x, midT) + wire(x, midB, x, yBot) +
      '<line x1="' + (x - 12) + '" y1="' + midT + '" x2="' + (x + 12) + '" y2="' + midT + '" class="comp"/>' +
      '<line x1="' + (x - 12) + '" y1="' + midB + '" x2="' + (x + 12) + '" y2="' + midB + '" class="comp"/>';
  }
  // Vertical diode centred at x from yA..yB. dir "up" = arrow/anode at bottom
  // (conducts bottom->top). dir "down" = anode at top.
  function diodeV(x, yA, yB, dir) {
    const mid = (yA + yB) / 2;
    const t = 11;
    let tri, bar;
    if (dir === "up") { // anode bottom, cathode top
      tri = "M" + (x - t) + " " + (mid + t) + " L" + (x + t) + " " + (mid + t) + " L" + x + " " + (mid - t) + " Z";
      bar = '<line x1="' + (x - t) + '" y1="' + (mid - t) + '" x2="' + (x + t) + '" y2="' + (mid - t) + '" class="comp"/>';
    } else { // anode top, cathode bottom
      tri = "M" + (x - t) + " " + (mid - t) + " L" + (x + t) + " " + (mid - t) + " L" + x + " " + (mid + t) + " Z";
      bar = '<line x1="' + (x - t) + '" y1="' + (mid + t) + '" x2="' + (x + t) + '" y2="' + (mid + t) + '" class="comp"/>';
    }
    return wire(x, yA, x, mid - t) + wire(x, mid + t, x, yB) +
      '<path d="' + tri + '" class="comp fill"/>' + bar;
  }
  // MOSFET symbol centred at (cx,cy). type "P" or "N". Top & bottom terminals
  // on the spine; gate stub to the left. Returns svg.
  function fet(cx, cy, type) {
    const g = [];
    const top = cy - 34, bot = cy + 34;
    // channel bar (vertical) at cx-6, gate bar at cx-14
    g.push('<line x1="' + (cx - 6) + '" y1="' + (cy - 22) + '" x2="' + (cx - 6) + '" y2="' + (cy + 22) + '" class="comp"/>');
    g.push('<line x1="' + (cx - 14) + '" y1="' + (cy - 22) + '" x2="' + (cx - 14) + '" y2="' + (cy + 22) + '" class="comp"/>');
    // source/drain stubs from channel to spine
    g.push(wire(cx - 6, cy - 18, cx, cy - 18)); g.push(wire(cx, cy - 18, cx, top));
    g.push(wire(cx - 6, cy + 18, cx, cy + 18)); g.push(wire(cx, cy + 18, cx, bot));
    // gate wire to the left
    g.push(wire(cx - 14, cy, cx - 40, cy));
    // arrow indicating type (on source side)
    const ay = type === "N" ? cy + 18 : cy - 18;
    const adir = type === "N" ? -1 : 1; // N: arrow points into channel (left), P: out
    g.push('<path d="M' + (cx - 3) + " " + ay + " l" + (adir * 6) + " -3 l0 6 Z\" class=\"comp fill\"/>");
    return g.join("");
  }

  // ---------- mini I-V plot ----------
  function ivPlot(data) {
    const W = 300, H = 210, m = { l: 42, r: 10, t: 14, b: 30 };
    const pw = W - m.l - m.r, ph = H - m.t - m.b;
    const vcc = data.vcc || 1.8;
    const series = [
      { rows: data.ivPulldown, cls: "cd", name: "pull-down" },
      { rows: data.ivPullup, cls: "cu", name: "pull-up" }
    ];
    let imax = 0;
    series.forEach(function (s) {
      (s.rows || []).forEach(function (r) {
        if (r.v >= 0 && r.v <= vcc + 1e-9) imax = Math.max(imax, Math.abs(r.typ));
      });
    });
    if (imax <= 0) imax = 1e-3;
    const X = function (v) { return m.l + pw * (v / vcc); };
    const Y = function (i) { return m.t + ph * (1 - Math.abs(i) / imax); };
    let g = '<svg viewBox="0 0 ' + W + ' ' + H + '" class="ivsvg">';
    // axes
    g += '<line x1="' + m.l + '" y1="' + (m.t + ph) + '" x2="' + (m.l + pw) + '" y2="' + (m.t + ph) + '" class="ax"/>';
    g += '<line x1="' + m.l + '" y1="' + m.t + '" x2="' + m.l + '" y2="' + (m.t + ph) + '" class="ax"/>';
    g += txt(m.l + pw / 2, H - 6, "V_out (V)", "axt");
    g += '<text x="12" y="' + (m.t + ph / 2) + '" class="axt" transform="rotate(-90 12 ' + (m.t + ph / 2) + ')">|I| (' + eng(imax, "A") + ' fs)</text>';
    series.forEach(function (s) {
      const rows = (s.rows || []).filter(function (r) { return r.v >= -1e-9 && r.v <= vcc + 1e-9; });
      if (rows.length < 2) return;
      let d = "";
      rows.forEach(function (r, i) { d += (i ? " L" : "M") + X(r.v).toFixed(1) + " " + Y(r.typ).toFixed(1); });
      g += '<path d="' + d + '" class="curve ' + s.cls + '"/>';
    });
    // legend
    g += '<rect x="' + (m.l + 6) + '" y="' + (m.t + 2) + '" width="10" height="3" class="curve cd"/>' + txt(m.l + 20, m.t + 8, "pull-down", "leg");
    g += '<rect x="' + (m.l + 6) + '" y="' + (m.t + 14) + '" width="10" height="3" class="curve cu"/>' + txt(m.l + 20, m.t + 20, "pull-up", "leg");
    g += '</svg>';
    return g;
  }

  // ---------- main schematic ----------
  function schematic(data) {
    const VDD = 45, GND = 400, PADy = 222;
    const railL = 70, railR = 580;
    const colX = 150, cX = 250, clX = 330, rX = 405, lX = 470, pinX = 545;
    let g = '<svg viewBox="0 0 640 440" class="schsvg">';

    // rails
    g += wire(railL, VDD, railR, VDD) + wire(railL, GND, railR, GND);
    g += txt(railL, VDD - 8, "VDD = " + (data.vcc != null ? data.vcc + " V" : "?"), "rail");
    g += txt(railL, GND + 20, "GND", "rail");

    // device column spine
    g += wire(colX, VDD, colX, GND);
    g += fet(colX, 120, "P") + fet(colX, 320, "N");
    g += dot(colX, PADy);

    // input to gates
    g += wire(70, PADy, 70, 120) + wire(70, 120, colX - 40, 120);   // to PMOS gate
    g += wire(70, PADy, 70, 320) + wire(70, 320, colX - 40, 320);   // to NMOS gate
    g += txt(46, PADy + 4, "IN", "rail");

    // labels for the two devices
    g += txt(colX + 12, 108, "PMOS pull-up", "dev");
    g += txt(colX + 12, 124, data.puLabel || "", "sub");
    g += txt(colX + 12, 140, "I_pk " + eng(data.peakPu, "A"), "sub");
    g += txt(colX + 12, 308, "NMOS pull-down", "dev");
    g += txt(colX + 12, 324, data.pdLabel || "", "sub");
    g += txt(colX + 12, 340, "I_pk " + eng(data.peakPd, "A"), "sub");

    // PAD horizontal wire out to package/pin
    g += wire(colX, PADy, 380, PADy);
    g += txt(colX + 4, PADy - 10, "PAD", "node");

    // C_comp tap at cX
    g += capV(cX, PADy, GND);
    g += txt(cX + 16, (PADy + GND) / 2, "C_comp", "sub");
    g += txt(cX + 16, (PADy + GND) / 2 + 14, eng(data.ccomp, "F"), "sub");

    // clamps at clX (up to VDD = POWER clamp; down to GND = GND clamp)
    if (data.clamps) {
      g += diodeV(clX, PADy, VDD, "up");     // POWER clamp: anode PAD, cathode VDD
      g += diodeV(clX, PADy, GND, "up");     // GND clamp: anode GND, cathode PAD
      g += txt(clX + 14, 70, "POWER", "sub"); g += txt(clX + 14, 82, "clamp", "sub");
      g += txt(clX + 14, GND - 24, "GND", "sub"); g += txt(clX + 14, GND - 12, "clamp", "sub");
    } else {
      g += txt(clX - 20, PADy - 26, "(no clamps modelled)", "sub");
    }

    // package: R_pkg, L_pkg in series; C_pkg to GND at pin
    g += resistorH(380, rX + 25, PADy);
    g += inductorH(rX + 35, lX + 40, PADy);
    g += wire(lX + 40, PADy, pinX, PADy);
    g += dot(pinX, PADy);
    g += capV(pinX, PADy, GND);
    g += txt(385, PADy - 10, "R_pkg " + eng(data.pkg ? data.pkg.r : null, "Ω"), "sub");
    g += txt(rX + 35, PADy - 10, "L_pkg " + eng(data.pkg ? data.pkg.l : null, "H"), "sub");
    g += txt(pinX + 8, PADy + 4, "PIN", "node");
    g += txt(pinX - 6, (PADy + GND) / 2 + 14, "C_pkg " + eng(data.pkg ? data.pkg.c : null, "F"), "sub");

    // ramp readout box
    g += txt(railL, 428, "dV/dt_r: 0.6·Vcc / " + ns(data.tr) + "     dV/dt_f: 0.6·Vcc / " + ns(data.tf), "ramp");

    g += '</svg>';
    return g;
  }

  window.Diagram = {
    render: function (data) {
      const host = document.getElementById("diagram");
      if (!host) return;
      if (!data) {
        host.innerHTML = '<p class="note">Enter inputs above to see the live model diagram.</p>';
        return;
      }
      host.innerHTML =
        '<div class="diagwrap">' +
        '<div class="schcol">' + schematic(data) + '</div>' +
        '<div class="ivcol">' + ivPlot(data) + (data.note ? '<p class="note">' + data.note + '</p>' : '') + '</div>' +
        '</div>';
    }
  };
})();
