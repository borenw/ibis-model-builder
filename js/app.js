/*
 * app.js -- UI wiring for the IBIS Model Builder.
 * Reads the DOM, dispatches to the active input adapter, assembles the
 * .ibs via IBIS.build, validates, and renders / downloads the result.
 */
(function () {
  "use strict";

  const $ = function (id) { return document.getElementById(id); };
  const num = function (id) { return parseFloat($(id).value); };

  let activeTab = "wl";
  let lastText = "";

  // ---- Populate process-node dropdown ----
  const nodeSel = $("node");
  Object.keys(window.PROCESS_LIBRARY).forEach(function (key) {
    const o = document.createElement("option");
    o.value = key;
    o.textContent = window.PROCESS_LIBRARY[key].label;
    nodeSel.appendChild(o);
  });
  nodeSel.value = "sky130";

  // Mirror the node list into the netlist tab's own selector.
  const netNodeSel = $("net_node");
  Object.keys(window.PROCESS_LIBRARY).forEach(function (key) {
    const o = document.createElement("option");
    o.value = key; o.textContent = window.PROCESS_LIBRARY[key].label;
    netNodeSel.appendChild(o);
  });
  netNodeSel.value = "sky130";

  const cadNodeSel = $("net_node") && $("cad_node");
  if (cadNodeSel) {
    Object.keys(window.PROCESS_LIBRARY).forEach(function (key) {
      const o = document.createElement("option");
      o.value = key; o.textContent = window.PROCESS_LIBRARY[key].label;
      cadNodeSel.appendChild(o);
    });
    cadNodeSel.value = "sky130";
  }

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
  function buildFromWL(d) {
    const params = {
      vdd: num("p_vdd"), vthn: num("p_vthn"), vthp: num("p_vthp"),
      kpn: num("p_kpn"), kpp: num("p_kpp"),
      lambdan: num("p_ln"), lambdap: num("p_lp"), cox: num("p_cox")
    };
    const ccompOv = $("wlCcomp").value ? num("wlCcomp") * 1e-12 : null;
    const r = window.SquareLaw.generate({
      params: params, wlN: num("wlN"), wlP: num("wlP"), ccomp: ccompOv
    });
    applyElectrical(d, params.vdd, r);
    d.provenance = "Square-law estimate. node=" + nodeSel.value +
      ", W/L(n)=" + num("wlN") + ", W/L(p)=" + num("wlP") + ", Vcc=" + params.vdd + "V.";
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
    $("net_wlN").value = isFinite(r.output.nWL) ? +r.output.nWL.toFixed(3) : "";
    $("net_wlP").value = isFinite(r.output.pWL) ? +r.output.pWL.toFixed(3) : "";
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
    const wlN = parseFloat($("net_wlN").value), wlP = parseFloat($("net_wlP").value);
    if (!(wlN > 0) || !(wlP > 0)) throw new Error("Could not determine output W/L — set NMOS/PMOS W/L manually.");
    const ccompOv = $("net_ccomp").value ? parseFloat($("net_ccomp").value) * 1e-12 : null;
    const r = window.SquareLaw.generate({ params: params, wlN: wlN, wlP: wlP, ccomp: ccompOv });
    applyElectrical(d, params.vdd, r);
    d.provenance = "Parsed from SPICE netlist. PAD=" + $("net_pad").value +
      ", VDD=" + $("net_vdd").value + ", GND=" + $("net_gnd").value +
      "; square-law on node=" + netNodeSel.value + ", W/L(n)=" + wlN + ", W/L(p)=" + wlP + ".";
  }

  // ---- Cadence tab: generate a SKILL/OCEAN extraction script ----
  function skillScript(lib, cell, view, pin) {
    return [
      ";; ===================================================================",
      ";; IBIS Model Builder -- extract PAD driver W/L from a Virtuoso cell",
      ";; Paste into the Virtuoso CIW and press Enter. Run from a shell with",
      ";; the PDK loaded so the netlister and CDF params are available.",
      ";; ===================================================================",
      'lib  = "' + lib + '"',
      'cell = "' + cell + '"',
      'view = "' + view + '"',
      'pin  = "' + pin + '"    ; the PAD / I-O net name',
      "",
      ";; 1) Netlist the cell to SPICE so you can paste it into the",
      ";;    'Paste SPICE netlist' tab (which auto-detects the PAD):",
      "simulator( 'spectre )",
      "design( lib cell view )",
      'resultsDir( strcat( "/tmp/" cell "_ibis" ) )',
      "createNetlist( ?recreateAll t ?display nil )",
      'printf("\\nSPICE netlist written under /tmp/%s_ibis -- open input.scs / netlist and paste it into the web tool.\\n" cell)',
      "",
      ";; 2) Print the W/L of every FET whose drain touches the PAD net",
      ";;    (the push-pull output devices). Param names vary by PDK --",
      ";;    adjust w/l below if your models use fw/nf/etc.",
      'cv = dbOpenCellViewByType( lib cell view "" "r" )',
      "theNet = car( setof( n cv~>nets  n~>name == pin ) )",
      "when( theNet",
      "  foreach( iterm theNet~>instTerms",
      "    inst  = iterm~>inst",
      "    mname = inst~>master~>cellName",
      '    when( rexMatchp( "fet\\\\|mos\\\\|nch\\\\|pch" lower(mname) )',
      '      w = dbReadCDFParam( inst "w" ) || inst~>w',
      '      l = dbReadCDFParam( inst "l" ) || inst~>l',
      '      printf("PAD driver: %-22s model=%-28s W=%L  L=%L\\n" inst~>name mname w l)',
      "    )",
      "  )",
      ")",
      'printf("Copy the W and L above into the W/L fields, or paste the netlist into the netlist tab.\\n")'
    ].join("\n");
  }

  if ($("genSkill")) {
    $("genSkill").addEventListener("click", function () {
      const s = skillScript(
        $("cad_lib").value.trim() || "my_lib",
        $("cad_cell").value.trim() || "io_buffer",
        $("cad_view").value.trim() || "schematic",
        $("cad_pin").value.trim() || "PAD"
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

  function buildFromCadence(d) {
    const base = window.PROCESS_LIBRARY[$("cad_node").value];
    const params = {
      vdd: base.vdd, vthn: base.vthn, vthp: base.vthp,
      kpn: base.kpn, kpp: base.kpp, lambdan: base.lambdan, lambdap: base.lambdap, cox: base.cox
    };
    const wlN = parseFloat($("cad_wlN").value), wlP = parseFloat($("cad_wlP").value);
    if (!(wlN > 0) || !(wlP > 0))
      throw new Error("Enter the NMOS/PMOS W/L from the SKILL script output first.");
    const ccompOv = $("cad_ccomp").value ? parseFloat($("cad_ccomp").value) * 1e-12 : null;
    const r = window.SquareLaw.generate({ params: params, wlN: wlN, wlP: wlP, ccomp: ccompOv });
    applyElectrical(d, params.vdd, r);
    d.provenance = "From Cadence cell " + $("cad_lib").value + "/" + $("cad_cell").value +
      " pin " + $("cad_pin").value + "; square-law on node=" + $("cad_node").value +
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
      return { pu: "W/L = " + ($("wlP").value || "?"), pd: "W/L = " + ($("wlN").value || "?"),
               note: "Square-law estimate from device geometry." };
    if (activeTab === "net")
      return { pu: "W/L = " + ($("net_wlP").value || "?"), pd: "W/L = " + ($("net_wlN").value || "?"),
               note: "Parsed from netlist; square-law on extracted W/L." };
    if (activeTab === "cad")
      return { pu: "W/L = " + ($("cad_wlP").value || "?"), pd: "W/L = " + ($("cad_wlN").value || "?"),
               note: "From Cadence cell; square-law on entered W/L." };
    if (activeTab === "rf")
      return { pu: "linear driver (from edges)", pd: "linear driver (from edges)",
               note: "Reconstructed from measured rise/fall times." };
    return { pu: "from I-V data", pd: "from I-V data", note: "Assembled from pasted I-V / edge data." };
  }

  function updateDiagram() {
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
      lastText = window.IBIS.build(d, dateStr);
      $("output").textContent = lastText;
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
