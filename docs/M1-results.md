# M1-A verified checkpoint

Starting main and unchanged checkpoint are recorded in audit/M1-audit.md.
Final HTML SHA256: `6e7bede31f03d7919446ec6aa6a32725e501fa7fe6e580be63a8450807703543`.

## Measurable before / after

|Measure|Before|After|
|---|---|---|
|New tests for this cycle|0|37 cases:6 characterization,6 accuracy,4 tracking unit,21 browser|
|Characterization before edits|6/6 pass|6/6 pass|
|Reproduced accuracy regressions|0/6 pass|6/6 pass|
|Existing automated JS suites|26 baseline suites passed; remaining3 not included in baseline runner|29/29 existing suites passed|
|All JS suites|—|33/33 pass,0 failures|
|Real-browser workflows across suites|177 baseline suite cases|229 cases including legacy format/layer/render suites;0 failed|
|Discrete snap error in new pointer cases|Dense intersection and translated arc tangent can return null;no finite error bound|Maximum4.440892098500626e-16 drawing units;test tolerance1e-8|
|.001 square AREA at150000/170000|3.814697265625e-6 vs represented analytic9.99999978579581e-7|Matches represented analytic to1e-15 absolute area units|
|.001-radius3P circle center at same origin|Center error .00458055538|Center error<=1e-8 tested;typed exact and separate mouse construction|
|Commands retaining repeat state/local U|0 of requested4|TRIM,EXTEND,OFFSET,COPY|
|Dense intersection limit|First240curves;warning lost on null and ignored in UI|All candidate curves;explicit100000pair budget;visible warning even on no hit|
|Baseline defects fixed|—|5 geometric defects + repeat/Undo state + option alias dispatch =7 groups|

## Real pointer handler timing

Same distributions/viewport/hardware as audit; median / p95 milliseconds.
These are single runs on a shared machine, not a controlled performance
benchmark. Handler includes snap/hover/readout; rendering measured separately in
raw JSON. Dense baseline used the240curve truncation, so a direct speed claim
would be misleading. The broader search increases dense median cost.

|Distribution|Entities|Before|After|
|---|---:|---:|---:|
|Sparse grid|5000|2.0 /6.5|1.5 /2.0|
|Sparse grid|20000|5.0 /8.8|4.8 /6.4|
|Dense diameters|5000|8.1 /16.2|19.7 /23.3|
|Dense diameters|20000|19.4 /79.1|25.6 /29.0|

Raw baseline: audit/m1-baseline-profile.json. Final: verification/m1-after-profile.json.

## Exact verification commands

`node tests/run-m1.cjs`:33/33 suites pass, all observe the same unchanged HTML.
`python3 tests/dxf_interop.py`:4 files independently audited,0 errors/repairs;
geometry,Arabic,dimensions,legacy checks pass. `node tests/m1-profile.cjs`:
4 measured distributions,0 page errors. Full per-suite manifest and browser
results: verification/m1-validation.json. Independent parser log:
verification/m1-dxf-interop.txt. Browser tests use real mouse down/move/up;
read-only state observation;native save/reopen deep comparison includes layers,
properties,block resources,hatches,dimensions,styles,plot settings and Arabic.
Existing tests also exercise offline DWG/DXF imports and Undo/Redo.

**Not verified:** literal file:// offline run (blocked by managed browser policy),
Windows target,Edge (not installed). Hence Gate A remains pending and M1-B/GateB
are not started. No claim of AutoCAD compatibility percentage or full workflow parity.

## Changed files / remaining limits

- precision.js,editing.js,commands.js,app.js:shared numeric predicates,translated area/circumcenter,repeat/state/input fixes.
- snaps.js,tracking.js,advanced-ui.js:overrides,priority/aperture,explicit budget reporting,limited tracking/shared advanced point routing.
- build.cjs,dist/parts22/23,restore-release.cjs:updated self-contained build and verified reconstruction hash.
- New m1-* tests and run-m1 runner; existing command/snap/browser tests updated only for dependency loading and deliberate repeat contract changes.
- Docs audit,references,command guide,verification and continuation;no dependency added.

No new M1-B drawing/modify command or PLINE schema change was made. Tracking is
limited to WCS polar rays and acquired x/y anchors. Dynamic input is a cursor
readout with command-field entry. OFFSET repeats the same source selection.
Dense snapping can report incomplete search; O(n) flatten/hover remains. Exact
limits and supported/rejected options are in M1-A.md. Full sample DWG uploads
were left outside the commit after automatic approval rejection; restore them
from the already delivered source archive to rerun import tests.
