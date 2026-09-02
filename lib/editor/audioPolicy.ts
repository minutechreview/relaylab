export const BROLL_AUDIO_POLICY = "muted" as const;
export const BASE_AUDIO_POLICY = "master" as const;

export function isBrollAudioMuted(): true {
  return true;
}
