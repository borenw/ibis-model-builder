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

lib    = "my_lib"
cell   = "io_buffer"
view   = "schematic"
padPat = "PAD*"            ; shell-style wildcard; * matches any suffix

;; --- convert the wildcard to an anchored SKILL regex --------------------
padRx = strcat( "^" (rexReplace( rexReplace( padPat "\\*" ".*" 0 ) "\\." "\\." 0 )) "$" )

;; --- 1) netlist the cell to SPICE --------------------------------------
simulator( 'spectre )
design( lib cell view )
resultsDir( strcat( "/tmp/" cell "_ibis" ) )
createNetlist( ?recreateAll t ?display nil )
printf("\nSPICE netlist written under /tmp/%s_ibis -- paste it into the web tool.\n" cell)

;; --- 2) report W/L of FETs whose drain touches a PAD net ---------------
cv = dbOpenCellViewByType( lib cell view "" "r" )
foreach( net cv~>nets
  when( rexMatchp( padRx net~>name )
    printf("=== PAD net: %s ===\n" net~>name)
    foreach( iterm net~>instTerms
      when( iterm~>name == "D" || rexMatchp( "D\\|DRAIN\\|PLUS" upperCase(iterm~>name) )
        inst  = iterm~>inst
        mname = inst~>master~>cellName
        when( rexMatchp( "fet\\|mos\\|nch\\|pch" lower(mname) )
          w = dbReadCDFParam( inst "w" ) || inst~>w
          l = dbReadCDFParam( inst "l" ) || inst~>l
          printf("  driver %-18s model=%-26s W=%L  L=%L\n" inst~>name mname w l)
        )
      )
    )
  )
)
printf("Copy the pfet/nfet W and L into the web tool.\n")

;; NOTE: CDF parameter names vary by PDK. If W/L come back nil, your models
;; may use fw / nf / totalw etc. -- adjust the dbReadCDFParam keys above.
