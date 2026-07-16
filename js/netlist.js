/*
 * netlist.js
 * ------------------------------------------------------------------
 * Adapter (stage 1): parse a pasted SPICE netlist of an I/O buffer,
 * auto-detect the PAD (I/O) net, the supply rails, and the output-
 * stage transistor W/L. The parsed W/L then feeds the square-law
 * engine, so this is the same ballpark-accuracy path as the manual
 * W/L tab -- it just reads the geometry off your netlist for you.
 *
 * PAD auto-detection heuristic (strongest signal first):
 *   1. A net that is the DRAIN of at least one NMOS *and* one PMOS
 *      (the classic push-pull output node) and is not a supply.
 *   2. Failing that, a net whose name looks like a pad/pin (pad, out,
 *      io, y, z, pin, ...).
 * ------------------------------------------------------------------
 */
(function () {
  "use strict";

  const SUPPLY_HI = /^(vdd|vcc|vpwr|vddd|vdda|vccd|vcca|vpb|vp)$/i;
  const SUPPLY_LO = /^(vss|gnd|vgnd|vssd|vssa|vnb|vn|0)$/i;
  const PAD_NAME  = /^(pad|out|output|io|dq|y|z|pin|q|o)$/i;
  const IN_NAME   = /^(in|input|a|d|data|din)$/i;

  const SI = { f: 1e-15, p: 1e-12, n: 1e-9, u: 1e-6, "µ": 1e-6, m: 1e-3, k: 1e3, meg: 1e6, g: 1e9, t: 1e12 };

  // Parse a SPICE value like "0.42u", "1e-6", "150n" -> number (SI base).
  function val(s) {
    if (s == null) return NaN;
    s = String(s).trim();
    const m = s.match(/^([+-]?[0-9.]+(?:[eE][+-]?[0-9]+)?)(meg|[fpnumkgtµ])?/);
    if (!m) return NaN;
    let x = parseFloat(m[1]);
    if (m[2]) x *= SI[m[2].toLowerCase()] || 1;
    return x;
  }

  function typeOf(model) {
    const s = model.toLowerCase();
    if (/nfet|nmos|_n_|(^|_)n(fet|mos|ch)/.test(s) || /nfet|nmos/.test(s)) return "N";
    if (/pfet|pmos|_p_|(^|_)p(fet|mos|ch)/.test(s) || /pfet|pmos/.test(s)) return "P";
    // fall back on a leading letter after last '__' e.g. sky130_fd_pr__nfet_01v8
    if (/nfet/.test(s)) return "N";
    if (/pfet/.test(s)) return "P";
    return null;
  }

  window.Netlist = {
    /**
     * Parse netlist text. Returns:
     * {
     *   devices: [{name,type:"N"|"P",d,g,s,b,model,w,l,wl}],
     *   nets: [string...],
     *   supplies: {hi:[...], lo:[...]},
     *   guess: { pad, vdd, gnd, input },
     *   output: { pad, nDev, pDev, nWL, pWL }   // strongest push-pull node
     *   warnings: [string...]
     * }
     */
    parse: function (text) {
      const warnings = [];
      const devices = [];
      const netSet = {};

      // Join continuation lines (leading '+'), strip comments.
      const raw = text.replace(/\r/g, "").split("\n");
      const lines = [];
      raw.forEach(function (ln) {
        const t = ln.replace(/\*.*$/, "").trimEnd();     // '*' comment
        if (/^\s*\+/.test(t) && lines.length) lines[lines.length - 1] += " " + t.replace(/^\s*\+/, "");
        else lines.push(t);
      });

      lines.forEach(function (ln) {
        const s = ln.trim();
        if (!s || /^[.*]/.test(s)) return;                // skip .subckt/.model/etc & comments
        const first = s[0].toUpperCase();
        if (first !== "M" && first !== "X") return;        // only devices

        const tok = s.split(/\s+/);
        const name = tok[0];
        // split into non-param tokens and params (contain '=')
        const nonParam = [], params = {};
        for (let i = 1; i < tok.length; i++) {
          const eq = tok[i].indexOf("=");
          if (eq > 0) params[tok[i].slice(0, eq).toLowerCase()] = tok[i].slice(eq + 1);
          else nonParam.push(tok[i]);
        }
        if (nonParam.length < 2) return;
        const model = nonParam[nonParam.length - 1];       // model = last non-param token
        const nodes = nonParam.slice(0, nonParam.length - 1);
        const type = typeOf(model);
        if (!type) return;                                 // not a recognizable MOSFET
        if (nodes.length < 3) return;

        const w = val(params.w), l = val(params.l);
        nodes.forEach(function (n) { netSet[n] = true; });
        devices.push({
          name: name, type: type,
          d: nodes[0], g: nodes[1], s: nodes[2], b: nodes[3] || nodes[2],
          model: model, w: w, l: l,
          wl: (isFinite(w) && isFinite(l) && l > 0) ? w / l : NaN
        });
      });

      if (!devices.length) warnings.push("No MOSFET (M... or X...nfet/pfet...) devices found. Check the netlist format.");

      const nets = Object.keys(netSet);
      const supplies = { hi: nets.filter(function (n) { return SUPPLY_HI.test(n); }),
                         lo: nets.filter(function (n) { return SUPPLY_LO.test(n); }) };
      const isSupply = function (n) { return SUPPLY_HI.test(n) || SUPPLY_LO.test(n); };

      // --- PAD detection: drain of both an NMOS and a PMOS ---
      const nDrain = {}, pDrain = {};
      devices.forEach(function (dv) {
        if (dv.type === "N") nDrain[dv.d] = (nDrain[dv.d] || 0) + 1;
        else pDrain[dv.d] = (pDrain[dv.d] || 0) + 1;
      });
      let padCandidates = nets.filter(function (n) { return nDrain[n] && pDrain[n] && !isSupply(n); });
      // Prefer one whose name looks like a pad
      let pad = padCandidates.find(function (n) { return PAD_NAME.test(n); }) || padCandidates[0];
      if (!pad) {
        pad = nets.find(function (n) { return PAD_NAME.test(n) && !isSupply(n); }) || null;
        if (pad) warnings.push("Could not find a push-pull output node; guessed PAD by name ('" + pad + "').");
        else warnings.push("Could not auto-detect the PAD net. Please select it manually.");
      }

      // Output devices on the PAD (largest-W driver of each type).
      function biggestOn(pad, type) {
        const cands = devices.filter(function (d) { return d.type === type && d.d === pad; });
        cands.sort(function (a, b) { return (b.w || 0) - (a.w || 0); });
        return cands[0] || null;
      }
      const nDev = pad ? biggestOn(pad, "N") : null;
      const pDev = pad ? biggestOn(pad, "P") : null;

      // Input net: gate shared by the output devices, if it looks like an input.
      let input = null;
      if (nDev && pDev && nDev.g === pDev.g) input = nDev.g;   // shared output gate: strongest
      else if (nDev) input = nDev.g;
      if (!input) input = nets.find(function (n) { return IN_NAME.test(n); }) || null;

      return {
        devices: devices,
        nets: nets,
        supplies: supplies,
        guess: {
          pad: pad,
          vdd: supplies.hi[0] || null,
          gnd: supplies.lo[0] || null,
          input: input
        },
        output: {
          pad: pad,
          nDev: nDev, pDev: pDev,
          nWL: nDev ? nDev.wl : NaN,
          pWL: pDev ? pDev.wl : NaN
        },
        warnings: warnings
      };
    }
  };
})();
