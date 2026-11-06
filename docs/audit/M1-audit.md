# M1 audit — baseline 0.7

Start: `e5d1f7594b2aaabeb9864d71b8e2270ba17e53a5` (main).
Unchanged remote checkpoint: `ee7a4e1ccae879c61ff887d96601313dba47cddd`.
Local checkpoint tree exactly matches remote `faf3b5cbbd5024e896868335f0ba76bc617b1113`.

## Reproduced defects (baseline file lines)

|Code|Evidence / regression|Impact|
|---|---|---|
|editing.js:177|`node tests/m1-accuracy.test.cjs`, AREA: .001 square at (150000,170000) gives 3.814697e-6, expected 9.9999998e-7|Measurement accuracy|
|app.js:655,1235|Same test, CIRCLE3P: .001 radius at survey origin gives center error .004580555|Committed geometry/preview accuracy|
|snaps.js:37–39; app.js:693|240 horizontal curves and one vertical in aperture: intersection snap null, no warning|Missed exact points|
|snaps.js:6; editing.js:21|Arc start 2deg, center(150000,170000),r5: exact start tangent/intersection rejected by angular wrap|Boundary precision|
|editing.js:33|Two genuine shallow crossing lines return []|Missed intersection|
|app.js:410,446–455,610,731|TRIM/EXTEND/OFFSET/COPY finish after one edit; Undo exits command|Command workflow|
|app.js:967–971|TRIM F invokes FILLET; COPY M invokes MOVE|Unsupported options dispatch incorrectly|

Before any implementation: six characterization tests pass; six accuracy regression tests fail. Exact commands: `node tests/m1-characterization.test.cjs`; `node tests/m1-accuracy.test.cjs`.

## Pointer performance

Chromium155.0.8059.79 Linux, Node24.22.1, 3 logical AMD EPYC9V74 CPUs, viewport1500x1100 DPR1. Real mouse events; instrumented handler includes snap/hover/coordinate UI, excludes separately measured RAF render. Sparse150 measured events; dense35;15 warmups. Dense baseline still truncates to240 curves, so these times do not establish complete accuracy.

|Distribution|Entities|Handler median / p95 ms|Render median / p95 ms|
|---|---:|---:|---:|
|Grid100cols,spacing40,line(20,10)|5000|2.0 /6.5|3.4 /9.9|
|Same|20000|5.0 /8.8|9.2 /32.7|
|Diameters through origin,length2000|5000|8.1 /16.2|2.3 /5.0|
|Same|20000|19.4 /79.1|10.3 /58.6|

Raw evidence and reproducible profiler: `docs/audit/m1-baseline-profile.json`, `tests/m1-profile.cjs`. Dense20k maximum140.8ms. File protocol is blocked by managed Chromium (`ERR_BLOCKED_BY_ADMINISTRATOR`); msedge is absent. Do not equate loopback/offline checks with the required file:// gate.

## M1-only comparison

Autodesk2006 behavior is a **user-requested workflow target**, not independently verified: allowed references exclude Autodesk documentation. Source permalinks and licenses are in `docs/REFERENCES.md`; reference applications were not executed.

|M1 item|RasmCAD baseline evidence|Allowed reference source|Expected2006 workflow target|
|---|---|---|---|
|Running/one-shot snap/aperture|snaps.js,app.js688:running only,fixed10px|OpenCADStudio snap.rs328,554;MLightCAD resolver251|Temporary override without changing running modes (user M1-A2)|
|Discrete snap priority|snaps.js16:weighted distance|OpenCADStudio snap.rs1760|Nearest should not hide intended discrete snap (user M1-A2)|
|Tracking/FROM|Absent,app.js688–704|OpenCADStudio snap.rs328 tracking;FROM not verified|Polar/object reference construction (user M1-A2)|
|Repeat/local Undo|app.js410,610,731:single edit|LibreCAD trim138;QCAD Offset49;OpenCADStudio offset574|Repeat targets/destinations until Enter/Esc (user M1-A4)|
|Ellipse/construction|No ellipse dispatch;ARC center/start/end|OpenCADStudio ellipse202;KulmanLab README only|M1-B requested drawing methods,not yet implemented|
|Precision/dense search|Six failing tests above|MLightCAD source explicitly limits INT;not an accuracy oracle|Exact analytic constructions within stated numerical tolerance (user tests2/3)|
|PLINE arcs/width|core.js polyline straight point list|Reference behavior not investigated beyond M1|Design/version/migration first (user M1-B)|

Priorities: fix numeric defects first, then snap controls and repeat/local Undo. Preserve Canvas2D, native format, existing DWG limitations and CSP. Gate A must remain pending while mandatory file:// verification is unavailable; M1-B must not start.
