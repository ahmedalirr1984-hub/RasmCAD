# RasmCAD Advanced 0.7

## GitHub download

Choose **Code → Download ZIP**, extract the repository, then double-click
`restore-release.cmd` on Windows. It joins the numbered files in `dist/parts`,
checks that the release is present, and opens `dist/RasmCAD-Advanced.html`.
The program itself needs only Edge or Chrome. The ready-to-open HTML and the
complete source bundle are also available in the
[0.7 delivery on Google Drive](https://drive.google.com/file/d/1SJnl4HztNggnzmd_pVEGWNP8ZyvfWRCW/view?usp=drivesdk).

Developers can run `node restore-release.cjs` to join and SHA-256-check the
HTML, then `node restore-vendor.cjs` to extract the bundled DWG engine and
`node build.cjs` to rebuild. The exact upstream LibreDWG source archive,
font source, and full test fixtures are in the complete Google Drive delivery.

CAD import and writable-layer correction — 2026-11-06.

An independent, English-language 2D CAD application that runs locally in a modern Edge or Chrome browser. Open `RasmCAD-Advanced.html` after extracting the ZIP. No Python, installer, administrator access, or unsigned EXE is required. The HTML includes its DWG WebAssembly engine and does not upload drawings or fetch conversion services.

Save your current project, close the earlier 0.6 tab, extract the new archive into a new folder, and open its HTML. Check that **0.7** appears beside the application name. Drawings are stored only when you download a project.

This release **does not meet or claim 90% coverage of AutoCAD 2008**. `FEATURES.md` records the implemented functionality and significant gaps. `COMMAND_WORDS.txt` lists registered words, including aliases; aliases are not independent CAD features or proof of percentage coverage.

See **UPGRADE_0.7.md** for the new snap/editing/hatch/block/attribute/dimension and scaled-vector-PDF workflows and their exact limits.

## Open and save

- **Open** accepts the formats listed below. The file content is checked; an extension alone does not make an unsupported file readable. Read the import report before relying on an imported drawing.
- **Save project** downloads an editable `.rasm.json`. It does not overwrite a source DWG, save automatically, or save a DWG file.
- **Export DXF** writes supported geometry as ASCII DXF R2007, using unitless drawing units. Native dimensions are exported as visible lines, arcs and text; DXF dimension associativity is not retained.
- **Export PNG** saves the current view. **Plot vector PDF** downloads vectors at a chosen physical paper size, drawing-unit conversion, scale1:N and plot window. Print that PDF at Actual size/100%; layouts and CTB/STB remain unsupported.

| Open format | Supported use and limits |
| --- | --- |
| `.dwg` | Decode supported DWG data locally and convert supported model-space entities to editable geometry. Reader/version/entity limits still apply. |
| `.dwt`, `.dws`, `.bak`, `.sv$` | Read through the DWG route only when the actual contents have a valid DWG signature and can be decoded. Template, standards, recovery and autosave semantics are not reproduced. |
| `.dxf` | Read supported ASCII or binary DXF into the same supported entity model. R12 and R13+ binary group encodings are decoded before parsing; unsupported entities and import simplifications still apply. |
| `.rasm.json`, prior `.rcad` | Read editable native RasmCAD projects. |

Other AutoCAD-associated formats, including DGN, DWF/DWFx, PDF and raster images, are not implemented as CAD authoring imports. This table is an explicit format scope, not a claim that the app opens all AutoCAD formats.

The tested DWG samples have the `AC1032` signature (DWG 2018 format), which is also the DWG format used by AutoCAD 2024. This establishes real decoding of sample files in that format, **not full fidelity for every file saved by AutoCAD 2024**. Your own files, proprietary objects, xrefs and advanced objects need additional validation. Seven public DWG fixtures were exercised; detailed warnings are included in the test results.

## Add to and edit an imported CAD drawing

1. Use **Open** to import the drawing, then review the import report and choose **Continue drawing**. Choose **Line** or another drawing tool to add supported geometry.
2. New drawings start on visible, unlocked layer `0`. If an opened drawing's current layer is hidden or locked, the application prefers the source current layer when writable, otherwise selects a writable layer or creates a separate visible, unlocked `RasmCAD-Edit` layer (with a unique suffix when needed). It preserves the original layer states.
3. Select an existing object and use Move, Copy, Properties or another supported edit. Objects intentionally stored on locked layers stay protected. Use **Unlock visible layers** in the Layers panel or import report to unlock the visible layers for editing; this is an undoable document change. Hidden layers are not shown or unlocked by this action.
4. Save the editable result with **Save project**, or use **Export DXF** for the supported geometry to reopen in AutoCAD. Saving a modified DWG file is not available.

Version 0.6 corrects a DWG reader metadata error that could incorrectly classify open layers as locked. It also corrects imported indexed layer/entity colors using the full 256-entry ACI palette, while retaining explicit truecolor and ByLayer behavior, including DXF layer truecolor. These fixes remove specific editing and appearance errors; they do not make every AutoCAD entity editable or establish a visually identical import.

## Drawing and editing

Choose a tool, then follow the green English prompt. Coordinates support `100,200`, `@50,0`, and `@100<45`. After a line's first point, aim the cursor and enter a scalar length such as `100` to create a segment in that direction. Wheel zooms; middle-button drag pans. **Finish**, a blank Enter, or right-click ends connected drawing; an Enter containing a value submits that value. A circle completes after its radius point or positive numeric radius. `C` closes a polyline. The active command is shown above the canvas; the command area's object/preview indicator distinguishes saved model geometry from the current preview. Browser-reserved shortcuts may differ; toolbar buttons remain available.

| Tool | Workflow and supported geometry |
| --- | --- |
| Line, polyline, rectangle, circle, arc, text | Points or command coordinates. Circle accepts a numeric radius, `D` for diameter after the center, or `2P`/`3P` before picking. Arc uses center/start/end direction CCW. Text input is plain text. |
| Move / Copy / Rotate / Scale | Preselect objects, or start the command and select when prompted, then press Enter to confirm. Supply base/destination points, or base plus numeric angle/factor. |
| Trim / Extend | Click the portion/end to edit. Preselected objects act as boundaries; with no preselection all other visible supported geometry are boundaries. Lines, polylines, circles/arcs have documented endpoint/closed-path limits. |
| Offset | Select line/polyline/circle/arc, choose Offset, enter a positive distance, then click the side. Polyline joins are mitered; collapsed or self-intersecting offsets are rejected. |
| Fillet | Enter radius, then click retained sides of two LINE entities. Creates trimmed lines and a tangent arc. Radius zero joins at their intersection. Parallel lines and oversized radii are rejected. |
| Chamfer | Enter `distance1,distance2`, then click retained sides of two LINE entities. Creates trimmed lines and a chamfer line. |
| Mirror | Select objects, specify two mirror-axis points. Originals are retained and mirrored copies created. |
| Rectangular array | Select objects, enter `rows,columns,dx,dy`, e.g. `2,3,100,80`. Creates independent copies. |
| Polar array | Select objects, enter `count,fill-angle`, e.g. `6,360`, then specify center. Creates rotated independent copies. |
| Explode / Join | Explode polylines or native dimensions. Dimension arrow outlines and per-primitive colors are kept; filled arrow areas are retained as separate SOLID entities by the application EXPLODE workflow. Join connected open lines/polylines on one layer into a polyline. |
| Distance / Angle / Area | Distance: two points. Angle: arm point, vertex, arm point. Area: click a circle/closed polyline, or enter polygon vertices then Enter. Outputs area and perimeter in decimal drawing units. |
| Dimensions | Aligned, horizontal/vertical linear, angular, radius and diameter. Angular: arm, vertex, arm, label position. Radius/diameter: select circle/arc then label location. `DIMTXT 12` sets height. `DIMVERTICAL` chooses vertical linear dimensions. |
| Properties / Match properties | Change selected objects' layer, ByLayer/explicit color, width, text/label and text height in the inspector. Only changed fields are applied to a mixed selection. `MATCHPROP` picks source then target for style copying. |
| Layers / Undo / Redo / view | Layer color, visibility and lock; bounded undo/redo; grid, object snap, ortho, zoom, pan, extents. |

## Finish a drawing and select objects

1. Choose **Line**, pick a start point, and pick the endpoint. Alternatively, move the cursor in the required direction, type `100`, and press Enter for an exact 100-unit segment. Use `@100<0` for 100 units along positive X, or `100,200` for an absolute endpoint. Click **Finish**, press a blank Enter, or right-click to end the connected command; the committed line stays selectable.
2. Choose **Circle**, pick the center, then pick the radius point or type a positive radius such as `50` and press Enter. This creates and finishes the circle immediately. For an exact diameter, type `D` after the center, press Enter, then enter the diameter.
3. In **Select**, click objects to add them to the selection. Shift+click removes an object; Ctrl+click toggles it. Choose **Replace selection** in the Selection menu when each pick should replace the current selection.
4. Drag **left to right** for an inside window, which includes whole objects. Drag **right to left** for a crossing window, which also includes objects touched by the window. Read the Selected count in the inspector.
5. Start an edit tool. When it requests an object selection, add objects and press Enter or click Finish to confirm before entering the edit points or values. For example: select a line → **Copy** → base point → destination point. Mirror needs two points defining the mirror axis. The **Select** button returns to object picking.

The visible selection hint and active-command pill show the current workflow. The canvas and command input accept Enter; use Finish if the browser reserves a keyboard shortcut. Double-click also finishes Line/Polyline. Within Line or Polyline, `U` removes the last segment/vertex and `C` closes the path. For circles, enter `2P` before picking two diameter endpoints, or `3P` before picking three non-collinear circumference points. For a center-based circle, enter `D` after the center and then a positive diameter.

You may also **press, drag and release** to commit a line, circle or rectangle in one stroke. A single-stroke Line returns to Select automatically; click-click Line continues until you finish it. **Stop / Esc / Select discards only an unconfirmed preview and retains committed objects.** Merely hovering over an endpoint or radius displays a preview: click, submit the value, or release the drawing stroke to commit it before stopping.

## Command workspace and troubleshooting

Type an English command in the command field and follow its next prompt. Command suggestions appear above the field: **Tab** fills the first match; arrow keys choose a suggestion; **Enter** submits the typed value or the suggestion explicitly chosen with an arrow key. Up/Down recall previous input when suggestions are closed. Command history retains earlier messages and inputs. Use **Repeat** to restart the previous tool explicitly. Expand **COMMAND HISTORY** when reviewing earlier results.

When a drawing appears incomplete, use **Fit drawing** to include its full extents, check that its layers are visible, and review the import report for unsupported content. A successful import can still omit unsupported objects. The Selected count should increase when an object is picked. Use **Diagnostics** to download version/workflow information when reporting a problem; include the steps and whether it happened in a new or imported drawing. Read the report before sharing it.

## Direct grip editing

Select an object and drag one of its square grips. Line endpoints and sampled polyline vertices move directly; circle cardinal grips adjust radius and the center grip moves the circle. Arc endpoint grips adjust the angle while keeping the radius. A dimension location grip moves its stored placement without moving other drawing objects. Dragging previews the result; release commits one undoable edit. Esc cancels the preview. Shift/Ctrl picking bypasses grips for selection changes. This is not a full AutoCAD grip/constraint system.

## Dimension appearance and defaults

Select an existing dimension and expand **Object properties**. Edit text height and the **Dimension style** fields: overall scale, arrow size, closed/open/tick arrowheads, extension-line offset and extension, text gap, decimal places, prefix/suffix, and separate line/text colors. The object **ByLayer** setting uses its layer color. **Inherit object color** for dimension lines/text follows the dimension object color, which may itself use ByLayer; clear that checkbox to choose an explicit line/text color. Overall scale changes annotation appearance, not the measured value. Without custom session defaults, new dimensions initially use a text height of approximately 14 screen pixels converted to drawing units at the current zoom. The stored height then scales with the drawing; it is not fixed-size screen text.

Click **Apply changed properties** to update the selected objects. Unchanged fields retain each object's values, which matters when you select dimensions with different styles. Text / dimension override accepts `<>` for the measured value: `L=<> mm` keeps the numeric measurement inside a custom label. A literal label replaces the displayed measurement; it does not change the geometry.

**Use as dimension defaults** copies the selected dimension settings for new annotations in the current browser session. Session defaults reset when the page is reloaded; the styles of saved dimension objects remain in the project. It does not restyle existing dimensions. Save an editable project to retain dimensions and their styles. Dimensions still use independent measurement points; this is not an associative constraint or a complete AutoCAD DIMSTYLE implementation. Imported source dimension styles are not fully reproduced.

## Import fidelity

Supported imported model geometry includes LINE, LWPOLYLINE/POLYLINE, CIRCLE, ARC, TEXT, simplified MTEXT/attributes, expanded nested INSERT blocks, and supported dimensions. ELLIPSE and SPLINE curves and bulged polyline segments are sampled into editable polylines and explicitly reported. DWG SOLID/TRACE corners retain editable filled 2D faces. DWG attribute values are imported as simplified text; invisible attributes remain excluded. POINT becomes a small cross. LEADER becomes a simplified polyline.

Unsupported HATCH, IMAGE, MULTILEADER, VIEWPORT, 3D faces/solids, custom objects, nonstandard OCS/extrusions, and unresolved xrefs are skipped or rejected with notices. Paper space, original block associations, dynamic-block behavior, SHX font rendering, dimension styles, linetypes, plot settings, and annotative behavior are not fully preserved. A successful import does not prove drawing equivalence. Keep the original file and review the import report.

## Managed computers

No operating-system protection or organization policy is changed. A managed computer may restrict local HTML, JavaScript, WebAssembly or downloads. If blocked, ask the organization's IT team to approve the application. The actual UNRWA device was not available for testing. This environment's Chromium blocks direct `file://` navigation by policy, so browser tests used the exact HTML over loopback HTTP with networking disabled after load. These limits are stated in `TEST_RESULTS.md`.

## Source, licensing and rebuild

The combined advanced distribution is GPL-3.0-or-later because it includes LibreDWG. The original MIT notices and dxf-parser MIT license are retained; see `THIRD_PARTY.md`. The exact upstream v0.8.4 source archive, vendor package, local integration changes, application source and tests are supplied in `Source`. Source is provided with no warranty.

Development commands (not needed by app users):

```sh
node build.cjs
node tests/core.test.cjs
node tests/advanced.test.cjs
node tests/dimension-styles.test.cjs
node tests/selection.test.cjs
node tests/grips.test.cjs
node tests/commands-v05.test.cjs
node tests/dxf-binary-v06.test.cjs
node tests/import-v06.test.cjs
RASMCAD_TEST_UNLOCK=1 node tests/layers-v06.test.cjs
node tests/browser.test.cjs
node tests/advanced-browser.test.cjs
node tests/interaction-regressions.test.cjs
node tests/dimension-browser.test.cjs
node tests/grips-browser.test.cjs
node tests/input-v05.test.cjs
```

See **[DEVELOPMENT.md](DEVELOPMENT.md)** for source files, setup, browser paths, a Windows development example, and how to add a tested command. Browser tests require Playwright, pngjs and Chromium; the fixture generator/auditor uses Python and ezdxf as development tools only. The browser application requires neither Node nor Python. Tests and limitations for this release are recorded in `TEST_RESULTS.md`.
