// @targets cc
// @expect pass
// @stdout Box { value: 7 }

class Box {
  value: number

  constructor(value: number) {
    this.value = value
  }
}

const value = await Promise.resolve(new Box(7)).then((item: object) => item)
console.log(value)
