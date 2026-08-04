// @targets cc
// @expect pass
// @stdout 1
// @stdout 1

const snapshot = process

console.log(snapshot.version === process.version)
console.log(snapshot.versions.inox === process.version.slice(1))
