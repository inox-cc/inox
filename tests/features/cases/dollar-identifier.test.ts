// @targets cc
// @expect pass
// @stdout 2 3

const update = {
  $set: { count: 2 },
  $inc: { count: 3 }
}

console.log(update.$set.count, update.$inc.count)
