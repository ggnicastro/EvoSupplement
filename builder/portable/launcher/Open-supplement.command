#!/bin/bash
cd -- "$(dirname -- "$0")" || exit 1
if [ ! -x /usr/bin/perl ]; then
  echo "This Mac does not include the Perl runtime required by the launcher."
  echo "Ask the author for a hosted version of the supplement. No tools have been installed."
  read -r -p "Press Enter to close... "
  exit 1
fi
if [ ! -f index.html ] || [ ! -f _portable/server.pl ]; then
  echo "Extract the entire ZIP before opening the supplement."
  read -r -p "Press Enter to close... "
  exit 1
fi
/usr/bin/perl _portable/server.pl "$PWD"
status=$?
if [ "$status" -ne 0 ]; then
  echo "Could not start the supplement (exit code $status)."
  read -r -p "Press Enter to close... "
fi
exit "$status"
