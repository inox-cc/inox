// @targets cc
// @expect pass
// @stdout Ada

class Factory {
  create(): { value: string } {
    return { value: 'Ada' }
  }
}

const factory = new Factory()
console.log(factory.create().value)
