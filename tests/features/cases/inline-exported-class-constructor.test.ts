// @targets cc
// @expect pass
// @stdout inline-constructor:9

export class Box {
  value: number

  /** @inline */
  constructor(value: number) {
    this.value = value
  }

  read(): number {
    return this.value
  }
}

const box = new Box(9)

console.log('inline-constructor:' + String(box.read()))
