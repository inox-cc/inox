// @targets cc
// @expect pass
// @stdout 7

class Factory {
  create(): Box {
    return new Box(7)
  }
}

class Box {
  value: number

  constructor(value: number) {
    this.value = value
  }
}

const factory = new Factory()
console.log(factory.create().value)
