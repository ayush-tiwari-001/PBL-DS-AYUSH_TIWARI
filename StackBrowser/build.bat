@echo off
setlocal
cd /d "%~dp0"
if not exist engine\bin mkdir engine\bin

where g++ >nul 2>nul
if %errorlevel%==0 (
  echo Building the C++ history engine with g++ ...
  g++ -std=c++17 -O2 -Wall -Wextra -static -o engine\bin\history_engine.exe engine\main.cpp
  if errorlevel 1 goto fail
  goto ok
)

where cl >nul 2>nul
if %errorlevel%==0 (
  echo Building the C++ history engine with MSVC ...
  cl /nologo /std:c++17 /O2 /EHsc /Fo:engine\bin\ /Fe:engine\bin\history_engine.exe engine\main.cpp
  if errorlevel 1 goto fail
  goto ok
)

echo.
echo No C++ compiler was found.
echo Install one of these, then run build.bat again:
echo   - MinGW-w64 / MSYS2 (g++)   https://www.msys2.org
echo   - Visual Studio Build Tools (open "x64 Native Tools Command Prompt" and run build.bat there)
exit /b 1

:fail
echo.
echo Build failed. See the compiler messages above.
exit /b 1

:ok
echo Built engine\bin\history_engine.exe
exit /b 0
