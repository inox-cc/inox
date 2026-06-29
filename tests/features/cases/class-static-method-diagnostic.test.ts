// @targets cc
// @expect diagnostics INOX_CLASS_STATIC

class User {
  static create(): User {
    return new User()
  }
}

const user = User.create()
console.log(user)
