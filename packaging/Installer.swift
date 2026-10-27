import Cocoa

final class Installer: NSObject, NSApplicationDelegate {
 let window = NSWindow(contentRect: NSRect(x:0,y:0,width:680,height:540), styleMask:[.titled,.closable,.miniaturizable], backing:.buffered, defer:false)
 let folder = NSTextField(string: NSHomeDirectory()+"/LLM")
 let channel = NSButton(checkboxWithTitle:"Связь с другими агентами (использует их лимиты)", target:nil, action:nil)
 let yolo = NSButton(checkboxWithTitle:"YOLO — автоматически разрешать инструменты", target:nil, action:nil)
 let mode = NSPopUpButton()
 let log = NSTextView()
 let progress = NSProgressIndicator()
 let install = NSButton(title:"Установить", target:nil, action:nil)
 var process: Process?
 func applicationDidFinishLaunching(_ notification: Notification) {
  window.title="Установка LocalCodex · OpenCode 2"; window.center()
  let view=window.contentView!
  func add(_ item:NSView,_ x:CGFloat,_ y:CGFloat,_ w:CGFloat,_ h:CGFloat){item.frame=NSRect(x:x,y:y,width:w,height:h);view.addSubview(item)}
  add(NSTextField(labelWithString:"Apple Silicon · MLX / Metal · требуется 25 ГБ свободного места"),20,495,640,24)
  add(folder,20,453,525,26)
  let browse=NSButton(title:"Папка…",target:self,action:#selector(choose));add(browse,550,451,110,30)
  mode.addItems(withTitles:["Auto","Fast","MaxPower"]);add(mode,20,410,180,28)
  add(channel,20,373,640,25);add(yolo,20,340,640,25)
  let scroll=NSScrollView(frame:NSRect(x:20,y:80,width:640,height:245));scroll.hasVerticalScroller=true;scroll.documentView=log;log.isEditable=false;log.isVerticallyResizable=true;log.autoresizingMask=[.width];log.font=NSFont.monospacedSystemFont(ofSize:11,weight:.regular);view.addSubview(scroll)
  progress.isIndeterminate=true;progress.style = .bar;add(progress,20,52,640,14)
  install.target=self;install.action=#selector(run);add(install,520,10,140,32)
  window.makeKeyAndOrderFront(nil);NSApp.activate(ignoringOtherApps:true)
 }
 @objc func choose(){let panel=NSOpenPanel();panel.canChooseDirectories=true;panel.canChooseFiles=false;panel.canCreateDirectories=true;if panel.runModal() == .OK,let url=panel.url{folder.stringValue=url.appendingPathComponent("LLM").path}}
 func append(_ text:String){log.textStorage?.append(NSAttributedString(string:text));log.scrollToEndOfDocument(nil)}
 @objc func run(){
  guard process == nil else{return}
  guard let payload=Bundle.main.resourceURL?.appendingPathComponent("payload") else{return}
  let p=Process();p.executableURL=URL(fileURLWithPath:"/bin/bash");p.arguments=[payload.appendingPathComponent("macos/install.sh").path,folder.stringValue]
  var env=ProcessInfo.processInfo.environment;env["LOCALCODEX_NONINTERACTIVE"]="1";env["LOCALCODEX_AGENT_CHANNEL"]=channel.state == .on ? "true":"false";env["LOCALCODEX_YOLO"]=yolo.state == .on ? "true":"false";env["LOCALCODEX_MODE"]=mode.titleOfSelectedItem ?? "Auto";p.environment=env
  let pipe=Pipe();p.standardOutput=pipe;p.standardError=pipe
  pipe.fileHandleForReading.readabilityHandler={ [weak self] handle in let data=handle.availableData;if data.isEmpty{return};let text=String(decoding:data,as:UTF8.self);DispatchQueue.main.async{self?.append(text)}}
  p.terminationHandler={ [weak self] task in DispatchQueue.main.async{guard let s=self else{return};pipe.fileHandleForReading.readabilityHandler=nil;s.progress.stopAnimation(nil);s.install.isEnabled=true;s.process=nil;s.append(task.terminationStatus == 0 ? "\nГотово. Откройте Start-LocalCodex.command в выбранной папке.\n":"\nОшибка установки. Журнал выше; файлы сохранены для повторной попытки.\n")}}
  do{try p.run();process=p;install.isEnabled=false;progress.startAnimation(nil)}catch{append("\(error)\n")}
 }
 func applicationShouldTerminate(_ sender:NSApplication)->NSApplication.TerminateReply {if process?.isRunning == true{let a=NSAlert();a.messageText="Установка ещё выполняется";a.informativeText="Дождитесь завершения. Загрузка больших моделей может занять время.";a.runModal();return .terminateCancel};return .terminateNow}
 func applicationShouldTerminateAfterLastWindowClosed(_ sender:NSApplication)->Bool{return true}
}
if CommandLine.arguments.contains("--self-test"){print("PASS: native AppKit installer executable");exit(0)}
let app=NSApplication.shared;let delegate=Installer();app.delegate=delegate;app.setActivationPolicy(.regular);app.run()
