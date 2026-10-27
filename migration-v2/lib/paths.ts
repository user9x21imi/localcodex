export const root = (process.env.LOCALCODEX_ROOT || process.cwd()).split(String.fromCharCode(92)).join('/');
export const pwsh = process.env.LOCALCODEX_PWSH || 'C:/Program Files/PowerShell/7/pwsh.exe';
