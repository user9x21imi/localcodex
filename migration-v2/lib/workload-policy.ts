export type Workload = {
  effort: 'low' | 'medium' | 'high'; output: number; budget: number;
  score: number; reasons: string[]; manual?: boolean; contextApproxTokens: number;
};

export function chooseWorkload(messages: any[], fallback = ''): Workload {
  let start = -1;
  for (let i = 0; i < messages.length; i++) if (messages[i].info?.role === 'user') start = i;
  const parts = start >= 0 ? messages[start].parts || [] : [];
  const text = parts.filter((p: any) => p.type === 'text' && !p.synthetic && !p.ignored && !/^\[Локальн/.test(p.text || '')).map((p: any) => p.text || '').join(' ') || fallback;
  const contextChars = messages.reduce((sum: number, m: any) => sum + (m.parts || []).reduce((n: number, p: any) => n + (p.text?.length || 0) + (p.state?.output?.length || 0), 0), 0);
  let score = 0;
  const reasons: string[] = [];
  const add = (points: number, reason: string) => { score += points; reasons.push(reason); };
  if (/диагност|исправ|почин|не работа|debug|repair|ошибк|причин/i.test(text)) add(2, 'diagnostics');
  if (/установ|постав[ьт]|настро|обнов|install|configur|deploy/i.test(text)) add(2, 'installation-or-configuration');
  if (/исслед|проанализ|анализ|сравн|research|compare|рефактор|алгоритм|архитектур/i.test(text)) add(2, 'analysis');
  if (/источник|провер[ьт].*достовер|официальн|докажи|гаранти|чексум|checksum|проверь.*результат/i.test(text)) add(1, 'verification');
  if (/подумай.*глуб|тщательн|разберись|максимум.*рассуж|режим.*макс/i.test(text)) add(2, 'deep-request');
  if (text.length > 2500) add(2, 'long-request'); else if (text.length > 900) add(1, 'detailed-request');
  const steps = (text.match(/затем|после этого|одновременно|во-первых|во-вторых|;|(?:^|\n)\s*(?:\d+[.)]|[-*])\s/gi) || []).length;
  if (steps >= 6) add(2, 'many-steps'); else if (steps >= 3) add(1, 'multiple-steps');
  if (contextChars > 60000) add(4, 'large-context'); else if (contextChars > 30000) add(2, 'growing-context');
  if (parts.some((p: any) => p.mime?.startsWith('image/') || /^\[Локальн/.test(p.text || ''))) add(1, 'image');
  const tools = messages.slice(Math.max(start, 0)).flatMap((m: any) => m.parts || []).filter((p: any) => p.type === 'tool');
  const recentErrors = tools.slice(-4).filter((p: any) => p.state?.status === 'error' && !/USER_CONTROL|CONTROL_UNAVAILABLE/.test(p.state.error || '')).length;
  if (recentErrors >= 2) add(4, 'repeated-tool-errors'); else if (recentErrors) add(2, 'tool-error-recovery');
  const plan = tools.filter((p: any) => p.tool === 'todowrite' && p.state?.status === 'completed').at(-1)?.state?.input?.todos;
  const pending = Array.isArray(plan) ? plan.filter((t: any) => t.status !== 'completed' && t.status !== 'cancelled').length : 0;
  if (pending >= 6) add(3, 'large-plan'); else if (pending >= 3) add(2, 'unfinished-plan');
  let effort: Workload['effort'] = score >= 4 ? 'high' : score >= 2 ? 'medium' : 'low';
  const forcedMax = /\[MODE:MAX\]/i.test(text), forcedFast = /\[MODE:FAST\]/i.test(text);
  if (forcedMax) effort = 'high'; else if (forcedFast) effort = 'low';
  return { effort, output: effort === 'high' ? 12288 : effort === 'medium' ? 6144 : 2048,
    budget: effort === 'high' ? 4096 : effort === 'medium' ? 1024 : 256,
    score, reasons, manual: forcedMax || forcedFast, contextApproxTokens: Math.ceil(contextChars / 3.5) };
}

