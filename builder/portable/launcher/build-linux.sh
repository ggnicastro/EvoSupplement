#!/bin/sh
# Development only: recipients use the already compiled launcher.
set -eu
cd -- "$(dirname -- "$0")"
if [ "$(uname -s)" != Linux ] || [ "$(uname -m)" != x86_64 ]; then
  echo "Build this target on Linux x86-64." >&2
  exit 1
fi
mkdir -p ../bin/linux-amd64
"${CC:-cc}" -std=c11 -O2 -Wall -Wextra -Werror -pthread -s \
  -o ../bin/linux-amd64/evosupplement launcher.c
echo "Built ../bin/linux-amd64/evosupplement using the system glibc."
