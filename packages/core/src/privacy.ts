import { z } from 'zod'

export const privacyLevel = z.enum(['public', 'friends', 'private'])
export type PrivacyLevel = z.infer<typeof privacyLevel>

export const PRIVACY_SECTIONS = ['library', 'achievements', 'activity', 'friends'] as const
export type PrivacySection = (typeof PRIVACY_SECTIONS)[number]

export const PRIVACY_LABELS: Record<PrivacyLevel, string> = {
  public: 'Público',
  friends: 'Solo amigos',
  private: 'Privado',
}
