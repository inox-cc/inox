// @targets c
// @expect pass

export function main(): void {
  let total = 0

  for (const value of [1, 2, 3]) {
    total = total + value
  }

  console.log(total)
}
