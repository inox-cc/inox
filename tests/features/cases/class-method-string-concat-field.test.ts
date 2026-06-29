// @targets cc
// @expect pass
// @stdout User:Ada

class User {
  name: string

  constructor(name: string) {
    this.name = name
  }

  label(): string {
    return 'User:' + this.name
  }
}

const user = new User('Ada')
console.log(user.label())
