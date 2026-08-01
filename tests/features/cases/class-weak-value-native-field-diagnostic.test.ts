// @targets cc
// @expect diagnostics INOX_WEAK_TYPE

class Matcher {
  pattern: weak<RegExp | null>

  constructor(pattern: RegExp) {
    this.pattern = pattern
  }
}
