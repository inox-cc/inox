// @targets cc
// @expect pass
// @stdout missing
// @stdout Grace
// @stdout smoke:7
// @stdout catch:handled
// @stdout finally:done

type User = {
  name: string
  score: number
}

class ScoreBoard {
  title: string
  total: number

  constructor(title: string) {
    this.title = title
    this.total = 0
  }

  add(user: User | null): void {
    this.total = this.total + (user?.score ?? 0)
  }

  label(): string {
    return this.title + ':' + String(this.total)
  }
}

function readName(user: User | null): string {
  return user?.name ?? 'missing'
}

const missing: User | null = null
const present: User = {
  name: 'Grace',
  score: 4
}
const board = new ScoreBoard('smoke')
board.add({
  name: 'Ada',
  score: 7
})
board.add(missing)

console.log(readName(missing))
console.log(readName(present))
console.log(board.label())

try {
  throw 'handled'
} catch (error) {
  console.log('catch:' + error)
} finally {
  console.log('finally:done')
}
