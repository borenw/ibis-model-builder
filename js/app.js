/*
 * app.js -- UI wiring for the IBIS Model Builder.
 * Reads the DOM, dispatches to the active input adapter, assembles the
 * .ibs via IBIS.build, validates, and renders / downloads the result.
 */
(function () {
  "use strict";

  const $ = function (id) { return document.getElementById(id); };
  const num = function (id) { return parseFloat($(id).value); };

  // App revision — shown top-right and stamped into the .ibs [Source] line.
  const APP_REV = "v1.9";
  if ($("rev")) $("rev").textContent = "rev " + APP_REV;

  let activeTab = "wl";
  let lastText = "";

  // ---- Populate process-node dropdown ----
  // Populate a node <select> with <optgroup>s from PROCESS_LIBRARY.
  function populateNodes(sel) {
    if (!sel) return;
    const groups = {}, order = [];
    Object.keys(window.PROCESS_LIBRARY).forEach(function (key) {
      const g = window.PROCESS_LIBRARY[key].group || "Other";
      if (!groups[g]) { groups[g] = []; order.push(g); }
      groups[g].push(key);
    });
    order.forEach(function (g) {
      const og = document.createElement("optgroup"); og.label = g;
      groups[g].forEach(function (key) {
        const o = document.createElement("option");
        o.value = key; o.textContent = window.PROCESS_LIBRARY[key].label;
        og.appendChild(o);
      });
      sel.appendChild(og);
    });
    sel.value = "sky130";
  }

  const nodeSel = $("node");
  const netNodeSel = $("net_node");
  const cadNodeSel = $("cad_node");
  populateNodes(nodeSel);
  populateNodes(netNodeSel);
  populateNodes(cadNodeSel);

  function loadNodeParams() {
    const p = window.PROCESS_LIBRARY[nodeSel.value];
    $("nodeNote").textContent = p.note;
    $("p_vdd").value = p.vdd;
    $("p_vthn").value = p.vthn;
    $("p_vthp").value = p.vthp;
    $("p_kpn").value = p.kpn;
    $("p_kpp").value = p.kpp;
    $("p_ln").value = p.lambdan;
    $("p_lp").value = p.lambdap;
    $("p_cox").value = p.cox;
  }
  nodeSel.addEventListener("change", loadNodeParams);
  loadNodeParams();

  // ---- Tab switching ----
  document.querySelectorAll(".tab").forEach(function (btn) {
    btn.addEventListener("click", function () {
      activeTab = btn.dataset.tab;
      document.querySelectorAll(".tab").forEach(function (b) { b.classList.remove("active"); });
      document.querySelectorAll(".panel").forEach(function (p) { p.classList.remove("active"); });
      btn.classList.add("active");
      $("panel-" + activeTab).classList.add("active");
      updateDiagram();
    });
  });

  // Index sub-links (data-tab) also activate the matching input tab.
  document.querySelectorAll('.toc-sub a[data-tab]').forEach(function (a) {
    a.addEventListener("click", function () {
      const t = a.dataset.tab;
      const btn = document.querySelector('.tab[data-tab="' + t + '"]');
      if (btn) btn.click();
    });
  });

  // ---- Shared model scaffold from the common form ----
  function baseModel() {
    return {
      component: $("component").value.trim() || "MyChip",
      manufacturer: $("manufacturer").value.trim() || "Unknown",
      pkg: { r: num("rpkg"), l: num("lpkg"), c: num("cpkg") },
      model: {
        name: $("modelName").value.trim() || "buf_io",
        type: $("modelType").value,
        polarity: "Non-Inverting",
        enable: "Active-High",
        vinl: num("vinl"), vinh: num("vinh"),
        tempTyp: num("ttyp"), tempMin: num("tmin"), tempMax: num("tmax"),
        rpin: num("rpin"), lpin: num("lpin"), cpin: num("cpin")
      },
      pins: parsePins()
    };
  }

  function parsePins() {
    const model = $("modelName").value.trim() || "buf_io";
    const lines = $("pins").value.split("\n").map(function (l) { return l.trim(); }).filter(Boolean);
    if (!lines.length) return [{ num: "1", name: "PIN1", model: model }];
    return lines.map(function (l) {
      const parts = l.split(/[\s,]+/);
      return { num: parts[0], name: parts[1] || ("PIN" + parts[0]), model: model };
    });
  }

  function parseCSV(text) {
    return text.split("\n").map(function (l) { return l.trim(); }).filter(Boolean).map(function (l) {
      const parts = l.split(/[\s,]+/).map(parseFloat);
      const i = parts[1];
      return { v: parts[0], typ: i, min: i * 0.8, max: i * 1.2 };
    }).filter(function (r) { return isFinite(r.v) && isFinite(r.typ); });
  }

  // ---- Adapters -> fill model electrical data ----
  // Read a W (µm) and L (µm) pair and return the W/L ratio (NaN if invalid).
  function ratio(wId, lId) {
    const w = parseFloat($(wId).value), l = parseFloat($(lId).value);
    return (w > 0 && l > 0) ? w / l : NaN;
  }
  function fmtRatio(x) { return isFinite(x) ? (x >= 100 ? x.toFixed(0) : x.toFixed(2)) : "?"; }

  // ---- Standard pad-ring cap (bond pad + ESD) per process ----
  function cpadOf(sel) { const e = sel && window.PROCESS_LIBRARY[sel.value]; return e ? e.cpad : 0.5e-12; }
  function updatePadVals() {
    if ($("wlPadVal")) $("wlPadVal").textContent = (cpadOf(nodeSel) * 1e12).toFixed(2);
    if ($("netPadVal")) $("netPadVal").textContent = (cpadOf(netNodeSel) * 1e12).toFixed(2);
    if ($("cadPadVal")) $("cadPadVal").textContent = (cpadOf(cadNodeSel) * 1e12).toFixed(2);
  }

  // Fill a C_comp override with the auto estimate (device cap + pad ring).
  function fillCcomp(tab) {
    let params, wlN, wlP, cpad, target;
    if (tab === "wl") {
      params = { vdd: num("p_vdd"), vthn: num("p_vthn"), vthp: num("p_vthp"),
        kpn: num("p_kpn"), kpp: num("p_kpp"), lambdan: num("p_ln"), lambdap: num("p_lp"), cox: num("p_cox") };
      wlN = ratio("wN", "lN"); wlP = ratio("wP", "lP"); cpad = cpadOf(nodeSel); target = "wlCcomp";
    } else if (tab === "net") {
      const b = window.PROCESS_LIBRARY[netNodeSel.value];
      params = b; wlN = ratio("net_wN", "net_lN"); wlP = ratio("net_wP", "net_lP"); cpad = b.cpad; target = "net_ccomp";
    } else {
      const b = window.PROCESS_LIBRARY[cadNodeSel.value];
      params = b; wlN = ratio("cad_wN", "cad_lN"); wlP = ratio("cad_wP", "cad_lP"); cpad = b.cpad; target = "cad_ccomp";
    }
    if (!(wlN > 0) || !(wlP > 0)) { alert("Enter W and L for both devices first."); return; }
    const r = window.SquareLaw.generate({ params: params, wlN: wlN, wlP: wlP, cpad: cpad, ccomp: null });
    $(target).value = +(r.ccomp.typ * 1e12).toFixed(3);
    updateDiagram();
  }
  if ($("wlCcFill")) $("wlCcFill").addEventListener("click", function () { fillCcomp("wl"); });
  if ($("netCcFill")) $("netCcFill").addEventListener("click", function () { fillCcomp("net"); });
  if ($("cadCcFill")) $("cadCcFill").addEventListener("click", function () { fillCcomp("cad"); });

  // Cadence "use open schematic window" toggle hides the lib/cell/view fields.
  if ($("cad_useopen")) {
    const tog = function () { $("cad_manual").style.display = $("cad_useopen").checked ? "none" : ""; };
    $("cad_useopen").addEventListener("change", tog); tog();
  }

  function buildFromWL(d) {
    const params = {
      vdd: num("p_vdd"), vthn: num("p_vthn"), vthp: num("p_vthp"),
      kpn: num("p_kpn"), kpp: num("p_kpp"),
      lambdan: num("p_ln"), lambdap: num("p_lp"), cox: num("p_cox")
    };
    const wlN = ratio("wN", "lN"), wlP = ratio("wP", "lP");
    if (!(wlN > 0) || !(wlP > 0)) throw new Error("Enter positive W and L for both devices.");
    const ccompOv = $("wlCcomp").value ? num("wlCcomp") * 1e-12 : null;
    const r = window.SquareLaw.generate({ params: params, wlN: wlN, wlP: wlP, ccomp: ccompOv,
      cpad: window.PROCESS_LIBRARY[nodeSel.value].cpad });
    applyElectrical(d, params.vdd, r);
    d.provenance = "Square-law estimate. node=" + nodeSel.value +
      ", NMOS " + $("wN").value + "/" + $("lN").value + "um (W/L=" + fmtRatio(wlN) + ")" +
      ", PMOS " + $("wP").value + "/" + $("lP").value + "um (W/L=" + fmtRatio(wlP) + ")" +
      ", Vcc=" + params.vdd + "V.";
  }

  function buildFromRF(d) {
    const vcc = num("rf_vcc");
    const r = window.RiseFall.generate({
      vcc: vcc, cload: num("rf_cload") * 1e-12,
      tr: num("rf_tr") * 1e-9, tf: num("rf_tf") * 1e-9,
      edge: $("rf_edge").value, ccomp: num("rf_ccomp") * 1e-12
    });
    applyElectrical(d, vcc, r);
    d.provenance = "Reconstructed from measured edges: tr=" + num("rf_tr") +
      "ns, tf=" + num("rf_tf") + "ns @ Cload=" + num("rf_cload") + "pF, Vcc=" + vcc + "V.";
  }

  function buildFromPaste(d) {
    const vcc = num("ps_vcc");
    const ccomp = num("ps_ccomp") * 1e-12;
    const dv = 0.6 * vcc;
    const r = {
      pulldown: parseCSV($("ps_pd").value),
      pullup: parseCSV($("ps_pu").value),
      gndClamp: [], powerClamp: [],
      ccomp: { typ: ccomp, min: ccomp * 0.85, max: ccomp * 1.15 },
      ramp: {
        dvr: dv, dvf: dv, rload: 50,
        dtr: mm(num("ps_tr") * 1e-9), dtf: mm(num("ps_tf") * 1e-9)
      }
    };
    applyElectrical(d, vcc, r);
    d.provenance = "Assembled from user-supplied I-V data and edge rates, Vcc=" + vcc + "V.";
  }

  function mm(x) { return { typ: x, min: x * 0.8, max: x * 1.2 }; }

  // ---- Netlist tab: parse + populate config ----
  let netParsed = null;

  function fillSelect(sel, nets, chosen) {
    sel.innerHTML = "";
    nets.forEach(function (n) {
      const o = document.createElement("option");
      o.value = n; o.textContent = n;
      if (n === chosen) o.selected = true;
      sel.appendChild(o);
    });
    // allow an empty choice when nothing detected
    if (!chosen) { const o = document.createElement("option"); o.value = ""; o.textContent = "(none)"; o.selected = true; sel.insertBefore(o, sel.firstChild); }
  }

  $("parseNet").addEventListener("click", function () {
    const r = window.Netlist.parse($("net_text").value);
    netParsed = r;
    // warnings
    const wbox = $("netWarn"); wbox.innerHTML = "";
    r.warnings.forEach(function (t) {
      const div = document.createElement("div");
      div.className = "vmsg warn"; div.textContent = "⚠ " + t; wbox.appendChild(div);
    });
    if (r.devices.length) {
      const div = document.createElement("div");
      div.className = "vmsg ok";
      div.textContent = "✔ Parsed " + r.devices.length + " device(s); " + r.nets.length + " nets.";
      wbox.appendChild(div);
    }
    fillSelect($("net_pad"), r.nets, r.guess.pad);
    fillSelect($("net_vdd"), r.nets, r.guess.vdd);
    fillSelect($("net_gnd"), r.nets, r.guess.gnd);
    fillSelect($("net_in"),  r.nets, r.guess.input);
    const um = function (m) { return isFinite(m) ? +(m * 1e6).toFixed(4) : ""; };
    $("net_wN").value = r.output.nDev ? um(r.output.nDev.w) : "";
    $("net_lN").value = r.output.nDev ? um(r.output.nDev.l) : "";
    $("net_wP").value = r.output.pDev ? um(r.output.pDev.w) : "";
    $("net_lP").value = r.output.pDev ? um(r.output.pDev.l) : "";
    const info = [];
    if (r.output.nDev) info.push("Pulldown: " + r.output.nDev.name + " (W/L=" + fmtWL(r.output.nDev) + ")");
    if (r.output.pDev) info.push("Pullup: " + r.output.pDev.name + " (W/L=" + fmtWL(r.output.pDev) + ")");
    $("net_devinfo").textContent = info.join("  ·  ");
    $("netResult").hidden = false;
    updateDiagram();
  });

  function fmtWL(dv) {
    if (!isFinite(dv.wl)) return "?";
    return (dv.w * 1e6).toFixed(2) + "u / " + (dv.l * 1e6).toFixed(3) + "u = " + dv.wl.toFixed(2);
  }

  function buildFromNet(d) {
    if (!netParsed) throw new Error("Click “Parse & auto-detect PAD” first.");
    const base = window.PROCESS_LIBRARY[netNodeSel.value];
    const params = {
      vdd: base.vdd, vthn: base.vthn, vthp: base.vthp,
      kpn: base.kpn, kpp: base.kpp, lambdan: base.lambdan, lambdap: base.lambdap, cox: base.cox
    };
    const wlN = ratio("net_wN", "net_lN"), wlP = ratio("net_wP", "net_lP");
    if (!(wlN > 0) || !(wlP > 0)) throw new Error("Could not determine output W/L — set NMOS/PMOS W and L manually.");
    const ccompOv = $("net_ccomp").value ? parseFloat($("net_ccomp").value) * 1e-12 : null;
    const r = window.SquareLaw.generate({ params: params, wlN: wlN, wlP: wlP, ccomp: ccompOv, cpad: base.cpad });
    applyElectrical(d, params.vdd, r);
    d.provenance = "Parsed from SPICE netlist. PAD=" + $("net_pad").value +
      ", VDD=" + $("net_vdd").value + ", GND=" + $("net_gnd").value +
      "; square-law on node=" + netNodeSel.value + ", W/L(n)=" + wlN + ", W/L(p)=" + wlP + ".";
  }

  // ---- Cadence tab: generate a SKILL/OCEAN extraction script ----
  // `padPat` may be a plain net name or a wildcard like "PAD*".
  function skillScript(lib, cell, view, padPat, oaPath, useOpen) {
    // Convert a shell-style wildcard to a SKILL regex anchored at start.
    const rx = "^" + padPat.replace(/[.^$+?()[\]{}|\\]/g, "\\$&").replace(/\*/g, ".*") + "$";
    const head = [
      ";; ===================================================================",
      ";; IBIS Model Builder -- extract PAD driver W/L from a Virtuoso cell",
      ";; Paste into the Virtuoso CIW and press Enter. Run with the PDK loaded.",
      ";; ==================================================================="
    ];
    if (useOpen) {
      head.push(";; Read the schematic in the CURRENT window -- no lib/cell/view needed.");
      head.push("cv = geGetEditCellView()");
      head.push('unless( cv error("No cellview in the current window. Open your schematic and retry.") )');
      head.push("lib = cv~>libName   cell = cv~>cellName   view = cv~>viewName");
      head.push('printf("Using open cellview: %s / %s / %s\\n" lib cell view)');
    } else {
      head.push('lib  = "' + lib + '"');
      head.push('cell = "' + cell + '"');
      head.push('view = "' + view + '"');
      if (oaPath) {
        head.push(";; register the library at its OA path (skip if already in cds.lib):");
        head.push('unless( ddGetObj( lib )  ddCreateLib( lib "' + oaPath + '" ) )');
      }
      head.push('cv = dbOpenCellViewByType( lib cell view "" "r" )');
    }
    head.push('padRx = "' + rx + '"    ; PAD net pattern (from "' + padPat + '")');
    return head.concat([
      "",
      ";; 1) Netlist the cell to SPICE so you can paste it into the",
      ";;    'Paste SPICE netlist' tab (which auto-detects the PAD):",
      "simulator( 'spectre )",
      "design( lib cell view )",
      'resultsDir( strcat( "/tmp/" cell "_ibis" ) )',
      "createNetlist( ?recreateAll t ?display nil )",
      'printf("\\nSPICE netlist written under /tmp/%s_ibis -- paste it into the web tool.\\n" cell)',
      "",
      ";; 2) Print W/L of EVERY instance connected to a PAD net (the drivers",
      ";;    are the FETs among them). No over-filtering -- so you always see",
      ";;    something. Tries the common CDF param names for W and L.",
      "procedure( getP( cdf names )",
      "  let( (p val)",
      "    foreach( nm names",
      "      p = and( cdf get( cdf nm ) )",
      "      when( and( p p~>value ) val = p~>value )",
      "    )",
      "    val",
      "  )",
      ")",
      "matched = 0  seen = nil",
      "foreach( net cv~>nets",
      "  when( rexMatchp( padRx net~>name )",
      "    matched = matched + 1",
      '    printf("=== PAD net: %s ===\\n" net~>name)',
      "    foreach( iterm net~>instTerms",
      "      inst = iterm~>inst",
      "      unless( member( inst seen )",
      "        seen = cons( inst seen )",
      "        cdf = cdfGetInstCDF( inst )",
      "        w = getP( cdf '(\"w\" \"fw\" \"wf\" \"wtot\" \"totalw\" \"W\") )",
      "        l = getP( cdf '(\"l\" \"lr\" \"L\") )",
      "        gt = car( setof( it inst~>instTerms rexMatchp( \"^G\" upperCase( it~>name ) ) ) )",
      "        gnet = and( gt gt~>net gt~>net~>name )",
      '        printf("  %-14s master=%-18s gate=%-10s W=%A  L=%A\\n"',
      "               inst~>name inst~>master~>cellName gnet w l)",
      "      )",
      "    )",
      "  )",
      ")",
      "when( zerop( matched )",
      '  printf("\\n[!] No net matched \\"%s\\". Nets in this cell (pick one for the pattern):\\n" padRx)',
      '  foreach( net cv~>nets printf("    %s\\n" net~>name) )',
      ")",
      'printf("\\n--> The FET rows above are your drivers: use the pfet W/L (pull-up) and',
      '       nfet W/L (pull-down). Or just paste the SPICE netlist into the netlist tab.\\n")'
    ]).join("\n");
  }

  if ($("genSkill")) {
    $("genSkill").addEventListener("click", function () {
      const s = skillScript(
        $("cad_lib").value.trim() || "my_lib",
        $("cad_cell").value.trim() || "io_buffer",
        $("cad_view").value.trim() || "schematic",
        $("cad_pin").value.trim() || "PAD*",
        $("cad_path").value.trim(),
        $("cad_useopen").checked
      );
      $("cad_skill").textContent = s;
      $("cad_skillwrap").hidden = false;
    });
    $("copySkill").addEventListener("click", function () {
      navigator.clipboard.writeText($("cad_skill").textContent).then(function () {
        const b = $("copySkill"); const o = b.textContent; b.textContent = "Copied!";
        setTimeout(function () { b.textContent = o; }, 1200);
      });
    });
  }

  // Parse the SKILL output text: group devices by type + gate net + L and
  // SUM the widths (parallel fingers act as one wider driver). Fill W/L.
  function cadTypeOf(m) {
    m = (m || "").toLowerCase();
    if (/nfet|nmos|nch|(^|_)n_?fet|(^|_)nmos/.test(m) || /nfet|nmos|nch/.test(m)) return "N";
    if (/pfet|pmos|pch/.test(m)) return "P";
    return null;
  }
  function toUm(s) {
    s = String(s).trim();
    const m = s.match(/^([+-]?[0-9.]+(?:[eE][+-]?[0-9]+)?)\s*(meg|[fpnumµ])?/);
    if (!m) return NaN;
    let x = parseFloat(m[1]);
    if (m[2]) {
      const SI = { f: 1e-15, p: 1e-12, n: 1e-9, u: 1e-6, "µ": 1e-6, m: 1e-3 };
      return x * (SI[m[2].toLowerCase()] || 1) * 1e6;       // meters -> µm
    }
    return (Math.abs(x) > 0 && Math.abs(x) < 1e-3) ? x * 1e6 : x;  // bare: guess meters vs µm
  }

  function parseCadenceOutput(text) {
    const rows = [];
    text.split("\n").forEach(function (line) {
      if (!/master=/.test(line) || !/\bW=/.test(line) || !/\bL=/.test(line)) return;
      const master = (line.match(/master=(\S+)/) || [])[1] || "";
      const gate = (line.match(/gate=(\S+)/) || [])[1] || "?";
      const w = toUm((line.match(/\bW=(\S+)/) || [])[1]);
      const l = toUm((line.match(/\bL=(\S+)/) || [])[1]);
      const t = cadTypeOf(master);
      if (!t || !(w > 0) || !(l > 0)) return;
      rows.push({ type: t, gate: gate, w: w, l: l });
    });
    // group by type|gate|L(rounded) and sum widths
    const groups = {};
    rows.forEach(function (r) {
      const key = r.type + "|" + r.gate + "|" + r.l.toFixed(4);
      if (!groups[key]) groups[key] = { type: r.type, gate: r.gate, l: r.l, sumW: 0, n: 0 };
      groups[key].sumW += r.w; groups[key].n++;
    });
    const list = Object.keys(groups).map(function (k) { return groups[k]; });
    const bestOf = function (type) {
      return list.filter(function (g) { return g.type === type; })
                 .sort(function (a, b) { return b.sumW - a.sumW; })[0] || null;
    };
    return { rows: rows.length, groups: list, N: bestOf("N"), P: bestOf("P") };
  }

  if ($("parseCadOut")) {
    $("parseCadOut").addEventListener("click", function () {
      const res = parseCadenceOutput($("cad_out").value);
      const info = [];
      if (!res.rows) {
        info.push("⚠ No device rows found — paste the lines that contain master= / W= / L=.");
      } else {
        if (res.N) { $("cad_wN").value = +res.N.sumW.toFixed(4); $("cad_lN").value = +res.N.l.toFixed(4); }
        if (res.P) { $("cad_wP").value = +res.P.sumW.toFixed(4); $("cad_lP").value = +res.P.l.toFixed(4); }
        if (res.N) info.push("NMOS: summed " + res.N.n + " finger(s) on gate '" + res.N.gate +
          "' → W=" + (+res.N.sumW.toFixed(3)) + " µm, L=" + (+res.N.l.toFixed(3)) + " µm");
        if (res.P) info.push("PMOS: summed " + res.P.n + " finger(s) on gate '" + res.P.gate +
          "' → W=" + (+res.P.sumW.toFixed(3)) + " µm, L=" + (+res.P.l.toFixed(3)) + " µm");
        const nOther = res.groups.filter(function (g) { return g.type === "N"; }).length - (res.N ? 1 : 0);
        const pOther = res.groups.filter(function (g) { return g.type === "P"; }).length - (res.P ? 1 : 0);
        if (nOther > 0 || pOther > 0)
          info.push("(picked the largest-width gate group per type; " + (nOther + pOther) +
            " other group(s) — different gate/L — ignored. Series/cascode stacks are NOT auto-detected.)");
      }
      $("cadOutInfo").textContent = info.join("  ·  ");
      updateDiagram();
    });
  }

  function buildFromCadence(d) {
    const base = window.PROCESS_LIBRARY[$("cad_node").value];
    const params = {
      vdd: base.vdd, vthn: base.vthn, vthp: base.vthp,
      kpn: base.kpn, kpp: base.kpp, lambdan: base.lambdan, lambdap: base.lambdap, cox: base.cox
    };
    const wlN = ratio("cad_wN", "cad_lN"), wlP = ratio("cad_wP", "cad_lP");
    if (!(wlN > 0) || !(wlP > 0))
      throw new Error("Enter the NMOS/PMOS W and L from the SKILL script output first.");
    const ccompOv = $("cad_ccomp").value ? parseFloat($("cad_ccomp").value) * 1e-12 : null;
    const r = window.SquareLaw.generate({ params: params, wlN: wlN, wlP: wlP, ccomp: ccompOv, cpad: base.cpad });
    applyElectrical(d, params.vdd, r);
    const oaPath = $("cad_path").value.trim();
    const src = $("cad_useopen").checked ? "current schematic window" :
      $("cad_lib").value + "/" + $("cad_cell").value + (oaPath ? " (" + oaPath + ")" : "");
    d.provenance = "From Cadence cell " + src +
      " pin " + $("cad_pin").value +
      "; square-law on node=" + $("cad_node").value +
      ", W/L(n)=" + wlN + ", W/L(p)=" + wlP + ".";
  }

  function applyElectrical(d, vcc, r) {
    const m = d.model;
    m.vcc = vcc;
    m.vccMin = +(vcc * 0.9).toFixed(4);
    m.vccMax = +(vcc * 1.1).toFixed(4);
    m.ccomp = r.ccomp;
    m.pulldown = r.pulldown;
    m.pullup = r.pullup;
    m.gndClamp = r.gndClamp;
    m.powerClamp = r.powerClamp;
    m.ramp = r.ramp;
  }

  // ---- Color-code the .ibs text to match the schematic palette ----
  function esc(s) { return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;"); }

  // Map a [Section] name to {row, header} css classes; null = neutral keyword.
  function sectionClass(name) {
    switch (name) {
      case "Pulldown":     return { s: "s-pd",   h: "h-pd" };
      case "Pullup":       return { s: "s-pu",   h: "h-pu" };
      case "POWER Clamp":  return { s: "s-pwr",  h: "h-pwr" };
      case "GND Clamp":    return { s: "s-gnd",  h: "h-gnd" };
      case "Ramp":         return { s: "s-ramp", h: "h-ramp" };
      case "Package":      return { s: "s-pkg",  h: "h-pkg" };
      default:             return null;
    }
  }

  function highlightIbis(text) {
    let sec = null;   // current section row-class
    return text.split("\n").map(function (line) {
      const t = line.trimStart();
      let cls = "";
      const hdr = t.match(/^\[([^\]]+)\]/);
      if (t.startsWith("|")) {
        cls = "cmt";                                   // comment lines
      } else if (hdr) {
        const sc = sectionClass(hdr[1]);
        sec = sc ? sc.s : null;                         // set/clear active section
        cls = sc ? sc.h : "kw";                         // header colored or keyword
      } else if (/^C_comp\b/.test(t)) {
        cls = "s-cc";                                   // C_comp line -> cap color
      } else if (sec) {
        cls = sec;                                      // data rows inherit section color
      }
      return cls ? '<span class="' + cls + '">' + esc(line) + "</span>" : esc(line);
    }).join("\n");
  }

  // ---- Validation rendering ----
  function renderValidation(v) {
    const box = $("validation");
    box.innerHTML = "";
    function block(cls, items, icon) {
      items.forEach(function (t) {
        const div = document.createElement("div");
        div.className = "vmsg " + cls;
        div.textContent = icon + " " + t;
        box.appendChild(div);
      });
    }
    block("err", v.err, "✖");
    block("warn", v.warn, "⚠");
    block("ok", v.ok, "✔");
  }

  function dispatchBuild(d) {
    if (activeTab === "wl") buildFromWL(d);
    else if (activeTab === "rf") buildFromRF(d);
    else if (activeTab === "net") buildFromNet(d);
    else if (activeTab === "cad") buildFromCadence(d);
    else buildFromPaste(d);
  }

  // ---- Live diagram (updates on every input change, before Generate) ----
  function labelsFor() {
    if (activeTab === "wl")
      return { pu: "W/L = " + fmtRatio(ratio("wP", "lP")), pd: "W/L = " + fmtRatio(ratio("wN", "lN")),
               note: "Square-law estimate from device geometry." };
    if (activeTab === "net")
      return { pu: "W/L = " + fmtRatio(ratio("net_wP", "net_lP")), pd: "W/L = " + fmtRatio(ratio("net_wN", "net_lN")),
               note: "Parsed from netlist; square-law on extracted W/L." };
    if (activeTab === "cad")
      return { pu: "W/L = " + fmtRatio(ratio("cad_wP", "cad_lP")), pd: "W/L = " + fmtRatio(ratio("cad_wN", "cad_lN")),
               note: "From Cadence cell; square-law on entered W/L." };
    if (activeTab === "rf")
      return { pu: "linear driver (from edges)", pd: "linear driver (from edges)",
               note: "Reconstructed from measured rise/fall times." };
    return { pu: "from I-V data", pd: "from I-V data", note: "Assembled from pasted I-V / edge data." };
  }

  function updateDiagram() {
    updatePadVals();
    let m = null;
    try {
      const tmp = baseModel();
      dispatchBuild(tmp);
      m = tmp;
    } catch (e) { m = null; }
    if (!m || !m.model.pullup) { window.Diagram.render(null); return; }
    const mo = m.model;
    const peak = function (a) { return (a || []).reduce(function (x, r) { return Math.max(x, r.typ); }, 0); };
    const L = labelsFor();
    window.Diagram.render({
      vcc: mo.vcc,
      ccomp: mo.ccomp ? mo.ccomp.typ : null,
      peakPu: peak(mo.pullup), peakPd: peak(mo.pulldown),
      tr: mo.ramp ? mo.ramp.dtr.typ : NaN, tf: mo.ramp ? mo.ramp.dtf.typ : NaN,
      clamps: !!(mo.gndClamp && mo.gndClamp.length),
      pkg: { r: m.pkg.r, l: m.pkg.l, c: m.pkg.c },
      puLabel: L.pu, pdLabel: L.pd,
      ivPullup: mo.pullup, ivPulldown: mo.pulldown,
      note: L.note
    });
  }

  // Redraw live on any input/select/textarea change anywhere in the form.
  document.addEventListener("input", updateDiagram);
  document.addEventListener("change", updateDiagram);

  // ---- Generate ----
  $("generate").addEventListener("click", function () {
    try {
      const d = baseModel();
      dispatchBuild(d);

      const v = window.Validate.run(d);
      renderValidation(v);

      const dateStr = new Date().toISOString().slice(0, 10);
      lastText = window.IBIS.build(d, dateStr, APP_REV);
      $("output").innerHTML = highlightIbis(lastText);
      $("outCard").hidden = false;
      $("outCard").scrollIntoView({ behavior: "smooth", block: "start" });
    } catch (e) {
      alert("Could not generate model: " + e.message);
      console.error(e);
    }
  });

  // ---- Download / copy ----
  $("download").addEventListener("click", function () {
    if (!lastText) return;
    const name = ($("component").value.trim() || "model").toLowerCase().replace(/[^a-z0-9_]/g, "_") + ".ibs";
    const blob = new Blob([lastText], { type: "text/plain" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = name;
    a.click();
    URL.revokeObjectURL(a.href);
  });

  $("copy").addEventListener("click", function () {
    if (!lastText) return;
    navigator.clipboard.writeText(lastText).then(function () {
      const b = $("copy"); const old = b.textContent;
      b.textContent = "Copied!"; setTimeout(function () { b.textContent = old; }, 1200);
    });
  });

  // Initial render so the diagram is populated on first load.
  updateDiagram();
})();
