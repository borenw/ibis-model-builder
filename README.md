# IBIS Model Builder

A tiny, dependency-free, **100% client-side** web tool that generates a board-level
[IBIS](https://ibis.org/) (`.ibs`) model for a CMOS I/O buffer — right in your browser.

There is no modern web front-end for building IBIS models; the classic free tool
(`s2ibis3`) is 2005-era C. This fills that gap with a clean HTML UI and three ways in:

| Input path | What you give it | Trust level |
|---|---|---|
| **Device W/L + process** | NMOS/PMOS W/L ratios + a process node (incl. **SkyWater sky130**) | ⭐ Ballpark — square-law physics |
| **Rise / Fall @ load** | Measured/simulated edge rates at a known load cap | ⭐⭐⭐ Real behavioral data |
| **Paste I‑V / V‑t** | Raw pullup/pulldown I‑V points + edge rates | ⭐⭐⭐⭐ Whatever you feed it |
| **Paste SPICE netlist** | A netlist of your buffer — it **auto-detects the PAD** net and pulls the output-stage W/L for you | ⭐ Ballpark — square-law on the extracted geometry |
| **Cadence schematic** | Lib/cell/view + pin → generates a Virtuoso **SKILL/OCEAN** script to extract the pin's driver W/L | ⭐ Ballpark — square-law on the extracted geometry |

All five feed **one** IBIS assembler core, so the output format is identical
regardless of input.

### Live model preview

As you type — **before** you click Generate — the tool draws the buffer model as a
schematic and a mini I‑V plot that update in real time: PMOS pull-up, NMOS pull-down,
PAD node, `C_comp`, POWER/GND clamp diodes, and package `R/L/C`, each labelled with
its current value.

### Derived driver on-resistance

IBIS has **no explicit driver resistance** — the pull-up/pull-down sections are `I(V)`
tables (a nonlinear voltage-controlled current, i.e. a nonlinear resistor). The tool
derives the **driver output impedance** `R_on = dV/dI` from the near-rail slope of those
tables and shows it on the schematic for both devices, and as **informational comment
lines in the generated `.ibs`** (clearly marked — it is not a real IBIS keyword). This
is the number SI engineers read off the I‑V curve for impedance matching; `τ ≈ R_on·C_total`
ties it to the step response.

### Transient step response

A live **step-response simulation** drives the output node (C_comp + an external load
you set) with the model's own nonlinear pull-up / pull-down I‑V tables — integrating
`dV/dt = I(V)/C_total` — and plots the rising and falling edges. A **1τ crosshair**
marks each edge: 63.2 % of the swing on the way up, 36.8 % on the way down (the
exponential-equivalent time constant), labelled `τ↑` and `τ↓` in ns. It's a real
nonlinear sim of the behavioral model, not an RC approximation.

The generated `.ibs` text is **color-coded with the same palette as the schematic** —
`[Pulldown]` matches the NMOS, `[Pullup]` the PMOS, `[POWER Clamp]`/`[GND Clamp]` the
clamp diodes, `C_comp`/`C_pkg` the caps, `[Package]` the R/L, and `[Ramp]` its own hue —
so you can trace every table in the file straight back to a component in the drawing.

### Cadence schematic path

A browser can't read a Virtuoso OA database or a filesystem path directly, so the
Cadence tab generates a **SKILL/OCEAN script** you paste into the Virtuoso CIW. By
default it reads the **schematic currently open in Virtuoso** (`geGetEditCellView()`)
so you don't have to type anything — untick that to enter library / cell / view
manually instead. Either way you give it a **PAD net pattern**. It netlists the cell (which
you can then drop into the *Paste SPICE netlist* tab) and prints the W/L of every FET
whose drain touches a PAD net — the push-pull output devices. Paste those numbers
back to build the model.

PAD nets are usually named `PAD`, `PAD1`, `PAD_A`, … so the pin field accepts a
**wildcard** — the default `PAD*` matches all of them (netlist auto-detection matches
the same `PAD*` naming). There's also an optional **Schematic OA path** field: give it
the path to your OA library and the script registers the library (`ddCreateLib`) so
`lib/cell/view` resolves even if it isn't in your `cds.lib` yet. The same script is
committed for standalone use at [`tools/extract_pad_wl.il`](tools/extract_pad_wl.il).

### PAD auto-detection

Paste a SPICE netlist and the tool finds the I/O pin for you: the **PAD is the
net that is the drain of both an output NMOS and an output PMOS** (the push-pull
node). Supply rails (`VDD/VCC/VPWR/…`, `VSS/GND/VGND/…`) and the input net are
detected by role and name. Every guess is shown in a dropdown you can override.
Works with plain `M...` devices and SkyWater `X...nfet/pfet...` subckt devices,
including `+` continuation lines.

## ⚠️ Accuracy disclaimer

This tool produces a **first-order estimate**, not silicon-validated data.

- The **W/L path** uses the long-channel (Shichman–Hodges) square-law MOSFET model.
  It ignores velocity saturation, mobility degradation, and short-channel effects, so
  it will **overstate drive strength at modern nodes**. Treat it as intuition-building.
- The **Rise/Fall** and **Paste** paths are only as good as the data you provide, but
  because they start from real behavioral measurements they are far more trustworthy.
- **Always** run the output through the golden parser
  [`ibischk`](https://ibis.org/tools/) and correlate against SPICE or measurement
  before using a model for real board sign-off.

## Usage — pick the easiest for you

**① Zero-install, online (one click):** just open the hosted page —
👉 **https://borenw.github.io/ibis-model-builder/** — nothing to download.

**② One self-contained file (offline, one click):** grab
[`dist/ibis-model-builder.html`](dist/ibis-model-builder.html), download it, and
**double-click**. Everything (HTML + CSS + JS) is inlined into that single file —
no server, no install, works with no internet.

**③ From source:** open `index.html` in a browser (no build step needed to run).

Then, in any of the above:

1. Fill in the component/model basics and your pin list.
2. Pick an input tab and enter your data (or paste a netlist and hit **Parse**).
3. Click **Generate** → review the built-in sanity checks → **Download `.ibs`**.

### Rebuilding the single-file bundle

The standalone file is generated from source by inlining every asset:

```
python3 build.py     # -> dist/ibis-model-builder.html
```

## Process library

Parameters live in [`js/process-library.js`](js/process-library.js), grouped in the
dropdown by family:

- **sky130** — anchored to the SkyWater open PDK (1.8 V devices, `toxe = 11.6 nm` →
  `Cox ≈ 3.0 fF/µm²`).
- **TSMC-class nodes (estimated)** — 180 / 130 / 65 / 40 / 28 nm and 16 nm FinFET,
  each with its device **flavors**: **LV core**, **MV I/O**, and **HV I/O**. An I/O
  buffer almost always uses the MV/HV I/O device (thick oxide, higher Vdd/Vth), *not*
  the LV core — so pick the flavor your pad driver actually uses. ⚠️ These are generic
  ballpark typicals for a node of that generation, **not confidential TSMC PDK data**
  (those are under NDA). The 16 nm FinFET entries carry an extra caveat: square-law is
  a poor fit for FinFETs (drive is per-fin/quantized, not W/L-continuous).
- **Generic textbook** nodes and a **Custom** option (type parameters directly).

Enter device geometry as **separate width (W) and length (L)** boxes in µm — the tool
computes W/L for you. Add your own node by dropping a new entry in the file.

Each node also carries an estimated **standard pad-ring capacitance** (bond pad + ESD),
which usually dominates `C_comp`. It's folded into the auto `C_comp` estimate, shown
next to the override field, and there's a one-click button to fill the override with
the full estimate (device + pad ring). Bigger/older pads and higher-voltage (bigger
ESD) flavors get larger values.

## Project layout

```
index.html              UI
css/style.css           styling (light + dark)
js/process-library.js   per-node square-law parameters (incl. sky130)
js/ibis-core.js         the assembler: normalized data -> .ibs text
js/square-law.js        adapter: W/L + process -> model data
js/risefall.js          adapter: rise/fall @ Cload -> model data
js/netlist.js           adapter: SPICE netlist -> PAD/W/L -> model data
js/diagram.js           live schematic + I-V preview (redraws as you type)
js/transient.js         step-response sim + 1-tau crosshair plot
js/validate.js          lightweight sanity checks (not ibischk)
js/app.js               DOM wiring (incl. Cadence SKILL/OCEAN generator)
build.py                inlines everything -> dist/ibis-model-builder.html
dist/                   the single-file, double-click-to-run bundle
```

Each input adapter produces the same normalized model-data object; `ibis-core.js`
turns that into IBIS v3.2 text. To add a new input method, write an adapter that emits
the normalized shape (documented at the top of `ibis-core.js`) — the assembler and
validator come for free.

## Roadmap

- [ ] `ngspice`-WASM adapter: run a real buffer sim in-browser from a user-uploaded
      model card (accurate W/L path).
- [ ] Port/compile `ibischk` to WASM for true golden validation.
- [ ] IBIS-AMI export for high-speed SerDes.
- [ ] Per-corner (typ/min/max) independent parameter entry instead of ±% proxies.

## License

MIT — see [LICENSE](LICENSE). Not affiliated with the IBIS Open Forum.
