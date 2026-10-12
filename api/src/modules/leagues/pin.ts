import { randomInt } from 'node:crypto'

// No 0/O, 1/I/L: PINs get read aloud and typed on phones.
const PIN_ALPHABET = '23456789ABCDEFGHJKMNPQRSTUVWXYZ'
export const PIN_LENGTH = 6
export const PIN_PATTERN = new RegExp(`^[${PIN_ALPHABET}]{${String(PIN_LENGTH)}}$`)

/** A cryptographically random PIN (~887 million combinations), so private leagues can't be guessed. */
export function generatePin(): string {
  return Array.from({ length: PIN_LENGTH }, () => PIN_ALPHABET.charAt(randomInt(PIN_ALPHABET.length))).join('')
}
