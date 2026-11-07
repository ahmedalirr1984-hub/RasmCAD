# RasmCAD 0.9-dev implemented scope

These are the delivery groups for this development cycle, not a measured ranking
of AutoCAD usage or a claim of 90% compatibility. Earlier capabilities remain;
matching command names do not imply the complete AutoCAD option system.

| Current workflow | Added or strengthened in 0.9 | Remaining material limits |
| --- | --- | --- |
| Selection | Fence, window/crossing polygons, Quick Select by type/layer/color, previous selection | Supported application geometry only; hidden/locked layer rules still apply |
| Object snaps | Extension and acquired parallel references; pruned intersection candidates with explicit completeness reporting | Parallel needs a base and acquired reference; finite pair budget can still report incomplete dense searches |
| PLINE / PEDIT | Native mixed line/analytic arc paths, three-point arc input, physical variable widths, per-segment edits, reverse/open/close, Explode | Width fills are tessellated; no general curve OFFSET, NURBS polyline fitting or complete AutoCAD PEDIT options; imported bulges may still be sampled |
| TRIM / EXTEND | Fence/Crossing target groups and group-local Undo; analytic centerlines for native curved polylines | Unsupported/no-cut targets are skipped with a count; no universal boundary or curve topology engine |
| MATCHPROP | Explicit choice to apply compatible styles to compound children, with atomic validation | Only modeled properties; no linetype/transparency or every Autodesk property |
| Dimensions | Explicit DIMASSOC for supported line/circle sources, persistent links, label offsets, orphan notices and Undo | No general associative constraint graph, automatic source binding on every new dimension, alternate units, tolerances or full annotative system |
| Page setups / plot styles | Named setup storage, physical paper/scale/window settings and RGB-to-printed-color/weight mapping | Custom mapping is not an AutoCAD CTB/STB parser; source CAD plot data is not fully imported |
| Plot layouts / publishing | 1–16 independently scaled/clipped viewports per custom plot layout; selected layouts to multi-page vector PDF | Plot-layout data, not full interactive AutoCAD paper-space viewport editing; maximum 32 PDF sheets per batch |
| Save / CAD exchange | Genuine offline experimental DWG2000 encoder with readback geometry comparison; existing native and versioned DXF choices | R2000 only for DWG writing; CAD exports flatten structures; truecolor maps to ACI; Windows-1256 layer-name limit; target AutoCAD application not tested |
| Recovery | Optional IndexedDB recovery: last three snapshots, checksum validation, restore UI | Default off; 16 MiB per snapshot; specific to browser/origin; not disk save or cloud backup |

See [TEN-WORKFLOWS.md](docs/TEN-WORKFLOWS.md) for exact commands and
[TEST_RESULTS.md](TEST_RESULTS.md) for the checks actually run. The table below records the broader retained functionality with current limits.

## Broader retained 2D functionality

The independent 2D application also retains the systems below. It does not establish 90% AutoCAD 2008 coverage, full Autodesk API/format compatibility or unrestricted visual fidelity. Commands with matching names implement the workflows below; their complete AutoCAD option systems are not implied.

| System | Implemented | Remaining material limits |
| --- | --- | --- |
| Drawing and view | LINE/mixed line-arc PLINE/rectangle/circle/center-based or 3P arc/plain text; zoom/pan/fit/grid/ortho; English command input and history | Fewer construction options; no full dynamic-input/UCS/tracking system |
| Object snaps | Endpoint/midpoint/center/quadrant/intersection/perpendicular/tangent/nearest/extension/parallel, selectable through OSNAPSET | Perpendicular/tangent/parallel need references; dense intersection searches have a reported pair budget |
| Basic modify | Move/copy/rotate/positive uniform scale/mirror/trim/extend/offset/fillet/chamfer/arrays/join | Entity-specific limits; full curve fillet/offset systems absent; arrays are independent copies |
| Advanced modify | STRETCH crossing vertices; BREAK intervals; LENGTHEN total/delta/percent; two-pair ALIGN; PEDIT vertex/closure/join/reverse/stroke operations; OVERKILL duplicates/collinear overlaps | Partial stretch of hatch/block compounds requires Explode; no arbitrary nonuniform geometry deformation; style-separated cleanup and complexity limits |
| Splines | Native editable interpolating Catmull–Rom curves; SPLINEDIT vertices/tension/closure/reversal | Not NURBS or full imported SPLINE editing; imported source curves remain sampled |
| Explode | Native compounds, blocks, hatches, regions, leaders, splines, polylines and dimensions; solid arrow parts retained | Exploded parts lose original associations |
| Hatch/fill | Five patterns, spacing/angle, picked or selected closed areas, holes/islands, HATCHEDIT, filled SOLID/TRACE import | Curves polygonized; no associative boundary tracking, custom PAT engine or native source DWG HATCH import |
| Boundary/region | Bounded planar-face tracing, polygonal regions and holes | Not ACIS or a Boolean region engine; open/self-intersecting/complex inputs rejected |
| Blocks | Named reusable definitions/insertions, nested references, scale/rotation, shared updates, staged BEDIT/REFEDIT save/discard, native WBLOCK | REFEDIT is isolated definition editing, not in-context xref editing; WBLOCK writes native project, not DWG; imported CAD blocks still flattened; no dynamic blocks |
| Attributes | Tag/prompt/default/local position/height/rotation; invisible/constant/required flags; per-instance values, update/rename/remove/sync | No multiline/field-driven attributes or every Autodesk option |
| Dimensions | Aligned/horizontal/vertical/angular/radius/diameter; continued/baseline/signed ordinate; text/position/reset editing; persistent named rendered DIMSTYLE resources | Explicit native line/circle associations supported; no full tolerance/alternate-unit/fit/annotative DIMSTYLE system; unsupported options rejected |
| Leaders | QLEADER/MLEADER with arrows, labels and multiple arms; edit text/location/add/remove arms; persistent metadata | Fewer content/attachment/style options; no full block/field-content system |
| Plotting | Actual vector PDF; A4–A0/Letter/Legal/custom; orientation/margins/unit conversion/scale1:N/extents/window/selected bounds; mono/color/line weights; stored settings | Custom independently scaled plot layouts and batch PDF supported; no full AutoCAD paper-space editing or CTB/STB. Embedded substitute font; SHX/CJK/complex shaping may differ. Print PDF at100% |
| Native model | Editable compounds/solids/block/style/plot resources, bounded Undo/Redo, native save/reopen and old-project import | Old app versions cannot open new compound kinds; complexity/file-size limits remain |
| Layers/properties | Actual source locks/visibility, safe writable current layer, explicit undoable unlock, full ACI and truecolor/ByLayer | No full layer-state/linetype/transparency/plot-style systems |
| CAD exchange | Real local DWG decoding; ASCII/binary DXF; content-recognized DWG-based DWT/DWS/BAK/SV$; vector DXF export | Partial model-space conversion; experimental DWG2000 writing with geometry readback; modern DWG writing unavailable. Source custom objects/xrefs/fonts/layouts/3D/advanced data incomplete; CAD exports flatten native associations |
| Other CAD systems | Not implemented | DWF/DWFx/DGN full import, 3D, AutoLISP/VBA/.NET, sheet sets and complete external-reference systems remain absent |

UPGRADE_0.7.md and its Arabic companion retain the earlier release record; the current workflow guide above supersedes changed limits. TEST_RESULTS.md records the exact tested artifact and validation environment. Passing these checks does not establish performance or fidelity for every user drawing.
