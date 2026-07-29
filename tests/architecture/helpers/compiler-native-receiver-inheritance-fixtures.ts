import type {
  CompilerLibraryDescriptor,
  LibraryNativeTypeDescriptor,
  LibraryOperationDescriptor,
  TypeRef
} from '../../../compiler/extensions/types.ts'

const libraryId = 'fixture:receiver-inheritance'

export function receiverInheritanceLibrary(
  nativeTypes: LibraryNativeTypeDescriptor[],
  operations: LibraryOperationDescriptor[] = []
): CompilerLibraryDescriptor {
  return {
    id: libraryId,
    dependencies: [],
    declarations: [],
    nativeTypes,
    operations,
    intrinsicBindings: [],
    runtimeRequirements: []
  }
}

export function receiverNativeType(name: string, baseTypeIds: string[] = []): LibraryNativeTypeDescriptor {
  return {
    libraryId,
    typeId: receiverTypeId(name),
    declarationNames: [name],
    valueType: 'object',
    cppType: name,
    baseTypeIds,
    runtimeRequirements: []
  }
}

export function receiverOperation(
  owner: string,
  memberName: string,
  operationName: string
): LibraryOperationDescriptor {
  const typeId = receiverTypeId(owner)

  return {
    libraryId,
    bindingId: `${typeId}.${memberName}`,
    operationId: `${libraryId}#${operationName}`,
    kind: 'member-read',
    receiverTypeId: typeId,
    runtimeRequirements: [],
    cExpression: memberName,
    cArgumentKinds: ['receiver'],
    cCallStyle: 'member',
    cResultMode: 'value',
    resultTypeRef: numberTypeRef(),
    minArgs: 0,
    maxArgs: 0,
    argumentChecks: []
  }
}

export function receiverTypeId(name: string): string {
  return `${libraryId}#${name}`
}

function numberTypeRef(): TypeRef {
  return {
    kind: 'primitive',
    name: 'number',
    nullable: false,
    ownership: 'value',
    traits: []
  }
}
