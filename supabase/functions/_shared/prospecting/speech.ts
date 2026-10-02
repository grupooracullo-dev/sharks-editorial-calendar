/* ─── SpeechProvider do Prospecting Engine (responder em áudio) ───
   - ElevenLabsProvider: TTS real (ELEVENLABS_API_KEY)
   - MockSpeechProvider: sem rede, retorna null (modo texto)
   Voz configurável por ambiente (prospecting_agent_settings.personality.voice). */

export interface SpeechResult {
  /** base64 do mp3 */
  audioBase64: string;
  mimeType: string;
}

export interface SpeechProvider {
  readonly name: string;
  synthesize(text: string, voiceId?: string): Promise<SpeechResult | null>;
}

const ELEVEN_URL = 'https://api.elevenlabs.io/v1/text-to-speech';
/** Voz pt-BR feminina padrão (substituível por voice_id do settings) */
export const ELEVEN_DEFAULT_VOICE = '9BWtsMINqrJLrRacOk9x'; // Aria

export class ElevenLabsProvider implements SpeechProvider {
  readonly name = 'elevenlabs';
  private apiKey: string;

  constructor(apiKey: string) {
    this.apiKey = apiKey;
  }

  async synthesize(text: string, voiceId?: string): Promise<SpeechResult | null> {
    const clean = text.slice(0, 900); // limite prático por mensagem
    if (!clean.trim()) return null;

    const res = await fetch(`${ELEVEN_URL}/${voiceId || ELEVEN_DEFAULT_VOICE}`, {
      method: 'POST',
      headers: {
        'xi-api-key': this.apiKey,
        'Content-Type': 'application/json',
        'Accept': 'audio/mpeg',
      },
      body: JSON.stringify({
        text: clean,
        model_id: 'eleven_multilingual_v2',
        voice_settings: { stability: 0.5, similarity_boost: 0.75 },
      }),
    });
    if (!res.ok) {
      console.error('[speech] ElevenLabs falhou:', res.status, (await res.text()).slice(0, 200));
      return null;
    }
    const buf = new Uint8Array(await res.arrayBuffer());
    let binary = '';
    for (let i = 0; i < buf.length; i++) binary += String.fromCharCode(buf[i]);
    return { audioBase64: btoa(binary), mimeType: 'audio/mpeg' };
  }
}

export class MockSpeechProvider implements SpeechProvider {
  readonly name = 'mock';

  async synthesize(): Promise<SpeechResult | null> {
    return null; // sem key → modo texto
  }
}

function env(k: string): string | undefined {
  const d = (globalThis as { Deno?: { env: { get(k: string): string | undefined } } }).Deno;
  return d?.env.get(k);
}

export function getSpeechProvider(): SpeechProvider {
  const key = env('ELEVENLABS_API_KEY');
  if (key) return new ElevenLabsProvider(key);
  return new MockSpeechProvider();
}

export function hasRealSpeech(): boolean {
  return !!env('ELEVENLABS_API_KEY');
}
