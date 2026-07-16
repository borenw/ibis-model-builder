/*
 * square-law.js
 * ------------------------------------------------------------------
 * Adapter: (device W/L + process node) -> normalized IBIS model data.
 *
 * Uses the classic long-channel (Shichman-Hodges) MOSFET equations to
 * synthesize the pullup / pulldown I-V tables, clamp diodes, C_comp
 * and ramp rates for a simple CMOS push-pull output buffer.
 *
 * This is a BALLPARK ESTIMATE. Square-law ignores velocity saturation,
 * mobility degradation, and short-channel effects -- it will overstate
 * drive at modern nodes. It is intended for intuition and first-pass
 * board checks, not sign-off.
 * ------------------------------------------------------------------
 */
(function () {
  "use strict";

  // NMOS drain current (uA) for source-referenced Vgs, Vds >= 0.
  // kp in uA/V^2, WL dimensionless (W/L).
  function idsN(vgs, vds, kp, wl, vth, lambda) {
    const vov = vgs - vth;
    if (vov <= 0) return 0;                 // cutoff
    if (vds <= 0) return 0;                 // handled by clamp region
    if (vds < vov) {                        // triode
      return kp * wl * (vov * vds - 0.5 * vds * vds);
    }
    return 0.5 * kp * wl * vov * vov * (1 + lambda * vds);  // saturation
  }

  // Clamp-diode current (A). A real ESD/body diode has series resistance,
  // so above the ~0.6 V knee the current is limited linearly instead of
  // blowing up like an ideal exponential. vd = anode-cathode (V).
  function diode(vd) {
    const Is = 1e-14, Vt = 0.02585, Von = 0.6, Rs = 5;
    if (vd <= 0) return -Math.min(Is, 1e-12);        // reverse: ~0 leakage
    if (vd < Von) return Is * (Math.exp(vd / Vt) - 1);
    const iKnee = Is * (Math.exp(Von / Vt) - 1);     // current at the knee
    return iKnee + (vd - Von) / Rs;                  // series-R limited
  }

  function linspace(a, b, n) {
    const out = [];
    for (let i = 0; i < n; i++) out.push(a + (b - a) * i / (n - 1));
    return out;
  }

  // Build one I-V table over the standard -Vcc..2Vcc range.
  // `fn(vout)` returns current in Amps for the given output voltage.
  function tableFromFn(vcc, fn) {
    const vs = linspace(-vcc, 2 * vcc, 25);
    return vs.map(function (v) {
      const i = fn(v);
      // typ/min/max spread: +/-20% as a crude corner proxy
      return { v: v, typ: i, min: i * 0.8, max: i * 1.2 };
    });
  }

  window.SquareLaw = {
    /**
     * opts: {
     *   params,             // one entry from PROCESS_LIBRARY (already merged w/ overrides)
     *   wlN, wlP,           // W/L ratios of pulldown NMOS / pullup PMOS
     *   ccomp,             // optional C_comp override (F); else estimated
     *   nodeLabel          // for provenance string
     * }
     * Returns { pulldown, pullup, gndClamp, powerClamp, ccomp, ramp } plus meta.
     */
    generate: function (opts) {
      const p = opts.params;
      const vcc = p.vdd;
      const wlN = opts.wlN, wlP = opts.wlP;

      // Pulldown NMOS: gate @ Vcc, source @ GND, Vds = Vout.
      // Current SINKS into the pin (positive per IBIS pulldown convention).
      const pulldown = tableFromFn(vcc, function (vout) {
        if (vout <= 0) return 0;                 // clamp region
        return idsN(vcc, Math.min(vout, 2 * vcc), p.kpn, wlN, p.vthn, p.lambdan) * 1e-6;
      });

      // Pullup PMOS: gate @ GND, source @ Vcc. Table voltage is
      // referenced to Vcc:  Vtable = Vcc - Vout.  Vsd = Vtable.
      // We SOURCE current out of the pin.
      const pullup = tableFromFn(vcc, function (vtable) {
        // vtable here plays the role of the referenced voltage directly
        if (vtable <= 0) return 0;
        return idsN(vcc, Math.min(vtable, 2 * vcc), p.kpp, wlP, p.vthp, p.lambdap) * 1e-6;
      });

      // GND clamp diode: conducts when Vout < 0 (pin below GND).
      const gndClamp = tableFromFn(vcc, function (vout) {
        return -diode(-vout);   // anode=GND, cathode=pin
      });

      // POWER clamp diode: conducts when Vout > Vcc (pin above rail).
      const powerClamp = tableFromFn(vcc, function (vout) {
        return diode(vout - vcc);  // anode=pin, cathode=Vcc
      });

      // C_comp estimate: gate + junction area cap of both devices + pad.
      // Assume L = 1 (ratios given as W/L) with a nominal Lmin so area
      // scales with the ratio; add a fixed pad/ESD cap.
      const padC = 0.5e-12;
      const areaCap = (p.cox * 1e-15) * (wlN + wlP) * 0.15 * 0.15; // very rough, um^2
      const ccomp = opts.ccomp || (padC + areaCap);

      // Ramp: dV/dt through the mid-rail driving C_comp.
      // Rising uses pullup current at Vout=Vcc/2 (Vtable=Vcc/2).
      // Falling uses pulldown current at Vout=Vcc/2.
      const iUp = idsN(vcc, vcc / 2, p.kpp, wlP, p.vthp, p.lambdap) * 1e-6;
      const iDn = idsN(vcc, vcc / 2, p.kpn, wlN, p.vthn, p.lambdan) * 1e-6;
      const dv = 0.6 * vcc;                    // 20%-80% swing
      const dtr = ccomp * dv / Math.max(iUp, 1e-9);
      const dtf = ccomp * dv / Math.max(iDn, 1e-9);

      return {
        pulldown: pulldown,
        pullup: pullup,
        gndClamp: gndClamp,
        powerClamp: powerClamp,
        ccomp: { typ: ccomp, min: ccomp * 0.85, max: ccomp * 1.15 },
        ramp: {
          dvr: dv, dvf: dv, rload: 50,
          dtr: { typ: dtr, min: dtr * 0.7, max: dtr * 1.4 },
          dtf: { typ: dtf, min: dtf * 0.7, max: dtf * 1.4 }
        },
        meta: { vcc: vcc, iUp: iUp, iDn: iDn }
      };
    }
  };
})();
