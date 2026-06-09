// @targets js,c
// @expect pass

export function main(): void {
  let total = 0

  for (let index = 0; index < 5; index = index + 1) {
    if (index === 2) {
      continue
    }

    total = total + index
  }

  console.log(total)
}
