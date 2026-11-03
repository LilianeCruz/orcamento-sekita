#!/bin/zsh
# Pede a senha do banco (não aparece na tela, não vai para o histórico), monta a DATABASE_URL do pooler do Supabase
# e grava no Netlify. Rode: zsh ferramentas/definir_banco.sh
cd "$(dirname "$0")/.." || exit 1
read -s "SENHA?Cole a senha do banco (nada aparece enquanto você cola) e aperte Enter: "
echo
[ -z "$SENHA" ] && { echo "Senha vazia. Nada foi feito."; exit 1; }
CODIFICADA=$(printf %s "$SENHA" | python3 -c "import sys,urllib.parse; print(urllib.parse.quote(sys.stdin.read(), safe=''))")
unset SENHA
netlify env:set DATABASE_URL "postgresql://postgres.gstbkqtwmomxvmhpcxva:${CODIFICADA}@aws-1-sa-east-1.pooler.supabase.com:6543/postgres" --force && echo "Pronto: DATABASE_URL salva no Netlify."
