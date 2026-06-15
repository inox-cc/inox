#include "ccjs/os.h"

#include <stdlib.h>
#include <string.h>
#ifndef _WIN32
#include <sys/utsname.h>
#include <unistd.h>
#endif
#include "ccjs/string.h"

static ccjs_status ccjs_os_string(ccjs_allocator* allocator, const char* value, ccjs_value* out) {
  return ccjs_string_from_literal(allocator, value == 0 ? "" : value, value == 0 ? 0 : strlen(value), out);
}

ccjs_status ccjs_os_arch(ccjs_allocator* allocator, ccjs_value* out) {
#if defined(__aarch64__) || defined(_M_ARM64)
  return ccjs_os_string(allocator, "arm64", out);
#elif defined(__x86_64__) || defined(_M_X64)
  return ccjs_os_string(allocator, "x64", out);
#elif defined(__i386__) || defined(_M_IX86)
  return ccjs_os_string(allocator, "ia32", out);
#elif defined(__arm__) || defined(_M_ARM)
  return ccjs_os_string(allocator, "arm", out);
#elif defined(__riscv) && __riscv_xlen == 64
  return ccjs_os_string(allocator, "riscv64", out);
#elif defined(__powerpc64__) || defined(__ppc64__)
  return ccjs_os_string(allocator, "ppc64", out);
#elif defined(__s390x__)
  return ccjs_os_string(allocator, "s390x", out);
#else
  return ccjs_os_string(allocator, "unknown", out);
#endif
}

ccjs_status ccjs_os_homedir(ccjs_allocator* allocator, ccjs_value* out) {
  const char* home = getenv("HOME");

#ifdef _WIN32
  if (home == 0 || home[0] == 0) {
    home = getenv("USERPROFILE");
  }
#endif

  return ccjs_os_string(allocator, home, out);
}

ccjs_status ccjs_os_hostname(ccjs_allocator* allocator, ccjs_value* out) {
#ifdef _WIN32
  return ccjs_os_string(allocator, "", out);
#else
  char name[256];

  if (gethostname(name, sizeof(name)) != 0) {
    return ccjs_os_string(allocator, "", out);
  }

  name[sizeof(name) - 1] = 0;
  return ccjs_os_string(allocator, name, out);
#endif
}

ccjs_status ccjs_os_platform(ccjs_allocator* allocator, ccjs_value* out) {
#if defined(__APPLE__)
  return ccjs_os_string(allocator, "darwin", out);
#elif defined(__linux__)
  return ccjs_os_string(allocator, "linux", out);
#elif defined(_WIN32)
  return ccjs_os_string(allocator, "win32", out);
#elif defined(__FreeBSD__)
  return ccjs_os_string(allocator, "freebsd", out);
#elif defined(__OpenBSD__)
  return ccjs_os_string(allocator, "openbsd", out);
#elif defined(__sun)
  return ccjs_os_string(allocator, "sunos", out);
#elif defined(_AIX)
  return ccjs_os_string(allocator, "aix", out);
#else
  return ccjs_os_string(allocator, "unknown", out);
#endif
}

ccjs_status ccjs_os_release(ccjs_allocator* allocator, ccjs_value* out) {
#ifdef _WIN32
  return ccjs_os_string(allocator, "", out);
#else
  struct utsname info;

  if (uname(&info) != 0) {
    return ccjs_os_string(allocator, "", out);
  }

  return ccjs_os_string(allocator, info.release, out);
#endif
}

ccjs_status ccjs_os_tmpdir(ccjs_allocator* allocator, ccjs_value* out) {
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

  return ccjs_os_string(allocator, value, out);
}

ccjs_status ccjs_os_type(ccjs_allocator* allocator, ccjs_value* out) {
#ifdef _WIN32
  return ccjs_os_string(allocator, "Windows_NT", out);
#else
  struct utsname info;

  if (uname(&info) != 0) {
    return ccjs_os_string(allocator, "", out);
  }

  return ccjs_os_string(allocator, info.sysname, out);
#endif
}
