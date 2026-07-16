/*
 * process-library.js
 * ------------------------------------------------------------------
 * First-order (square-law) device parameters per process node & device
 * flavor.
 *
 * IMPORTANT: except for `sky130` (anchored to the SkyWater open PDK),
 * every entry is a GENERIC / APPROXIMATE typical for a process of that
 * class -- NOT confidential foundry PDK data. TSMC exact model cards are
 * under NDA; the "TSMC ..." entries are ballpark estimates for a node of
 * that generation, useful for intuition and first-pass board checks only.
 *
 * Device flavors within a node matter for IBIS: an I/O buffer almost
 * always uses the MV/HV *I/O* device (thick oxide, higher Vdd/Vth), not
 * the LV core device -- so pick the flavor your pad driver actually uses.
 *
 * Fields:
 *   group   : optgroup heading in the UI dropdown
 *   label   : option text
 *   vdd     : nominal supply (V)
 *   vthn    : NMOS threshold (V, positive)
 *   vthp    : PMOS threshold magnitude (V, positive)
 *   kpn     : NMOS transconductance param k'n = un*Cox (uA/V^2)
 *   kpp     : PMOS transconductance param k'p = up*Cox (uA/V^2)
 *   lambdan : NMOS channel-length modulation (1/V)
 *   lambdap : PMOS channel-length modulation (1/V)
 *   cox     : gate-oxide capacitance per area (fF/um^2)
 *   note    : provenance / caveat shown in the UI
 * ------------------------------------------------------------------
 */
window.PROCESS_LIBRARY = {
  /* ---------- Open PDK (silicon-anchored) ---------- */
  sky130: {
    group: "Open PDK (silicon-anchored)",
    label: "SkyWater sky130 — 1.8 V I/O (130 nm)",
    vdd: 1.8, vthn: 0.45, vthp: 0.45, kpn: 120, kpp: 40,
    lambdan: 0.05, lambdap: 0.06, cox: 2.98,
    note: "Anchored to the SkyWater open PDK 1.8 V devices: toxe = 11.6 nm -> Cox ~ 3.0 fF/um^2. Vth/mobility are approximate typicals for square-law use."
  },

  /* ---------- TSMC-class (ESTIMATED, not PDK data) ---------- */
  tsmc180_lv: {
    group: "TSMC 180 nm (estimated)",
    label: "Core 1.8 V (LV)",
    vdd: 1.8, vthn: 0.45, vthp: 0.47, kpn: 170, kpp: 42,
    lambdan: 0.06, lambdap: 0.08, cox: 8.6,
    note: "Estimated typical for a TSMC-class 0.18 um CORE device (tox ~ 4 nm). Not TSMC PDK data."
  },
  tsmc180_mv: {
    group: "TSMC 180 nm (estimated)",
    label: "I/O 3.3 V (MV)",
    vdd: 3.3, vthn: 0.60, vthp: 0.65, kpn: 110, kpp: 28,
    lambdan: 0.04, lambdap: 0.05, cox: 4.3,
    note: "Estimated typical for a TSMC-class 0.18 um 3.3 V I/O device (tox ~ 8 nm). Not TSMC PDK data."
  },
  tsmc180_hv: {
    group: "TSMC 180 nm (estimated)",
    label: "I/O 5 V (HV)",
    vdd: 5.0, vthn: 0.70, vthp: 0.75, kpn: 90, kpp: 22,
    lambdan: 0.03, lambdap: 0.04, cox: 3.0,
    note: "Estimated typical for a TSMC-class 0.18 um 5 V HV I/O device (tox ~ 12 nm). Not TSMC PDK data."
  },

  tsmc130_lv: {
    group: "TSMC 130 nm (estimated)",
    label: "Core 1.2 V (LV)",
    vdd: 1.2, vthn: 0.35, vthp: 0.37, kpn: 350, kpp: 80,
    lambdan: 0.08, lambdap: 0.10, cox: 12.8,
    note: "Estimated typical for a TSMC-class 0.13 um CORE device (tox ~ 2.7 nm). Not TSMC PDK data."
  },
  tsmc130_mv: {
    group: "TSMC 130 nm (estimated)",
    label: "I/O 2.5 V (MV)",
    vdd: 2.5, vthn: 0.50, vthp: 0.55, kpn: 150, kpp: 38,
    lambdan: 0.05, lambdap: 0.06, cox: 6.0,
    note: "Estimated typical for a TSMC-class 0.13 um 2.5 V I/O device (tox ~ 5.6 nm). Not TSMC PDK data."
  },
  tsmc130_hv: {
    group: "TSMC 130 nm (estimated)",
    label: "I/O 3.3 V (HV)",
    vdd: 3.3, vthn: 0.60, vthp: 0.65, kpn: 120, kpp: 30,
    lambdan: 0.04, lambdap: 0.05, cox: 4.3,
    note: "Estimated typical for a TSMC-class 0.13 um 3.3 V I/O device (tox ~ 8 nm). Not TSMC PDK data."
  },

  tsmc65_lv: {
    group: "TSMC 65 nm (estimated)",
    label: "Core 1.0 V (LV)",
    vdd: 1.0, vthn: 0.30, vthp: 0.32, kpn: 500, kpp: 110,
    lambdan: 0.14, lambdap: 0.16, cox: 18.0,
    note: "Estimated typical for a TSMC-class 65 nm CORE device (tox ~ 1.85 nm). Not TSMC PDK data."
  },
  tsmc65_mv: {
    group: "TSMC 65 nm (estimated)",
    label: "I/O 1.8 V (MV)",
    vdd: 1.8, vthn: 0.45, vthp: 0.47, kpn: 200, kpp: 48,
    lambdan: 0.06, lambdap: 0.08, cox: 8.6,
    note: "Estimated typical for a TSMC-class 65 nm 1.8 V I/O device (tox ~ 4 nm). Not TSMC PDK data."
  },
  tsmc65_hv: {
    group: "TSMC 65 nm (estimated)",
    label: "I/O 3.3 V (HV)",
    vdd: 3.3, vthn: 0.60, vthp: 0.65, kpn: 120, kpp: 30,
    lambdan: 0.04, lambdap: 0.05, cox: 4.3,
    note: "Estimated typical for a TSMC-class 65 nm 3.3 V HV I/O device (tox ~ 8 nm). Not TSMC PDK data."
  },

  tsmc40_lv: {
    group: "TSMC 40 nm (estimated)",
    label: "Core 1.1 V (LV)",
    vdd: 1.1, vthn: 0.30, vthp: 0.32, kpn: 560, kpp: 125,
    lambdan: 0.16, lambdap: 0.18, cox: 22.0,
    note: "Estimated typical for a TSMC-class 40 nm CORE device (tox ~ 1.75 nm). Not TSMC PDK data."
  },
  tsmc40_mv: {
    group: "TSMC 40 nm (estimated)",
    label: "I/O 1.8 V (MV)",
    vdd: 1.8, vthn: 0.45, vthp: 0.47, kpn: 210, kpp: 50,
    lambdan: 0.06, lambdap: 0.08, cox: 8.6,
    note: "Estimated typical for a TSMC-class 40 nm 1.8 V I/O device (tox ~ 4 nm). Not TSMC PDK data."
  },
  tsmc40_hv: {
    group: "TSMC 40 nm (estimated)",
    label: "I/O 2.5 V (HV)",
    vdd: 2.5, vthn: 0.50, vthp: 0.55, kpn: 150, kpp: 38,
    lambdan: 0.05, lambdap: 0.06, cox: 6.0,
    note: "Estimated typical for a TSMC-class 40 nm 2.5 V HV I/O device (tox ~ 5.6 nm). Not TSMC PDK data."
  },

  tsmc28_lv: {
    group: "TSMC 28 nm (estimated)",
    label: "Core 0.9 V (LV, HKMG)",
    vdd: 0.9, vthn: 0.25, vthp: 0.27, kpn: 620, kpp: 140,
    lambdan: 0.20, lambdap: 0.22, cox: 30.0,
    note: "Estimated typical for a TSMC-class 28 nm HKMG CORE device (EOT ~ 1.1 nm). Not TSMC PDK data."
  },
  tsmc28_mv: {
    group: "TSMC 28 nm (estimated)",
    label: "I/O 1.8 V (MV)",
    vdd: 1.8, vthn: 0.45, vthp: 0.47, kpn: 210, kpp: 52,
    lambdan: 0.06, lambdap: 0.08, cox: 8.6,
    note: "Estimated typical for a TSMC-class 28 nm 1.8 V I/O device (tox ~ 4 nm). Not TSMC PDK data."
  },
  tsmc28_hv: {
    group: "TSMC 28 nm (estimated)",
    label: "I/O 3.3 V (HV)",
    vdd: 3.3, vthn: 0.60, vthp: 0.65, kpn: 120, kpp: 30,
    lambdan: 0.04, lambdap: 0.05, cox: 4.3,
    note: "Estimated typical for a TSMC-class 28 nm 3.3 V HV I/O device (tox ~ 8 nm). Not TSMC PDK data."
  },

  tsmc16_lv: {
    group: "TSMC 16 nm FinFET (estimated)",
    label: "Core 0.8 V (LV) — FinFET*",
    vdd: 0.8, vthn: 0.20, vthp: 0.22, kpn: 800, kpp: 180,
    lambdan: 0.25, lambdap: 0.28, cox: 35.0,
    note: "*FinFET: square-law is a POOR fit (drive is per-fin/quantized, not W/L-continuous). Rough estimate only. Not TSMC PDK data."
  },
  tsmc16_io: {
    group: "TSMC 16 nm FinFET (estimated)",
    label: "I/O 1.8 V (planar I/O)",
    vdd: 1.8, vthn: 0.45, vthp: 0.47, kpn: 210, kpp: 52,
    lambdan: 0.06, lambdap: 0.08, cox: 8.6,
    note: "Estimated typical for the planar 1.8 V I/O device in a TSMC-class 16 nm FinFET flow. Not TSMC PDK data."
  },

  /* ---------- Generic textbook nodes ---------- */
  n180: {
    group: "Generic textbook", label: "Generic 180 nm (1.8 V)",
    vdd: 1.8, vthn: 0.45, vthp: 0.45, kpn: 170, kpp: 40,
    lambdan: 0.06, lambdap: 0.08, cox: 8.6,
    note: "Generic textbook typicals for a 0.18 um process (tox ~ 4 nm). Not tied to any specific PDK."
  },
  n90: {
    group: "Generic textbook", label: "Generic 90 nm (1.2 V)",
    vdd: 1.2, vthn: 0.30, vthp: 0.30, kpn: 430, kpp: 100,
    lambdan: 0.10, lambdap: 0.12, cox: 15.0,
    note: "Generic textbook typicals for a 90 nm core device."
  },
  n45: {
    group: "Generic textbook", label: "Generic 45 nm (1.0 V)",
    vdd: 1.0, vthn: 0.25, vthp: 0.25, kpn: 560, kpp: 120,
    lambdan: 0.18, lambdap: 0.20, cox: 25.0,
    note: "Generic textbook typicals for a 45 nm core device."
  },

  /* ---------- Custom ---------- */
  custom: {
    group: "Custom", label: "Custom (enter parameters)",
    vdd: 1.8, vthn: 0.45, vthp: 0.45, kpn: 120, kpp: 40,
    lambdan: 0.05, lambdap: 0.06, cox: 3.0,
    note: "User-defined parameters."
  }
};

/*
 * Estimated STANDARD PAD-RING capacitance per entry (bond pad + ESD clamps),
 * in farads. This usually dominates C_comp for an I/O pin. Rough typicals:
 * bigger/older pads and higher-voltage flavors (larger ESD devices) => larger.
 * Anchor: a sky130 GPIO pad is ~1 pF. Estimates only -- override in the UI.
 */
(function (L) {
  const cpad = {
    sky130:     1.0e-12,
    tsmc180_lv: 1.0e-12, tsmc180_mv: 1.3e-12, tsmc180_hv: 1.6e-12,
    tsmc130_lv: 0.8e-12, tsmc130_mv: 1.0e-12, tsmc130_hv: 1.2e-12,
    tsmc65_lv:  0.6e-12, tsmc65_mv:  0.8e-12, tsmc65_hv:  1.0e-12,
    tsmc40_lv:  0.5e-12, tsmc40_mv:  0.7e-12, tsmc40_hv:  0.9e-12,
    tsmc28_lv:  0.5e-12, tsmc28_mv:  0.7e-12, tsmc28_hv:  0.9e-12,
    tsmc16_lv:  0.5e-12, tsmc16_io:  0.7e-12,
    n180:       1.0e-12, n90:        0.7e-12, n45:        0.6e-12,
    custom:     0.5e-12
  };
  for (const k in L) L[k].cpad = cpad[k] || 0.7e-12;
})(window.PROCESS_LIBRARY);
