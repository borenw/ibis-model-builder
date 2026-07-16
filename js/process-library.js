/*
 * process-library.js
 * ------------------------------------------------------------------
 * First-order (square-law) device parameters per process node.
 *
 * These are TYPICAL / APPROXIMATE values meant for a ballpark
 * behavioral estimate only -- NOT sign-off accurate. The only entry
 * anchored to a real open PDK is `sky130`.
 *
 * Fields:
 *   vdd     : nominal core supply (V)
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
  sky130: {
    label: "SkyWater sky130 (130 nm, 1.8 V)",
    vdd: 1.8, vthn: 0.45, vthp: 0.45,
    kpn: 120, kpp: 40,
    lambdan: 0.05, lambdap: 0.06,
    cox: 2.98,
    note: "Anchored to the SkyWater open PDK 1.8 V devices: toxe = 11.6 nm -> Cox ~ 3.0 fF/um^2. Vth/mobility are approximate typicals for square-law use."
  },
  n180: {
    label: "Generic 180 nm (1.8 V)",
    vdd: 1.8, vthn: 0.45, vthp: 0.45,
    kpn: 170, kpp: 40,
    lambdan: 0.06, lambdap: 0.08,
    cox: 8.6,
    note: "Generic textbook typicals for a 0.18 um process (tox ~ 4 nm). Not tied to any specific PDK."
  },
  n130: {
    label: "Generic 130 nm (1.2 V)",
    vdd: 1.2, vthn: 0.35, vthp: 0.35,
    kpn: 350, kpp: 80,
    lambdan: 0.08, lambdap: 0.10,
    cox: 12.8,
    note: "Generic textbook typicals for a 0.13 um core device (tox ~ 2.7 nm)."
  },
  n90: {
    label: "Generic 90 nm (1.2 V)",
    vdd: 1.2, vthn: 0.30, vthp: 0.30,
    kpn: 430, kpp: 100,
    lambdan: 0.10, lambdap: 0.12,
    cox: 15.0,
    note: "Generic textbook typicals for a 90 nm core device."
  },
  n65: {
    label: "Generic 65 nm (1.0 V)",
    vdd: 1.0, vthn: 0.28, vthp: 0.28,
    kpn: 500, kpp: 110,
    lambdan: 0.14, lambdap: 0.16,
    cox: 18.0,
    note: "Generic textbook typicals for a 65 nm core device."
  },
  n45: {
    label: "Generic 45 nm (1.0 V)",
    vdd: 1.0, vthn: 0.25, vthp: 0.25,
    kpn: 560, kpp: 120,
    lambdan: 0.18, lambdap: 0.20,
    cox: 25.0,
    note: "Generic textbook typicals for a 45 nm core device."
  },
  n28: {
    label: "Generic 28 nm (0.9 V)",
    vdd: 0.9, vthn: 0.22, vthp: 0.22,
    kpn: 620, kpp: 130,
    lambdan: 0.22, lambdap: 0.24,
    cox: 30.0,
    note: "Generic textbook typicals for a 28 nm core device."
  },
  custom: {
    label: "Custom (enter parameters)",
    vdd: 1.8, vthn: 0.45, vthp: 0.45,
    kpn: 120, kpp: 40,
    lambdan: 0.05, lambdap: 0.06,
    cox: 3.0,
    note: "User-defined parameters."
  }
};
