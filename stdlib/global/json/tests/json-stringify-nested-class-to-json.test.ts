// @targets cc
// @expect pass
// @stdout {"user":{"label":"Ada"},"label":"Grace"}

class User {
  name: string

  constructor(name: string) {
    this.name = name
  }

  toJSON(): object {
    return { label: this.name }
  }
}

class Label {
  value: string

  constructor(value: string) {
    this.value = value
  }

  toJSON(): string {
    return this.value
  }
}

console.log(JSON.stringify({ user: new User('Ada'), label: new Label('Grace') }))
