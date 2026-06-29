// @targets cc
// @expect pass
// @stdout 9

class Box {
  value: number

  constructor(value: number) {
    let adjusted = value
    adjusted = adjusted + 2
    this.value = adjusted
  }
}

const box = new Box(7)
console.log(box.value)
