// @targets cc
// @expect pass
// @stdout 0

class DateReader {
  read(value: Date): number {
    return value.getTime()
  }
}

const reader = new DateReader()
const date = new Date(0)

console.log(reader.read(date))
