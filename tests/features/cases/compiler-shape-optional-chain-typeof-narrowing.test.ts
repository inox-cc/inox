// @targets cc
// @expect pass
// @stdout cpp

type NativeShape = {
  libraryCppType?: string | null
}

type NativeField = {
  shape?: NativeShape | null
}

function nativeFieldCppType(field: NativeField): string {
  if (typeof field.shape?.libraryCppType === 'string') {
    return field.shape.libraryCppType
  }

  return 'missing'
}

console.log(nativeFieldCppType({ shape: { libraryCppType: 'cpp' } }))
