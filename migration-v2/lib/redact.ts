export function redactSecrets(text:string){return text
 .replace(/\bBearer\s+[A-Za-z0-9._~+\/-]+/gi,'Bearer [СКРЫТО]')
 .replace(/\b(?:sk-[A-Za-z0-9_-]{16,}|eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+)\b/g,'[СКРЫТО]')
 .replace(/((?:api[_ -]?key|access[_ -]?token|session[_ -]?token|password|secret|пароль|(?:api|апи)[ -]?ключ)\s*["']?\s*[:=]\s*["']?)[^\s"',;}]+/gi,'$1[СКРЫТО]');}
