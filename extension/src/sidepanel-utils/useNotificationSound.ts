import { useCallback, useRef } from 'react';

/**
 * Custom hook for playing notification sounds
 * Uses Web Audio API to generate a pleasant notification tone
 */
export function useNotificationSound() {
  const audioContextRef = useRef<AudioContext | null>(null);

  const playNotificationSound = useCallback(() => {
    try {
      // Create audio context if it doesn't exist
      if (!audioContextRef.current) {
        const AudioContextClass = window.AudioContext || (window as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
        if (AudioContextClass) {
          audioContextRef.current = new AudioContextClass()
        } else {
          throw new Error('AudioContext not supported')
        }
      }

      const audioContext = audioContextRef.current;
      const currentTime = audioContext.currentTime;

      // Create oscillator for the notification sound
      const oscillator = audioContext.createOscillator();
      const gainNode = audioContext.createGain();

      // Connect nodes
      oscillator.connect(gainNode);
      gainNode.connect(audioContext.destination);

      // Configure a pleasant two-tone notification sound
      oscillator.type = 'sine';
      oscillator.frequency.setValueAtTime(800, currentTime); // First tone (800 Hz)
      oscillator.frequency.setValueAtTime(1000, currentTime + 0.1); // Second tone (1000 Hz)

      // Envelope for smooth sound
      gainNode.gain.setValueAtTime(0, currentTime);
      gainNode.gain.linearRampToValueAtTime(0.3, currentTime + 0.01); // Attack
      gainNode.gain.linearRampToValueAtTime(0.2, currentTime + 0.1); // Sustain
      gainNode.gain.linearRampToValueAtTime(0.3, currentTime + 0.11); // Second tone attack
      gainNode.gain.linearRampToValueAtTime(0, currentTime + 0.3); // Release

      // Play the sound
      oscillator.start(currentTime);
      oscillator.stop(currentTime + 0.3);

    } catch (error) {
      console.error('Failed to play notification sound:', error);
    }
  }, []);

  return { playNotificationSound };
}
