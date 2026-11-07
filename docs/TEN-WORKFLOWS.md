# Ten workflow groups — 0.9-dev

Branch: `codex/ten-workflows`, based on the 0.8 command-depth preview. This guide
records this cycle's implemented groups, not a usage survey or a count of complete
AutoCAD commands. Main is unchanged. The earlier [20-workflow guide](COMMAND-DEPTH.md)
is a historical 0.8 record; the additions here supersede its listed gaps where
explicitly described.

## Implemented depth and remaining limits

| Group | Current workflow | Remaining limits |
| --- | --- | --- |
| 1. Selection | `SELECT FENCE`, `FENCE`, `WPOLYGON`, `CPOLYGON`, `CROSSING`, `QSELECT`, `SELECTPREVIOUS`; finite-geometry checks and semantic native object types | Hidden/locked layers remain protected; selection is limited to represented geometry |
| 2. Snaps | Endpoint/midpoint/center/quadrant/intersection/perpendicular/tangent/nearest plus Extension and acquired Parallel; intersection candidate pruning; explicit incomplete-search notice | Parallel needs an input base and acquired line reference; default 100,000-pair budget can still stop dense searches |
| 3. PLINE / PEDIT | Alternating straight and analytic circular-arc segments, physical start/end widths, per-segment bulges/widths, vertex movement, reverse/open/close and Explode | Arc construction uses through-point input; width ribbons are tessellated; no general curved OFFSET or full AutoCAD PEDIT fitting/option set |
| 4. TRIM / EXTEND | Repeated targets, Edge modes and Fence/Crossing target groups with a single local Undo step; native curve centerlines used for intersections | Unsupported/no-cut targets are skipped and counted; not all curve/topology cases are implemented |
| 5. MATCHPROP | Choose compatible properties and optionally include explicit child styles within compound objects; repeated targets with local Undo and atomic validation | No absent linetype/transparency fields or full Autodesk property model; geometry types remain unchanged |
| 6. Dimensions | Explicit `DIMASSOC` binding to a LINE/CIRCLE, `STATUS`, `REMOVE`; source-following native dimensions, retained label offsets and visible orphan state; existing named DIMSTYLE tools | Binding is explicit and limited to compatible native dimensions and references; not a constraint solver, full imported associativity, tolerances, alternate units or annotative system |
| 7. Page setups / styles | Store/load named page settings; paper size, units, region, scale, margins and weights; RGB-to-printed-color/weight mapping | Mapping is RasmCAD data, not AutoCAD CTB/STB; some source plot settings and fonts cannot be reproduced |
| 8. Plot layouts / publishing | Store/load custom layouts containing 1–16 separately scaled, clipped model windows; vector preview/layout PDF; selected saved layouts published to one PDF | Plot-only layout data, not full interactive AutoCAD paper space; maximum 32 sheets in a batch; physical printer behavior remains untested |
| 9. Save / exchange | Native project and four DXF versions; genuine offline experimental R2000 DWG output, header checks and reimported-geometry comparison | Modern DWG writing absent; geometry/structure loss described below; no guarantee of lossless AutoCAD round trips |
| 10. Recovery | Optional local snapshots, checksum validation, restore UI and native project parsing | Default off; three snapshots, maximum 16 MiB each; browser/origin-specific storage, not disk autosave or cloud backup |

## Selection and grouped edits

Use `SELECT FENCE`, pick two or more points and press a blank Enter. `WPOLYGON`
selects objects wholly inside a polygon; `CPOLYGON` also selects intersecting
objects. Pick at least three polygon vertices, then Enter. `CROSSING` uses two
corners. Esc cancels the current selection draft. `QSELECT` opens the type,
layer, color and inverse-match controls; `SELECTPREVIOUS` restores the previous
selection while the drawing remains open.

For Trim/Extend, preselect boundary objects if needed, start the command, enter
`FENCE` or `CROSSING`, then pick the target path/window. Fence uses its geometric
intersection as the target pick. The operation reports resulting objects and
skipped unsupported/no-cut targets. `U` undoes the whole latest group. Enter or
Esc finishes the repeated edit command.

## Native curved polylines

Example using coordinates in the command field:

```text
PLINE
0,0
WIDTH 2,4
A
50,-50
100,0
L
100,100
[blank Enter]
```

`A` takes a point on the arc followed by its endpoint; `L` returns to straight
segments. This is the implemented three-point arc workflow, not every AutoCAD
PLINE Arc construction option. `WIDTH 2,4` defines physical start/end widths
in drawing units, independently of screen line weight. `U` removes the latest
committed segment; `C` closes the path. Unconfirmed previews are discarded on
Esc, while committed segments remain.

Select the resulting polyline and use `PEDIT` for its form or use commands such
as `PEDIT SEGWIDTH 0 1 3` and `PEDIT SEGMENT 0 0.5`. Segment indices are zero
based; a bulge of zero means straight. Analytic centerline arcs are retained in
native data, while width fills use a bounded polygonal ribbon approximation.
Explode creates independent child objects. Native save/reopen retains the path
metadata; CAD exchange flattens it. Older RasmCAD versions may reject new native
polyline compounds. Imported source-DWG bulges can still be sampled by the
existing reader; this change does not reconstruct lost source metadata.

## Match Properties and linked dimensions

Run `MATCHPROP`, choose the source, enter `SETTINGS`, and select the fields.
Enable **Apply to explicit styles inside compound objects** when the destination
has independently styled children. Choose target objects repeatedly; `U` removes
the last target change. Unsupported properties are not invented or copied.

To link a dimension, select exactly one compatible native dimension and its LINE
or CIRCLE source, then run `DIMASSOC`. Linear dimensions follow line endpoints;
radius/diameter dimensions follow a circle center/radius. Existing label offsets
are retained. Moving or editing the source refreshes the dimension within the
same application edit transaction. Deleted or collapsed sources show `[ORPHAN]`
in place of a stale measurement. Native project save/reopen retains links.
`DIMASSOC STATUS` reports links; select dimensions and run `DIMASSOC REMOVE` to
detach them. This is distinct from AutoCAD's DIMASSOC system-variable semantics.

## Advanced plotting

In **Plot / Print**, choose the paper, orientation, drawing units, scale and
region. Model plots support Extents, Display, mouse-picked Window, Selected
Bounds and Selected Objects Only. The browser printer option opens a real print
dialog. Vector PDF avoids screen capture; print at Actual size / 100% and match
the physical paper. Browser headers/footers and printer scaling can alter output.

Expand **Page setups, layouts and batch publishing**:

1. Enter a page-setup name and use **Save setup**; choose it and **Load setup**
   to restore its settings.
2. Use **Add viewport** and enter its paper X/Y, width and height in millimetres
   from the bottom-left of the sheet. Pick or enter its model window and set
   `Scale 1:N`, or enable Fit for that viewport. Multiple windows can use
   independent scales and vector clips.
3. Save a named layout, then use **Preview layout** or **Download layout PDF**.
4. Check saved layouts and choose **Publish selected layouts as PDF** for one
   multi-page vector document.
5. Optionally save an RGB color mapping and physical pen width. Disable
   Monochrome to use its mapped color. These mappings are not CTB/STB files.

Layouts and presets persist in the native project. The UI manages plot layouts;
it does not provide interactive model/paper-space viewport editing or preserve
source AutoCAD layout metadata. Font substitution, SHX, complex text shaping and
source object conversion remain fidelity limits.

## Real DWG writing and loss report

**Save As → DWG R2000** invokes the embedded LibreDWG encoder locally. The output
has an actual `AC1015` DWG header, not DXF renamed to `.dwg`. Before offering the
download, the normal save route reopens it and compares supported geometry
against the DXF exchange representation. A failed comparison stops that output.
This check does not prove full CAD structure fidelity or acceptance by every
version of Autodesk AutoCAD; no actual AutoCAD installation was used here.

Important scope:

- Writing targets DWG2000 only. The modern DWG versions remain unavailable for
  writing; the existing reader has its own, broader tested sample scope.
- Native polylines, blocks, hatches, dimensions and their associations become
  visible independent geometry. Keep `.rasm.json` for full RasmCAD editability.
- True RGB colors map to nearest indexed ACI colors. The geometry check does
  not promise identical color, font, lineweight or plot-style reproduction.
- Layer names must be representable in Arabic/Latin Windows-1256. Text values
  use Unicode escapes; unsupported layer names are rejected rather than silently
  renamed.
- Unsupported or already simplified data from an import cannot be restored by
  export. Original xrefs, custom objects, source block definitions, layouts and
  advanced metadata are not reconstructed.

The Save As integrity/loss report and [DWG-WRITING.md](DWG-WRITING.md) describe
these limitations. There are no runtime drawing uploads or conversion servers.

## Local recovery and verification

Open **Recovery** or enter `RECOVERY` and enable local recovery. It keeps the
latest three integrity-checked native snapshots in IndexedDB, up to 16 MiB each.
Use **Save snapshot now** or let changes schedule a snapshot. **Restore** loads a
listed drawing; save a disk project afterward. Recovery is tied to the browser
and origin; clearing browser data, changing origins or restricted local-file
storage can remove or isolate it. It starts disabled and is not a replacement
for saving work to disk.

The focused Chromium suite exercises eight workflows, including actual pointer
selection, grouped Trim Undo, curved PLINE, associated-dimension movement,
layout controls/PDF, actual DWG download/reopen with Arabic text and local
recovery. The focused Node runner `node tests/ten-focused.cjs` passed 18 suites, including
seven new DWG/recovery groups. Exact verification and artifact hashes are recorded in [TEST_RESULTS.md](../TEST_RESULTS.md); these
counts are not a statement that every old suite was rerun or that Windows Edge,
direct local-file policies, physical printers or target AutoCAD were tested.
