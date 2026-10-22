// Supabase Edge Function (Deno): 把已登录用户的 AI 请求转发给 DeepSeek，
// DeepSeek API Key 只保存在服务器端的 secret `DEEPSEEK_API_KEY` 中。
//
// 部署：supabase functions deploy ai-proxy
// 密钥：supabase secrets set DEEPSEEK_API_KEY=sk-xxxx
import { createClient } from 'npm:@supabase/supabase-js@2';

const DEEPSEEK_URL = 'https://api.deepseek.com/chat/completions';
const ALLOWED_MODELS = ['deepseek-chat', 'deepseek-reasoner'];
const MAX_TOKENS_CAP = 2000;
const MAX_BODY_BYTES = 64 * 1024;
const MAX_MESSAGES = 20;

const CORS_HEADERS: Record<string, string> = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Max-Age': '86400',
};

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
  });
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

Deno.serve(async (req: Request): Promise<Response> => {
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: CORS_HEADERS });
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405);

  // 1) 必须是有效的用户 JWT
  const authHeader = req.headers.get('Authorization');
  if (!authHeader) return json({ error: 'Missing Authorization header' }, 401);

  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY');
  const deepseekKey = Deno.env.get('DEEPSEEK_API_KEY');
  if (!supabaseUrl || !anonKey) return json({ error: 'Supabase environment is not configured' }, 500);
  if (!deepseekKey) return json({ error: 'DEEPSEEK_API_KEY secret is not set' }, 500);

  const supabase = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: authHeader } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data: userData, error: userError } = await supabase.auth.getUser();
  if (userError || !userData.user) return json({ error: 'Invalid or expired session' }, 401);

  // 2) 校验并重新组装请求体（只放行白名单字段）
  const raw = await req.text();
  if (raw.length > MAX_BODY_BYTES) return json({ error: 'Request body too large' }, 413);
  let input: unknown;
  try {
    input = JSON.parse(raw);
  } catch {
    return json({ error: 'Body must be JSON' }, 400);
  }
  if (!isRecord(input)) return json({ error: 'Body must be a JSON object' }, 400);

  const model = typeof input.model === 'string' ? input.model : 'deepseek-chat';
  if (!ALLOWED_MODELS.includes(model)) return json({ error: `Model not allowed: ${model}` }, 400);

  const messages = input.messages;
  if (!Array.isArray(messages) || messages.length === 0 || messages.length > MAX_MESSAGES) {
    return json({ error: 'messages must be a non-empty array' }, 400);
  }
  for (const m of messages) {
    if (!isRecord(m) || typeof m.content !== 'string' || !['system', 'user', 'assistant'].includes(String(m.role))) {
      return json({ error: 'Invalid message' }, 400);
    }
  }

  const requestedMax = typeof input.max_tokens === 'number' && input.max_tokens > 0 ? input.max_tokens : MAX_TOKENS_CAP;
  const payload: Record<string, unknown> = {
    model,
    messages: messages.map((m) => ({ role: (m as Record<string, unknown>).role, content: (m as Record<string, unknown>).content })),
    max_tokens: Math.min(Math.floor(requestedMax), MAX_TOKENS_CAP),
    stream: false,
  };
  if (typeof input.temperature === 'number') payload.temperature = Math.min(Math.max(input.temperature, 0), 1.5);
  if (isRecord(input.response_format) && input.response_format.type === 'json_object') {
    payload.response_format = { type: 'json_object' };
  }

  // 3) 转发给 DeepSeek，原样返回其状态码和 JSON
  let upstream: Response;
  try {
    upstream = await fetch(DEEPSEEK_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${deepseekKey}` },
      body: JSON.stringify(payload),
    });
  } catch (e) {
    return json({ error: `Upstream unreachable: ${e instanceof Error ? e.message : String(e)}` }, 502);
  }
  const text = await upstream.text();
  return new Response(text, {
    status: upstream.status,
    headers: { ...CORS_HEADERS, 'Content-Type': upstream.headers.get('Content-Type') ?? 'application/json' },
  });
});
