#include "inox/process.h"

#include <stdint.h>
#include <stdlib.h>
#include <string.h>
#if defined(_WIN32)
#include <windows.h>
#else
#include <sys/resource.h>
#include <time.h>
#endif
#include "inox/array.h"
#include "inox/object.h"
#include <unistd.h>
#include "inox/string.h"

#ifndef INOX_PACKAGE_VERSION
#define INOX_PACKAGE_VERSION "0.0.0"
#endif

static int inox_process_argc = 0;
static char** inox_process_argv_values = 0;
static const char* inox_process_entry_path = 0;
static int inox_process_exit_code = 0;

static const inox_field_info inox_process_memory_usage_fields[] = {
  { "rss", INOX_FIELD_READONLY },
  { "heapTotal", INOX_FIELD_READONLY },
  { "heapUsed", INOX_FIELD_READONLY },
  { "external", INOX_FIELD_READONLY },
  { "arrayBuffers", INOX_FIELD_READONLY }
};

static const inox_shape inox_process_memory_usage_shape = { 5, inox_process_memory_usage_fields };

static const inox_field_info inox_process_versions_fields[] = {
  { "node", INOX_FIELD_READONLY }
};

static const inox_shape inox_process_versions_shape = { 1, inox_process_versions_fields };

static const inox_field_info inox_process_fields[] = {
  { "version", INOX_FIELD_READONLY },
  { "versions", INOX_FIELD_READONLY }
};

static const inox_shape inox_process_shape = { 2, inox_process_fields };

static inox_status inox_process_string(inox_allocator* allocator, const char* value, inox_value* out) {
  return inox_string_from_literal(allocator, value == 0 ? "" : value, value == 0 ? 0 : strlen(value), out);
}

static inox_status inox_process_init_object_field(
  inox_value object,
  uint32_t index,
  inox_status (*init)(inox_allocator* allocator, inox_value* out),
  inox_allocator* allocator
) {
  inox_value value = inox_undefined_value();
  inox_status status = init(allocator, &value);

  if (status == INOX_OK) {
    status = inox_object_init_known(object, index, value);
  }

  inox_release(value);

  return status;
}

inox_status inox_process(inox_allocator* allocator, inox_value* out) {
  if (allocator == 0 || out == 0) {
    return INOX_ERR_TYPE;
  }

  inox_status status = inox_object_new(allocator, &inox_process_shape, out);

  if (status != INOX_OK) {
    return status;
  }

  status = inox_process_init_object_field(*out, 0, inox_process_version, allocator);

  if (status == INOX_OK) {
    status = inox_process_init_object_field(*out, 1, inox_process_versions, allocator);
  }

  if (status != INOX_OK) {
    inox_release(*out);
    *out = inox_undefined_value();
  }

  return status;
}

void inox_process_init(int argc, char** argv) {
  inox_process_argc = argc;
  inox_process_argv_values = argv;
  inox_process_entry_path = 0;
}

void inox_process_init_with_entry(int argc, char** argv, const char* entry_path) {
  inox_process_argc = argc;
  inox_process_argv_values = argv;
  inox_process_entry_path = entry_path;
}

static int inox_process_argv_native_index(int index) {
  if (inox_process_entry_path != 0 && index > 1) {
    return index - 1;
  }

  return index;
}

static const char* inox_process_argv_value_at(int index) {
  if (index < 0) {
    return 0;
  }

  if (inox_process_entry_path != 0 && index == 1) {
    return inox_process_entry_path;
  }

  if (inox_process_argv_values == 0) {
    return 0;
  }

  int native_index = inox_process_argv_native_index(index);

  if (native_index < 0 || native_index >= inox_process_argc || inox_process_argv_values[native_index] == 0) {
    return 0;
  }

  return inox_process_argv_values[native_index];
}

inox_status inox_process_arch(inox_allocator* allocator, inox_value* out) {
#if defined(__aarch64__) || defined(_M_ARM64)
  return inox_process_string(allocator, "arm64", out);
#elif defined(__x86_64__) || defined(_M_X64)
  return inox_process_string(allocator, "x64", out);
#elif defined(__i386__) || defined(_M_IX86)
  return inox_process_string(allocator, "ia32", out);
#elif defined(__arm__) || defined(_M_ARM)
  return inox_process_string(allocator, "arm", out);
#elif defined(__riscv) && __riscv_xlen == 64
  return inox_process_string(allocator, "riscv64", out);
#elif defined(__powerpc64__) || defined(__ppc64__)
  return inox_process_string(allocator, "ppc64", out);
#elif defined(__s390x__)
  return inox_process_string(allocator, "s390x", out);
#else
  return inox_process_string(allocator, "unknown", out);
#endif
}

inox_status inox_process_argv(inox_allocator* allocator, int index, inox_value* out) {
  if (out == 0) {
    return INOX_ERR_TYPE;
  }

  const char* value = inox_process_argv_value_at(index);

  if (value == 0) {
    return inox_string_from_literal(allocator, "", 0, out);
  }

  return inox_string_from_literal(allocator, value, strlen(value), out);
}

int inox_process_argv_length(void) {
  if (inox_process_entry_path != 0) {
    return inox_process_argc + 1;
  }

  return inox_process_argc;
}

inox_status inox_process_argv0(inox_allocator* allocator, inox_value* out) {
  return inox_process_argv(allocator, 0, out);
}

inox_status inox_process_cwd(inox_allocator* allocator, inox_value* out) {
  char cwd[4096];

  if (getcwd(cwd, sizeof(cwd)) == 0) {
    return INOX_ERR_UNSUPPORTED;
  }

  return inox_string_from_literal(allocator, cwd, strlen(cwd), out);
}

inox_status inox_process_env(inox_allocator* allocator, const char* name, size_t name_len, inox_value* out) {
  if (name == 0 || out == 0) {
    return INOX_ERR_TYPE;
  }

  char* key = allocator->alloc(allocator->user, name_len + 1, _Alignof(char));

  if (key == 0) {
    return INOX_ERR_OOM;
  }

  memcpy(key, name, name_len);
  key[name_len] = 0;

  const char* value = getenv(key);
  inox_status status = inox_string_from_literal(allocator, value == 0 ? "" : value, value == 0 ? 0 : strlen(value), out);

  allocator->free(allocator->user, key, name_len + 1, _Alignof(char));

  return status;
}

inox_status inox_process_execPath(inox_allocator* allocator, inox_value* out) {
  return inox_process_argv(allocator, 0, out);
}

int inox_process_get_exit_code(void) {
  return inox_process_exit_code;
}

static inox_status inox_process_now(int64_t* seconds, int64_t* nanoseconds) {
  if (seconds == 0 || nanoseconds == 0) {
    return INOX_ERR_TYPE;
  }

#if defined(_WIN32)
  LARGE_INTEGER frequency;
  LARGE_INTEGER counter;

  if (!QueryPerformanceFrequency(&frequency) || !QueryPerformanceCounter(&counter) || frequency.QuadPart == 0) {
    return INOX_ERR_UNSUPPORTED;
  }

  *seconds = (int64_t)(counter.QuadPart / frequency.QuadPart);
  *nanoseconds = (int64_t)(((counter.QuadPart % frequency.QuadPart) * 1000000000ll) / frequency.QuadPart);
  return INOX_OK;
#elif defined(CLOCK_MONOTONIC)
  struct timespec current;

  if (clock_gettime(CLOCK_MONOTONIC, &current) != 0) {
    return INOX_ERR_UNSUPPORTED;
  }

  *seconds = (int64_t)current.tv_sec;
  *nanoseconds = (int64_t)current.tv_nsec;
  return INOX_OK;
#else
  struct timespec current;

  if (timespec_get(&current, TIME_UTC) == 0) {
    return INOX_ERR_UNSUPPORTED;
  }

  *seconds = (int64_t)current.tv_sec;
  *nanoseconds = (int64_t)current.tv_nsec;
  return INOX_OK;
#endif
}

static inox_status inox_process_hrtime_component(inox_value previous, size_t index, int64_t* out) {
  if (out == 0) {
    return INOX_ERR_TYPE;
  }

  inox_value value = inox_undefined_value();
  inox_status status = inox_array_get(previous, index, &value);

  if (status != INOX_OK) {
    return status;
  }

  if (value.tag != INOX_TAG_NUMBER) {
    inox_release(value);
    return INOX_ERR_TYPE;
  }

  *out = (int64_t)value.as.number;
  inox_release(value);

  return INOX_OK;
}

inox_status inox_process_hrtime(inox_allocator* allocator, inox_value previous, int has_previous, inox_value* out) {
  if (allocator == 0 || out == 0) {
    return INOX_ERR_TYPE;
  }

  int64_t seconds = 0;
  int64_t nanoseconds = 0;
  inox_status status = inox_process_now(&seconds, &nanoseconds);

  if (status != INOX_OK) {
    return status;
  }

  if (has_previous) {
    int64_t previous_seconds = 0;
    int64_t previous_nanoseconds = 0;

    status = inox_process_hrtime_component(previous, 0, &previous_seconds);

    if (status != INOX_OK) {
      return status;
    }

    status = inox_process_hrtime_component(previous, 1, &previous_nanoseconds);

    if (status != INOX_OK) {
      return status;
    }

    seconds -= previous_seconds;
    nanoseconds -= previous_nanoseconds;

    if (nanoseconds < 0) {
      seconds -= 1;
      nanoseconds += 1000000000ll;
    }
  }

  status = inox_array_new(allocator, 2, out);

  if (status != INOX_OK) {
    return status;
  }

  status = inox_array_set(*out, 0, inox_number_value((inox_number)seconds));

  if (status == INOX_OK) {
    status = inox_array_set(*out, 1, inox_number_value((inox_number)nanoseconds));
  }

  if (status != INOX_OK) {
    inox_release(*out);
    *out = inox_undefined_value();
  }

  return status;
}

static inox_number inox_process_rss_bytes(void) {
#if defined(_WIN32)
  return 0;
#else
  struct rusage usage;

  if (getrusage(RUSAGE_SELF, &usage) != 0) {
    return 0;
  }

#if defined(__APPLE__)
  return (inox_number)usage.ru_maxrss;
#else
  return (inox_number)usage.ru_maxrss * 1024.0;
#endif
#endif
}

static inox_status inox_process_memory_usage_set(inox_value object, uint32_t index, inox_number value) {
  return inox_object_init_known(object, index, inox_number_value(value));
}

inox_status inox_process_memoryUsage(inox_allocator* allocator, inox_value* out) {
  if (allocator == 0 || out == 0) {
    return INOX_ERR_TYPE;
  }

  inox_status status = inox_object_new(allocator, &inox_process_memory_usage_shape, out);

  if (status != INOX_OK) {
    return status;
  }

  status = inox_process_memory_usage_set(*out, 0, inox_process_rss_bytes());

  if (status == INOX_OK) {
    status = inox_process_memory_usage_set(*out, 1, 0);
  }

  if (status == INOX_OK) {
    status = inox_process_memory_usage_set(*out, 2, 0);
  }

  if (status == INOX_OK) {
    status = inox_process_memory_usage_set(*out, 3, 0);
  }

  if (status == INOX_OK) {
    status = inox_process_memory_usage_set(*out, 4, 0);
  }

  if (status != INOX_OK) {
    inox_release(*out);
    *out = inox_undefined_value();
  }

  return status;
}

int inox_process_pid(void) {
#ifdef _WIN32
  return 0;
#else
  return (int)getpid();
#endif
}

inox_status inox_process_platform(inox_allocator* allocator, inox_value* out) {
#if defined(__APPLE__)
  return inox_process_string(allocator, "darwin", out);
#elif defined(__linux__)
  return inox_process_string(allocator, "linux", out);
#elif defined(_WIN32)
  return inox_process_string(allocator, "win32", out);
#elif defined(__FreeBSD__)
  return inox_process_string(allocator, "freebsd", out);
#elif defined(__OpenBSD__)
  return inox_process_string(allocator, "openbsd", out);
#elif defined(__sun)
  return inox_process_string(allocator, "sunos", out);
#elif defined(_AIX)
  return inox_process_string(allocator, "aix", out);
#else
  return inox_process_string(allocator, "unknown", out);
#endif
}

inox_status inox_process_version(inox_allocator* allocator, inox_value* out) {
  return inox_process_string(allocator, "v" INOX_PACKAGE_VERSION, out);
}

inox_status inox_process_versions(inox_allocator* allocator, inox_value* out) {
  if (allocator == 0 || out == 0) {
    return INOX_ERR_TYPE;
  }

  inox_status status = inox_object_new(allocator, &inox_process_versions_shape, out);

  if (status != INOX_OK) {
    return status;
  }

  inox_value node = inox_undefined_value();
  status = inox_process_versions_node(allocator, &node);

  if (status == INOX_OK) {
    status = inox_object_init_known(*out, 0, node);
  }

  inox_release(node);

  if (status != INOX_OK) {
    inox_release(*out);
    *out = inox_undefined_value();
  }

  return status;
}

inox_status inox_process_versions_node(inox_allocator* allocator, inox_value* out) {
  return inox_process_string(allocator, INOX_PACKAGE_VERSION, out);
}

void inox_process_set_exit_code(int code) {
  inox_process_exit_code = code;
}

void inox_process_exit(int code) {
  exit(code);
}
