#include "inox/os.h"

#include <stdlib.h>
#include <string.h>
#ifndef _WIN32
#include <sys/utsname.h>
#include <unistd.h>
#endif

static inox::String os_string(const char* value) {
  return inox::String(value == 0 ? "" : value);
}

os::os() : EOL("\n") {}

inox::String os::arch() const {
#if defined(__aarch64__) || defined(_M_ARM64)
  return os_string("arm64");
#elif defined(__x86_64__) || defined(_M_X64)
  return os_string("x64");
#elif defined(__i386__) || defined(_M_IX86)
  return os_string("ia32");
#elif defined(__arm__) || defined(_M_ARM)
  return os_string("arm");
#elif defined(__riscv) && __riscv_xlen == 64
  return os_string("riscv64");
#elif defined(__powerpc64__) || defined(__ppc64__)
  return os_string("ppc64");
#elif defined(__s390x__)
  return os_string("s390x");
#else
  return os_string("unknown");
#endif
}

inox::String os::homedir() const {
  const char* home = getenv("HOME");

#ifdef _WIN32
  if (home == 0 || home[0] == 0) {
    home = getenv("USERPROFILE");
  }
#endif

  return os_string(home);
}

inox::String os::hostname() const {
#ifdef _WIN32
  return os_string("");
#else
  char name[256];

  if (gethostname(name, sizeof(name)) != 0) {
    return os_string("");
  }

  name[sizeof(name) - 1] = 0;
  return os_string(name);
#endif
}

inox::String os::platform() const {
#if defined(__APPLE__)
  return os_string("darwin");
#elif defined(__linux__)
  return os_string("linux");
#elif defined(_WIN32)
  return os_string("win32");
#elif defined(__FreeBSD__)
  return os_string("freebsd");
#elif defined(__OpenBSD__)
  return os_string("openbsd");
#elif defined(__sun)
  return os_string("sunos");
#elif defined(_AIX)
  return os_string("aix");
#else
  return os_string("unknown");
#endif
}

inox::String os::release() const {
#ifdef _WIN32
  return os_string("");
#else
  struct utsname info;

  if (uname(&info) != 0) {
    return os_string("");
  }

  return os_string(info.release);
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

  return os_string(value);
}

inox::String os::type() const {
#ifdef _WIN32
  return os_string("Windows_NT");
#else
  struct utsname info;

  if (uname(&info) != 0) {
    return os_string("");
  }

  return os_string(info.sysname);
#endif
}

class os os;
