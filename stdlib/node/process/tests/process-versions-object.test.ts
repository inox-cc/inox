// @targets c
// @expect pass
// @stdout 1

const versions = process.versions

console.log(versions.node === process.version.slice(1))
