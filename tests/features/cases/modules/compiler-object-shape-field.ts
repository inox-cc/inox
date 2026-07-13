export type ShapeValueMetadata = {
  valueType: string
}

export type ObjectShapeField = ShapeValueMetadata & {
  name: string
  [key: string]: any
}
