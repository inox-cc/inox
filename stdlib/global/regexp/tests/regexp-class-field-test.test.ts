// @targets cc
// @expect pass
// @stdout 1

class Matcher {
  pattern: RegExp

  constructor() {
    this.pattern = /stdlib/i
  }

  matches(value: string): boolean {
    return this.pattern.test(value)
  }
}

const matcher = new Matcher()
console.log(matcher.matches('INOX stdlib'))
