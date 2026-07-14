// @targets cc
// @expect pass
// @stdout 0

class ThrowingDateCopier {
  copy(value: Date, fail: boolean): Date {
    if (fail) {
      throw new Error('failed')
    }

    return value
  }
}

const copier = new ThrowingDateCopier()

try {
  const copied: Date = copier.copy(new Date(0), false)
  console.log(copied.getTime())
} catch (error) {
  console.log(error)
}
