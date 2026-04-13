// src/config/ai.js — Multi-provider AI abstraction
// Supported providers: anthropic, openai, mistral, openwebui (Ollama-compatible)
const db = require('./db');

async function getAIConfig() {
  const [rows] = await db.query(
    `SELECT setting_key, setting_value FROM system_settings
     WHERE setting_key IN (
       'ai_provider','anthropic_key','anthropic_model',
       'openai_key','openai_model',
       'mistral_key','mistral_model',
       'openwebui_url','openwebui_key','openwebui_model'
     )`
  );
  const cfg = {};
  rows.forEach(r => { cfg[r.setting_key] = r.setting_value; });
  return cfg;
}

// Resolve the active API key for a given provider
function resolveKey(cfg) {
  const provider = cfg.ai_provider || 'anthropic';
  switch (provider) {
    case 'anthropic':  return { provider, key: process.env.ANTHROPIC_API_KEY || cfg.anthropic_key || '' };
    case 'openai':     return { provider, key: process.env.OPENAI_API_KEY    || cfg.openai_key     || '' };
    case 'mistral':    return { provider, key: process.env.MISTRAL_API_KEY   || cfg.mistral_key    || '' };
    case 'openwebui':  return { provider, key: cfg.openwebui_key || '' };
    default:           return { provider: 'anthropic', key: process.env.ANTHROPIC_API_KEY || cfg.anthropic_key || '' };
  }
}

// ── Anthropic (Claude) ────────────────────────────────────────────────────────
async function callAnthropic(messages, maxTokens, cfg) {
  const key = process.env.ANTHROPIC_API_KEY || cfg.anthropic_key;
  if (!key) throw new Error('Clé API Anthropic non configurée');
  const model = cfg.anthropic_model || 'claude-sonnet-4-6';
  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': key,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({ model, max_tokens: maxTokens, messages }),
    signal: AbortSignal.timeout(30000),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(`Anthropic API ${res.status}: ${err.error?.message || res.statusText}`);
  }
  const data = await res.json();
  return data.content?.map(c => c.text || '').join('') || '';
}

// ── OpenAI (ChatGPT) and Mistral (same wire format) ──────────────────────────
async function callOpenAICompat(messages, maxTokens, apiKey, baseUrl, model) {
  if (!apiKey) throw new Error(`Clé API non configurée pour ${baseUrl}`);
  const res = await fetch(`${baseUrl}/chat/completions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model,
      max_tokens: maxTokens,
      messages: messages.map(m => ({ role: m.role, content: Array.isArray(m.content)
        // Flatten multimodal content to text for non-Anthropic providers
        ? m.content.map(c => c.type === 'text' ? c.text : '[image]').join('\n')
        : m.content
      })),
    }),
    signal: AbortSignal.timeout(30000),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(`API ${res.status}: ${err.error?.message || res.statusText}`);
  }
  const data = await res.json();
  return data.choices?.[0]?.message?.content || '';
}

// ── Self-hosted (OpenWebUI / Ollama) ─────────────────────────────────────────
// OpenWebUI exposes /api/chat/completions (OpenAI-compatible)
// Ollama exposes /v1/chat/completions when using the OpenAI compat endpoint
async function callOpenWebUI(messages, maxTokens, cfg) {
  const url = (cfg.openwebui_url || 'http://localhost:11434').replace(/\/$/, '');
  const key  = cfg.openwebui_key || '';
  const model = cfg.openwebui_model || 'llama3';
  // Try OpenAI-compatible endpoint first (OpenWebUI & Ollama /v1)
  const endpoint = url.includes('/v1') ? url : `${url}/v1`;
  return callOpenAICompat(messages, maxTokens, key || 'ollama', endpoint, model);
}

// ── Main dispatcher ───────────────────────────────────────────────────────────
async function callAI(messages, maxTokens = 1000) {
  const cfg = await getAIConfig();
  const { provider, key } = resolveKey(cfg);

  // If the configured provider has no key but ANTHROPIC_API_KEY env is set,
  // fall back silently to Anthropic rather than throwing a confusing error.
  if (!key && provider !== 'openwebui' && process.env.ANTHROPIC_API_KEY) {
    console.warn(`[ai] Provider "${provider}" has no key — falling back to Anthropic (env key)`);
    return callAnthropic(messages, maxTokens, cfg);
  }

  switch (provider) {
    case 'anthropic':
      return callAnthropic(messages, maxTokens, cfg);

    case 'openai': {
      const k     = process.env.OPENAI_API_KEY || cfg.openai_key;
      const model = cfg.openai_model || 'gpt-4o-mini';
      return callOpenAICompat(messages, maxTokens, k, 'https://api.openai.com/v1', model);
    }

    case 'mistral': {
      const k     = process.env.MISTRAL_API_KEY || cfg.mistral_key;
      const model = cfg.mistral_model || 'mistral-small-latest';
      return callOpenAICompat(messages, maxTokens, k, 'https://api.mistral.ai/v1', model);
    }

    case 'openwebui':
      return callOpenWebUI(messages, maxTokens, cfg);

    default:
      // Unknown provider → use Anthropic if available
      if (process.env.ANTHROPIC_API_KEY || cfg.anthropic_key) {
        return callAnthropic(messages, maxTokens, cfg);
      }
      throw new Error(`Fournisseur IA inconnu : ${provider}`);
  }
}

// ── Vision helper (image + text message) ─────────────────────────────────────
// Builds the correct message structure per provider
async function callAIVision(imageBase64, imageMediaType, textPrompt, maxTokens = 800) {
  const cfg = await getAIConfig();
  const { provider } = resolveKey(cfg);

  if (provider === 'anthropic') {
    return callAnthropic([{
      role: 'user',
      content: [
        { type: 'image', source: { type: 'base64', media_type: imageMediaType, data: imageBase64 } },
        { type: 'text', text: textPrompt },
      ],
    }], maxTokens, cfg);
  }

  if (provider === 'openai') {
    const key   = process.env.OPENAI_API_KEY || cfg.openai_key;
    const model = cfg.openai_model || 'gpt-4o-mini';
    // GPT-4o vision format
    const res = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${key}` },
      body: JSON.stringify({
        model,
        max_tokens: maxTokens,
        messages: [{
          role: 'user',
          content: [
            { type: 'image_url', image_url: { url: `data:${imageMediaType};base64,${imageBase64}` } },
            { type: 'text', text: textPrompt },
          ],
        }],
      }),
      signal: AbortSignal.timeout(30000),
    });
    if (!res.ok) { const e = await res.json().catch(() => ({})); throw new Error(`OpenAI ${res.status}: ${e.error?.message || res.statusText}`); }
    const data = await res.json();
    return data.choices?.[0]?.message?.content || '';
  }

  // Mistral / OpenWebUI: fallback to text-only (no vision support guaranteed)
  return callAI([{ role: 'user', content: textPrompt + '\n[Image analysis not supported by this provider — describe what you see]' }], maxTokens);
}

// ── Provider availability check ───────────────────────────────────────────────
async function checkAIAvailable() {
  const cfg = await getAIConfig();
  const { provider, key } = resolveKey(cfg);
  if (provider === 'openwebui') return { ok: true, provider };
  // If the configured provider has no key, try falling back to Anthropic env key
  if (!key) {
    if (process.env.ANTHROPIC_API_KEY) return { ok: true, provider: 'anthropic' };
    return { ok: false, provider, error: `Clé API ${provider} non configurée` };
  }
  return { ok: true, provider };
}

module.exports = { callAI, callAIVision, checkAIAvailable, getAIConfig };
