@echo off
setlocal
cd /d "%~dp0"
copy /b "dist\parts\RasmCAD-Advanced.html.part01"+"dist\parts\RasmCAD-Advanced.html.part02"+"dist\parts\RasmCAD-Advanced.html.part03"+"dist\parts\RasmCAD-Advanced.html.part04"+"dist\parts\RasmCAD-Advanced.html.part05"+"dist\parts\RasmCAD-Advanced.html.part06"+"dist\parts\RasmCAD-Advanced.html.part07"+"dist\parts\RasmCAD-Advanced.html.part08"+"dist\parts\RasmCAD-Advanced.html.part09"+"dist\parts\RasmCAD-Advanced.html.part10"+"dist\parts\RasmCAD-Advanced.html.part11"+"dist\parts\RasmCAD-Advanced.html.part12"+"dist\parts\RasmCAD-Advanced.html.part13"+"dist\parts\RasmCAD-Advanced.html.part14"+"dist\parts\RasmCAD-Advanced.html.part15"+"dist\parts\RasmCAD-Advanced.html.part16"+"dist\parts\RasmCAD-Advanced.html.part17"+"dist\parts\RasmCAD-Advanced.html.part18"+"dist\parts\RasmCAD-Advanced.html.part19"+"dist\parts\RasmCAD-Advanced.html.part20"+"dist\parts\RasmCAD-Advanced.html.part21"+"dist\parts\RasmCAD-Advanced.html.part22"+"dist\parts\RasmCAD-Advanced.html.part23" "dist\RasmCAD-Advanced.html" >nul
if errorlevel 1 (
  echo Could not restore the release.
  exit /b 1
)
start "" "dist\RasmCAD-Advanced.html"
