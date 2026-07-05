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

class process_number_property {
private:
  int (*read_)();

public:
  explicit process_number_property(int (*read)());

  double value() const;
  operator double() const;
};

class process_exit_code_property {
public:
  double value() const;
  operator double() const;
  process_exit_code_property& operator=(int code);
  process_exit_code_property& operator=(double code);
};

class process_argv {
public:
  process_number_property length{inox_process_argv_length};

  inox::String operator[](int index) const;
};

class process_env {
public:
  inox::String get(const char* name, size_t name_len) const;
  inox::String get(inox::StringView name) const;
};

class process_versions {
public:
  inox::String node;

  void init();
  inox::Value value() const;
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

  void init();
  inox::String cwd() const;
  void exit(int code = 0) const;
  inox::Value hrtime() const;
  inox::Value hrtime(inox_value previous) const;
  inox::Value hrtime(const inox::Value& previous) const;
  inox::Value memoryUsage() const;
  inox::Value value() const;

private:
  inox::Value hrtime(inox_value previous, int has_previous) const;
};

inline process process;

namespace inox {

int return_code();
int main(int argc, char** argv, AppMain app_main);
int main(int argc, char** argv, const char* entry_path, AppMain app_main);

} // namespace inox

#endif

#endif
