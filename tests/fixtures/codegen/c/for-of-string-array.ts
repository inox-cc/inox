// @targets c
// @expect pass

export function main(): void {
  const names = ['Ada', 'Grace']

  for (const name of names) {
    console.log(name)
  }
}
