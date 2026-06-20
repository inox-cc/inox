// @targets c
// @expect diagnostics INOX_WEAK_TYPE

class Box {
  weak value: number | null
  constructor(value: number | null) {
    this.value = value
  }
}
