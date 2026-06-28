// @targets cc
// @expect pass
// @stdout ok

type AnyNode = { [key: string]: any }

type Info = {
  nullable: boolean
}

function markWeakMetadata(field: AnyNode): Info {
  const info: Info = {
    nullable: false
  }

  field.weakTypeValidated = true
  info.nullable = true

  return info
}

const field: AnyNode = {
  type: 'FieldDefinition',
  name: 'next'
}

const info = markWeakMetadata(field)

if (info.nullable && field.weakTypeValidated === true) {
  console.log('ok')
}
