// @targets c
// @expect diagnostics INOX_WEAK_TYPE

class Box {
  value: weak<number | null>
  constructor(value: number | null) {
    this.value = value
  }
}
