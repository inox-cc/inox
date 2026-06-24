// @targets c
// @expect pass
// @stdout boolean

function describeNodeValue(node: AnyNode): void {
  let valueType = node.valueType

  if (valueType === null || typeof valueType === 'undefined') {
    if (node.type === 'BooleanLiteral') {
      valueType = 'boolean'
    } else {
      valueType = 'unknown'
    }
  }

  console.log(valueType)
}

describeNodeValue({ type: 'BooleanLiteral', value: true })
