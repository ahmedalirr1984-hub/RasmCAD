# Focused engine and accuracy audit — command depth cycle

Baseline: M1-A commit e48b82e488f479d3558fd3c72225c5eab7e04bfb, HTML SHA256
6e7bede31f03d7919446ec6aa6a32725e501fa7fe6e580be63a8450807703543.
Canvas2D and double-precision WCS are retained. Native format remains1.

|Finding|Code / evidence|Resolution|
|---|---|---|
|OFFSET rejects inward unit square at(1e8,1e8)|editing.js152;depth-geometry test1|Translate shoelace orientation to local origin|
|OFFSET rejects valid.0001square inward.00001|editing.js152;depth-geometry test2|Compare squared direction with length-scaled tolerance|
|Applying unchanged Properties consumes COPY Undo|app.js205–219;depth-commands-browser no-op test|Skip redundant history checkpoint|
|Reprinting identical plot settings consumes COPY Undo|app.js setPlotSettings;depth-commands-browser finalcase|Normalize relevant settings and skip unchanged checkpoint|
|Arc hitTest loses exact start near survey origin|core.js53;depth-core test failed before,passes after|Wrap-aware angular start boundary|
|Baseline auto dimensions below/left stack inward|dimensions.js continueDimension;depth-dimensions tests|Preserve reference side;explicit spacing|
|Imported CAD fidelity still limited|io.js import warnings,existingformat tests|Report flattening/unsupported types;not claimed fixed|
|Real DWG encoding absent|dwg-write.js runtime inspection;depth-dwg4checks|SaveAs honestly disables DWG;see DWG-WRITING.md|

New integration defects caught and fixed before delivery include invalidreference
retry state,advancedpoint rollback,COPY Array/All ambiguity and previews,plot
window cancellation,degenerate selected-bounds clipping,SVGclip-ID collision,
andpartial dimension matching losing overrides on future style updates.
The newtests cover each relevant integration state. Partial dimension matching
nowdetaches the named style where needed;full-style match explicitly copies it.

Accuracy verification spans survey origins150000/170000 and1e8,small andnormal
geometry,analytic intersection/perpendicular/tangent,Undo/Redo andnative/DXF
round trips. A test formerly compared a nominal screenclick with exactworld30;
newUI scaling exposed a6.4e-7unit pointer-delivery quantization difference. It now
compares committed COPY geometry with the actual observed pointerworldposition,
keeping the1e-8 geometric tolerance. This is not coordinate rounding in the model.

Twenty workflow scope and unsupported options: COMMAND-DEPTH.md. Measured5k/20k
pointer costs and finaltest evidence: DEPTH-RESULTS.md. No spatial index orengine
rewrite was added. Physicalprinter,Windows/Edge andliteral fileprotocol tests
remain environment-limited. No AutoCAD percentage or fullcompatibility claim.
