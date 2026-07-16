;; ======================================================================
;; extract_pad_wl.il
;; ----------------------------------------------------------------------
;; Companion to the IBIS Model Builder (github.com/borenw/ibis-model-builder).
;;
;; A browser can't read a Cadence OA database, so run this in the Virtuoso
;; CIW to (1) netlist your buffer cell to SPICE and (2) print the W/L of the
;; PAD's push-pull output devices. Then paste the netlist into the
;; "Paste SPICE netlist" tab, or type the W/L into the "Cadence schematic"
;; tab, and generate the .ibs.
;;
;; PAD nets are usually named PAD, PAD1, PAD_A, ... -> the default pattern
;; "PAD*" matches all of them.
;;
;; Usage: edit the four vars below, then load/paste this file in the CIW.
;; ======================================================================

useOpen = t               ; t = read the schematic in the CURRENT window
lib    = "my_lib"         ; (used only when useOpen = nil)
cell   = "io_buffer"
view   = "schematic"
padPat = "PAD*"            ; shell-style wildcard; * matches any suffix
oaPath = ""               ; optional: path to the OA library dir (else "")

;; --- convert the wildcard to an anchored SKILL regex --------------------
padRx = strcat( "^" (rexReplace( rexReplace( padPat "\\*" ".*" 0 ) "\\." "\\." 0 )) "$" )

;; --- 0) pick the cellview: current window, or lib/cell/view -----------
if( useOpen then
  cv = geGetEditCellView()
  unless( cv error("No cellview in the current window. Open your schematic and retry.") )
  lib = cv~>libName  cell = cv~>cellName  view = cv~>viewName
  printf("Using open cellview: %s / %s / %s\n" lib cell view)
else
  when( and( oaPath nequal( oaPath "" ) )
    unless( ddGetObj( lib ) ddCreateLib( lib oaPath ) )
  )
  cv = dbOpenCellViewByType( lib cell view "" "r" )
)

;; --- 1) netlist the cell to SPICE --------------------------------------
simulator( 'spectre )
design( lib cell view )
resultsDir( strcat( "/tmp/" cell "_ibis" ) )
createNetlist( ?recreateAll t ?display nil )
printf("\nSPICE netlist written under /tmp/%s_ibis -- paste it into the web tool.\n" cell)

;; --- 2) report W/L of EVERY instance on a PAD net ----------------------
;; No over-filtering, so you always see something. The FETs among the rows
;; are your drivers (pfet = pull-up, nfet = pull-down). Tries the common
;; CDF param names for W and L.
procedure( getP( cdf names )
  let( (p val)
    foreach( nm names
      p = and( cdf get( cdf nm ) )
      when( and( p p~>value ) val = p~>value )
    )
    val
  )
)

;; (cv was opened in step 0 above)
matched = 0  seen = nil
foreach( net cv~>nets
  when( rexMatchp( padRx net~>name )
    matched = matched + 1
    printf("=== PAD net: %s ===\n" net~>name)
    foreach( iterm net~>instTerms
      inst = iterm~>inst
      unless( member( inst seen )
        seen = cons( inst seen )
        cdf = cdfGetInstCDF( inst )
        w = getP( cdf '("w" "fw" "wf" "wtot" "totalw" "W") )
        l = getP( cdf '("l" "lr" "L") )
        printf("  %-16s master=%-22s term=%-4s W=%A  L=%A\n"
               inst~>name inst~>master~>cellName iterm~>name w l)
      )
    )
  )
)
when( zerop( matched )
  printf("\n[!] No net matched \"%s\". Nets in this cell (pick one):\n" padRx)
  foreach( net cv~>nets printf("    %s\n" net~>name) )
)
printf("\n--> pfet W/L = pull-up, nfet W/L = pull-down. Or paste the SPICE netlist into the web tool.\n")

;; NOTE: if W/L still come back nil, print all params for one instance to
;; find the right names:  cdfGetInstCDF(inst)~>parameters~>name
