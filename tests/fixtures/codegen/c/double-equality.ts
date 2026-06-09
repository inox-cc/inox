// @targets c
// @expect pass
// @stdout 1 1

export function main(): void {
  const same = 1 == 1
  const different = 'Ada' != 'Grace'
  console.log(same, different)
}
