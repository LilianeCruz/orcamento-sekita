#!/bin/bash
# Abre o sistema de orçamento no Google Chrome (só neste computador).
cd "$(dirname "$0")"
if [ ! -d .venv ]; then
  python3 -m venv .venv && .venv/bin/pip install -q -r requirements.txt
fi
URL="http://127.0.0.1:8010"
(
  sleep 2
  if [ -d "/Applications/Google Chrome.app" ] || [ -d "$HOME/Applications/Google Chrome.app" ]; then
    open -a "Google Chrome" "$URL"
  else
    echo "Google Chrome não encontrado; abrindo no navegador padrão."
    open "$URL"
  fi
) &
.venv/bin/python -m uvicorn app.main:app --host 127.0.0.1 --port 8010 --reload --reload-dir app
