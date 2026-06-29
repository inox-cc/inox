// @targets cc
// @expect pass
// @stdout 1

const snapshot = process
console.log(snapshot.versions.node === process.version.slice(1))
