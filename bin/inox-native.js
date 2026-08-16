#!/usr/bin/env node

import { spawn } from 'node:child_process'
import { existsSync, readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { dirname, join } from 'node:path'
import process from 'node:process'
import { fileURLToPath } from 'node:url'

import { currentReleaseNpmPlatform } from './npm-platform.js'
import { prepareProjectCompilerLibraries } from './project-libraries.js'

const platform = currentReleaseNpmPlatform()

if (platform === null) {
  console.error(`Inox does not provide a compiler for ${process.platform}-${process.arch}.`)
  process.exit(1)
}

const packageRoot = dirname(dirname(fileURLToPath(import.meta.url)))
const platformManifest = resolvePlatformManifest(platform.packageName, packageRoot)

if (platformManifest === null) {
  console.error(
    `Inox compiler package ${platform.packageName} is not installed. ` +
      'Reinstall @inox-cc/inox without --omit=optional.'
  )
  process.exit(1)
}

const platformRoot = dirname(platformManifest)
const packageVersion = readPackageVersion(join(packageRoot, 'package.json'))
const platformVersion = readPackageVersion(platformManifest)

if (packageVersion !== platformVersion) {
  console.error(
    `Inox package version mismatch: @inox-cc/inox is ${packageVersion}, ` +
      `but ${platform.packageName} is ${platformVersion}. Reinstall both packages at the same version.`
  )
  process.exit(1)
}

const compiler = join(platformRoot, platform.binary)
const toolchainRoot = process.env.INOX_HOME?.length > 0 ? process.env.INOX_HOME : packageRoot
let projectLibraries = null

if (!compilerHelpRequested(process.argv.slice(2))) {
  try {
    projectLibraries = prepareProjectCompilerLibraries({
      cwd: process.cwd(),
      toolchainRoot
    })
  } catch (error) {
    console.error(`Cannot prepare Inox project libraries: ${error.message}`)
    process.exit(1)
  }
}

const childEnvironment = {
  ...process.env,
  INOX_HOME: toolchainRoot
}

if (
  (childEnvironment.INOX_PROJECT_LIBRARIES ?? '').length === 0 &&
  projectLibraries?.packageRootsManifestPath !== null &&
  typeof projectLibraries?.packageRootsManifestPath !== 'undefined'
) {
  childEnvironment.INOX_PROJECT_LIBRARIES = projectLibraries.packageRootsManifestPath
}

if (
  (childEnvironment.INOX_NATIVE_PLAN ?? '').length === 0 &&
  projectLibraries?.nativePlanCMakePath !== null &&
  typeof projectLibraries?.nativePlanCMakePath !== 'undefined'
) {
  childEnvironment.INOX_NATIVE_PLAN = projectLibraries.nativePlanCMakePath
}

const child = spawn(compiler, process.argv.slice(2), {
  cwd: process.cwd(),
  env: childEnvironment,
  shell: false,
  stdio: 'inherit'
})
const signalHandlers = new Map()
const forwardedSignals =
  process.platform === 'win32' ? ['SIGINT', 'SIGTERM'] : ['SIGHUP', 'SIGINT', 'SIGQUIT', 'SIGTERM']

for (const signal of forwardedSignals) {
  const handler = () => {
    if (child.exitCode === null && child.signalCode === null) {
      child.kill(signal)
    }
  }

  try {
    process.on(signal, handler)
    signalHandlers.set(signal, handler)
  } catch {
    // A signal can be unavailable on the current operating system.
  }
}

child.once('error', (error) => {
  removeSignalHandlers()
  console.error(`Failed to start ${platform.packageName}: ${error.message}`)
  process.exitCode = 1
})

child.once('exit', (code, signal) => {
  removeSignalHandlers()

  if (signal !== null) {
    try {
      process.kill(process.pid, signal)
    } catch {
      process.exitCode = 1
    }
    return
  }

  process.exitCode = code ?? 1
})

function removeSignalHandlers() {
  for (const [signal, handler] of signalHandlers) {
    process.off(signal, handler)
  }
}

function resolvePlatformManifest(packageName, packageRoot) {
  const request = `${packageName}/package.json`
  const resolvers = [createRequire(import.meta.url)]

  if (typeof process.argv[1] === 'string' && process.argv[1].length > 0) {
    resolvers.push(createRequire(join(dirname(process.argv[1]), '..', 'package.json')))
  }

  for (const resolver of resolvers) {
    try {
      return resolver.resolve(request)
    } catch (error) {
      if (error?.code !== 'MODULE_NOT_FOUND') {
        throw error
      }
    }
  }

  const packageDirectory = packageName.slice(packageName.lastIndexOf('/') + 1)
  const siblingManifest = join(dirname(packageRoot), packageDirectory, 'package.json')

  if (existsSync(siblingManifest)) {
    return siblingManifest
  }

  return null
}

function readPackageVersion(path) {
  const manifest = JSON.parse(readFileSync(path, 'utf8'))

  if (typeof manifest.version !== 'string' || manifest.version.length === 0) {
    throw new Error(`Inox package manifest has no version: ${path}`)
  }

  return manifest.version
}

function compilerHelpRequested(args) {
  for (const argument of args) {
    if (argument === '--') {
      return false
    }

    if (argument === '--help' || argument === '-h') {
      return true
    }
  }

  return false
}
