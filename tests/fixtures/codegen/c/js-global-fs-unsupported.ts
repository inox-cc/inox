// @targets c
// @expect pass

export function main(): void {
  const text = fs.readFile('/tmp/value.txt', 'utf8')
  fs.writeFile('/tmp/out.txt', 'saved')
}
