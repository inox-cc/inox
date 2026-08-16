// @targets cc
// @expect pass
// @stdout {"createdAt":"1970-01-01T00:00:00.000Z"}

console.log(JSON.stringify({ createdAt: new Date(0) }))
