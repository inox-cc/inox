// @targets cc
// @expect pass
// @stdout async:8
// @stdout parsed:Ada:7
// @stdout json:{"name":"Ada","score":7}
// @stdout math:2/7/3/2

async function nextScore(value: number): Promise<number> {
  return await Promise.resolve(value).then((item) => item + 1)
}

const score = await nextScore(7)
const parsed = JSON.parse('{"name":"Ada","score":7}')
const encoded = JSON.stringify({
  name: parsed.name,
  score: parsed.score
})
const low = Math.min(2, score)
const high = Math.max(7, score - 1)
const rounded = Math.round(2.6)
const truncated = Math.trunc(2.9)

console.log('async:' + String(score))
console.log('parsed:' + parsed.name + ':' + String(parsed.score))
console.log('json:' + encoded)
console.log('math:' + String(low) + '/' + String(high) + '/' + String(rounded) + '/' + String(truncated))
