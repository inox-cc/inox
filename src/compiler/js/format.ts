export function indent(lines: string[]): string[] {
  return lines.map((line) => `  ${line}`)
}
