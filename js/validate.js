/*
 * validate.js
 * ------------------------------------------------------------------
 * Lightweight sanity checks on the assembled model data. This is NOT
 * the golden IBIS parser (ibischk) -- it catches the common gross
 * errors that make a model unusable or obviously wrong.
 * ------------------------------------------------------------------
 */
(function () {
  "use strict";

  function checkMonotonic(name, rows, out) {
    if (!rows || !rows.length) return;
    let prev = null, mono = true;
    for (let i = 0; i < rows.length; i++) {
      if (prev !== null && rows[i].typ < prev - 1e-12) mono = false;
      prev = rows[i].typ;
    }
    if (!mono) out.warn.push(name + " I-V table is not monotonic; some board simulators dislike this.");
  }

  window.Validate = {
    run: function (d) {
      const out = { ok: [], warn: [], err: [] };
      const m = d.model;

      if (!m.name) out.err.push("Model has no name.");
      if (!(m.vcc > 0)) out.err.push("Voltage range invalid (Vcc must be > 0).");
      if (m.vinl >= m.vinh) out.err.push("Vinl must be less than Vinh.");
      if (!d.pins.length) out.err.push("No pins defined.");

      if (m.ccomp && m.ccomp.typ > 20e-12)
        out.warn.push("C_comp (" + (m.ccomp.typ * 1e12).toFixed(1) + " pF) is unusually large for a signal pin.");
      if (m.ccomp && m.ccomp.typ <= 0)
        out.err.push("C_comp must be positive.");

      checkMonotonic("Pulldown", m.pulldown, out);
      checkMonotonic("Pullup", m.pullup, out);

      // Sanity: is there any drive at all?
      const maxPd = (m.pulldown || []).reduce(function (a, r) { return Math.max(a, r.typ); }, 0);
      const maxPu = (m.pullup || []).reduce(function (a, r) { return Math.max(a, r.typ); }, 0);
      if (maxPd < 1e-6) out.warn.push("Pulldown drive is essentially zero -- check W/L or inputs.");
      if (maxPu < 1e-6) out.warn.push("Pullup drive is essentially zero -- check W/L or inputs.");
      if (maxPd > 1) out.warn.push("Pulldown peak current > 1 A -- likely an unrealistic W/L for square-law.");

      if (m.ramp) {
        if (!(m.ramp.dtr.typ > 0) || !(m.ramp.dtf.typ > 0))
          out.err.push("Ramp time must be positive.");
      }

      if (!out.err.length && !out.warn.length) out.ok.push("No issues found by the built-in checks.");
      return out;
    }
  };
})();
