import { spawn } from 'node:child_process';
import { pwsh } from './lib/paths.ts';
export async function runPowerShell(args: {script:string,cwd?:string,timeout_ms?:number}, context: {directory:string}) {
    const userScript = Buffer.from(args.script, 'utf8').toString('base64');
    const script = `[Console]::OutputEncoding = [Text.UTF8Encoding]::new($false)\n$OutputEncoding = [Text.UTF8Encoding]::new($false)\n$ErrorActionPreference = 'Stop'\n$PSNativeCommandUseErrorActionPreference = $true\n$global:LASTEXITCODE = 0\ntry {\n$taskScript = [scriptblock]::Create([Text.Encoding]::UTF8.GetString([Convert]::FromBase64String('${userScript}')))\n& $taskScript\nif ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }\n} catch {\n[Console]::Error.WriteLine($_.Exception.Message)\nexit 1\n}`;
    const encoded = Buffer.from(script, 'utf16le').toString('base64');
    const result = await new Promise<{exitCode: number; stdout: string; stderr: string}>((resolve, reject) => {
      const proc = spawn(pwsh, ['-NoLogo', '-NoProfile', '-NonInteractive', '-EncodedCommand', encoded], {
        cwd: args.cwd || context.directory,
        windowsHide: true,
        env: { ...process.env, PYTHONUTF8: '1', PYTHONIOENCODING: 'utf-8' },
        stdio: ['ignore', 'pipe', 'pipe'],
      });
      const out: Buffer[] = [], err: Buffer[] = [];
      const timer = setTimeout(() => proc.kill(), Math.min(args.timeout_ms || 120000, 1200000));
      proc.stdout.on('data', data => out.push(Buffer.from(data)));
      proc.stderr.on('data', data => err.push(Buffer.from(data)));
      proc.on('error', error => { clearTimeout(timer); reject(error); });
      proc.on('close', code => { clearTimeout(timer); resolve({ exitCode: code ?? -1, stdout: Buffer.concat(out).toString('utf8'), stderr: Buffer.concat(err).toString('utf8') }); });
    });
    const output = JSON.stringify(result);
    if (result.exitCode !== 0) throw new Error(output);
    return { title: 'PowerShell', output, metadata: { exit: result.exitCode } };

}

