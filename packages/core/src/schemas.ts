import { z } from 'zod'
import { USERNAME_MAX, USERNAME_MIN, USERNAME_PATTERN } from './username.ts'

export const usernameSchema = z
  .string()
  .min(USERNAME_MIN, `Mínimo ${USERNAME_MIN} caracteres`)
  .max(USERNAME_MAX, `Máximo ${USERNAME_MAX} caracteres`)
  .regex(USERNAME_PATTERN, 'Solo minúsculas, números y _')

export const BIO_MAX = 280

export const profileUpdateSchema = z.object({
  username: usernameSchema,
  bio: z.string().max(BIO_MAX, `Máximo ${BIO_MAX} caracteres`),
})
export type ProfileUpdate = z.infer<typeof profileUpdateSchema>
