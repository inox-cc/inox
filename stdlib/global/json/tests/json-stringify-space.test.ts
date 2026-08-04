// @targets cc
// @expect pass
// @stdout {
// @stdout   "name": "Ada",
// @stdout   "scores": [
// @stdout     7,
// @stdout     8
// @stdout   ]
// @stdout }

console.log(JSON.stringify({ name: 'Ada', scores: [7, 8] }, null, 2))
