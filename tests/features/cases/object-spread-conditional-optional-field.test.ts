// @targets cc
// @expect pass
// @stdout item

const mapping = { cppType: 'value' }

function descriptor(enabled: boolean) {
  return {
    id: 'item',
    ...(enabled ? { mapping } : {})
  }
}

console.log(descriptor(true).id)
