// @targets cc
// @expect pass
// @stdout inline-order:7

export class Reader {
  /** @inline */
  read(value: Box): number {
    return value.value
  }
}

export class Box {
  value: number

  constructor(value: number) {
    this.value = value
  }
}

console.log('inline-order:' + String(new Reader().read(new Box(7))))
