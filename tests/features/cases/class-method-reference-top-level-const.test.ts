// @targets cc
// @expect pass
// @stdout 2

const limit = 2

class Reader {
  read(): number {
    return limit
  }
}

console.log(new Reader().read())
