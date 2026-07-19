// @targets cc
// @expect pass
// @exit-code 1
// @stderr Unhandled Promise rejection
// @skip-node Inox exposes unhandled rejection through process status

Promise.reject('boom')
