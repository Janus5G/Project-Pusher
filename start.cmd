@echo off
setlocal
cd /d "%~dp0"
if not exist "node_modules\electron" (
  echo Afhaengigheder mangler. Koer foerst: npm install
  pause
  exit /b 1
)
npm start