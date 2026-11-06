# DWG saving: investigated, unavailable in the bundled runtime

The current offline application can **read supported DWG entities**, but it
cannot produce a genuine DWG file with its bundled engine. Save As must keep
DWG unavailable and explain the reason. Native `.rasm.json` preserves the
application's editable model; DXF export is the available AutoCAD interchange
route, with its existing documented entity/style flattening limits.

## Verified evidence

The bundled `@mlightcad/libredwg-web` engine is version0.8.4. A real instantiated
WASM runtime exposes269 keys, including `dwg_read_file`, `dwg_write_dxf`, and
some low-level setters. It does **not** expose `dwg_write_file` or
`dxf_read_file`. Its31 direct WebAssembly exports also have no DWG writer.
`dwg_write_dxf` takes existing DWG input and writes DXF output; it is not a
DXF-to-DWG converter.

The existing corresponding source archive
`vendor/libredwg-source-v0.8.4.tar.gz` in the complete0.7 delivery confirms this:

- `bindings/javascript/embind/binding_func.cpp:111–118`: the
  `dwg_write_file_wrapper` implementation is commented out.
- The same file at951: `DEFINE_FUNC(dwg_write_file)` is commented out;
  `DEFINE_FUNC(dwg_write_dxf)` at949 is active.
- `CMakeLists.txt:40,249–279,309–313`: upstream native LibreDWG has optional
  encoder sources and `dwgwrite`/`dxf2dwg` tools. This does not make that encoder
  available in the shipped JavaScript interface.
- `bindings/javascript/script/build-wasm.mjs:38–39`: rebuilding the WASM requires
  Emscripten. `emcc`, `emcmake`, `dwgwrite` and `dxf2dwg` are not installed in the
  current execution environment. No new encoder/toolchain was installed or built.

The inspection is reproduced by `node tests/depth-dwg.test.cjs`, which records
the exact runtime capability and binary SHA256 in `build/depth-dwg-capability.json`.
The WASM SHA256 inspected is
`faf887bddb97fa8075ce718aaae578ea2af33bb091c9cf123df75c1d5b212abf`.
No reference implementation code was copied and no dependency was added.

## Application boundary

`RasmDwgWrite.capabilities()` returns `available:false` with a user-facing reason.
`RasmDwgWrite.write()` explicitly throws `DWG_WRITER_UNAVAILABLE`; it emits no
bytes and cannot create a mislabeled DXF or JSON file. Discovering a similarly
named runtime method never enables saving automatically: an actual document
encoder and tested round-trip path are required.

## What is still required

Writing DWG requires an actual encoder build or compatible licensed SDK, mapping
the RasmCAD document to its native database, and explicit handling of layers,
text/fonts, dimensions, hatches, blocks/attributes and version-specific data.
An accepted result must have a valid DWG signature, reopen in an independent
DWG reader, and preserve the tested geometry and supported properties. Modern
DWG version choices must each be verified; merely selecting a header is not a
DWG encoder. Imported drawings currently contain flattened/unsupported data,
so native DWG round-trip fidelity cannot be promised even after an encoder is
introduced.

No DWG write round-trip test was possible, because no file was generated. The
capability test is evidence for an honest limitation, not completion of the
user's DWG-saving requirement. Windows/Edge and AutoCAD application validation
remain separate requirements for a future encoder integration.
