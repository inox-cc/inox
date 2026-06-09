// @targets js
// @expect pass

export function main(): void {
  const values = [1, 2, 3]
  let total = 0

  for (const value of values) {
    total = total + value
  }

  console.log(total)
}
