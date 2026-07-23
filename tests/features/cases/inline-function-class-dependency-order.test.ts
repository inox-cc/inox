// @targets cc
// @expect pass
// @stdout inline-function-order:7

/** @inline */
export function read(value: Box): number {
  return value.value
}

export class Box {
  value: number

  constructor(value: number) {
    this.value = value
  }
}

console.log('inline-function-order:' + String(read(new Box(7))))
