// @targets cc
// @expect pass
// @stdout NativeValue

type Shape = {
  libraryCppType?: string | null
}

type Init = {
  shape?: Shape | null
}

type Node = {
  shape?: Shape | null
  init?: Init | null
}

function libraryCppType(node: Node): string | null {
  const shape = node.shape ?? node.init?.shape
  const cppType = shape?.libraryCppType

  if (cppType === null || typeof cppType === 'undefined') {
    return null
  }

  return cppType
}

console.log(libraryCppType({ shape: { libraryCppType: 'NativeValue' } }) ?? '')
