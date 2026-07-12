import { generateCompilerLibraryRegistry } from './lib/compiler-library-registry.ts'

await generateCompilerLibraryRegistry()
console.log('dist/compiler-libraries')
