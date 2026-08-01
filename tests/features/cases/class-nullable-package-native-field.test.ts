// @targets cc
// @expect pass
// @stdout true:false

class Matcher {
  pattern: RegExp | null

  constructor(pattern: RegExp | null) {
    this.pattern = pattern
  }

  matches(value: string): boolean {
    return this.pattern?.test(value) ?? false
  }
}

const present = new Matcher(/inox/i)
const missing = new Matcher(null)
console.log(`${present.matches('INOX')}:${missing.matches('INOX')}`)
