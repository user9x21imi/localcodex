param([string]$Root=$PSScriptRoot,[switch]$SelfTest)
$ErrorActionPreference='Stop'
$Root=[IO.Path]::GetFullPath($Root).TrimEnd('\')
New-Item "$Root\state-v2" -ItemType Directory -Force|Out-Null
$name='Local\LocalCodexStop-'+[Convert]::ToHexString([Security.Cryptography.SHA256]::HashData([Text.Encoding]::UTF8.GetBytes($Root))).Substring(0,12)
$mutex=[Threading.Mutex]::new($false,$name)
if(!$mutex.WaitOne(0)){exit 0}
Add-Type @'
using System;using System.Runtime.InteropServices;
public static class LocalCodexHotkey {
 [StructLayout(LayoutKind.Sequential)] public struct MSG {public IntPtr hwnd;public uint message;public UIntPtr wParam;public IntPtr lParam;public uint time;public int x;public int y;public uint extra;}
 [DllImport("user32.dll",SetLastError=true)]static extern bool RegisterHotKey(IntPtr h,int id,uint mods,uint key);
 [DllImport("user32.dll")]static extern bool UnregisterHotKey(IntPtr h,int id);
 [DllImport("user32.dll")]static extern int GetMessage(out MSG m,IntPtr h,uint a,uint b);
 [DllImport("user32.dll")]static extern bool PeekMessage(out MSG m,IntPtr h,uint a,uint b,uint remove);
 [DllImport("user32.dll",SetLastError=true)]static extern bool PostThreadMessage(uint t,uint m,UIntPtr w,IntPtr l);
 [DllImport("user32.dll")]static extern UIntPtr SetTimer(IntPtr h,UIntPtr id,uint ms,IntPtr callback);
 [DllImport("user32.dll")]static extern bool KillTimer(IntPtr h,UIntPtr id);
 [DllImport("kernel32.dll")]static extern uint GetCurrentThreadId();
 static uint thread;
 static UIntPtr timer;
 public static bool Register(){MSG m;PeekMessage(out m,IntPtr.Zero,0,0,0);thread=GetCurrentThreadId();if(!RegisterHotKey(IntPtr.Zero,5271,0x4003,0x7B))return false;timer=SetTimer(IntPtr.Zero,(UIntPtr)5272,200,IntPtr.Zero);return timer!=UIntPtr.Zero;}
 public static bool Trigger(){return PostThreadMessage(thread,0x312,(UIntPtr)5271,IntPtr.Zero);}
 public static int Wait(){MSG m;while(GetMessage(out m,IntPtr.Zero,0,0)>0){if(m.message==0x312&&m.wParam.ToUInt64()==5271)return 1;if(m.message==0x113)return 2;}return 0;}
 public static void Close(){KillTimer(IntPtr.Zero,timer);UnregisterHotKey(IntPtr.Zero,5271);}
}
'@
try{
 if(![LocalCodexHotkey]::Register()){throw 'Не удалось зарегистрировать Ctrl+Alt+F12. Агент не должен запускаться без аварийной клавиши.'}
 @{pid=$PID;registered=$true;hotkey='Ctrl+Alt+F12';time=(Get-Date).ToString('o')}|ConvertTo-Json|Set-Content "$Root\state-v2\stop-hotkey.json" -Encoding utf8
 if($SelfTest){if(![LocalCodexHotkey]::Trigger()){throw 'Hotkey test dispatch failed'}}
 $handled=''
 try{$handled=(Get-Content "$Root\state-v2\stop-request-handled.json" -Raw|ConvertFrom-Json).nonce}catch{}
 while($event=[LocalCodexHotkey]::Wait()){
  if($event -eq 1){& "$PSScriptRoot\Stop-Agent.ps1" -Root $Root -Reason 'Аварийная остановка Ctrl+Alt+F12';if($SelfTest){break}}
  else{
   try{$request=Get-Content "$Root\config-v2\stop-request.json" -Raw -ErrorAction Stop|ConvertFrom-Json;if($request.nonce -and $request.nonce -ne $handled){$handled=$request.nonce;& "$PSScriptRoot\Stop-Agent.ps1" -Root $Root -Reason $request.reason;@{nonce=$handled;time=(Get-Date).ToString('o')}|ConvertTo-Json|Set-Content "$Root\state-v2\stop-request-handled.json" -Encoding utf8}}catch{}
  }
 }
}finally{[LocalCodexHotkey]::Close();$mutex.ReleaseMutex();$mutex.Dispose()}
