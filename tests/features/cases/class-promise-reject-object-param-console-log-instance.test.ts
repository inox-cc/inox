// @targets cc
// @expect pass
// @stdout Box { value: 7 }

class Box {
  value: number

  constructor(value: number) {
    this.value = value
  }
}

const value = await Promise.reject(new Box(7)).catch((item: object) => item)
console.log(value)
