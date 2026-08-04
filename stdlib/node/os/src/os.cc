#include "inox/os.h"

#include <bit>
#include <stdlib.h>
#include <thread>
#ifndef _WIN32
#include <sys/utsname.h>
#include <unistd.h>
#endif

os::os()
#ifdef _WIN32
  : EOL("\r\n"), devNull("\\\\.\\nul") {}
#else
  : EOL("\n"), devNull("/dev/null") {}
#endif

double os::availableParallelism() const {
  const unsigned int count = std::thread::hardware_concurrency();
  return static_cast<double>(count == 0 ? 1 : count);
}

inox::String os::arch() const {
#if defined(__aarch64__) || defined(_M_ARM64)
  return inox::String("arm64");
#elif defined(__x86_64__) || defined(_M_X64)
  return inox::String("x64");
#elif defined(__i386__) || defined(_M_IX86)
  return inox::String("ia32");
#elif defined(__arm__) || defined(_M_ARM)
  return inox::String("arm");
#elif defined(__riscv) && __riscv_xlen == 64
  return inox::String("riscv64");
#elif defined(__powerpc64__) || defined(__ppc64__)
  return inox::String("ppc64");
#elif defined(__s390x__)
  return inox::String("s390x");
#else
  return inox::String("unknown");
#endif
}

inox::String os::endianness() const {
  if constexpr (std::endian::native == std::endian::big) {
    return inox::String("BE");
  }

  return inox::String("LE");
}

inox::String os::homedir() const {
  const char* home = getenv("HOME");

#ifdef _WIN32
  if (home == 0 || home[0] == 0) {
    home = getenv("USERPROFILE");
  }
#endif

  return inox::String(home == 0 ? "" : home);
}

inox::String os::hostname() const {
#ifdef _WIN32
  return inox::String("");
#else
  char name[256];

  if (gethostname(name, sizeof(name)) != 0) {
    return inox::String("");
  }

  name[sizeof(name) - 1] = 0;
  return inox::String(name);
#endif
}

inox::String os::machine() const {
#ifdef _WIN32
#if defined(_M_ARM64)
  return inox::String("aarch64");
#elif defined(_M_X64)
  return inox::String("x86_64");
#elif defined(_M_IX86)
  return inox::String("i386");
#elif defined(_M_ARM)
  return inox::String("arm");
#else
  return inox::String("unknown");
#endif
#else
  struct utsname info;

  if (uname(&info) != 0) {
    return inox::String("");
  }

  return inox::String(info.machine);
#endif
}

inox::String os::platform() const {
#if defined(__APPLE__)
  return inox::String("darwin");
#elif defined(__linux__)
  return inox::String("linux");
#elif defined(_WIN32)
  return inox::String("win32");
#elif defined(__FreeBSD__)
  return inox::String("freebsd");
#elif defined(__OpenBSD__)
  return inox::String("openbsd");
#elif defined(__sun)
  return inox::String("sunos");
#elif defined(_AIX)
  return inox::String("aix");
#else
  return inox::String("unknown");
#endif
}

inox::String os::release() const {
#ifdef _WIN32
  return inox::String("");
#else
  struct utsname info;

  if (uname(&info) != 0) {
    return inox::String("");
  }

  return inox::String(info.release);
#endif
}

inox::String os::tmpdir() const {
  const char* value = getenv("TMPDIR");

  if (value == 0 || value[0] == 0) {
    value = getenv("TMP");
  }

  if (value == 0 || value[0] == 0) {
    value = getenv("TEMP");
  }

  if (value == 0 || value[0] == 0) {
#ifdef _WIN32
    value = "C:\\Temp";
#else
    value = "/tmp";
#endif
  }

  return inox::String(value);
}

inox::String os::type() const {
#ifdef _WIN32
  return inox::String("Windows_NT");
#else
  struct utsname info;

  if (uname(&info) != 0) {
    return inox::String("");
  }

  return inox::String(info.sysname);
#endif
}

inox::String os::version() const {
#ifdef _WIN32
  return inox::String("");
#else
  struct utsname info;

  if (uname(&info) != 0) {
    return inox::String("");
  }

  return inox::String(info.version);
#endif
}

class os os;
