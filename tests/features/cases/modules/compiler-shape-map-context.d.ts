type CompilerShapeMapBase = {
  nullableValues: Map<string, string | null>
  values: Map<string, string>
}

export type CompilerShapeMapContext = CompilerShapeMapBase & {
  marker: string
}
