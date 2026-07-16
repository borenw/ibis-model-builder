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

  // ---- Generate ----
  $("generate").addEventListener("click", function () {
    try {
      const d = baseModel();
      if (activeTab === "wl") buildFromWL(d);
      else if (activeTab === "rf") buildFromRF(d);
      else buildFromPaste(d);

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
})();
