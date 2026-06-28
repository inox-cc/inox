// @targets cc
// @expect pass
// @stdout value

type Ref = { type: string, name: string }
const expression: Ref | null = { type: 'Reference', name: 'value' }
if (expression !== null && typeof expression !== 'undefined' && expression.type === 'Reference') {
console.log(expression.name)
}
