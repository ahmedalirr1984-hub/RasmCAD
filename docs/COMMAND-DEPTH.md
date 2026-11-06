# Command depth preview — 0.8-dev

Branch: `codex/command-depth`, based on `codex/m1` at
`e48b82e488f479d3558fd3c72225c5eab7e04bfb`. Main is unchanged. This cycle follows
the user's expanded command/printing/save/interface request. It does not assert
that the earlier literal file:// gate has been passed or that RasmCAD exceeds
AutoCAD. These are20 practical workflows, not a statistically verified usage ranking.

## Twenty workflows reviewed

Options are entered in the command field at the prompted stage. Selection-first
and command-first input are retained. Full option words are the clearest way
to avoid ambiguity; unsupported options report an error.

|Workflow|Current supported depth / changes|Limits|
|---|---|---|
|LINE|Connected segments, scalar length, absolute/relative/polar points, U,Close,FROM,snap/tracking input; retained and regression-tested|No associative constraints|
|PLINE|Straight connected vertices,U,Close,PEDIT vertex/join/reverse; retained|Bulge arc segments and varying physical width remain unsupported|
|CIRCLE|Center/radius,Diameter,2P,3P; new TTR: choose two LINE supports then radius|TTR uses supporting-line extensions; no parallel-line/circle tangency or TTT|
|ARC|Center/start/end-direction plus new3P solver shared by preview/commit|Other start/end/radius construction variants remain unsupported|
|RECTANGLE|Opposite corners or first corner→DIMENSIONS→width→height→quadrant pick|No rotated/rounded rectangle options|
|MOVE|Base/destination plus DISPLACEMENT to enter a vector without a separate base|No constraints/associative references|
|COPY|SINGLE,MULTIPLE,ARRAY count,FIT. Count includes the original;U reverses whole last array. Preview uses original sources and transforms compound children|Independent copies,not associative arrays;count<=10001includingoriginal,subjecttodocumentlimits|
|ROTATE|Numeric rotation or REFERENCE: numeric/picked reference and new angle/direction;invalid reference can be retried|No Copy option|
|SCALE|Positive factor or REFERENCE: numeric/picked old length and new length|Uniform scale only|
|MIRROR|KEEP(default) or DELETE before picking the axis;Y deletes,N keeps|No MIRRTEXT variable|
|TRIM|Repeated target picks,localU;EDGE EXTEND/NONE to use implied boundaries|No fence/crossing target mode|
|EXTEND|Repeated endpoint picks,localU;EDGE EXTEND/NONE|No fence/crossing target mode|
|OFFSET|Distance or THROUGH;LAYER SOURCE/CURRENT;ERASE ON/OFF. Fixed large-origin and tiny-polygon inward offsets|Through polyline uses nearest segment support;not a general curved/compound offset|
|FILLET|Two LINE objects,radius,TRIM/NOTRIM|No all-vertices polyline fillet|
|CHAMFER|Two LINE objects,two distances or ANGLE(distance then degrees),TRIM/NOTRIM|No all-vertices polyline chamfer|
|MATCHPROP|One source→multiple targets;SETTINGS chooses fields;localU;atomic validation. Geometry/measurement kind are retained;compatible dimension overrides can detach from named style|Compound children retain explicit child styling;not every AutoCAD property exists|
|DIM / DIMSTYLE|All14rendered style fields exposed,COPY source\|target,PRESET preset\|target;METRIC/LARGE_TEXT/COMPACT visual presets. DIMCONTINUE AUTO and DIMBASELINE AUTO [spacing] repeat withU. Outward baseline placement fixed below/left/aligned|No alternate units,tolerance dimensions,annotative system or full object associativity|
|OSNAP / point input|Eight analytic modes,one-shot overrides,aperture,priority,FROM,limitedpolar/x-ytracking;core arc hit-test wrap fixed|100000intersection-pair budget remains explicit;incomplete search is visibly marked|
|PLOT / PRINT|Actual vector preview,Extents,Display,mouse Window,Selected Bounds,Selected Objects Only;paper/orientation/units/scale/margins/weights;PDF or browser printer dialog|No Layouts/CTB/STB;physicalprinter andWindows/Edge untested|
|SAVE / SAVEAS|Native full-data project or DXF2007/2010/2013/2018–2024;name/location choice. Native browser file handle is reused by SAVE when available and reset onNew/Open. Failed writing keeps dirty state|Genuine DWG encoding unavailable;DXF flattens native editable structures|

## Try the important options

1. Select an object,COPY,pick a base,`ARRAY 4 FIT`,then specify last displacement.
   Four includes the original. `U` removes the last generated array.
2. Select an object,ROTATE,pick pivot,`REFERENCE`,enter old angle,then new angle.
   SCALE uses old/new lengths instead. Picked reference points are also accepted.
3. MATCHPROP,pick source,`SETTINGS`,choose the fields,then pick multiple targets.
   `U` undoes the latest target transaction;Enter/Esc ends.
4. OFFSET,select/confirm source,`THROUGH`,then pick a point on the desired offset.
   `LAYER CURRENT` selects destination layer;`ERASE ON` removes source atomically.
5. PLOT,choose the area and paper,then`Pick plot window` to select two corners.
   Selected Objects Only filters objects;Selected Bounds includes other visible
   geometry inside the selected bounding box. PDF and printer use the chosen plan.
6. SAVEAS chooses file type and name. Native keeps RasmCAD resources. DXF exports
   supported geometry and cannot preserve all native hatch/block/dimension editability.

## Geometry and compatibility evidence

The Canvas2D engine, WCS double-precision coordinates, native format version1,
and existing import route are preserved. New TTR and3P calculations use local
coordinates. OFFSET polygon orientation now avoids absolute-coordinate
cancellation, and its direction predicate compares quantities with consistent
units. Existing old project,Arabic,DXF,DWG-reader andsnap tests are retained.

SaveAs versions are real DXF outputs with validated version headers and compatible
supported entities,not DWG renamed to DXF or vice versa. An independent ezdxf
audit checks all four versions. Imported NURBS,ellipses and bulges can still be
approximated/flattened by the reader; this cycle does not establish lossless DWG
round trips. See DWG-WRITING.md for the runtime export evidence.

## Printing and saving to disk

Browser printing opens a genuine browser print window with vector content and
physical @page dimensions. Match paper/orientation,disable headers/footers,and
choose100%/Actual size in the browser/printer dialog. Browser print uses local
fonts;PDF embeds its substitute font. A physical printer cannot be tested here.

Where `showSaveFilePicker` exists,the user can choose a native file. SAVE then
rewrites that chosen handle. The browser controls permissions and whether it
prompts again. Without this API,Download file and quickSave use browser downloads.
OS picker tests use a controlled browser adapter;real Windows filesystem-picker
behavior remains unverified. No server storage or cloud account was added.

## Source, checks and delivery

`node build.cjs` builds the one-file offline HTML. `node tests/run-depth.cjs`
runs every `.test.cjs` suite using version0.8-dev. `python3 tests/dxf_interop.py`
independently checks legacy DXF outputs. `node tests/m1-profile.cjs` measures
actual pointer handlers at5k/20k. Test fixtures must be restored from the
existing0.7 full source delivery as described in CONTINUATION.md;no sample DWG
binary is newly published in this branch. See DEPTH-RESULTS.md for final results.
