export class Box {
  value: number

  constructor(value: number) {
    this.value = value
  }

  /** @inline */
  read(): number {
    return this.value
  }
}
