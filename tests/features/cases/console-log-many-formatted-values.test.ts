// @targets cc
// @expect pass
// @stdout many v0.0.1 { node: 0.0.1 } { version: v0.0.1, versions: { node: 0.0.1 } }
// @stdout entries [[v, [1]]] { node: 0.0.1 } { version: v0.0.1, versions: { node: 0.0.1 } }

console.log('many', process.version, process.versions, process)
const parsed = JSON.parse('{"v":[1]}')
console.log('entries', Object.entries(parsed), process.versions, process)
