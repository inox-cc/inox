// @targets cc
// @expect pass
// @stdout 0

class DateCopier {
  copy(value: Date): Date {
    return value
  }
}

const copier = new DateCopier()
const copied: Date = copier.copy(new Date(0))

console.log(copied.getTime())
