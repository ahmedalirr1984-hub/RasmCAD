# RasmCAD 0.7 implemented scope

This release substantially expands the independent 2D application. It does not establish 90% AutoCAD 2008 coverage, full Autodesk API/format compatibility or unrestricted visual fidelity. Commands with matching names implement the workflows below; their complete AutoCAD option systems are not implied.

| System | Implemented | Remaining material limits |
| --- | --- | --- |
| Drawing and view | LINE/PLINE/rectangle/circle/center-based arc/plain text; zoom/pan/fit/grid/ortho; English command input and history | Fewer construction options; no full dynamic-input/UCS/tracking system |
| Object snaps | Endpoint/midpoint/center/quadrant/intersection/perpendicular/tangent/nearest, selectable through OSNAPSET | Perpendicular/tangent require a base; intersections bound dense local pairs to 240 segments |
| Basic modify | Move/copy/rotate/positive uniform scale/mirror/trim/extend/offset/fillet/chamfer/arrays/join | Entity-specific limits; full curve fillet/offset systems absent; arrays are independent copies |
| Advanced modify | STRETCH crossing vertices; BREAK intervals; LENGTHEN total/delta/percent; two-pair ALIGN; PEDIT vertex/closure/join/reverse/stroke operations; OVERKILL duplicates/collinear overlaps | Partial stretch of hatch/block compounds requires Explode; no arbitrary nonuniform geometry deformation; style-separated cleanup and complexity limits |
| Splines | Native editable interpolating Catmull–Rom curves; SPLINEDIT vertices/tension/closure/reversal | Not NURBS or full imported SPLINE editing; imported source curves remain sampled |
| Explode | Native compounds, blocks, hatches, regions, leaders, splines, polylines and dimensions; solid arrow parts retained | Exploded parts lose original associations |
| Hatch/fill | Five patterns, spacing/angle, picked or selected closed areas, holes/islands, HATCHEDIT, filled SOLID/TRACE import | Curves polygonized; no associative boundary tracking, custom PAT engine or native source DWG HATCH import |
| Boundary/region | Bounded planar-face tracing, polygonal regions and holes | Not ACIS or a Boolean region engine; open/self-intersecting/complex inputs rejected |
| Blocks | Named reusable definitions/insertions, nested references, scale/rotation, shared updates, staged BEDIT/REFEDIT save/discard, native WBLOCK | REFEDIT is isolated definition editing, not in-context xref editing; WBLOCK writes native project, not DWG; imported CAD blocks still flattened; no dynamic blocks |
| Attributes | Tag/prompt/default/local position/height/rotation; invisible/constant/required flags; per-instance values, update/rename/remove/sync | No multiline/field-driven attributes or every Autodesk option |
| Dimensions | Aligned/horizontal/vertical/angular/radius/diameter; continued/baseline/signed ordinate; text/position/reset editing; persistent named rendered DIMSTYLE resources | No full tolerance/alternate-unit/fit/annotative/associative DIMSTYLE system; unsupported options rejected |
| Leaders | QLEADER/MLEADER with arrows, labels and multiple arms; edit text/location/add/remove arms; persistent metadata | Fewer content/attachment/style options; no full block/field-content system |
| Plotting | Actual vector PDF; A4–A0/Letter/Legal/custom; orientation/margins/unit conversion/scale1:N/extents/window/selected bounds; mono/color/line weights; stored settings | Single model-space plot, no layouts/viewports/CTB/STB. Embedded substitute font; SHX/CJK/complex shaping may differ. Print PDF at100% |
| Native model | Editable compounds/solids/block/style/plot resources, bounded Undo/Redo, native save/reopen and old-project import | Old app versions cannot open new compound kinds; complexity/file-size limits remain |
| Layers/properties | Actual source locks/visibility, safe writable current layer, explicit undoable unlock, full ACI and truecolor/ByLayer | No full layer-state/linetype/transparency/plot-style systems |
| CAD exchange | Real local DWG decoding; ASCII/binary DXF; content-recognized DWG-based DWT/DWS/BAK/SV$; vector DXF export | Partial model-space conversion; no native DWG writing; source custom objects/xrefs/fonts/layouts/3D/advanced data incomplete. DXF export flattens new compound associations |
| Other CAD systems | Not implemented | DWF/DWFx/DGN full import, 3D, AutoLISP/VBA/.NET, sheet sets and complete external-reference systems remain absent |

UPGRADE_0.7.md and its Arabic companion describe actual workflows and limitations. TEST_RESULTS.md records the exact tested artifact and validation environment. Passing these checks does not establish performance or fidelity for every user drawing.
