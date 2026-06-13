// @targets c
// @platforms embedded
// @features entropy,binary
// @expect pass

export function main(): void {
  const bytes = Buffer.alloc(4)
  crypto.getRandomValues(bytes)
  console.log(bytes.length)
}
