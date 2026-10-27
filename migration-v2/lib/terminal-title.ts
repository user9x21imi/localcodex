export function terminalTitle(status:any,frame=0){
 const active=status.phase==='working'||['inbound','outbound'].includes(status.channel);
 const spinner=['⠋','⠙','⠹','⠸','⠼','⠴','⠦','⠧','⠇','⠏'];
 const phase=active?`${spinner[frame%spinner.length]} Работает`:status.result==='failed'?'⚠ Ошибка':status.result==='cancelled'?'■ Остановлен':status.result==='succeeded'?'🔔 Завершил':'● Готов';
 const direction=status.channel==='outbound'?` → ${status.peer||'агент'}`:status.channel==='inbound'?` ← ${status.peer||'агент'}`:'';
 return `LocalCodex | ${phase} | ${status.mode||'Auto'}${direction}`;
}
