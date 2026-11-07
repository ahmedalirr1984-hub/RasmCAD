#!/usr/bin/env bash
set -euo pipefail
# Requires Emscripten 3.1.69, CMake and make/ninja.
dwg_source=$(cd "${1:?Pass the extracted LibreDWG source directory}" && pwd)
dwg_root=$(cd "$(dirname "$0")/../.." && pwd)
dwg_build="$dwg_root/build/dwg-writer"
emcmake cmake -S "$dwg_source" -B "$dwg_build" \
  -DCMAKE_BUILD_TYPE=Release -DCMAKE_C_FLAGS_RELEASE='-O1 -DNDEBUG' \
  -DBUILD_SHARED_LIBS=OFF -DLIBREDWG_DISABLE_JSON=ON \
  -DLIBREDWG_DISABLE_WRITE=OFF -DLIBREDWG_LIBONLY=OFF \
  '-DCMAKE_EXE_LINKER_FLAGS=-sALLOW_MEMORY_GROWTH=1 -sMODULARIZE=1 -sEXPORT_NAME=createDwgWriter -sENVIRONMENT=web,node -sEXPORTED_RUNTIME_METHODS=[FS,callMain] -sINVOKE_RUN=0 -sEXIT_RUNTIME=0'
cmake --build "$dwg_build" --target dxf2dwg --parallel 2
cp "$dwg_build/dxf2dwg.js" "$dwg_root/vendor/dwg-writer/dxf2dwg.cjs"
cp "$dwg_build/dxf2dwg.wasm" "$dwg_root/vendor/dwg-writer/dxf2dwg.wasm"
