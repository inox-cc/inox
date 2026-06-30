export function render(value: string, suffix: string = 'fallback'): string {
  return value + ': ' + suffix
}
