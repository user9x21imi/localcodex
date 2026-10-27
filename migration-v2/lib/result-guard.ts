export function verifiedReply(messages: any[], proposed: string): { text: string; reason?: string } {
  if (!/готов|выполн|успеш|создан|открыт|присутств|confirmed|\bdone\b|success/i.test(proposed)) return { text: proposed };
  let lastUser = -1;
  for (let i = 0; i < messages.length; i++) if (messages[i].info?.role === 'user') lastUser = i;
  const turn = messages.slice(Math.max(lastUser, 0));
  const tools = turn.flatMap((message: any) => message.parts ?? []).filter((part: any) => part.type === 'tool');
  let rejectedInput = -1, successfulInput = -1;
  const inputs = /^windows_(App|Click|Type|Shortcut|Move|Drag|Scroll)$/;
  tools.forEach((part: any, index: number) => {
    if (part.state?.status === 'error' && /USER_CONTROL|CONTROL_UNAVAILABLE/.test(part.state.error || '')) rejectedInput = index;
    if (part.state?.status === 'completed' && inputs.test(part.tool)) successfulInput = index;
  });
  if (rejectedInput > successfulInput) return {
    reason: 'desktop-control-blocked',
    text: 'Действие в интерфейсе не подтверждено: Windows MCP приостановил управление (USER_CONTROL/CONTROL_UNAVAILABLE). Часть шагов могла выполниться, но сообщать об успехе пока нельзя. Когда управление будет доступно, нужно повторно проверить окно и продолжить.',
  };
  const userText = turn.filter((m: any) => m.info?.role === 'user').flatMap((m: any) => m.parts ?? []).map((p: any) => p.text || '').join(' ');
  if (/проводник/i.test(userText)) {
    const typed = tools.filter((part: any) => part.tool === 'windows_Type' && part.state?.status === 'completed' && part.state.input?.press_enter && /^[a-z]:\\/i.test(part.state.input?.text || '')).at(-1);
    const snapshot = tools.filter((part: any) => part.tool === 'windows_Snapshot' && part.state?.status === 'completed').at(-1);
    if (typed && snapshot) {
      const expected = typed.state.input.text.replace(/\\+/g, '\\').replace(/\\$/, '').split('\\').at(-1);
      const focused = /Focused Window:([\s\S]*?)Opened Windows:/.exec(snapshot.state.output || '')?.[1] || '';
      if (expected && focused && !focused.toLowerCase().includes(expected.toLowerCase())) return {
        reason: 'folder-not-confirmed',
        text: `Ввод пути выполнен, но переход в папку «${expected}» не подтверждён состоянием Проводника. Необходимо повторно активировать адресную строку через Ctrl+L, ввести путь и проверить фактически открывшуюся папку.`,
      };
    }
  }
  return { text: proposed };
}

