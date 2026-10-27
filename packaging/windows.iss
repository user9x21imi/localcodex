[Setup]
AppId=LocalCodex.Windows
AppName=LocalCodex
AppVersion=0.2.0
DefaultDirName={sd}\LLM
DisableProgramGroupPage=yes
PrivilegesRequired=lowest
OutputDir=..\dist
OutputBaseFilename=LocalCodex-Windows-Setup-v0.2.0
Compression=lzma2
SolidCompression=yes
WizardStyle=modern
Uninstallable=no
SetupLogging=yes
ArchitecturesAllowed=x64compatible
InfoBeforeFile=installer-info.txt
[Files]
Source: "..\*"; DestDir: "{tmp}\LocalCodex-source"; Flags: recursesubdirs createallsubdirs deleteafterinstall; Excludes: "node_modules\*,.git\*,dist\*,packaging\*,*.zip,*.exe,*.gguf,*.log"
[Tasks]
Name: channel; Description: "Enable communication with installed AI agents (uses their limits)"; Flags: unchecked
Name: yolo; Description: "YOLO: allow agent tools automatically"; Flags: unchecked
Name: voice; Description: "Install voice input"; Flags: unchecked
[Icons]
Name: "{userdesktop}\LocalCodex"; Filename: "{app}\localcodex.cmd"; WorkingDir: "{app}"
Name: "{userprograms}\LocalCodex"; Filename: "{app}\localcodex.cmd"; WorkingDir: "{app}"
[Code]
var ModePage: TInputOptionWizardPage;
procedure InitializeWizard;
begin
 ModePage := CreateInputOptionPage(wpSelectDir, 'Performance mode', 'Hardware is detected during installation', 'Auto adapts effort; Fast limits context; MaxPower requests maximum reasoning.', True, False);
 ModePage.Add('Auto (recommended)'); ModePage.Add('Fast'); ModePage.Add('MaxPower'); ModePage.SelectedValueIndex := 0;
end;
procedure CurStepChanged(CurStep: TSetupStep);
var Args, Mode: String; Code: Integer;
begin
 if CurStep = ssPostInstall then begin
  Mode := 'Auto'; if ModePage.SelectedValueIndex = 1 then Mode := 'Fast'; if ModePage.SelectedValueIndex = 2 then Mode := 'MaxPower';
  Args := '-NoLogo -NoProfile -ExecutionPolicy Bypass -File "' + ExpandConstant('{tmp}\LocalCodex-source\Bootstrap.ps1') + '" -NonInteractive -Root "' + ExpandConstant('{app}') + '" -Mode ' + Mode;
  if WizardIsTaskSelected('channel') then Args := Args + ' -AgentChannel';
  if WizardIsTaskSelected('yolo') then Args := Args + ' -Yolo';
  if WizardIsTaskSelected('voice') then Args := Args + ' -Voice';
  WizardForm.StatusLabel.Caption := 'Downloading and verifying components. Follow progress in the installation console.';
  if not Exec(ExpandConstant('{sys}\WindowsPowerShell\v1.0\powershell.exe'), Args, '', SW_SHOW, ewWaitUntilTerminated, Code) then RaiseException('Cannot start PowerShell installer.');
  if Code <> 0 then RaiseException('Installation failed, exit code ' + IntToStr(Code) + '. Downloaded files are retained for retry.');
 end;
end;
