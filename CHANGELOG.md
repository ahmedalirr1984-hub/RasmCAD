# Changes

## 0.8-dev — command depth preview

- Deeper COPY,Reference ROTATE/SCALE,MIRROR,ARC3P,CIRCLETTR,RectangleDimensions,
  MOVEdisplacement,Trim/ExtendEdge,OffsetThrough/layer/erase,Fillet/ChamferNoTrim,
  ChamferAngle andselective repeatedMATCHPROP.
- Named dimension style copy/presets,all renderedfields and repeatedauto chains.
- Actual vector plotpreview,mousewindow,Display,selectionvsselectedbounds,
  browserprinterinvocation andPDF.
- SaveAs native/DXFversion choices,filehandle reuse whereavailable,writefailure
  dirty-state protection. GenuineDWGwrite notavailable;no fakeDWGfiles.
- Professional grouped workspace and20workflow reference;precision/Undo fixes.
- See docs/DEPTH-RESULTS.md for exactfinalverification andremaininglimits.


## 0.7 — 2026-11-06: advanced 2D systems

Added analytic intersection/perpendicular/tangent/nearest snaps; STRETCH, BREAK, LENGTHEN, ALIGN, PEDIT, editable interpolating splines/SPLINEDIT, OVERKILL and compound EXPLODE; persistent hatches/regions with holes and boundary tracing; reusable blocks, isolated definition editing, attributes and native WBLOCK; named dimension styles, continue/baseline/ordinate/edit and multiarm leaders; paper/unit/window/scale-controlled vector PDF with embedded licensed font. New compounds, resources and fill primitives persist through Undo and native save/reopen. Compound transformations preserve editable metadata; SOLID/TRACE imports retain fill. See UPGRADE_0.7.md and TEST_RESULTS.md for limits and verification.


## 0.6 — 2026-11-06: CAD import and writable layers

- Corrected DWG layer-lock metadata through a local adapter for the bundled reader; intentionally locked layers retain their source state.
- Select a writable current layer after opening a drawing, or create a separate visible, unlocked editing layer when needed.
- Added an explicit, undoable Unlock visible layers action for editing protected imported objects. Hidden layers are preserved.
- Reset unfinished command state before replacing the document with New or Open, preventing the previous drawing's pending geometry from leaking into the new one.
- Recognize supported CAD content independently of filename, including DWG-based DWT/DWS/BAK/SV$ files; reject unsupported contents explicitly.
- Corrected DXF frozen-layer flags so freeze-in-new-viewports does not hide a model-space layer; intentional frozen/locked states remain preserved.
- Corrected imported indexed layer/entity colors using the full 256-entry ACI palette from the bundled MIT-licensed dxf-parser. DWG indexed layers no longer inherit a white placeholder; explicit truecolor, ByLayer and DXF layer group-420 colors are retained.
- Corrected DWG SOLID/TRACE corner fields and attribute text values. Solids remain editable outlines, and invisible attributes remain excluded.
- Added bounded R12/R13+ binary DXF decoding and declared-codepage handling for legacy DXF text before the existing entity parser. Output remains ASCII DXF.
- Added Continue drawing to dismiss the import report and an Unlock visible layers action there when applicable.
- Documented editing after import, saving supported geometry to DXF, and remaining format/fidelity limits. Exact checks are recorded in TEST_RESULTS.md.

## 0.5 — 2026-11-05 (UTC): input reliability and command workspace

- Made the release version visible in the title and header to distinguish the rebuilt application from older open tabs.
- Added a persistent Select control alongside Finish and Stop, an explicit Repeat action, and a committed-object/preview status area.
- Clarified completion: clicked endpoints and entered values commit immediately; Stop/Esc/Select discards unconfirmed previews while keeping committed geometry. Added single-stroke press/drag/release drawing for Line, Circle and Rectangle, with automatic completion for a single-stroke Line.
- Added scrollable command history, keyboard recall, command suggestions, explicit Enter handling, more readable prompts, and diagnostics/error-reporting controls. Reserved command-panel space prevents messages from shifting the drawing coordinates.
- Added Arabic/Persian numeric input normalization while preserving literal drawing text.
- Replaced distorted endpoint clamping and capped full-circle sampling with actual viewport clipping and subpixel visible-arc tessellation.
- Corrected nearest-object picking and selection tolerance for drawings at large survey origins.
- Hardened HTML bundling so literal replacement tokens in embedded modules cannot corrupt generated JavaScript.
- Documented cursor-directed numeric line lengths, precise coordinate entry, numeric circle completion, object selection and Copy/Mirror workflows.
- Added a development guide covering source files, building, relevant regression tests, Windows browser-path setup and preview/model invariants.
- Release verification and measured interaction fixes are recorded in `TEST_RESULTS.md`; scope and file-format limitations remain in `FEATURES.md` and `README.md`.

## 0.4 — 2026-11-05: drawing completion, selection and dimension styling

- Added persistent Finish and Cancel controls, active-command status and visible selection guidance.
- Unified Finish, Enter and right-click completion; added Line/Polyline double-click completion and U/C options. Kept middle-button drag for panning. Circles support radius, diameter, 2P and 3P input.
- Added default additive picking, optional replace mode, Shift removal, Ctrl addition, left-to-right inside windows and right-to-left crossing windows.
- Added selection confirmation for edit commands and clearer prompts for drawing and editing.
- Added ByLayer object color controls and changed-field property application for mixed selections.
- Added dimension overall scale, text height, arrow size/style, extension offsets and extensions, text gap, precision, prefix/suffix, measurement placeholders and separate line/text colors. Dimension colors can inherit the object color, which may use ByLayer, or use explicit overrides.
- Dimension Explode retains arrow outlines and primitive colors; filled arrow areas are not preserved as standalone fill entities.
- Added new-dimension defaults independently of editing existing dimensions.
- Added actual draggable grips, isolated previews, Escape cancellation, and one-step undo/redo for endpoint, circle, arc-angle, text-anchor and dimension-placement edits.
- Preserved the dimension line when a long label is moved above it; retained complete label/arrow selection bounds.

This update improves specific 2D workflows. It does not certify AutoCAD percentage coverage, complete DWG fidelity, 3D support or associative dimension constraints. Current tests and limits are recorded separately in TEST_RESULTS.md and FEATURES.md.
