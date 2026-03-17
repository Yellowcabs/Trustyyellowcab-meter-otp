import { GoogleGenAI, Modality } from "@google/genai";

const apiKey = process.env.GEMINI_API_KEY;

export class GeminiService {
  private static ai: GoogleGenAI | null = null;

  private static getAI() {
    if (!this.ai && apiKey) {
      this.ai = new GoogleGenAI({ apiKey });
    }
    return this.ai;
  }

  static async textToSpeech(text: string, language: 'en' | 'ta' = 'en'): Promise<string | null> {
    const ai = this.getAI();
    if (!ai) return null;

    try {
      const prompt = language === 'ta' 
        ? `Translate to Tamil and say: ${text}`
        : text;

      const response = await ai.models.generateContent({
        model: "gemini-2.5-flash-preview-tts",
        contents: [{ parts: [{ text: prompt }] }],
        config: {
          responseModalities: [Modality.AUDIO],
          speechConfig: {
            voiceConfig: {
              prebuiltVoiceConfig: { voiceName: 'Kore' },
            },
          },
        },
      });

      const base64Audio = response.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data;
      return base64Audio || null;
    } catch (error) {
      console.error("TTS Error:", error);
      return null;
    }
  }
}
