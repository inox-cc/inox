// @targets cc
// @expect diagnostics INOX_CLASS_EXTENDS

class Base {
  label(): string {
    return 'base'
  }
}

class User extends Base {
  label(): string {
    return super.label()
  }
}

const user = new User()
console.log(user.label())
