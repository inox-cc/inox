#ifndef INOX_PROCESS_H
#define INOX_PROCESS_H

#include <stddef.h>
#include "inox/allocator.h"
#include "inox/value.h"

#ifdef __cplusplus
extern "C" {
#endif

void inox_process_init(int argc, char** argv);
void inox_process_init_with_entry(int argc, char** argv, const char* entry_path);
inox_status inox_process(inox_allocator* allocator, inox_value* out);
inox_status inox_process_arch(inox_allocator* allocator, inox_value* out);
inox_status inox_process_argv(inox_allocator* allocator, int index, inox_value* out);
int inox_process_argv_length(void);
inox_status inox_process_argv0(inox_allocator* allocator, inox_value* out);
inox_status inox_process_cwd(inox_allocator* allocator, inox_value* out);
inox_status inox_process_env(inox_allocator* allocator, const char* name, size_t name_len, inox_value* out);
inox_status inox_process_execPath(inox_allocator* allocator, inox_value* out);
int inox_process_get_exit_code(void);
inox_status inox_process_hrtime(inox_allocator* allocator, inox_value previous, int has_previous, inox_value* out);
inox_status inox_process_memoryUsage(inox_allocator* allocator, inox_value* out);
int inox_process_pid(void);
inox_status inox_process_platform(inox_allocator* allocator, inox_value* out);
inox_status inox_process_version(inox_allocator* allocator, inox_value* out);
inox_status inox_process_versions(inox_allocator* allocator, inox_value* out);
inox_status inox_process_versions_node(inox_allocator* allocator, inox_value* out);
void inox_process_set_exit_code(int code);
void inox_process_exit(int code);

#ifdef __cplusplus
}
#endif

#ifdef __cplusplus

#include "inox/main.h"
#include "inox/string_view.h"

namespace inox {
namespace node_process {

inline String string(inox_status (*read)(inox_allocator*, inox_value*)) {
  inox_value value = inox_undefined_value();

  if (read(&inox_default_allocator, &value) != INOX_OK) {
    return String();
  }

  return String(adopt(value));
}

inline Value value(inox_status (*read)(inox_allocator*, inox_value*)) {
  inox_value result = inox_undefined_value();

  if (read(&inox_default_allocator, &result) != INOX_OK) {
    return Value();
  }

  return adopt(result);
}

} // namespace node_process
} // namespace inox

class process_number_property {
private:
  int (*read_)();

public:
  explicit constexpr process_number_property(int (*read)()) : read_(read) {}

  double value() const {
    return read_ == nullptr ? 0 : (double)read_();
  }

  operator double() const {
    return value();
  }
};

class process_exit_code_property {
public:
  double value() const {
    return (double)inox_process_get_exit_code();
  }

  operator double() const {
    return value();
  }

  process_exit_code_property& operator=(int code) {
    inox_process_set_exit_code(code);
    return *this;
  }

  process_exit_code_property& operator=(double code) {
    inox_process_set_exit_code((int)code);
    return *this;
  }
};

class process_argv {
public:
  process_number_property length{inox_process_argv_length};

  inox::String operator[](int index) const {
    inox_value value = inox_undefined_value();

    if (inox_process_argv(&inox_default_allocator, index, &value) != INOX_OK) {
      return inox::String();
    }

    return inox::String(inox::adopt(value));
  }
};

class process_env {
public:
  inox::String get(const char* name, size_t name_len) const {
    inox_value value = inox_undefined_value();

    if (inox_process_env(&inox_default_allocator, name, name_len, &value) != INOX_OK) {
      return inox::String();
    }

    return inox::String(inox::adopt(value));
  }

  inox::String get(inox::StringView name) const {
    return get(name.bytes, name.len);
  }
};

class process_versions {
public:
  inox::String node;

  void init() {
    node = inox::node_process::string(inox_process_versions_node);
  }

  inox::Value value() const {
    return inox::node_process::value(inox_process_versions);
  }
};

class process {
public:
  inox::String arch;
  process_argv argv;
  inox::String argv0;
  process_env env;
  inox::String execPath;
  process_exit_code_property exitCode;
  process_number_property pid{inox_process_pid};
  inox::String platform;
  inox::String version;
  process_versions versions;

  void init() {
    arch = inox::node_process::string(inox_process_arch);
    argv0 = inox::node_process::string(inox_process_argv0);
    execPath = inox::node_process::string(inox_process_execPath);
    platform = inox::node_process::string(inox_process_platform);
    version = inox::node_process::string(inox_process_version);
    versions.init();
  }

  inox::String cwd() const {
    return inox::node_process::string(inox_process_cwd);
  }

  void exit(int code = 0) const {
    inox_process_exit(code);
  }

  inox::Value hrtime() const {
    return hrtime(inox_undefined_value(), 0);
  }

  inox::Value hrtime(inox_value previous) const {
    return hrtime(previous, 1);
  }

  inox::Value hrtime(const inox::Value& previous) const {
    return hrtime(previous.raw(), 1);
  }

  inox::Value memoryUsage() const {
    return inox::node_process::value(inox_process_memoryUsage);
  }

  inox::Value value() const {
    return inox::node_process::value(inox_process);
  }

private:
  inox::Value hrtime(inox_value previous, int has_previous) const {
    inox_value value = inox_undefined_value();

    if (inox_process_hrtime(&inox_default_allocator, previous, has_previous, &value) != INOX_OK) {
      return inox::Value();
    }

    return inox::adopt(value);
  }
};

inline process process;

namespace inox {

inline int return_code() {
  return inox::return_code(inox_process_get_exit_code());
}

inline int main(int argc, char** argv, AppMain app_main) {
  inox_process_init(argc, argv);
  ::process.init();
  const int code = run_app(app_main);

  if (code != 0) {
    return return_code(code);
  }

  return return_code();
}

inline int main(int argc, char** argv, AppStatusMain app_main) {
  inox_process_init(argc, argv);
  ::process.init();
  const inox_status status = run_status_app(app_main);

  if (status != INOX_OK) {
    return return_code(status_exit_code(status));
  }

  return return_code();
}

inline int main(int argc, char** argv, const char* entry_path, AppMain app_main) {
  inox_process_init_with_entry(argc, argv, entry_path);
  ::process.init();
  const int code = run_app(app_main);

  if (code != 0) {
    return return_code(code);
  }

  return return_code();
}

inline int main(int argc, char** argv, const char* entry_path, AppStatusMain app_main) {
  inox_process_init_with_entry(argc, argv, entry_path);
  ::process.init();
  const inox_status status = run_status_app(app_main);

  if (status != INOX_OK) {
    return return_code(status_exit_code(status));
  }

  return return_code();
}

} // namespace inox

#endif

#endif
