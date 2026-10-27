#!/bin/bash
cd "$(dirname "$0")" || exit 1
/bin/bash ./macos/install.sh "$@"
RESULT=$?
if [[ $RESULT -ne 0 ]];then printf '\nУстановка остановилась с ошибкой %s. Скопируйте сообщение выше.\n' "$RESULT";fi
printf '\nНажмите Enter, чтобы закрыть окно.'
read -r _
exit "$RESULT"
