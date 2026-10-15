@echo off
REM ============================================================
REM  EventoFacil - inicia o sistema no Windows (duplo clique)
REM  1. Instala as bibliotecas do Python (so demora na 1a vez)
REM  2. Sobe o backend + site em http://localhost:5000
REM ============================================================
cd /d "%~dp0"
chcp 65001 > nul

if not exist ".env" (
    echo.
    echo  [ATENCAO] Arquivo backend\.env nao encontrado.
    echo  Copie o .env.example para .env e preencha os dados.
    echo.
    pause
    exit /b 1
)

echo Instalando/verificando bibliotecas...
python -m pip install -r requirements.txt --quiet --disable-pip-version-check

REM Abre o navegador alguns segundos depois, quando o servidor ja subiu
start "" /b cmd /c "timeout /t 4 /nobreak > nul & start http://localhost:5000"
python app.py
pause
