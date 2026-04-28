import { supabase } from '../lib/supabase';
import type {
  AIProviderConfig, AIPrediction, AISignalRequest, AISignalResponse, AIProviderFormData
} from '../types/aiProvider';

export async function fetchAIProviders(userId: string): Promise<AIProviderConfig[]> {
  const { data, error } = await supabase
    .from('ai_provider_configs')
    .select('*')
    .eq('user_id', userId)
    .order('created_at', { ascending: false });
  if (error) throw error;
  return (data ?? []) as AIProviderConfig[];
}

export async function createAIProvider(
  userId: string,
  form: AIProviderFormData
): Promise<AIProviderConfig> {
  const { api_key, ...rest } = form;
  const masked = api_key.length > 8
    ? api_key.slice(0, 4) + '••••' + api_key.slice(-4)
    : '••••••••';

  const { data, error } = await supabase
    .from('ai_provider_configs')
    .insert({
      user_id: userId,
      ...rest,
      api_key_masked: masked,
      is_active: true,
    })
    .select()
    .single();
  if (error) throw error;

  const { error: keyError } = await supabase
    .from('ai_provider_api_keys')
    .insert({ provider_id: data.id, user_id: userId, api_key });
  if (keyError) throw keyError;

  return data as AIProviderConfig;
}

export async function updateAIProvider(
  id: string,
  updates: Partial<Omit<AIProviderConfig, 'id' | 'user_id' | 'created_at'>>
): Promise<void> {
  const { error } = await supabase
    .from('ai_provider_configs')
    .update({ ...updates, updated_at: new Date().toISOString() })
    .eq('id', id);
  if (error) throw error;
}

export async function deleteAIProvider(id: string): Promise<void> {
  const { error } = await supabase
    .from('ai_provider_configs')
    .delete()
    .eq('id', id);
  if (error) throw error;
}

export async function fetchAIPredictions(
  userId: string,
  limit = 50
): Promise<AIPrediction[]> {
  const { data, error } = await supabase
    .from('ai_predictions')
    .select('*')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .limit(limit);
  if (error) throw error;
  return (data ?? []) as AIPrediction[];
}

export async function savePrediction(
  userId: string,
  prediction: Omit<AIPrediction, 'id' | 'created_at'>
): Promise<AIPrediction> {
  const { data, error } = await supabase
    .from('ai_predictions')
    .insert({ ...prediction, user_id: userId })
    .select()
    .single();
  if (error) throw error;
  return data as AIPrediction;
}

export async function callAISignal(
  providerId: string,
  request: AISignalRequest
): Promise<AISignalResponse> {
  const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
  const supabaseKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

  const response = await fetch(
    `${supabaseUrl}/functions/v1/ai-signal-proxy`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${supabaseKey}`,
      },
      body: JSON.stringify({ provider_id: providerId, request }),
    }
  );

  if (!response.ok) {
    const err = await response.text();
    throw new Error(`AI signal request failed: ${err}`);
  }

  return response.json() as Promise<AISignalResponse>;
}

export async function testAIConnection(
  providerId: string
): Promise<{ ok: boolean; latency_ms: number; message: string }> {
  const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
  const supabaseKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

  const t0 = Date.now();
  const response = await fetch(
    `${supabaseUrl}/functions/v1/ai-signal-proxy`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${supabaseKey}`,
      },
      body: JSON.stringify({ provider_id: providerId, test: true }),
    }
  );
  const latency_ms = Date.now() - t0;

  if (!response.ok) {
    return { ok: false, latency_ms, message: await response.text() };
  }
  return { ok: true, latency_ms, message: 'Connection successful' };
}
