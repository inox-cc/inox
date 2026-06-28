// @targets cc
// @expect pass
// @stdout 3

function countSelected(values: number[]): number {
  let count = 0

  for (let index = 0; index < values.length; index = index + 1) {
    switch (values[index]) {
      case 0:
        continue
      case 2:
        count = count + values[index]
        break
      default:
        count = count + 1
        break
    }
  }

  return count
}

console.log(countSelected([0, 2, 3]))
