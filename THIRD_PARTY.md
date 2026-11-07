# Licenses, source and integration changes

The combined RasmCAD Advanced application is distributed under **GPL-3.0-or-later**, without warranty. See `GPL-3.0.txt` / `LICENSE`. Original MIT notices remain in `ORIGINAL-MIT-LICENSE.txt`.

## LibreDWG JavaScript/WebAssembly

- Package: `@mlightcad/libredwg-web` version **0.8.4**, GPL-3.0.
- Package source: https://registry.npmjs.org/@mlightcad/libredwg-web/-/libredwg-web-0.8.4.tgz
- Upstream release: https://github.com/mlightcad/libredwg-web/tree/v0.8.4
- Upstream release source archive is included as `Source/vendor/libredwg-source-v0.8.4.tar.gz`. It includes the C library, JavaScript bindings and build scripts. The distributed npm package, generated JavaScript glue and WASM binary are also included in `Source/vendor/libredwg`.
- Local build integration embeds the unchanged reader WASM binary as gzip/base64. It converts the ESM glue's `import.meta.url` to a fixed inert file URL and its default export to a browser global. Supplying `wasmBinary` prevents network loading. The distributed UMD database wrapper is unchanged. A local adapter in `src/io.js` corrects its layer-lock metadata lookup: the upstream converter requests `plotflockedlag` rather than the native `locked` field. The adapter reads the actual source lock state; it does not blanket-unlock imported layers. The local integration is in `build.cjs` and `src/io.js`.
- Emscripten Embind creates JavaScript call wrappers dynamically. This document's own CSP allows those wrappers and WebAssembly execution; it continues to forbid network connections. No browser or OS policy is edited.

## dxf-parser

- Package: `dxf-parser` version **1.1.2**, MIT.
- Source: https://github.com/gdsestimating/dxf-parser
- Published package source and MIT notice are included in `Source/vendor/dxf-parser`. The browser UMD parser is embedded unchanged.
- The 256-entry ACI color palette used by the local import adapter in `src/io.js` is copied from this bundled package. Its MIT notice is retained in `Source/vendor/dxf-parser/LICENSE`: Copyright (c) 2015 GDS Storefront Estimating. This local use corrects indexed DWG/DXF color conversion without modifying the vendor parser.

## Public DWG fixtures

The `2018-*.dwg` fixtures are from LibreDWG's test data in the upstream release/source. The two small reference text dumps were obtained from the upstream public test-data directory. They establish sample-format tests, not a claim that the files were authored in AutoCAD 2024.

## Original RasmCAD code

Original independent RasmCAD core/UI code retained its MIT notice. New integration/editing work and the combined application are supplied under GPL-3.0-or-later. `Source` includes local source, build scripts, tests and dependency source archives. No Autodesk program code, branding assets or proprietary SDK is included. AutoCAD is a trademark of Autodesk.

## Embedded PDF font

Version 0.7 embeds a deterministic subset of DejaVu Sans for vector PDF text. Original font source and its complete license are included in Source/vendor/plot-font-source.ttf and plot-font-LICENSE.txt. Source/tests/make_plot_font.py reproduces the subset using development fontTools. No fonts or conversion services are fetched at runtime.

## Experimental DWG writer added in0.9-dev

A separate GPL-3.0-or-later LibreDWG `dxf2dwg` build from the same v0.8.4
corresponding source is embedded as gzip/base64 with generated Emscripten glue.
No C source modifications were made. The exact build flags, blank DXF template
and local encoding adapter are documented in vendor/dwg-writer/BUILD.md and
build.sh. The complete0.9 source delivery includes the corresponding upstream
source archive. The palette retains the dxf-parser MIT attribution above.
