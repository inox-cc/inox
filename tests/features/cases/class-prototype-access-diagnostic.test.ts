// @targets cc
// @expect diagnostics INOX_CLASS_PROTOTYPE

class User {
  name: string

  constructor(name: string) {
    this.name = name
  }
}

const prototype = User.prototype
console.log(prototype)
