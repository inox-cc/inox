// @targets cc
// @expect pass
// @stdout 2

class Box {
  values: number[]

  constructor(values: number[]) {
    this.values = values
  }
}

const values = [1, 2]
const box = new Box(values)
console.log(box.values.length)
