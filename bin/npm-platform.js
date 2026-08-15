import process from 'node:process'

const platformPackages = new Map([
  [
    'darwin-arm64',
    {
      binary: 'bin/inox',
      cpu: 'arm64',
      id: 'darwin-arm64',
      os: 'darwin',
      packageName: '@inox-cc/inox-darwin-arm64'
    }
  ],
  [
    'darwin-x64',
    {
      binary: 'bin/inox',
      cpu: 'x64',
      id: 'darwin-x64',
      os: 'darwin',
      packageName: '@inox-cc/inox-darwin-x64'
    }
  ],
  [
    'linux-arm64-gnu',
    {
      binary: 'bin/inox',
      cpu: 'arm64',
      id: 'linux-arm64-gnu',
      libc: 'glibc',
      os: 'linux',
      packageName: '@inox-cc/inox-linux-arm64-gnu'
    }
  ],
  [
    'linux-arm64-musl',
    {
      binary: 'bin/inox',
      cpu: 'arm64',
      id: 'linux-arm64-musl',
      libc: 'musl',
      os: 'linux',
      packageName: '@inox-cc/inox-linux-arm64-musl'
    }
  ],
  [
    'linux-x64-gnu',
    {
      binary: 'bin/inox',
      cpu: 'x64',
      id: 'linux-x64-gnu',
      libc: 'glibc',
      os: 'linux',
      packageName: '@inox-cc/inox-linux-x64-gnu'
    }
  ],
  [
    'linux-x64-musl',
    {
      binary: 'bin/inox',
      cpu: 'x64',
      id: 'linux-x64-musl',
      libc: 'musl',
      os: 'linux',
      packageName: '@inox-cc/inox-linux-x64-musl'
    }
  ],
  [
    'win32-arm64-msvc',
    {
      binary: 'bin/inox.exe',
      cpu: 'arm64',
      id: 'win32-arm64-msvc',
      os: 'win32',
      packageName: '@inox-cc/inox-win32-arm64-msvc'
    }
  ],
  [
    'win32-x64-msvc',
    {
      binary: 'bin/inox.exe',
      cpu: 'x64',
      id: 'win32-x64-msvc',
      os: 'win32',
      packageName: '@inox-cc/inox-win32-x64-msvc'
    }
  ]
])
const releasePlatformIds = ['darwin-arm64', 'darwin-x64', 'linux-arm64-gnu', 'linux-x64-gnu']

export function currentNpmPlatform() {
  return npmPlatform(process.platform, process.arch, runtimeUsesGlibc())
}

export function currentReleaseNpmPlatform() {
  return npmReleasePlatform(process.platform, process.arch, runtimeUsesGlibc())
}

export function npmPlatform(platform, architecture, usesGlibc = true) {
  let id = `${platform}-${architecture}`

  if (platform === 'linux') {
    id = `${id}-${usesGlibc ? 'gnu' : 'musl'}`
  } else if (platform === 'win32') {
    id = `${id}-msvc`
  }

  return platformPackages.get(id) ?? null
}

export function npmReleasePlatform(platform, architecture, usesGlibc = true) {
  const platformPackage = npmPlatform(platform, architecture, usesGlibc)

  return platformPackage !== null && releasePlatformIds.includes(platformPackage.id) ? platformPackage : null
}

export function releaseNpmPlatforms() {
  return releasePlatformIds.map((id) => platformPackages.get(id))
}

function runtimeUsesGlibc() {
  if (process.platform !== 'linux') {
    return true
  }

  const report = process.report?.getReport()
  return typeof report?.header?.glibcVersionRuntime === 'string'
}
