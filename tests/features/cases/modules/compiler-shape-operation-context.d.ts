export type CompilerShapeArgumentCheck = {
  objectFieldValueType?: nullable<string>
}

export type CompilerShapeOperation = {
  minArgs?: nullable<number>
  checks?: array<CompilerShapeArgumentCheck>
}
