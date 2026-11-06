# RasmCAD 0.7 — advanced 2D guide

Open the extracted standalone HTML in Edge/Chrome and confirm 0.7. Save a project from an older tab before closing it. New compound objects require this release; older application versions cannot read them. The Source folder includes editable modules, tests, font source, licenses and build scripts.

All commands below are available through the command field and the expandable **Advanced 2D** tool group. Select source objects before a command, or select them when prompted and press Enter. Escape cancels an unfinished command. Forms validate inputs before geometry is applied.

## Object snaps

Run **OSNAPSET**, enable the desired modes and Apply. F3 toggles running snaps. Endpoint, midpoint, center and quadrant remain available; intersection, perpendicular, tangent and nearest are added. Perpendicular and tangent require a first/base point. Move close to the desired foot or contact; the coordinate strip displays the snap type. Intersections reuse analytic editing intersections; in dense areas the nearest 240 local segments bound the pair work.

## Editing

| Command | Workflow |
| --- | --- |
| STRETCH | Two corners of a crossing window, then base and destination points. Captured line/polyline/dimension vertices move; completely enclosed objects translate. Partial block/hatch stretching requires Explode first. |
| BREAK | Select one supported line/polyline/arc/circle, then specify two break points. The interval between projected picks is removed; circle direction is counterclockwise from first to second. |
| LENGTHEN | Select one open path/arc, choose TOTAL, DELTA or PERCENT and value, then pick near the endpoint to change. |
| ALIGN | Select objects; choose whether to scale; pick source1, destination1, source2, destination2. Uses translation/rotation and optional uniform scaling. |
| PEDIT | Close/open/reverse/join or insert, move and delete zero-based vertices. Command form also accepts `PEDIT VERTEX 1 200 50` or `PEDIT WIDTH 2`. Width uses the display stroke system. |
| SPLINE | Enter control/interpolation points, then blank Enter. Creates an editable interpolating Catmull–Rom curve. |
| SPLINEDIT | Select a native spline; change vertices, tension, reversal or closure. Imported sampled polylines are not native NURBS splines. |
| OVERKILL | Select objects and specify tolerance. Removes compatible duplicate/reversed objects and merges compatible collinear overlaps. Different layers/styles remain separate. |
| EXPLODE / EXPLOAD / X | Explodes native blocks, hatches, regions, leaders, splines, polylines and dimensions into supported parts. Filled arrows remain solid primitives. |

## Hatching and planar regions

Select closed outlines and their inner outlines, then **HATCH**. With no selection, choose settings and pick inside a closed area. Available patterns are SOLID, ANSI31, CROSS, HORIZONTAL and VERTICAL; spacing and angle use drawing units/degrees. Nested islands follow the even-odd rule. **HATCHEDIT** changes a selected native hatch's settings without losing its boundary loops. Move/scale/rotate/mirror preserve editable boundary data.

**BOUNDARY** traces the bounded face containing an interior pick from visible supported geometry. **REGION** creates a persistent planar polygonal region from selected loops, preserving holes. Open/self-intersecting/ambiguous boundaries or excessive complexity are rejected. Curves are sampled for these polygon operations; REGION is not an ACIS region or a Boolean union/subtraction system. Hatches are not associative to later edits of separate source boundary objects.

SOLID/TRACE file import now retains filled faces. DXF export contains vector hatch strokes or SOLID triangles, not a native associative HATCH definition. Native project saving retains editable hatch/region metadata. Source DWG HATCH import remains unsupported.

## Blocks and attributes

1. Select geometry; run `BLOCK Door`; specify its base point. A reusable definition and insertion replace the selected geometry.
2. Run `INSERT Door`; set uniform scale, rotation and attribute values in the individual prompt fields; specify insertion point.
3. Run `BEDIT Door`, or select an insertion and run **REFEDIT**. Edit the isolated working geometry. **Save block** / `BCLOSE SAVE` updates all references; **Discard** / `BCLOSE CANCEL` restores the source. New/Open/Example are guarded while this session is open.
4. Run `ATTDEF Door` to ADD, UPDATE (including tag rename), or REMOVE an attribute definition. Fields include prompt/default, local position, text height/rotation, invisible, constant and required flags. UPDATE requires the old tag and the replacement values.
5. Select an insertion and run **ATTEDIT** to edit values in individual tag/prompt fields. **ATTSYNC Door** synchronizes definitions/values. Constant values cannot be changed per insertion; invisible values remain stored.
6. `WBLOCK Door` downloads a reusable native `.block.rasm.json`, with needed definitions and attributes. Reopen it as a project. Native DWG writing is not available; ordinary Export DXF flattens displayed geometry and loses block associations.

Nested definitions, transformed insertions, shared-definition updates and native Undo/save/reopen are supported with recursion/expansion limits. REFEDIT here edits a shared native block definition in isolation; it is not AutoCAD's complete in-context xref editor. Dynamic blocks, external-reference editing, multiline/field-driven attributes and every Autodesk attribute option are not implemented. Imported DWG/DXF blocks still use the existing flattened conversion.

## Dimensions and leaders

**DIMSTYLE Name** opens a named-style form. It saves text height, overall scale, arrow style/size, extension settings, text gap, precision, prefixes/suffixes and independent colors. Apply to selected dimensions or leave unchecked for future dimensions. Updating a style updates dimensions referring to that name. Commands also include `DIMSTYLE SETCURRENT Name`, `DIMSTYLE APPLY Name`, `DIMSTYLE LIST`, `DIMSTYLE DELETE Name` and `DIMSTYLE RENAME Old name|New name`.

This is a persistent named rendered-style system, not the entire AutoCAD DIMSTYLE engine: alternate units, tolerances, full fit rules, annotative scales and geometry associativity are not implemented.

- **DIMCONTINUE / DIMBASELINE:** select one dimension, specify next feature point and placement. Continue uses its last endpoint; Baseline retains its datum.
- **DIMORDINATE:** choose X or Y, then datum origin, feature and label location. Signed offsets are measured from that datum.
- **DIMEDIT:** change text, placement or RESET the measured label. Oblique extension-line editing is not implemented.
- **QLEADER / MLEADER:** arrow tip, bend, text location, then enter text. **MLEADEREDIT** changes text/location or adds/removes arms. Native save retains editable paths and styles. The implementation does not include every AutoCAD MLEADER content/style/attachment option.

## Scaled vector PDF

Use **Plot vector PDF** or **PLOT / PRINT**. Choose A4–A0, Letter, Legal or custom paper, orientation, margins, drawing units, scale `1:N`, and extents or a window. Selected bounds can populate the window. Choose color/monochrome and paper line weights. Fit is optional and reports its calculated scale; oversized drawings show a clipping notice.

**Download vector PDF** creates actual PDF paths, curves, filled regions and embedded substitute-font text. For example, a 1000 mm model line at 1:100 is 10 mm on paper, independent of screen zoom. Settings persist in the native project. Print the resulting PDF at **Actual size / 100%**; printer-driver fitting changes the scale.

DejaVu is embedded offline with its license and reproducible subset generator. Source SHX fonts, complex Arabic shaping and characters outside the subset may differ. This is a single model-space plot, not paper-space layouts, multiple viewports or a CTB/STB system.

## Development and limits

Build: `node build.cjs`. New modules: advanced-edit.js, snaps.js, hatch.js, blocks.js, dimensions.js, plot.js, plot-ui.js and advanced-ui.js. Core adds bounded persistent compounds/solids/resources; old native projects still open. The PDF font generator uses development-only Python/fontTools. Running the app requires neither Python nor Node.

Read TEST_RESULTS.md for exact executed tests and artifact hash. Full AutoCAD/DWG equivalence and a 90% coverage claim remain unestablished. Existing DWG conversion limitations continue to apply; retain original files.
