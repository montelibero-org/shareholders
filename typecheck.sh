#!/bin/bash
set -eux -o pipefail

TMPFILE=/tmp/typecheck.$RANDOM
xmlstarlet select --text --template --value-of '//body//script' index.html \
  > "$TMPFILE.ts"
tsc --noEmit --strict "$TMPFILE.ts"
rm "$TMPFILE.*"
