// @targets cc
// @expect pass
// @stdout 7

class Box {
  value: number

  constructor(value: number) {
    this.value = value
  }
}

const box = new Box(7)
console.log(box.value)
