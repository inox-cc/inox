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

namespace inox {

inline int return_code() {
  return inox::return_code(inox_process_get_exit_code());
}

inline int main(int argc, char** argv, AppMain app_main) {
  inox_process_init(argc, argv);
  const int code = run_app(app_main);

  if (code != 0) {
    return return_code(code);
  }

  return return_code();
}

inline int main(int argc, char** argv, const char* entry_path, AppMain app_main) {
  inox_process_init_with_entry(argc, argv, entry_path);
  const int code = run_app(app_main);

  if (code != 0) {
    return return_code(code);
  }

  return return_code();
}

} // namespace inox

#endif

#endif
