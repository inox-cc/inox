// @targets cc
// @expect pass
// @stdout 1

const versions = process.versions

console.log(versions.inox === process.version.slice(1))
