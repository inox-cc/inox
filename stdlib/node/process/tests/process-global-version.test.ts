// @targets cc
// @expect pass
// @stdout 1
// @stdout 1

console.log(process.version.startsWith('v'))
console.log(process.versions.inox === process.version.slice(1))
