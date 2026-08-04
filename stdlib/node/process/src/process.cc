#include "inox/process.h"

#include <stdint.h>
#include <stdlib.h>
#include <string.h>
#if defined(_WIN32)
#include <windows.h>
#else
#include <sys/resource.h>
#include <time.h>
#include <unistd.h>
#endif

#include "inox/array.h"
#include "inox/loop.h"
#include "inox/main.h"
#include "inox/object.h"
#include "inox/promise_runtime.h"
#include "inox/string.h"

#ifndef INOX_PACKAGE_VERSION
#define INOX_PACKAGE_VERSION "0.0.0"
#endif

static const char* process_arch_name(void);
static const char* process_platform_name(void);

static int process_argc = 0;
static char** process_argv_values = 0;
static bool process_has_entry_path = false;
static inox::StringView process_entry_path;
static int process_exit_code = 0;

static const inox_field_info process_memory_usage_fields[] = {
  { "rss", INOX_FIELD_READONLY },
  { "heapTotal", INOX_FIELD_READONLY },
  { "heapUsed", INOX_FIELD_READONLY },
  { "external", INOX_FIELD_READONLY },
  { "arrayBuffers", INOX_FIELD_READONLY }
};

static const inox_shape process_memory_usage_shape = { 5, process_memory_usage_fields };

static const inox_field_info process_versions_fields[] = {
  { "inox", INOX_FIELD_READONLY }
};

static const inox_shape process_versions_shape = { 1, process_versions_fields };

static const inox_field_info process_fields[] = {
  { "version", INOX_FIELD_READONLY },
  { "versions", INOX_FIELD_READONLY }
};

static const inox_shape process_shape = { 2, process_fields };

static void process_init(int argc, char** argv) {
  process_argc = argc;
  process_argv_values = argv;
  process_has_entry_path = false;
  process_entry_path = inox::StringView();
}

static void process_init_with_entry(int argc, char** argv, inox::StringView entry_path) {
  process_argc = argc;
  process_argv_values = argv;
  process_has_entry_path = true;
  process_entry_path = entry_path;
}

static int process_argv_native_index(int index) {
  if (process_has_entry_path && index > 1) {
    return index - 1;
  }

  return index;
}

static inox::StringView process_argv_value_at(int index) {
  if (index < 0) {
    return inox::StringView();
  }

  if (process_has_entry_path && index == 1) {
    return process_entry_path;
  }

  if (process_argv_values == 0) {
    return inox::StringView();
  }

  int native_index = process_argv_native_index(index);

  if (native_index < 0 || native_index >= process_argc || process_argv_values[native_index] == 0) {
    return inox::StringView();
  }

  return inox::StringView(process_argv_values[native_index]);
}

static const char* process_arch_name(void) {
#if defined(__aarch64__) || defined(_M_ARM64)
  return "arm64";
#elif defined(__x86_64__) || defined(_M_X64)
  return "x64";
#elif defined(__i386__) || defined(_M_IX86)
  return "ia32";
#elif defined(__arm__) || defined(_M_ARM)
  return "arm";
#elif defined(__riscv) && __riscv_xlen == 64
  return "riscv64";
#elif defined(__powerpc64__) || defined(__ppc64__)
  return "ppc64";
#elif defined(__s390x__)
  return "s390x";
#else
  return "unknown";
#endif
}

static int process_argv_length(void) {
  if (process_has_entry_path) {
    return process_argc + 1;
  }

  return process_argc;
}

static inox_status process_now(int64_t* seconds, int64_t* nanoseconds) {
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

static inox_status process_hrtime_component(inox_value previous, size_t index, int64_t* out) {
  if (out == 0) {
    return INOX_ERR_TYPE;
  }

  inox::Value value = Array(previous).get(index);

  if (inox::thrown()) {
    return INOX_ERR_TYPE;
  }

  if (value.tag != INOX_TAG_NUMBER) {
    return INOX_ERR_TYPE;
  }

  *out = (int64_t)value.as.number;

  return INOX_OK;
}

static inox_number process_rss_bytes(void) {
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

static int process_pid(void) {
#ifdef _WIN32
  return 0;
#else
  return (int)getpid();
#endif
}

static const char* process_platform_name(void) {
#if defined(__APPLE__)
  return "darwin";
#elif defined(__linux__)
  return "linux";
#elif defined(_WIN32)
  return "win32";
#elif defined(__FreeBSD__)
  return "freebsd";
#elif defined(__OpenBSD__)
  return "openbsd";
#elif defined(__sun)
  return "sunos";
#elif defined(_AIX)
  return "aix";
#else
  return "unknown";
#endif
}

process_number_property::process_number_property(process_number_reader read) : read_(read) {}

process_number_property::operator double() const {
  if (read_ == process_number_reader::argvLength) {
    return (double)process_argv_length();
  }

  if (read_ == process_number_reader::pid) {
    return (double)process_pid();
  }

  return 0;
}

process_exit_code_property::operator double() const {
  return (double)process_exit_code;
}

process_exit_code_property& process_exit_code_property::operator=(int code) {
  process_exit_code = code;
  return *this;
}

process_exit_code_property& process_exit_code_property::operator=(double code) {
  process_exit_code = (int)code;
  return *this;
}

ProcessArgv::ProcessArgv() : length(process_number_reader::argvLength) {}

inox::String ProcessArgv::operator[](int index) const {
  inox::StringView value = process_argv_value_at(index);

  return inox::String(value);
}

inox::String ProcessEnv::operator[](inox::StringView name) const {
  if (name.bytes == 0) {
    return inox::String();
  }

  inox_allocator* allocator = &inox_default_allocator;
  char* key = (char*)allocator->alloc(allocator->user, name.len + 1, alignof(char));

  if (key == 0) {
    return inox::String();
  }

  memcpy(key, name.bytes, name.len);
  key[name.len] = 0;

  const char* value = getenv(key);
  inox::String out(value == 0 ? "" : value);

  allocator->free(allocator->user, key, name.len + 1, alignof(char));

  return out;
}

void ProcessVersions::init() {
  inoxVersion = inox::String(INOX_PACKAGE_VERSION);
  inox::Value object;

  if (!inoxVersion.valid()) {
    static_cast<inox::Value&>(*this) = inox::Value();
    return;
  }

  if (inox_object_new(&inox_default_allocator, &process_versions_shape, object.out()) != INOX_OK) {
    static_cast<inox::Value&>(*this) = inox::Value();
    return;
  }

  if (inox_object_init_known(object, 0, inoxVersion) != INOX_OK) {
    static_cast<inox::Value&>(*this) = inox::Value();
    return;
  }

  static_cast<inox::Value&>(*this) = std::move(object);
}

ProcessMemoryUsage::ProcessMemoryUsage()
    : inox::Value(), rss(0), heapTotal(0), heapUsed(0), external(0), arrayBuffers(0) {}

Process::Process() : pid(process_number_reader::pid) {}

void Process::init() {
  arch = inox::String(process_arch_name());
  argv0 = argv[0];
  execPath = argv[0];
  platform = inox::String(process_platform_name());
  version = inox::String("v" INOX_PACKAGE_VERSION);
  versions.init();
  inox::Value object;

  if (!version.valid() || versions.raw().tag != INOX_TAG_OBJECT || versions.raw().as.ref == 0) {
    static_cast<inox::Value&>(*this) = inox::Value();
    return;
  }

  if (inox_object_new(&inox_default_allocator, &process_shape, object.out()) != INOX_OK) {
    static_cast<inox::Value&>(*this) = inox::Value();
    return;
  }

  if (inox_object_init_known(object, 0, version) != INOX_OK) {
    static_cast<inox::Value&>(*this) = inox::Value();
    return;
  }

  if (inox_object_init_known(object, 1, versions) != INOX_OK) {
    static_cast<inox::Value&>(*this) = inox::Value();
    return;
  }

  static_cast<inox::Value&>(*this) = std::move(object);
}

inox::String Process::cwd() const {
  char cwd[4096];

  if (getcwd(cwd, sizeof(cwd)) == 0) {
    return inox::String();
  }

  return inox::String(cwd);
}

void Process::exit(int code) const {
  ::exit(code);
}

Array Process::hrtime() const {
  int64_t seconds = 0;
  int64_t nanoseconds = 0;

  if (process_now(&seconds, &nanoseconds) != INOX_OK) {
    return Array();
  }

  Array result = Array::create(2);

  if (inox::thrown() || !result.valid()) {
    return Array();
  }

  result.set(0, inox_number_value((inox_number)seconds));

  if (!inox::thrown()) {
    result.set(1, inox_number_value((inox_number)nanoseconds));
  }

  if (inox::thrown()) {
    return Array();
  }

  return result;
}

Array Process::hrtime(const inox::Value& previous) const {
  int64_t seconds = 0;
  int64_t nanoseconds = 0;

  if (process_now(&seconds, &nanoseconds) != INOX_OK) {
    return Array();
  }

  int64_t previous_seconds = 0;
  int64_t previous_nanoseconds = 0;

  if (
    process_hrtime_component(previous.raw(), 0, &previous_seconds) != INOX_OK ||
    process_hrtime_component(previous.raw(), 1, &previous_nanoseconds) != INOX_OK
  ) {
    return Array();
  }

  seconds -= previous_seconds;
  nanoseconds -= previous_nanoseconds;

  if (nanoseconds < 0) {
    seconds -= 1;
    nanoseconds += 1000000000ll;
  }

  Array result = Array::create(2);

  if (inox::thrown() || !result.valid()) {
    return Array();
  }

  result.set(0, inox_number_value((inox_number)seconds));

  if (!inox::thrown()) {
    result.set(1, inox_number_value((inox_number)nanoseconds));
  }

  if (inox::thrown()) {
    return Array();
  }

  return result;
}

ProcessMemoryUsage Process::memoryUsage() const {
  ProcessMemoryUsage result;
  result.rss = process_rss_bytes();
  inox_value value = inox_undefined_value();

  inox_status status = inox_object_new(&inox_default_allocator, &process_memory_usage_shape, &value);

  if (status == INOX_OK) {
    status = inox_object_init_known(value, 0, inox_number_value(result.rss));
  }

  if (status == INOX_OK) {
    status = inox_object_init_known(value, 1, inox_number_value(result.heapTotal));
  }

  if (status == INOX_OK) {
    status = inox_object_init_known(value, 2, inox_number_value(result.heapUsed));
  }

  if (status == INOX_OK) {
    status = inox_object_init_known(value, 3, inox_number_value(result.external));
  }

  if (status == INOX_OK) {
    status = inox_object_init_known(value, 4, inox_number_value(result.arrayBuffers));
  }

  if (status != INOX_OK) {
    inox_release(value);

    if (status == INOX_ERR_OOM) {
      inox::throw_out_of_memory();
    } else {
      inox::fatal("process.memoryUsage native facade invariant failed");
    }

    return ProcessMemoryUsage();
  }

  static_cast<inox::Value&>(result) = inox::adopt(value);
  return result;
}

Process process;

static int process_return_code(int success_code) {
  return !inox_promise_has_unhandled_rejection() ? success_code : 1;
}

int inox::process_main(int argc, char** argv, void (*app_main)(void)) {
  process_init(argc, argv);
  ::process.init();
  const int code = run_app(app_main);

  if (code != 0) {
    return process_return_code(code);
  }

  return process_return_code(process_exit_code);
}

int inox::process_main(int argc, char** argv, inox::StringView entry_path, void (*app_main)(void)) {
  process_init_with_entry(argc, argv, entry_path);
  ::process.init();
  const int code = run_app(app_main);

  if (code != 0) {
    return process_return_code(code);
  }

  return process_return_code(process_exit_code);
}
