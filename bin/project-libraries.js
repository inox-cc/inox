import { createHash } from 'node:crypto'
import { mkdirSync, readFileSync, realpathSync, renameSync, statSync, unlinkSync, writeFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { dirname, isAbsolute, join, relative, resolve } from 'node:path'
import process from 'node:process'

export function prepareProjectCompilerLibraries({ cwd, toolchainRoot }) {
  const projectRoot = nearestProjectPackageRoot(cwd)

  if (projectRoot === null) {
    return emptyProjectCompilerLibraryPreparation(cwd)
  }

  const packageRoots = discoverCompilerLibraryPackageRoots(projectRoot)

  if (packageRoots.length === 0) {
    return emptyProjectCompilerLibraryPreparation(projectRoot)
  }

  const outputRoot = join(projectRoot, 'dist', '.inox')
  const packageRootsManifestPath = join(outputRoot, 'compiler-library-roots.json')
  const nativePlanJsonPath = join(outputRoot, 'native-plan.json')
  const nativePlanCMakePath = join(outputRoot, 'native-plan.cmake')
  const builtInNativePlanPath = join(toolchainRoot, 'dist', 'compiler-libraries', 'native-plan.json')
  const builtInNativePlan = readJsonObject(builtInNativePlanPath, 'built-in Inox native plan')
  const externalLibraries = packageRoots.map(loadExternalCompilerLibrary)
  const nativePlan = combineNativePlan(builtInNativePlan, externalLibraries)

  mkdirSync(outputRoot, { recursive: true })
  writeFileIfChanged(
    packageRootsManifestPath,
    `${JSON.stringify(
      {
        version: 1,
        librarySetFingerprint: nativePlan.librarySetFingerprint,
        packageRoots
      },
      null,
      2
    )}\n`
  )
  writeFileIfChanged(nativePlanJsonPath, `${JSON.stringify(nativePlan, null, 2)}\n`)
  writeFileIfChanged(nativePlanCMakePath, renderNativePlanCMake(nativePlan))

  return {
    projectRoot,
    packageRoots,
    packageRootsManifestPath,
    nativePlanJsonPath,
    nativePlanCMakePath
  }
}

export function discoverCompilerLibraryPackageRoots(projectRoot) {
  const projectManifestPath = join(projectRoot, 'package.json')
  const projectManifest = readJsonObject(projectManifestPath, 'project package manifest')
  const dependencyNames = []

  appendDependencyNames(dependencyNames, projectManifest.dependencies)
  appendDependencyNames(dependencyNames, projectManifest.devDependencies)
  appendDependencyNames(dependencyNames, projectManifest.optionalDependencies)
  dependencyNames.sort()

  const resolver = createRequire(projectManifestPath)
  const roots = []

  for (const dependencyName of dependencyNames) {
    const packageRoot = resolveDependencyPackageRoot(projectRoot, dependencyName, resolver)

    if (packageRoot === null) {
      continue
    }

    const packageManifest = readJsonObject(join(packageRoot, 'package.json'), `package ${dependencyName}`)

    if (packageManifest.inox === null || typeof packageManifest.inox !== 'object') {
      continue
    }

    if (!roots.includes(packageRoot)) {
      roots.push(packageRoot)
    }
  }

  roots.sort()
  return roots
}

export function renderNativePlanCMake(plan) {
  let source =
    `set(INOX_STDLIB_LIBRARY_SET_FINGERPRINT "${cmakeScalar(plan.librarySetFingerprint)}")\n` +
    renderNativePlanCMakePathList('INOX_STDLIB_SOURCES', plan.sources) +
    renderNativePlanCMakePathList('INOX_STDLIB_INCLUDE_DIRS', plan.includeDirs) +
    `set(INOX_STDLIB_NATIVE_UNIT_COUNT ${plan.units.length})\n`

  for (let index = 0; index < plan.units.length; index = index + 1) {
    const unit = plan.units[index]
    const prefix = `INOX_STDLIB_NATIVE_UNIT_${index}`

    source =
      source +
      `set(${prefix}_LIBRARY_ID "${cmakeScalar(unit.libraryId)}")\n` +
      renderNativePlanCMakeValueList(`${prefix}_RUNTIME_REQUIREMENTS`, unit.runtimeRequirements) +
      renderNativePlanCMakeValueList(`${prefix}_CMAKE_PACKAGES`, unit.cmakePackages) +
      renderNativePlanCMakeValueList(`${prefix}_CMAKE_LINK_LIBRARIES`, unit.cmakeLinkLibraries) +
      renderNativePlanCMakeValueList(`${prefix}_LINKER_ARGUMENTS`, unit.linkerArguments) +
      renderNativePlanCMakeProjects(prefix, unit.cmakeProjects ?? []) +
      renderNativePlanCMakePathList(`${prefix}_SOURCES`, unit.sources)
  }

  return source
}

function emptyProjectCompilerLibraryPreparation(projectRoot) {
  return {
    projectRoot,
    packageRoots: [],
    packageRootsManifestPath: null,
    nativePlanJsonPath: null,
    nativePlanCMakePath: null
  }
}

function nearestProjectPackageRoot(start) {
  let current = resolve(start)

  while (true) {
    if (isFile(join(current, 'package.json'))) {
      return current
    }

    const parent = dirname(current)

    if (parent === current) {
      return null
    }

    current = parent
  }
}

function appendDependencyNames(names, dependencies) {
  if (dependencies === null || typeof dependencies !== 'object' || Array.isArray(dependencies)) {
    return
  }

  for (const name of Object.keys(dependencies)) {
    if (!names.includes(name)) {
      names.push(name)
    }
  }
}

function resolveDependencyPackageRoot(projectRoot, dependencyName, resolver) {
  const direct = join(projectRoot, 'node_modules', dependencyName)

  if (isFile(join(direct, 'package.json'))) {
    return realpathSync(direct)
  }

  try {
    return dirname(resolver.resolve(`${dependencyName}/package.json`))
  } catch (error) {
    if (error?.code !== 'ERR_PACKAGE_PATH_NOT_EXPORTED' && error?.code !== 'MODULE_NOT_FOUND') {
      throw error
    }
  }

  try {
    return nearestPackageRoot(dirname(resolver.resolve(dependencyName)))
  } catch (error) {
    if (error?.code !== 'ERR_PACKAGE_PATH_NOT_EXPORTED' && error?.code !== 'MODULE_NOT_FOUND') {
      throw error
    }
  }

  return null
}

function nearestPackageRoot(start) {
  let current = start

  while (true) {
    if (isFile(join(current, 'package.json'))) {
      return realpathSync(current)
    }

    const parent = dirname(current)

    if (parent === current) {
      return null
    }

    current = parent
  }
}

function loadExternalCompilerLibrary(packageRoot) {
  const packageManifestPath = join(packageRoot, 'package.json')
  const packageManifest = readJsonObject(packageManifestPath, 'Inox compiler library package')
  const inox = packageManifest.inox

  if (inox === null || typeof inox !== 'object' || Array.isArray(inox)) {
    throw new Error(`Invalid Inox compiler library metadata: ${packageManifestPath}`)
  }

  if (
    inox.manifestVersion !== 1 ||
    typeof inox.libraryId !== 'string' ||
    inox.libraryId.length === 0 ||
    typeof inox.importSource !== 'string' ||
    inox.importSource.length === 0 ||
    typeof inox.compilerLibrary !== 'string' ||
    typeof inox.declarations !== 'string'
  ) {
    throw new Error(`Invalid Inox compiler library metadata: ${packageManifestPath}`)
  }

  const serializedPath = resolvePackagePath(packageRoot, inox.compilerLibrary, 'compilerLibrary')
  const declarationPath = resolvePackagePath(packageRoot, inox.declarations, 'declarations')
  const serialized = readJsonObject(serializedPath, `compiler library ${inox.libraryId}`)
  const declarationSource = readTextFile(declarationPath, `compiler library declarations ${inox.libraryId}`)
  const descriptor = serialized.descriptor

  if (
    serialized.version !== 1 ||
    descriptor === null ||
    typeof descriptor !== 'object' ||
    Array.isArray(descriptor) ||
    descriptor.id !== inox.libraryId ||
    !Array.isArray(descriptor.dependencies) ||
    !Array.isArray(descriptor.operations) ||
    !Array.isArray(descriptor.intrinsicBindings) ||
    !Array.isArray(descriptor.runtimeRequirements)
  ) {
    throw new Error(`Invalid serialized Inox compiler library: ${serializedPath}`)
  }

  const native = inox.native ?? { sources: [], includeDirs: [] }
  const nativeBuild = serialized.nativeBuild ?? {
    cmakePackages: [],
    cmakeLinkLibraries: [],
    linkerArguments: [],
    cmakeProjects: []
  }

  validateStringArray(native.sources, `${packageManifestPath} inox.native.sources`)
  validateStringArray(native.includeDirs, `${packageManifestPath} inox.native.includeDirs`)
  validateStringArray(nativeBuild.cmakePackages, `${serializedPath} nativeBuild.cmakePackages`)
  validateStringArray(nativeBuild.cmakeLinkLibraries, `${serializedPath} nativeBuild.cmakeLinkLibraries`)
  validateStringArray(nativeBuild.linkerArguments, `${serializedPath} nativeBuild.linkerArguments`)

  const runtimeRequirements = descriptor.runtimeRequirements.map((requirement) => {
    if (requirement === null || typeof requirement !== 'object' || typeof requirement.id !== 'string') {
      throw new Error(`Invalid runtime requirement in ${serializedPath}`)
    }

    return requirement.id
  })
  const cmakeProjects = (nativeBuild.cmakeProjects ?? []).map((project) => {
    if (
      project === null ||
      typeof project !== 'object' ||
      typeof project.sourceDir !== 'string' ||
      !Array.isArray(project.options)
    ) {
      throw new Error(`Invalid native CMake project in ${serializedPath}`)
    }

    return {
      sourceDir: resolvePackagePath(packageRoot, project.sourceDir, 'nativeBuild.cmakeProjects.sourceDir'),
      options: project.options.map((option) => {
        if (
          option === null ||
          typeof option !== 'object' ||
          typeof option.name !== 'string' ||
          typeof option.value !== 'string'
        ) {
          throw new Error(`Invalid native CMake option in ${serializedPath}`)
        }

        return { name: option.name, value: option.value }
      })
    }
  })

  return {
    libraryId: inox.libraryId,
    importSource: inox.importSource,
    declarationSource,
    descriptor,
    sources: native.sources.map((value) => resolvePackagePath(packageRoot, value, 'native.sources')),
    includeDirs: native.includeDirs.map((value) => resolvePackagePath(packageRoot, value, 'native.includeDirs')),
    runtimeRequirements: uniqueSorted(runtimeRequirements),
    cmakePackages: uniqueSorted(nativeBuild.cmakePackages),
    cmakeLinkLibraries: uniqueSorted(nativeBuild.cmakeLinkLibraries),
    linkerArguments: nativeBuild.linkerArguments.slice(),
    cmakeProjects
  }
}

function combineNativePlan(builtIn, externalLibraries) {
  if (
    builtIn.version !== 1 ||
    typeof builtIn.librarySetFingerprint !== 'string' ||
    !Array.isArray(builtIn.sources) ||
    !Array.isArray(builtIn.includeDirs) ||
    !Array.isArray(builtIn.units)
  ) {
    throw new Error('Invalid built-in Inox native plan')
  }

  const ids = new Set(builtIn.units.map((unit) => unit.libraryId))
  const sources = builtIn.sources.slice()
  const includeDirs = builtIn.includeDirs.slice()
  const units = builtIn.units.map(copyNativePlanUnit)

  for (const library of externalLibraries) {
    if (ids.has(library.libraryId)) {
      throw new Error(`Duplicate compiler library id ${library.libraryId}`)
    }

    ids.add(library.libraryId)
    sources.push(...library.sources)
    includeDirs.push(...library.includeDirs)
    units.push({
      libraryId: library.libraryId,
      runtimeRequirements: library.runtimeRequirements,
      sources: library.sources,
      cmakePackages: library.cmakePackages,
      cmakeLinkLibraries: library.cmakeLinkLibraries,
      linkerArguments: library.linkerArguments,
      cmakeProjects: library.cmakeProjects
    })
  }

  units.sort((left, right) => left.libraryId.localeCompare(right.libraryId))
  const fingerprintPackages = externalLibraries
    .map((library) => ({
      libraryId: library.libraryId,
      importSource: library.importSource,
      declarationSource: library.declarationSource,
      descriptor: library.descriptor
    }))
    .sort((left, right) => left.libraryId.localeCompare(right.libraryId))
  const externalFingerprint = createHash('sha256').update(JSON.stringify(fingerprintPackages)).digest('hex')

  return {
    version: 1,
    librarySetFingerprint: `${builtIn.librarySetFingerprint}:project:${externalFingerprint}`,
    sources: uniqueSorted(sources),
    includeDirs: uniqueSorted(includeDirs),
    units
  }
}

function copyNativePlanUnit(unit) {
  return {
    libraryId: unit.libraryId,
    runtimeRequirements: unit.runtimeRequirements.slice(),
    sources: unit.sources.slice(),
    cmakePackages: unit.cmakePackages.slice(),
    cmakeLinkLibraries: unit.cmakeLinkLibraries.slice(),
    linkerArguments: unit.linkerArguments.slice(),
    cmakeProjects: (unit.cmakeProjects ?? []).map((project) => ({
      sourceDir: project.sourceDir,
      options: project.options.map((option) => ({ name: option.name, value: option.value }))
    }))
  }
}

function renderNativePlanCMakeProjects(prefix, projects) {
  let source = `set(${prefix}_CMAKE_PROJECT_COUNT ${projects.length})\n`

  for (let index = 0; index < projects.length; index = index + 1) {
    const project = projects[index]
    const projectPrefix = `${prefix}_CMAKE_PROJECT_${index}`

    source =
      source +
      `set(${projectPrefix}_SOURCE_DIR "${cmakePath(project.sourceDir)}")\n` +
      renderNativePlanCMakeValueList(
        `${projectPrefix}_OPTIONS`,
        project.options.map((option) => `${option.name}=${option.value}`)
      )
  }

  return source
}

function renderNativePlanCMakePathList(name, paths) {
  let source = `set(${name}\n`

  for (const path of paths) {
    source = `${source}  "${cmakePath(path)}"\n`
  }

  return `${source})\n`
}

function renderNativePlanCMakeValueList(name, values) {
  let source = `set(${name}\n`

  for (const value of values) {
    source = `${source}  "${cmakeScalar(value)}"\n`
  }

  return `${source})\n`
}

function cmakePath(path) {
  const normalized = path.split('\\').join('/')
  const escaped = cmakeScalar(normalized)

  if (isAbsolute(normalized) || normalized.startsWith('//')) {
    return escaped
  }

  return `\${INOX_REPO_ROOT}/${escaped}`
}

function cmakeScalar(value) {
  return value
    .split('\\')
    .join('\\\\')
    .split('"')
    .join('\\"')
    .split('$')
    .join('\\$')
    .split(';')
    .join('\\;')
    .split('\n')
    .join('\\n')
    .split('\r')
    .join('\\r')
}

function resolvePackagePath(packageRoot, packagePath, field) {
  if (typeof packagePath !== 'string' || packagePath.length === 0) {
    throw new Error(`Invalid Inox compiler library ${field}`)
  }

  const resolved = resolve(packageRoot, packagePath)
  const relativePath = relative(packageRoot, resolved)

  if (
    relativePath === '..' ||
    relativePath.startsWith('../') ||
    relativePath.startsWith('..\\') ||
    isAbsolute(relativePath)
  ) {
    throw new Error(`Inox compiler library ${field} escapes package root: ${packagePath}`)
  }

  return resolved
}

function validateStringArray(value, label) {
  if (!Array.isArray(value) || !value.every((item) => typeof item === 'string' && item.length > 0)) {
    throw new Error(`Invalid ${label}`)
  }
}

function uniqueSorted(values) {
  return Array.from(new Set(values)).sort()
}

function readJsonObject(path, description) {
  let parsed

  try {
    parsed = JSON.parse(readFileSync(path, 'utf8'))
  } catch (error) {
    throw new Error(`Cannot read ${description} at ${path}: ${error.message}`)
  }

  if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new Error(`Expected a JSON object for ${description} at ${path}`)
  }

  return parsed
}

function readTextFile(path, description) {
  try {
    return readFileSync(path, 'utf8')
  } catch (error) {
    throw new Error(`Cannot read ${description} at ${path}: ${error.message}`)
  }
}

function writeFileIfChanged(path, source) {
  try {
    if (readFileSync(path, 'utf8') === source) {
      return
    }
  } catch {
    // First generation has no previous file.
  }

  const temporary = `${path}.${process.pid}.tmp`

  try {
    writeFileSync(temporary, source)
    renameSync(temporary, path)
  } finally {
    try {
      unlinkSync(temporary)
    } catch {
      // renameSync already removed the temporary path.
    }
  }
}

function isFile(path) {
  try {
    return statSync(path).isFile()
  } catch {
    return false
  }
}
