#!/bin/bash
ROOT="$(cd "$(dirname "$0")" && pwd)"
"$ROOT/localcodex" "$@"
RESULT=$?
if [[ $RESULT -ne 0 ]];then printf '\nLocalCodex завершился с ошибкой %s. Нажмите Enter.\n' "$RESULT";read -r _;fi
exit "$RESULT"
