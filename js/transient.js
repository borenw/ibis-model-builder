/*
 * transient.js
 * ------------------------------------------------------------------
 * Simulate the IBIS model's TRANSIENT STEP RESPONSE and draw it, with a
 * 1-tau crosshair on both the rising and falling edge.
 *
 * The output node (C_comp + external load) is charged/discharged by the
 * model's own nonlinear pullup/pulldown I-V tables -- i.e. we integrate
 *     dV/dt = I(V) / C_total
 * with a simple forward-Euler step. This is a real (nonlinear) sim of the
 * behavioral model, not an RC approximation.
 *
 * 1 tau is marked where the edge reaches (1 - 1/e) = 63.2 % of the swing
 * on the way up, and 1/e = 36.8 % on the way down (the exponential-
 * equivalent time constant of the actual, possibly non-exponential edge).
 * ------------------------------------------------------------------
 */
(function () {
  "use strict";

  function interp(tbl, x) {
    if (!tbl || !tbl.length) return 0;
    if (x <= tbl[0].v) return tbl[0].typ;
    const last = tbl[tbl.length - 1];
    if (x >= last.v) return last.typ;
    for (let i = 1; i < tbl.length; i++) {
      if (x <= tbl[i].v) {
        const a = tbl[i - 1], b = tbl[i];
        const f = (b.v - a.v) ? (x - a.v) / (b.v - a.v) : 0;
        return a.typ + f * (b.typ - a.typ);
      }
    }
    return last.typ;
  }

  // First time the trace crosses `level` going up.
  function crossUp(arr, level) {
    for (let i = 1; i < arr.length; i++) {
      if (arr[i].v >= level) {
        const a = arr[i - 1], b = arr[i];
        const f = (b.v - a.v) ? (level - a.v) / (b.v - a.v) : 0;
        return a.t + f * (b.t - a.t);
      }
    }
    return NaN;
  }
  // First time the trace crosses `level` going down.
  function crossDown(arr, level) {
    for (let i = 1; i < arr.length; i++) {
      if (arr[i].v <= level) {
        const a = arr[i - 1], b = arr[i];
        const f = (b.v - a.v) ? (level - a.v) / (b.v - a.v) : 0;
        return a.t + f * (b.t - a.t);
      }
    }
    return NaN;
  }

  function ns(t) { return isFinite(t) ? (t * 1e9).toFixed(2) : "?"; }

  window.Transient = {
    simulate: function (m, cloadF) {
      const vcc = m.vcc;
      const ctot = (m.ccomp ? m.ccomp.typ : 2e-12) + (cloadF || 0);
      const pu = m.pullup || [], pd = m.pulldown || [];
      const Ipu = function (v) { return Math.max(0, interp(pu, vcc - v)); }; // pullup ref'd to Vcc
      const Ipd = function (v) { return Math.max(0, interp(pd, v)); };
      const MAX = 5000;

      // rising edge: pullup charges the node from 0 -> Vcc
      const iMidR = Math.max(Ipu(vcc / 2), 1e-12);
      const dtR = (ctot * vcc / iMidR) / 300;
      const rise = [{ t: 0, v: 0 }];
      let v = 0, t = 0, s = 0;
      while (v < 0.995 * vcc && s < MAX) {
        const dv = Ipu(v) / ctot * dtR;
        if (!(dv > 0)) break;
        v = Math.min(vcc, v + dv); t += dtR; rise.push({ t: t, v: v }); s++;
      }

      // falling edge: pulldown discharges the node from Vcc -> 0
      const iMidF = Math.max(Ipd(vcc / 2), 1e-12);
      const dtF = (ctot * vcc / iMidF) / 300;
      const fall = [{ t: 0, v: vcc }];
      v = vcc; t = 0; s = 0;
      while (v > 0.005 * vcc && s < MAX) {
        const dv = Ipd(v) / ctot * dtF;
        if (!(dv > 0)) break;
        v = Math.max(0, v - dv); t += dtF; fall.push({ t: t, v: v }); s++;
      }

      return {
        rise: rise, fall: fall, vcc: vcc, ctot: ctot,
        tauR: crossUp(rise, 0.632 * vcc),
        tauF: crossDown(fall, 0.368 * vcc)
      };
    },

    render: function (host, sim) {
      if (!host) return;
      if (!sim || sim.rise.length < 2 || sim.fall.length < 2) {
        host.innerHTML = '<p class="note">Enter inputs above to see the step response.</p>';
        return;
      }
      const vcc = sim.vcc;
      const tmax = Math.max(sim.rise[sim.rise.length - 1].t, sim.fall[sim.fall.length - 1].t) || 1e-9;
      const W = 620, H = 300, m = { l: 52, r: 14, t: 16, b: 40 };
      const pw = W - m.l - m.r, ph = H - m.t - m.b;
      const X = function (t) { return m.l + pw * (t / tmax); };
      const Y = function (v) { return m.t + ph * (1 - v / vcc); };

      function path(arr, cls) {
        let d = "";
        arr.forEach(function (p, i) { d += (i ? " L" : "M") + X(p.t).toFixed(1) + " " + Y(p.v).toFixed(1); });
        return '<path d="' + d + '" class="curve ' + cls + '"/>';
      }
      function crosshair(t, v, cls, label, anchorRight) {
        if (!isFinite(t)) return "";
        const x = X(t), y = Y(v);
        let g = '<line x1="' + m.l + '" y1="' + y.toFixed(1) + '" x2="' + x.toFixed(1) + '" y2="' + y.toFixed(1) + '" class="tr-cross ' + cls + '"/>';
        g += '<line x1="' + x.toFixed(1) + '" y1="' + (m.t + ph) + '" x2="' + x.toFixed(1) + '" y2="' + y.toFixed(1) + '" class="tr-cross ' + cls + '"/>';
        g += '<circle cx="' + x.toFixed(1) + '" cy="' + y.toFixed(1) + '" r="4" class="tr-mark ' + cls + '"/>';
        const tx = anchorRight ? x + 8 : x + 8;
        g += '<text x="' + tx + '" y="' + (y - 6).toFixed(1) + '" class="tr-lbl ' + cls + '">' + label + '</text>';
        return g;
      }

      let g = '<svg viewBox="0 0 ' + W + ' ' + H + '" class="trsvg">';
      // axes
      g += '<line x1="' + m.l + '" y1="' + (m.t + ph) + '" x2="' + (m.l + pw) + '" y2="' + (m.t + ph) + '" class="ax"/>';
      g += '<line x1="' + m.l + '" y1="' + m.t + '" x2="' + m.l + '" y2="' + (m.t + ph) + '" class="ax"/>';
      // Vcc guide + 63/37 % guides
      [{ v: vcc, t: "Vcc" }, { v: 0.632 * vcc, t: "63%" }, { v: 0.368 * vcc, t: "37%" }].forEach(function (gl) {
        const y = Y(gl.v);
        g += '<line x1="' + m.l + '" y1="' + y.toFixed(1) + '" x2="' + (m.l + pw) + '" y2="' + y.toFixed(1) + '" class="tr-guide"/>';
        g += '<text x="' + (m.l - 6) + '" y="' + (y + 3).toFixed(1) + '" class="tr-tick">' + gl.t + '</text>';
      });
      // curves
      g += path(sim.rise, "cu");
      g += path(sim.fall, "cd");
      // crosshairs
      g += crosshair(sim.tauR, 0.632 * vcc, "cu", "τ↑ = " + ns(sim.tauR) + " ns", true);
      g += crosshair(sim.tauF, 0.368 * vcc, "cd", "τ↓ = " + ns(sim.tauF) + " ns", true);
      // axis titles
      g += '<text x="' + (m.l + pw / 2) + '" y="' + (H - 6) + '" class="axt">time (ns), full scale ' + ns(tmax) + ' ns</text>';
      g += '<text x="14" y="' + (m.t + ph / 2) + '" class="axt" transform="rotate(-90 14 ' + (m.t + ph / 2) + ')">V_out (V)</text>';
      // legend
      g += '<rect x="' + (m.l + 8) + '" y="' + (m.t + 2) + '" width="10" height="3" class="curve cu"/><text x="' + (m.l + 22) + '" y="' + (m.t + 8) + '" class="leg">rising (pull-up)</text>';
      g += '<rect x="' + (m.l + 130) + '" y="' + (m.t + 2) + '" width="10" height="3" class="curve cd"/><text x="' + (m.l + 144) + '" y="' + (m.t + 8) + '" class="leg">falling (pull-down)</text>';
      g += '</svg>';
      g += '<p class="note">C_total = ' + (sim.ctot * 1e12).toFixed(2) + ' pF (C_comp + external load). 1τ = 63.2 % of the swing rising, 36.8 % falling — the exponential-equivalent time constant of the simulated edge.</p>';
      host.innerHTML = g;
    }
  };
})();
