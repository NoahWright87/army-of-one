/** Order and timing of the audio sprite produced by tools/gen-caption-voices.py. */
export const CAPTION_SOUNDS = [...'abcdefghijklmnopqrstuvwxyz0123456789', 'sh', 'th', 'ch', 'ng'];
export const CAPTION_SOUND_SECONDS = 0.125;
export const CAPTION_VOICE_BANKS = ['low', 'high'] as const;

export type CaptionVoiceBank = (typeof CAPTION_VOICE_BANKS)[number];

export interface CaptionVoiceProfile {
  bank: CaptionVoiceBank;
  pitch: number;
  speed: number;
  expression: number;
}
