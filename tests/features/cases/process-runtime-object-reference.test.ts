// @targets cc
// @expect pass
// @stdout 1

const snapshot = process
console.log(snapshot.versions.inox === snapshot.versions.inox)
