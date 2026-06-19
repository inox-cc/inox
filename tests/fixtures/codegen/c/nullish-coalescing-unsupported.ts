// @targets c
// @expect pass

function printValue(value: unknown): void {
  console.log(value ?? 'Ada')
}

printValue(1)
