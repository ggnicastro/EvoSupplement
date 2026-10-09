#!/bin/bash
cd -- "$(dirname -- "$0")" || exit 1
if [ ! -x /usr/bin/perl ]; then
  echo "Este Mac nao inclui o runtime Perl usado pelo iniciador."
  echo "Peça ao autor uma versao hospedada do suplemento. Nenhuma ferramenta foi instalada."
  read -r -p "Pressione Enter para fechar... "
  exit 1
fi
if [ ! -f index.html ] || [ ! -f _portable/server.pl ]; then
  echo "Extraia o ZIP completo antes de abrir o suplemento."
  read -r -p "Pressione Enter para fechar... "
  exit 1
fi
/usr/bin/perl _portable/server.pl "$PWD"
status=$?
if [ "$status" -ne 0 ]; then
  echo "Nao foi possivel iniciar o suplemento (codigo $status)."
  read -r -p "Pressione Enter para fechar... "
fi
exit "$status"
