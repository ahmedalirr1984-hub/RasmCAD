# Continuation — M1 paused before Gate A

## Done

- Latest main recorded: `e5d1f7594b2aaabeb9864d71b8e2270ba17e53a5`.
- Branch `codex/m1`; unchanged checkpoint `ee7a4e1ccae879c61ff887d96601313dba47cddd`.
- Step0 audit/reference review, characterization before modification, baseline5k/20k pointer profile.
- M1-A numerical fixes, transparent snap overrides/aperture/priority, limited polar/object tracking/FROM/cursor readout, repeated TRIM/EXTEND/OFFSET/COPY with local Undo and explicit unsupported-option errors.
- All33 JavaScript test suites pass on the same final HTML; independent Python ezdxf audit passes. There are37 new cases:6 characterization,6 numeric regression,4 tracking unit,21 real-browser workflows. Existing29 suites also pass. No known unresolved defect from the reproduced M1 audit set.
- SHA256 `6e7bede31f03d7919446ec6aa6a32725e501fa7fe6e580be63a8450807703543`,15683496bytes. Joining the tracked parts reconstructs these exact bytes.

## Gate status / next work

Gate A is **PENDING**, not passed. The real file:// Chromium test is blocked by managed policy (`ERR_BLOCKED_BY_ADMINISTRATOR`), and Edge is absent. Loopback/offline tests pass but are not a substitute for that requirement. Do not start M1-B until the literal file:// offline import/draw/save/reopen suite is verified in an environment that permits it. Do not weaken browser/institution policies to run it.

M1-B and Gate B have **not started**. After Gate A, implement only the user's M1-B list. Write a PLINE bulge/width design and compatibility/migration tests before any model change; defer if compatibility cannot be demonstrated. No M2 implementation, main push, merge, force-push or deployment has occurred.

Dense snapping still has an explicit100000pair budget, with a visible incomplete-search warning; dense median handler time regressed relative to truncated baseline. See M1-results and raw profiles. Full arbitrary-angle object tracking and a separate dynamic-input cursor editor are not implemented.

## Commands to resume

1. Download/checkout `codex/m1`.
2. Copy `Source/tests/fixtures` from the complete0.7 delivery linked in README into `tests/fixtures`. These baseline fixtures were not on main. Automatic approval rejected uploading a specific DWG binary because code-upload authorization was insufficient; the code/test changes are complete without publishing that file.
3. `node restore-release.cjs && node restore-vendor.cjs && node build.cjs`
4. Development tooling: `npm install --no-save playwright pngjs`; install ezdxf for the independent Python check and Poppler for PDF auditing if unavailable.
5. `node tests/run-m1.cjs`
6. `python3 tests/dxf_interop.py`
7. `node tests/m1-profile.cjs`

The runner records literal file protocol status separately from suite success in `build/m1-validation.json`. A successful file check includes DWG/DXF import with networking offline. Run the actual human pointer/save/reopen checks from file:// on the Windows target too; Edge must only be described as tested after the suite has run there.

## Recommended later milestone — plan only

After M1-B/GateB, M2 data safety and DXF fidelity: recoverable local drafts, atomic native save checks, explicit import/export loss reports, entity/style/layer round-trip tests and Arabic text fidelity. M3 spatial indexing follows to address5k/20k hover and dense-snap cost. Layout/plot and DWG-writing feasibility remain later plans.
