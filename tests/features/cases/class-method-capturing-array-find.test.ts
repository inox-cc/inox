// @targets cc
// @expect pass
// @stdout 1

class Finder {
  includes(values: number[], expected: number): boolean {
    const found = values.find((value) => value === expected)
    return found !== undefined
  }
}

const finder = new Finder()
console.log(finder.includes([1, 2, 3], 2))
