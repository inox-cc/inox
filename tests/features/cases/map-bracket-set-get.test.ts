// @targets cc
// @expect pass
// @stdout json

const headers: Map<string, string> = new Map()
headers['content-type'] = 'json'
console.log(headers['content-type'] ?? '')
