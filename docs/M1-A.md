# M1-A development checkpoint

Work is on `codex/m1`, based on main `e5d1f7594b2aaabeb9864d71b8e2270ba17e53a5`.
This is a development checkpoint, not completion of the entire requested M1.
M1-B has not started; the mandatory file protocol gate is pending.

## Numeric fixes

AREA and CIRCLE3P solve in translated local coordinates. Preview and commit use
the same circumcenter helper. Editing and snapping share a wrap-aware arc
predicate and coordinate-aware tolerance. The line determinant uses a floating
point error bound instead of discarding all shallow crossings below1e-12 radians.
At (150000,170000), the .001-radius typed3P construction is tested to1e-8 units;
small polygon area is compared against represented-coordinate analytic area to1e-15.
This is double-precision arithmetic, not arbitrary-precision decimal geometry.

## Point input

Running modes still use OSNAP/F3 and OSNAPSET. Temporary overrides are typed
during a point prompt: `END MID CEN QUA INT PER TAN NEA NON`. Each affects the
next accepted point and then restores running modes. PER/TAN require a base.
These work in advanced point prompts as well as LINE/CIRCLE. Typed coordinates
are explicit coordinates and do not get silently resnapped.

- `APERTURE 10`: screen-pixel radius1..50, independent of zoom.
- `SNAPPRIORITY endpoint intersection midpoint center quadrant tangent perpendicular nearest`: explicit full mode-name order; `SNAPPRIORITY DEFAULT` restores the weighted default. Default Nearest is a fallback after discrete snaps.
- `POLAR ON 45` / `POLAR OFF`: positive angular increment<=180degrees, measured from WCS x-axis at the current base. Acquires a ray only within the aperture. This is not a full AutoCAD polar-angle settings dialog.
- `OTRACK ON` / `OTRACK OFF`: acquire up to4 endpoint/midpoint/center/quadrant/intersection anchors by dwelling350ms and moving again at the snap. `TRACK` explicitly acquires the current hovered snap. Aligns x/y to those anchors, with guide lines. No arbitrary angled object tracking.
- `FROM`: pick or type a temporary base, then `@dx,dy` or `@distance<angle`. It does not add the temporary base to the drawing.
- `DYNMODE ON` / `DYNMODE OFF`: cursor distance/angle and typed-value readout. Input continues through the command field; LINE/PLINE accept scalar length and `@distance<angle`. No separate multi-field cursor editor.

Object snap wins over tracking; tracking wins over Ortho. The coordinate footer
shows the active type. Unsupported options produce a message rather than
invoking unrelated single-letter command aliases.

## Repeated editing

TRIM and EXTEND keep their boundary selection and accept successive targets.
OFFSET retains its selected source(s) and distance for repeated side picks.
COPY uses Multiple mode: each destination is relative to the original base and
source, not the last copy. `M`/`MULTIPLE` is accepted for COPY. Enter/Esc ends
these commands while keeping committed edits. `U`/Undo button undoes the last
edit without leaving the command; it will not undo earlier work when the
command has no edits. If Properties or another document edit intervenes, U
ends the repeat command and performs ordinary history Undo, preserving history
order instead of consuming the wrong command counter. Redo uses ordinary history.

Fence/crossing/edge TRIM/EXTEND options, new construction commands, MIRROR
delete-source and the other requested advanced modify options belong to M1-B
and remain deferred. Existing FILLET/CHAMFER behavior is unchanged.

## Intersection limits and performance

The old240curve truncation is removed. The search considers all locally eligible
curves until it proves a zero-score optimum or reaches100000 pair comparisons.
If that budget is exhausted, the footer visibly says `INCOMPLETE INTERSECTION
SEARCH`, with a detailed tooltip, even if no point was found. A marked result
can therefore be an incomplete nearest-candidate search; do not treat it as a
guaranteed nearest intersection. Zoom/isolate geometry or use a different exact
construction. Module API callers must pass `onWarning` to observe incomplete
no-hit searches; the application does so. This limit and O(n) flatten/hover cost
remain candidates for M3 spatial indexing, not a claim of unrestricted dense CAD.

## Run checks

Restore the standalone parts with `node restore-release.cjs`; extract the
vendored WASM using `node restore-vendor.cjs`; rebuild with `node build.cjs`.
Development-only dependencies: `npm install --no-save playwright pngjs`.
Run `node tests/run-m1.cjs` for every `.test.cjs` suite. Poppler enables the
independent vector-PDF audit. Test fixtures come from the existing0.7 delivery
and must be copied from its `Source/tests/fixtures` directory to this checkout
before testing; provenance is in THIRD_PARTY.md. Automatic approval rejected
uploading a DWG fixture, stating that authorization to upload code did not
establish authorization to publish that specific binary. No DWG fixtures are
included in the new commit. The fixture hashes were independently matched
against the existing upstream source archive.
Run `node tests/m1-profile.cjs` separately for pointer profiling. Generated
logs/reports go under build. End users need only the restored single HTML.

The managed Chromium policy blocks file://. Exact-file loopback/offline tests
are evidence for those paths only; they do not pass the user's literal file://
gate. Edge is not installed. No browser or institution security policy was changed.
