# RasmCAD 0.7 — executed release validation

Date: 2026-11-06. The exact tested HTML is 15,674,926 bytes, SHA256:

`9950fe4b4c4a517eb8601024ef5c5a75df9edb40e8c3fe8fd9ba72b4480599a6`

All **26 suites** in Source/test-results/v07-final-manifest.json passed, with unchanged HTML before/after each suite. Browser testing used Chromium155.0.8059.79 on Linux, exact standalone HTML served on allowed localhost and workflows offline after load. Zero uncaught browser errors or external requests occurred in the final UI reports. Physical Windows/Edge/UNRWA hardware was not available; no security policy was changed. This does not certify every CAD file, all AutoCAD options, or a compatibility percentage.

| Executed coverage | Result |
| --- | --- |
| New compound/solid/resources/ordinate core | 15 groups pass |
| New advanced editing geometry/rollback | 21 groups pass |
| New analytic object snaps | 19 groups pass |
| Hatch/holes/regions/boundary geometry | 15 groups pass |
| Reusable blocks/attributes/nesting/edit sessions | 25 groups pass |
| Named dimensions/continuation/ordinate/leaders | 27 groups pass |
| Vector PDF geometry/scale/font/independent Poppler | 15 checks pass |
| Compound mirror and later geometry regeneration | 6 groups pass |
| Real editing/snaps UI | 14 workflows pass |
| Real hatch/region/fill/pixel/download UI | 4 workflows pass |
| Real block/attribute/dimension/leader/plot UI | 8 workflows pass |
| Previous browser suites, including four display scales | 151 checks/workflows pass across7 suites |
| Previous model suites | Core13, advanced21, dimensions14, selection376, grips11, commands147 pass |
| Actual DWG/format/layer import | 39 groups pass |
| Binary/codepage DXF | 320 checks pass |

## What the UI tests actually did

Advanced editing tests create geometry with actual commands and keys; perform crossing STRETCH, interval BREAK, total LENGTHEN, ALIGN, vertex PEDIT, native SPLINE/SPLINEDIT, duplicate cleanup and EXPLOAD. Snap tests click near geometric intersection/perpendicular/tangent/nearest targets and verify the committed coordinates. A native spline is actually downloaded, reopened and edited again.

Hatch tests verify actual canvas pixels in a SOLID exterior and empty hole, inside/hole selection, native saving and editing after reopen, HATCHEDIT pattern changes, moving saved loops, actual DXF download/reopen, picked BOUNDARY/REGION/EXPLODE and no-selection picked-area HATCH. SOLID DXF export/reimport now retains filled faces.

System tests define a reusable block, insert a scaled reference, save/cancel BEDIT changes, add/edit/rename/remove attributes and reopen saved data, download/reopen WBLOCK native files, save/update/rename/persist named DIMSTYLE associations, create continued/baseline/ordinate dimensions, edit dimension text/placement, create/edit a multiarm leader, and download an actual A3 PDF at1:100 from a chosen model window. Plot settings survive native project saving/reopening.

The PDF tests independently check that a 1000mm model line at1:100 is exactly10mm on paper, physical MediaBox dimensions, clipping/units, paths/arcs/fills, embedded font and noImage objects. Poppler parses the generated PDF. The actual UI PDF reports A3 MediaBox1190.55×841.89points and PDF1.7. A rendered preview was visually inspected. Printer drivers must use Actual size/100% to preserve scale.

## Preserved semantics and limits

Compounds store their actual editable boundaries, control points, block matrices, attributes, leader paths and named style resources in native projects. Undo/Redo and move/scale/rotation/mirror preserve this metadata; later edits regenerate geometry consistently. Recursive bounds, picking, holes and complexity budgets are tested. Old native projects remain readable; old application versions cannot read the new kinds.

These are functional supported implementations, not full copies of every AutoCAD option. Important limits: Catmull–Rom rather than NURBS splines; partial compound STRETCH requires Explode; five built-in nonassociative hatch patterns; polygonal regions without ACIS/Boolean operations; isolated native block definition editing rather than full in-context/xref editing; native-project WBLOCK rather than DWG writing; no dynamic blocks or complete multiline/field-driven Attributes; named visual DIMSTYLE settings without the entire tolerance/alternate-unit/fit/annotative/associative system; fewer MLEADER options; one model-space PDF plot rather than Layout/Viewports/CTB/STB. Source SHX fonts and complex Arabic shaping/CJK may differ from the embedded DejaVu substitute.

DWG import still uses the existing partial local conversion, including flattened source blocks, sampled curves and unsupported source entities such as HATCH/custom objects/xrefs/layouts. Native DWG writing and unrestricted all-format visual fidelity remain unsupported. DXF export renders new systems as editable vector primitives and loses their native associations; .rasm.json retains them. No user-specific failing CAD drawing was supplied for a visual equivalence comparison.

## Reproduce

Build with node build.cjs. UPGRADE_0.7.md and its Arabic companion explain every added workflow; DEVELOPMENT.md covers setup. All test programs, actual fixtures, font source/license and deterministic font-subset generator are included in Source. Optional Poppler/fontTools are development tools; using the app requires no Python/Node or network conversion. Source/test-results includes the final manifest, logs and detailed new UI reports. A native advanced-example.rasm.json and its vector PDF are supplied for immediate inspection.

## Source hashes

```text
6f5773e615e6ba6b4b00fd47442c6ec75a8bb01415fc3bd98eab664bd0164593  src/advanced-edit.js
8d4638d30eb3b307c77f769230d261c799437607dbb2f708d4bdf49d46532003  src/advanced-ui.js
a5a50b1fab996522db42554f22c55936a9c7cf90226d58bfeba221114d14cf83  src/app.js
e2f899b731a61473f3e26ceb62609336688f18eff58c998f359c4f3f8fb203bf  src/blocks.js
bb6f7de8316e878cc533242a14d1d67921621579ce3055e2b4bdfd6f934c7570  src/commands.js
c977c5070893b782d020a2d62103424c13827bf0863f24f91f340877f65bac19  src/core.js
9c85c05a3a14ba51899c025df39996866c8b7e80373dc00a45b109561290e3f3  src/dimensions.js
a5bc895f5c63b1560bf0541a195e5e1477fa013dbc0c7528d90af3d9087cdabc  src/dxf-binary.js
c91bb39d3f77ebe9b04ca8c66757c568eed4f17f367d293e722144cdfb41ac5e  src/editing.js
f9c470240a5a27b41913159a6b4343d544303cbba0cdc7e078de8043500a44af  src/grips.js
9fe20a8732cf9d1ce702c2d0f0585202c941fa3b0da5bd466f7f0187037375cd  src/hatch.js
6ba6f7fae6ddcfc922d8b444b14647a0d2a09b91d7d259cf2148f9e4cd64ff64  src/index.html
538a321b9aff89f54134597be0ba3a50696ab5cda35b9e429d21fb6bc7dbee1a  src/io.js
bbb74a7394309d7c2b176e17c257c83cbe117df1dfd47f382d84a4455b6abd1a  src/plot-ui.js
281ed097e2116ae3f804fa78b7f56b2b3c8615fd06be922a94b38618cadf7b35  src/plot.js
f3b44bf8e4bd7120b846cde32a92d7050cad39d2da6c5d6d2b194773a2ee3c84  src/selection.js
e02e4a3a51dc98542c4deabc8ccc1169eb3e0a2f06b6258f665ae0742434947b  src/snaps.js
070a4e5e976ed637d2b1498d403315a9f4e187ea4d176e9417cdcf2c3e1b4131  src/style.css
68e1f999d15882a7a5c40faa5585f7da5fb438aa9f2f4077d20d4c841f66c215  src/view.js
```
