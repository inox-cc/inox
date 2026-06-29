// @targets cc
// @expect pass
// @stdout Ada!

class User {
  name: string

  constructor(name: string, excited: boolean) {
    if (excited) {
      this.name = name + '!'
    } else {
      this.name = name
    }
  }
}

const user = new User('Ada', true)
console.log(user.name)
