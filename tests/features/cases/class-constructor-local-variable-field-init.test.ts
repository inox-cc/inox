// @targets cc
// @expect pass
// @stdout 8

class Box {
  value: number

  constructor(value: number) {
    const adjusted = value + 1
    this.value = adjusted
  }
}

const box = new Box(7)
console.log(box.value)
