import { GeminiService } from './geminiService';

export class SoundService {
  private static audioCtx: AudioContext | null = null;

  private static init() {
    if (!this.audioCtx) {
      this.audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)();
    }
  }

  static beep(frequency = 880, duration = 100, volume = 0.1) {
    this.init();
    if (!this.audioCtx) return;

    const oscillator = this.audioCtx.createOscillator();
    const gainNode = this.audioCtx.createGain();

    oscillator.connect(gainNode);
    gainNode.connect(this.audioCtx.destination);

    oscillator.type = 'square';
    oscillator.frequency.setValueAtTime(frequency, this.audioCtx.currentTime);
    
    gainNode.gain.setValueAtTime(volume, this.audioCtx.currentTime);
    gainNode.gain.exponentialRampToValueAtTime(0.01, this.audioCtx.currentTime + duration / 1000);

    oscillator.start();
    oscillator.stop(this.audioCtx.currentTime + duration / 1000);
  }

  static async playAudio(base64Data: string) {
    this.init();
    if (!this.audioCtx) return;

    try {
      const binaryString = window.atob(base64Data);
      const bytes = new Uint8Array(binaryString.length);
      for (let i = 0; i < binaryString.length; i++) {
        bytes[i] = binaryString.charCodeAt(i);
      }

      const audioBuffer = await this.audioCtx.decodeAudioData(bytes.buffer);
      const source = this.audioCtx.createBufferSource();
      source.buffer = audioBuffer;
      source.connect(this.audioCtx.destination);
      source.start();
    } catch (error) {
      console.error("Error playing audio:", error);
    }
  }

  static async speak(text: string, language: 'en' | 'ta' = 'ta') {
    const audioData = await GeminiService.textToSpeech(text, language);
    if (audioData) {
      await this.playAudio(audioData);
    }
  }

  static playStart() {
    this.beep(880, 100);
    setTimeout(() => this.beep(1760, 150), 100);
    this.speak("Trip started. Have a safe journey.", 'ta');
  }

  static async playFile(url: string) {
    return new Promise((resolve, reject) => {
      const audio = new Audio(url);
      audio.onended = resolve;
      audio.onerror = reject;
      audio.play().catch(reject);
    });
  }

  static async playStop(fare?: number) {
    this.beep(1760, 100);
    setTimeout(() => this.beep(880, 150), 100);
    
    // Try to play the local mp3 file first
    try {
      await this.playFile('/stop.mp3');
    } catch (e) {
      console.log("Local stop.mp3 not found or failed to play, falling back to TTS");
      const text = fare !== undefined 
        ? `Trip completed. Total fare is ${fare.toFixed(0)} rupees.` 
        : "Trip completed.";
      this.speak(text, 'ta');
    }
  }

  static playTick() {
    this.beep(440, 50, 0.05);
  }
}
