@echo off
setlocal
cd /d "%~dp0"
copy /b "dist\parts\RasmCAD-Advanced.html.part01"+"dist\parts\RasmCAD-Advanced.html.part02"+"dist\parts\RasmCAD-Advanced.html.part03"+"dist\parts\RasmCAD-Advanced.html.part04"+"dist\parts\RasmCAD-Advanced.html.part05"+"dist\parts\RasmCAD-Advanced.html.part06"+"dist\parts\RasmCAD-Advanced.html.part07"+"dist\parts\RasmCAD-Advanced.html.part08"+"dist\parts\RasmCAD-Advanced.html.part09"+"dist\parts\RasmCAD-Advanced.html.part10" "dist\RasmCAD-Advanced.html" >nul
if errorlevel 1 (
  echo Could not restore the release.
  exit /b 1
)
start "" "dist\RasmCAD-Advanced.html"
