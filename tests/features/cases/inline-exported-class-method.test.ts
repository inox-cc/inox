// @targets cc
// @expect pass
// @stdout inline-class:7

export class Box {
  value: number

  constructor(value: number) {
    this.value = value
  }

  /** @inline */
  read(): number {
    return this.value
  }
}

const box = new Box(7)

console.log('inline-class:' + String(box.read()))
