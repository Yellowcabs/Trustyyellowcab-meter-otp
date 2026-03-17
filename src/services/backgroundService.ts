/**
 * BackgroundService
 * 
 * Uses a silent audio loop to keep the browser process active in the background
 * on mobile devices, which is critical for maintaining GPS tracking during 
 * phone calls or when the app is minimized.
 */

class BackgroundService {
  private audio: HTMLAudioElement | null = null;
  private isRunning: boolean = false;

  constructor() {
    // A more robust silent audio data URI (1 second of silence)
    const silentAudioBase64 = 'data:audio/wav;base64,UklGRigAAABXQVZFZm10IBAAAAABAAEARKwAAIhYAQACABAAZGF0YQAAAAA=';
    
    if (typeof window !== 'undefined') {
      this.audio = new Audio(silentAudioBase64);
      this.audio.loop = true;
      
      // Handle potential interruptions (like phone calls ending)
      this.audio.onpause = () => {
        if (this.isRunning) {
          this.audio?.play().catch(e => console.error('Background audio resume failed:', e));
        }
      };
    }
  }

  public async start() {
    if (this.isRunning || !this.audio) return;

    try {
      // Play audio to keep the browser process alive
      await this.audio.play();
      this.isRunning = true;
      console.log('Background audio service started');
    } catch (err) {
      console.warn('Failed to start background audio automatically. User interaction may be required.', err);
      // We don't throw here because it's a non-critical enhancement
    }
  }

  public stop() {
    if (!this.isRunning || !this.audio) return;
    
    this.audio.pause();
    this.audio.currentTime = 0;
    this.isRunning = false;
    console.log('Background audio service stopped');
  }
}

export const backgroundService = new BackgroundService();
