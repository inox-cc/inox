// @targets cc
// @expect pass
// @stdout {"label":"Grace"}

class User {
  name: string

  constructor(name: string) {
    this.name = name
  }

  toJSON(): object {
    return { label: 'Grace' }
  }
}

const user = new User('Ada')
console.log(JSON.stringify(user))
