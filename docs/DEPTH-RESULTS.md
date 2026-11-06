# 0.8-dev verification and limits

Final standalone HTML:15749274bytes.
SHA256:`80f90cf791dddbdf168423c454f70c237fdfa027dd6f9b33ef25e5faf8dcb378`.
Starting remote commit:`e48b82e488f479d3558fd3c72225c5eab7e04bfb`.
Work is on `codex/command-depth`;main is unchanged. This preview does not claim
AutoCAD feature parity,a compatibility percentage,or completion of DWG writing.

## Verified by tests

`node tests/run-depth.cjs`:**44/44JavaScript suites pass**,0failed. Every suite
observed the same unchanged final HTML hash. The existing33suites and11new
suites run together;their source,logs and machine-readable manifest are retained.
Legacy browser boot checks now accept the expected version through the same
environment variable instead of hard-coding0.7;their behavior assertions remain.

New real-browser cases:**39**:

|Suite|Cases|Covered behavior|
|---|---:|---|
|depth-commands-browser|19|Actual mouse selection and command stages,COPYSingle/ArrayFit/All,Undo,Reference rotate/scale,MirrorDelete,ARC3P,RectangleDimensions,MOVEvector,TTR,MatchPropSettings,multiple targets,Edge,Through/layer/erase,NoTrim,ChamferAngle,retry state and redundant checkpoints|
|depth-dimensions-browser|3|Full rendered style form/copy/preset,repeated dimension chains,baseline spacing,invalid-point recovery|
|depth-plot-browser|5|Mouse window andEsc,selectionvsbounds,Display,realA3vectorPDFdownload,persistent settings,vectorprinterwindow andprintAPI invocation|
|depth-save-browser|12|Five actual format downloads,SaveAs command,DWGdisabled,chosen native handle reuse,writefailure/dirty protection,New resets handle,async snapshot andoverlap guards,captured format during delayedwriting,andwrong-extension rejection beforewrite|

New pure checks/groups:construction20,core arc2,dimensions9,DWGcapability4,
geometry18,plot10,saveformats26. Counts describe individual suite conventions;
they are not a CAD feature score. Existing mathematical,selection,grip,Arabic,
native persistence,DWG reader andDXF browser regressions also pass.

Maximum discrete snap error observed by the inherited real-pointer precision
cases:4.440892098500626e-16drawing units,with tolerance1e-8. This is a bound for
those fixtures only,not all coordinates or all imported CAD entities. New TTR
checks cover origin0,150000 and1e8. OFFSET regressions cover tiny.0001geometry
and inward offsets at1e8. Reference anddimension assertions compare analytic
results or the actual delivered pointer coordinates,not an assumed exact screen
position. See DEPTH-AUDIT.md for the reproduced defects and scope.

## Independent compatibility checks

`python3 tests/dxf_interop.py`:four legacy output files audited with ezdxf,
zero errors/repairs;geometry,Arabic,dimensions andlegacy plan checks pass.
All four new SaveAs versions—AC1021/AC1024/AC1027/AC1032—were independently
audited. A broader81entity native sample exported141supported flattened DXF
entities in each version,with zero errors/repairs;Arabic andSOLIDgeometry retained.
This validates those files,not exact AutoCAD application round-trip fidelity.
Native save/reopen deep comparison preserves the application's layers,object
properties,blocks,hatches,dimensions,styles andplot resources in tested cases.

SaveAs filehandle tests use a controlled browser adapter;actual file downloads
are real. Printer tests create the actual vectorpopup and observeprintinvocation;
physical hardware output is not tested. PDF paper/scale behavior is checked
through the existing independent PDF/Poppler audit in the full runner.

## Pointer performance:observed before/after

Chromium155,Linux,Node24.22.1,3logical AMD EPYC9V74 CPUs,viewport1500x1100,DPR1.
Sparse grid:100columns,spacing40,linevector(20,10). Dense:diameters throughorigin,
length2000. Same15warmups and150sparse/35dense pointer samples asM1 profiler.
Handler includes snapping,hover andcoordinate text;RAF rendering is separate.

|Distribution|Entities|Before median/p95 ms|After median/p95 ms|
|---|---:|---:|---:|
|Sparse|5000|1.5/2.9|1.3/1.9|
|Sparse|20000|5.8/7.2|4.8/6.2|
|Dense|5000|21.8/39.7|22.7/28.5|
|Dense|20000|26.6/30.9|27.1/40.0|

There is no general speedup claim:dense20k remains noticeably slower and itsp95
increased in this run. These are single runs on a shared machine;the newUI also
changes canvas dimensions within the viewport. They measure observed workflow
cost,not a controlled causal benchmark. O(n)flatten/hover andthe explicit100000
intersection-pair budget remain;no spatial index was added. Both profiles had
zero page errors. Raw profiles contain separate snap,hover andRAF results.

## Not done / not verified

- **DWG saving is not implemented.** The bundled reader lacks a usable DWG
  encoder. See DWG-WRITING.md;the disabled option never emits a renamedDXF.
- ActualWindows/Edge,file://offline execution andphysicalprinter output are
  unverified. ManagedChromium rejects file protocol with
  ERR_BLOCKED_BY_ADMINISTRATOR;msedge is absent. Exact-file loopback/offline
  testing is evidence for that route only. No security policy was changed.
- Imported NURBS,ellipses andbulges can remain approximated/flattened;no original
  DWG losslessness claim. Native project save preserves the converted app model.
- PLINEbulges/variablewidth,all-polyline fillet,fence/crossing Trim/Extend,
  completeDIMSTYLE,alternate units/tolerances/associativity,Layouts andCTB/STB
  remain unsupported. Individual supported/rejected options are inCOMMAND-DEPTH.md.
- Native format1 andexisting document/history limits remain;this is a
  development preview,not a full AutoCAD replacement.

## Evidence / reproducibility

Machine-readable files under `docs/verification/`:depth-validation.json,
depth-before-profile.json,depth-after-profile.json,depth-dxf-interop.txt,and
depth-dxf-versions.json. Run the exact commands above after restoring fixtures
from the existing0.7source delivery. `node restore-release.cjs` joins and hashes
the tracked parts;`node restore-vendor.cjs` extracts the bundledWASM;
`node build.cjs` reproduces the standalone HTML. No new runtime dependency added.
