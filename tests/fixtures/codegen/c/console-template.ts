// @targets c
// @expect pass
// @stdout hello Ada ok score 7 ready true

const user = { name: 'Ada', score: 7 }
const suffix = 'ok'
const ready = true
console.log(`hello ${user.name} ${suffix} score ${user.score} ready ${ready}`)
