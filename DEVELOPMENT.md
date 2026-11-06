# Develop RasmCAD Advanced 0.7

The GitHub checkout stores the standalone HTML in `dist/parts` because the
GitHub connector cannot send the 15 MB file in one request. Run
`node restore-release.cjs` and `node restore-vendor.cjs` before rebuilding.
Both the complete corresponding upstream source archive and the original font
source are included in the 0.7 Google Drive delivery linked from README.md.

The delivery's `Source` folder contains editable application source, bundled dependencies, build scripts, fixtures, and tests. The HTML beside that folder is a generated application. Change the source files, then rebuild the HTML; edits to the generated file will be overwritten by the next build.

## Set up and build

1. Extract the complete archive and make a working copy of `Source`.
2. Install a current Node.js LTS release on the development computer. Open a terminal in your working `Source` directory.
3. Build the application:

   ```sh
   node build.cjs
   ```

4. Open `dist/RasmCAD-Advanced.html` in Edge or Chrome and confirm its visible version. End users only need this built HTML; Node.js and Python are development tools.

`build.cjs` embeds CSS, application modules, dxf-parser, and the LibreDWG JavaScript/WebAssembly runtime into one HTML file. It uses the existing files in `vendor`; a build does not fetch a conversion service or download dependencies.

For automated browser tests, install the development-only packages:

```sh
npm install --no-save playwright pngjs
```

The browser tests serve the built HTML on loopback, exercise it through mouse/keyboard events and observe model state. Most turn the browser context offline after loading. Keep the original security policy and import warnings when making changes.

## Source map

| File | Responsibility |
| --- | --- |
| `src/app.js` | Canvas rendering and camera, event handling, drawing/editing command stages, numeric input, selection workflow, inspector, history and file actions. |
| `src/commands.js` | Pure numeric/coordinate input parsing, scalar direction and command-input helpers. |
| `src/view.js` | Viewport projection, clipping and curve rendering support without document mutation. |
| `src/core.js` | Document model, native project serialization, geometry, undo/redo, dimension primitives and common validation. |
| `src/editing.js` | Geometry operations such as transform, trim/extend, offset, fillet/chamfer, arrays, join and explode. |
| `src/selection.js` | Geometric hit testing, window/crossing selection and selection bounds. |
| `src/grips.js` | Grip definitions and isolated previews for direct geometric edits. |
| `src/io.js` | CAD content recognition, DWG/DXF import, source-layer metadata correction, writable current-layer selection, supported entity conversion and import warnings. |
| `src/dxf-binary.js` | Binary DXF group decoding and DXF text/codepage decoding before the existing entity parser. |
| `src/index.html` | English interface, tool controls, command field, inspector and help. Preserve element IDs used by the UI. |
| `src/style.css` | Layout, responsive rules, command/history controls and print styles. |
| `build.cjs` | Generates the standalone HTML and embeds the bundled local runtime. |
| `package.cjs` | Assembles a delivery with the application, source, licenses and test evidence. Run after building and producing the expected test artifacts. |
| `tests/` | Model tests, real browser interactions, import fixtures, and optional DXF audits. |

Start with the command dispatch in `app.js` when tracing an interaction, then follow its geometry/input helpers. `build.cjs` lists the modules embedded in the application.

## Test a change

Run the relevant model tests first; these require Node.js and the bundled vendor files:

```sh
node tests/core.test.cjs
node tests/advanced.test.cjs
node tests/selection.test.cjs
node tests/grips.test.cjs
node tests/dimension-styles.test.cjs
node tests/commands-v05.test.cjs
node tests/dxf-binary-v06.test.cjs
node tests/import-v06.test.cjs
node tests/render-v05.test.cjs
```

`render-v05.test.cjs` includes both model/viewport and browser checks; set `RASMCAD_SKIP_BROWSER=1` to run only its pure checks (in PowerShell: `$env:RASMCAD_SKIP_BROWSER = '1'`). Clear that variable before the full browser run.

Rebuild before testing the browser artifact:

```sh
node build.cjs
RASMCAD_TEST_UNLOCK=1 node tests/layers-v06.test.cjs
node tests/input-v05.test.cjs
RASMCAD_EXPECT_VERSION=0.7 RASMCAD_OUTPUT=build/command-ui-v07 node tests/command-ui-v05.test.cjs
node tests/render-v05.test.cjs
node tests/interaction-regressions.test.cjs
node tests/browser.test.cjs
node tests/advanced-browser.test.cjs
node tests/dimension-browser.test.cjs
node tests/grips-browser.test.cjs
```

The default browser path in this development environment is `/usr/bin/chromium`. `browser.test.cjs`, `interaction-regressions.test.cjs`, `input-v05.test.cjs`, `grips-browser.test.cjs`, `command-ui-v05.test.cjs`, and `render-v05.test.cjs` accept the `CHROMIUM` environment variable. For example, in Windows PowerShell, adjust this path to your actual Edge installation:

```powershell
$env:CHROMIUM = 'C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe'
node build.cjs
node tests/input-v05.test.cjs
node tests/interaction-regressions.test.cjs
```

The version and output variables above target the 0.7 command UI checks; `RASMCAD_TEST_UNLOCK=1` enables the layer suite's explicit-unlock cases. In Windows PowerShell, set them before running those suites:

```powershell
$env:RASMCAD_TEST_UNLOCK = '1'
node tests/layers-v06.test.cjs
$env:RASMCAD_EXPECT_VERSION = '0.7'
$env:RASMCAD_OUTPUT = 'build/command-ui-v07'
node tests/command-ui-v05.test.cjs
```

`advanced-browser.test.cjs` and `dimension-browser.test.cjs` currently hardcode the Linux browser path; adapt their `chromium.launch` options for Windows before running them there. This is setup guidance, not a claim that these harnesses were validated on your Windows device. Browser policies can affect local HTML or downloads even when a loopback test passes.

The command UI suite verifies real keyboard/form input, completion/recall, Unicode numbers and literal text, invalid-input recovery, history and diagnostic downloads. The render suite checks visible curve accuracy, clipping and pick alignment at large coordinates.

The input regression suite supports `RASMCAD_DPRS`, `RASMCAD_TEST_PATTERN`, and `RASMCAD_HTML` to target display scales, test names or another built artifact. Test output and screenshots are written under `build`. Python/ezdxf are used only by fixture-generation and independent DXF-audit scripts; they are not required to use the application.

`input-v05.test.cjs` exercises two-click and single-stroke drawing, scalar line lengths, numeric circle completion, preview cancellation, command-first Move/Copy/Mirror selection, typed coordinates, double-click completion and resizing at common Windows display scales. These describe test coverage; consult `TEST_RESULTS.md` and actual output for pass/fail results.

## Import and layer regressions

When changing import, test both drawing new geometry and editing an existing imported object. A nonzero entity count alone does not establish editability. Check a source with unlocked layers, intentionally locked layers, hidden current layers, all layers protected, and New/Open while a polyline is unfinished. Save/reopen the result and verify a supported DXF round trip. Keep source layer states except for explicit user changes. `ensureWritableLayer` in `io.js` selects a valid current layer after the source layer flags are decoded. The DWG adapter corrects the upstream `plotflockedlag` lookup by reading the actual native `locked` field; never replace this with blanket layer unlocking. Check `CLAYER`, true frozen/off states, freeze-in-new-viewports and genuine locks independently.

Color tests should exercise ACI indices beyond the first few colors, explicit truecolor, ByLayer inheritance and DXF layer group 420 independently; the palette comes from the bundled MIT-licensed dxf-parser, with attribution in THIRD_PARTY.md.

Binary DXF decoding changes file representation, not entity coverage; exercise both R12 and modern code widths and malformed/truncated inputs. The byte decoder uses UTF-8 for AC1021+ and supported declared encodings for earlier files, including Windows-1256 Arabic. Unknown encodings and malformed byte sequences are rejected explicitly. Strict size, group, string, numeric-finiteness and EOF checks must remain in place. Binary input requires SECTION first and EOF last; trailing bytes and literal CR/LF inside a binary string value are rejected. Fixtures from `tests/make_binary_v06_fixtures.py` pair R12 Windows-1252, R2000 Windows-1256 Arabic and R2018 UTF-8 text with their ASCII versions; this fixture generator needs development-only Python/ezdxf.

## Add or change a command

1. Reproduce the intended user sequence with actual clicks and keys. Write down what each prompt expects, when geometry is committed, and how the command ends.
2. Add pure geometry/validation in the appropriate module. Reject invalid input before changing the document.
3. Add command names/aliases, workflow stages and prompts in `app.js`; expose a tool button only if useful. Keep preview geometry separate from committed entities.
4. Add a focused regression that would fail without the change. For drawing/selection problems, use browser clicks and keyboard input rather than directly injecting the final geometry.
5. Build, run the relevant tests, then manually draw, edit, undo/redo, save a native project and reopen it. Check a fresh drawing and imported geometry when selection/rendering is involved.
6. Update Help, `COMMAND_WORDS.txt`, `FEATURES.md`, `CHANGELOG.md`, and test results to match observed behavior. Count actual supported workflows; aliases do not establish a percentage of AutoCAD coverage.

Keep these invariants:

- A preview never replaces the committed document model. Rendering and hit testing use the same geometry/camera and CSS-pixel coordinates regardless of device-pixel ratio.
- A completed action commits exactly once and is undoable; blank Enter does not invent another line segment.
- Stopping a command never erases already committed geometry. Grip cancellation discards only its preview.
- A scalar line length uses an explicit direction; an invalid/zero radius leaves the command ready for correction.
- Preselection and command-first selection can both reach Move, Copy and Mirror. Locked/hidden-layer behavior stays consistent.
- New/Open clears old command stages before replacing the document; pending geometry must never be appended to the replacement drawing.
- A new drawing starts with visible, unlocked layer `0`. Opening a drawing preserves actual source layer visibility/locks while establishing a writable current layer; unlocking visible layers is deliberate and undoable.
- Saving and reopening preserves editable geometry, dimension styles and colors; imported unsupported content remains reported.

## Distribute source and dependencies

The combined advanced application is GPL-3.0-or-later. Preserve `GPL-3.0.txt`, original MIT notices, `THIRD_PARTY.md`, local source/build files and the corresponding LibreDWG source archive `vendor/libredwg-source-v0.8.4.tar.gz` when redistributing the combined program. Keep vendor notices with the generated application. Review `THIRD_PARTY.md` for the exact bundled versions and integration changes.

This source implements an independent 2D application. It does not contain Autodesk source or establish complete AutoCAD/DWG compatibility. Improving DWG fidelity requires entity-specific import work and comparisons against real reference files; passing one fixture does not establish fidelity for all files of the same format.

Version 0.7 adds compound/solid entities and resources (block/style/plot). See UPGRADE_0.7.md and the new tests/*v07.test.cjs. Run command UI tests with RASMCAD_EXPECT_VERSION=0.7 and RASMCAD_OUTPUT=build/command-ui-v07. Font reproduction: tests/make_plot_font.py uses development fontTools and vendor/plot-font-source.ttf. Preserve vendor/plot-font-LICENSE.txt.
