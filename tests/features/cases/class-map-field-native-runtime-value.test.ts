// @targets cc
// @expect pass
// @stdout 1

class ScoreBox {
  scores: Map<string, number>

  constructor(scores: Map<string, number>) {
    this.scores = scores
  }

  size(): number {
    return this.scores.size
  }
}

const scores: Map<string, number> = new Map()
scores.set('Ada', 7)
const box = new ScoreBox(scores)
console.log(box.size())
