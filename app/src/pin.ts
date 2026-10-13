/** League PINs use letters and digits only; normalize what people type or paste. */
export function normalizePin(value: string): string {
  return value.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 6)
}
