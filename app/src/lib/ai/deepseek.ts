import type { FunctionsHttpError } from '@supabase/supabase-js';
import { getSettings } from '../settings';
import { getSupabase, supabaseConfigured } from '../sync/client';
import { isRecord, ValidationError } from './validate';

export type AiErrorCode =
  | 'no-key'
  | 'network'
  | 'cors'
  | 'auth'
  | 'rate'
  | 'bad-response'
  | 'proxy-unavailable';

/** `message` is always user-facing Simplified Chinese. */
export class AiError extends Error {
  code: AiErrorCode;
  constructor(code: AiErrorCode, message: string) {
    super(message);
    this.name = 'AiError';
    this.code = code;
  }
}

export interface ChatMessage {
  role: 'system' | 'user';
  content: string;
}

export interface ChatOptions {
  temperature?: number;
  maxTokens?: number;
}

const ENDPOINT = 'https://api.deepseek.com/chat/completions';
const TIMEOUT_MS = 60_000;
const DEFAULT_MAX_TOKENS = 1800; // the ai-proxy caps at 4096 (8192 for the reasoner)
/** The reasoning chain counts toward max_tokens, so the reasoner needs a much larger budget. */
export const REASONER_MAX_TOKENS = 8000;

export function isReasoner(model: string): boolean {
  return model === 'deepseek-reasoner';
}

function buildBody(model: string, messages: ChatMessage[], opts: ChatOptions) {
  const reasoner = isReasoner(model);
  return {
    model,
    messages,
    // deepseek-reasoner ignores temperature, so don't send it
    ...(reasoner ? {} : { temperature: opts.temperature ?? 0.3 }),
    max_tokens: reasoner ? REASONER_MAX_TOKENS : (opts.maxTokens ?? DEFAULT_MAX_TOKENS),
    response_format: { type: 'json_object' as const },
    stream: false,
  };
}

function httpError(status: number): AiError {
  if (status === 401 || status === 403) {
    return new AiError('auth', 'DeepSeek API Key 无效或没有权限，请在设置中检查。');
  }
  if (status === 402) return new AiError('auth', 'DeepSeek 余额不足，请前往 DeepSeek 开放平台充值。');
  if (status === 429) return new AiError('rate', '请求太频繁了，请稍等几秒再试。');
  if (status === 400 || status === 422) {
    return new AiError('bad-response', `DeepSeek 无法处理这次请求（HTTP ${status}），请稍后重试。`);
  }
  return new AiError('network', `DeepSeek 服务暂时不可用（HTTP ${status}），请稍后重试。`);
}

function fetchFailure(): AiError {
  const online = typeof navigator === 'undefined' ? true : navigator.onLine;
  if (online) {
    return new AiError(
      'cors',
      '无法连接 DeepSeek（可能是浏览器跨域限制或网络问题）。可在设置中切换为「服务器代理」模式。',
    );
  }
  return new AiError('network', '当前没有网络连接，AI 功能暂不可用。');
}

export interface Completion {
  /** choices[0].message.content only (never reasoning_content). */
  content: string;
  /** finish_reason === 'length': the output hit max_tokens and is cut off. */
  truncated: boolean;
}

/** Extract choices[0].message.content and finish_reason from a chat-completions payload. */
function extractCompletion(payload: unknown): Completion {
  if (isRecord(payload) && Array.isArray(payload.choices)) {
    const first: unknown = payload.choices[0];
    if (isRecord(first) && isRecord(first.message) && typeof first.message.content === 'string') {
      return { content: first.message.content, truncated: first.finish_reason === 'length' };
    }
  }
  throw new AiError('bad-response', 'AI 返回的内容格式不对，请重试。');
}

async function requestDirect(body: ReturnType<typeof buildBody>, key: string): Promise<unknown> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  let res: Response;
  try {
    res = await fetch(ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${key}` },
      body: JSON.stringify(body),
      signal: ctrl.signal,
    });
  } catch (e) {
    if (e instanceof DOMException && e.name === 'AbortError') {
      throw new AiError('network', 'DeepSeek 响应超时，请稍后重试。');
    }
    throw fetchFailure();
  } finally {
    clearTimeout(timer);
  }
  if (!res.ok) throw httpError(res.status);
  try {
    return await res.json();
  } catch {
    throw new AiError('bad-response', 'AI 返回的内容格式不对，请重试。');
  }
}

async function requestProxy(body: ReturnType<typeof buildBody>): Promise<unknown> {
  const supabase = supabaseConfigured() ? getSupabase() : null;
  if (!supabase) {
    throw new AiError('proxy-unavailable', '服务器代理需要先在设置中配置 Supabase 并登录。');
  }
  let signedIn = false;
  try {
    const { data } = await supabase.auth.getSession();
    signedIn = !!data.session;
  } catch {
    signedIn = false;
  }
  if (!signedIn) {
    throw new AiError('proxy-unavailable', '服务器代理需要先登录同步账号。');
  }
  const { data, error } = await supabase.functions.invoke('ai-proxy', { body });
  if (error) {
    const ctx = (error as Partial<FunctionsHttpError>).context;
    if (ctx instanceof Response) throw httpError(ctx.status);
    if (error.name === 'FunctionsRelayError') {
      throw new AiError('proxy-unavailable', 'ai-proxy 函数不可用，请确认已部署（见 docs/SETUP.md）。');
    }
    throw fetchFailure();
  }
  if (typeof data === 'string') {
    try {
      return JSON.parse(data);
    } catch {
      throw new AiError('bad-response', 'AI 返回的内容格式不对，请重试。');
    }
  }
  return data;
}

/** Sends one chat request and returns the raw assistant message content (a JSON string) plus truncation info. */
export async function requestCompletion(messages: ChatMessage[], opts: ChatOptions = {}): Promise<Completion> {
  const s = getSettings();
  const body = buildBody(s.deepseekModel || 'deepseek-chat', messages, opts);
  let payload: unknown;
  if (s.aiMode === 'proxy') {
    payload = await requestProxy(body);
  } else {
    if (!s.deepseekApiKey.trim()) {
      throw new AiError('no-key', '还没有设置 DeepSeek API Key，请先到「设置」中填写。');
    }
    payload = await requestDirect(body, s.deepseekApiKey.trim());
  }
  return extractCompletion(payload);
}

/** Parse model output as JSON, tolerating a ```json fence. */
export function parseJsonContent(content: string): unknown {
  let text = content.trim();
  const fenced = /^```(?:json)?\s*([\s\S]*?)\s*```$/i.exec(text);
  if (fenced) text = fenced[1];
  return JSON.parse(text);
}

/**
 * Chat request that must produce JSON accepted by `validate`.
 * Invalid JSON / failed validation is retried once, then reported as 'bad-response'.
 */
export async function chatJson<T>(
  messages: ChatMessage[],
  validate: (u: unknown) => T,
  opts: ChatOptions = {},
): Promise<T> {
  let lastReason = '';
  let lastTruncated = false;
  for (let attempt = 0; attempt < 2; attempt++) {
    const { content, truncated } = await requestCompletion(messages, opts);
    lastTruncated = truncated;
    if (truncated) {
      lastReason = '输出被截断';
      continue;
    }
    try {
      return validate(parseJsonContent(content));
    } catch (e) {
      if (e instanceof AiError) throw e;
      lastReason = e instanceof ValidationError ? e.message : 'JSON 解析失败';
    }
  }
  if (lastTruncated) throw new AiError('bad-response', 'AI 输出被截断，请重试或缩短句子。');
  throw new AiError('bad-response', `AI 返回的结果不符合要求（${lastReason}），请重试。`);
}
