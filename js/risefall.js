/*
 * risefall.js
 * ------------------------------------------------------------------
 * Adapter: (measured/simulated rise & fall time at a known load cap)
 *          -> normalized IBIS model data.
 *
 * This is the MORE TRUSTWORTHY path: rise/fall @ a known capacitive
 * load is real behavioral data, so the resulting ramp is directly
 * meaningful. We reconstruct an effective linear driver (an on-
 * resistance) to populate the pullup/pulldown I-V tables so the model
 * is complete and usable by any board simulator.
 * ------------------------------------------------------------------
 */
(function () {
  "use strict";

  function linspace(a, b, n) {
    const out = [];
    for (let i = 0; i < n; i++) out.push(a + (b - a) * i / (n - 1));
    return out;
  }

  window.RiseFall = {
    /**
     * opts: {
     *   vcc,               // supply / logic swing (V)
     *   cload,             // external load cap the times were measured at (F)
     *   tr, tf,            // rise / fall time (s)
     *   edge,              // "20-80" or "10-90" -> fraction of swing spanned
     *   ccomp              // pin C_comp (F), user-provided or default
     * }
     */
    generate: function (opts) {
      const vcc = opts.vcc;
      const frac = opts.edge === "10-90" ? 0.8 : 0.6;   // both span 0.8 or 0.6 of swing
      const dv = frac * vcc;

      // Effective average drive current that slews cload through dv in tr/tf:
      //   I_avg = Cload * dv / t
      const iUp = opts.cload * dv / Math.max(opts.tr, 1e-15);
      const iDn = opts.cload * dv / Math.max(opts.tf, 1e-15);

      // Model each driver as a linear on-resistance sized so that at
      // mid-rail it sources/sinks I_avg:  Ron = (Vcc/2) / I_avg.
      const ronUp = (vcc / 2) / Math.max(iUp, 1e-12);
      const ronDn = (vcc / 2) / Math.max(iDn, 1e-12);

      const vs = linspace(-vcc, 2 * vcc, 25);

      // Pulldown: linear sink, I = Vout / Ron for Vout in [0, Vcc], flat beyond.
      const pulldown = vs.map(function (v) {
        let vd = v;
        if (vd < 0) vd = 0;
        if (vd > vcc) vd = vcc;
        const i = vd / ronDn;
        return { v: v, typ: i, min: i * 0.8, max: i * 1.2 };
      });

      // Pullup: referenced to Vcc, I = Vtable / Ron for Vtable in [0, Vcc].
      const pullup = vs.map(function (v) {
        let vt = v;
        if (vt < 0) vt = 0;
        if (vt > vcc) vt = vcc;
        const i = vt / ronUp;
        return { v: v, typ: i, min: i * 0.8, max: i * 1.2 };
      });

      const ccomp = opts.ccomp || 2e-12;

      // Ramp comes straight from the measured edges (the good part).
      const dtr = opts.tr, dtf = opts.tf;

      return {
        pulldown: pulldown,
        pullup: pullup,
        gndClamp: [],
        powerClamp: [],
        ccomp: { typ: ccomp, min: ccomp * 0.85, max: ccomp * 1.15 },
        ramp: {
          dvr: dv, dvf: dv, rload: 50,
          dtr: { typ: dtr, min: dtr * 0.8, max: dtr * 1.2 },
          dtf: { typ: dtf, min: dtf * 0.8, max: dtf * 1.2 }
        },
        meta: { ronUp: ronUp, ronDn: ronDn, iUp: iUp, iDn: iDn }
      };
    }
  };
})();
