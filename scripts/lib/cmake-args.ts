export function quietCMakeConfigureArgs(args: string[]): string[] {
  return ['--log-level=WARNING', ...args]
}
