#include "inox/child_process.h"

#include <errno.h>
#include <fcntl.h>
#include <signal.h>
#include <stdlib.h>
#include <string.h>
#include <sys/select.h>
#include <sys/time.h>
#include <sys/types.h>
#include <sys/wait.h>
#include <unistd.h>
#include "inox/loop.h"
#include "inox/string.h"

struct ChildProcessOptions {
  int ignore_stdio;
  int has_timeout;
  long timeout_ms;
  inox_value cwd_value;
  const char* cwd;
  size_t cwd_length;
  char* cwd_nul;
  inox_value env_value;
  char** envp;
  size_t env_count;
};

struct ChildProcessResult {
  int status;
  char* stdout_bytes;
  size_t stdout_length;
  size_t stdout_capacity;
  char* stderr_bytes;
  size_t stderr_length;
  size_t stderr_capacity;
};

static inox_status inox_child_process_string(inox_value value, const char** bytes, size_t* len);
static inox_status inox_child_process_number(inox_value value, long* out);
static inox_status inox_child_process_options_init(
  inox_allocator* allocator,
  inox_value options,
  ChildProcessOptions* out
);
static void inox_child_process_options_dispose(inox_allocator* allocator, ChildProcessOptions* options);
static inox_status inox_child_process_option_get(
  inox_value options,
  const char* name,
  size_t name_len,
  inox_value* out,
  int* found
);
static inox_status inox_child_process_envp_from_object(
  inox_allocator* allocator,
  inox_value env,
  char*** out,
  size_t* out_count
);
static void inox_child_process_envp_free(inox_allocator* allocator, char** envp, size_t count);
static inox_status inox_child_process_run_shell(
  inox_allocator* allocator,
  inox::StringView command,
  inox_value options,
  ChildProcessResult* result
);
static inox_status inox_child_process_run_file(
  inox_allocator* allocator,
  inox::StringView file,
  const inox::StringView* args,
  size_t arg_count,
  inox_value options,
  ChildProcessResult* result
);
static inox_status inox_child_process_run_argv(
  inox_allocator* allocator,
  char** argv,
  inox_value options,
  ChildProcessResult* result
);
static inox_status inox_child_process_build_argv(
  inox_allocator* allocator,
  inox::StringView file,
  const inox::StringView* args,
  size_t arg_count,
  char*** out
);
static void inox_child_process_free_argv(inox_allocator* allocator, char** argv);
static inox_status inox_child_process_result_init(inox_allocator* allocator, ChildProcessResult* result);
static void inox_child_process_result_dispose(inox_allocator* allocator, ChildProcessResult* result);
static inox_status inox_child_process_result_append(
  inox_allocator* allocator,
  char** bytes,
  size_t* len,
  size_t* cap,
  const char* chunk,
  size_t chunk_len
);
static inox_status inox_child_process_spawn_result_object(
  inox_allocator* allocator,
  const ChildProcessResult* result,
  const inox_shape* shape,
  inox_value* out
);
static void inox_child_process_exec_child(char** argv, const ChildProcessOptions* options);
static long inox_child_process_now_ms(void);
static char* inox_child_process_alloc(inox_allocator* allocator, size_t len);
static char* inox_child_process_copy_nul(inox_allocator* allocator, const char* bytes, size_t len);

static void inox_child_process_throw_failed(const char* message) {
  inox::throw_value(inox::String(message == 0 ? "child_process operation failed" : message));
}

inox::String child_process::execSync(inox::StringView command, const inox::Value& options) const {
  inox_allocator* allocator = &inox_default_allocator;
  inox_value raw_options = options.raw();
  ChildProcessResult result;
  inox_status status = inox_child_process_result_init(allocator, &result);

  if (status == INOX_OK) {
    status = inox_child_process_run_shell(allocator, command, raw_options, &result);
  }

  if (status == INOX_OK && result.status != 0) {
    status = INOX_ERR_UNSUPPORTED;
  }

  inox::String out;

  if (status == INOX_OK) {
    out = inox::String(result.stdout_bytes, result.stdout_length);
    status = out.valid() ? INOX_OK : INOX_ERR_OOM;
  }

  inox_child_process_result_dispose(allocator, &result);

  if (status != INOX_OK) {
    inox_child_process_throw_failed("child_process.execSync failed");
    return inox::String();
  }

  return out;
}

inox::String child_process::execFileSync(
  inox::StringView file,
  const inox::StringView* args,
  size_t arg_count,
  const inox::Value& options
) const {
  inox_allocator* allocator = &inox_default_allocator;
  inox_value raw_options = options.raw();
  ChildProcessResult result;
  inox_status status = inox_child_process_result_init(allocator, &result);

  if (status == INOX_OK) {
    status = inox_child_process_run_file(allocator, file, args, arg_count, raw_options, &result);
  }

  if (status == INOX_OK && result.status != 0) {
    status = INOX_ERR_UNSUPPORTED;
  }

  inox::String out;

  if (status == INOX_OK) {
    out = inox::String(result.stdout_bytes, result.stdout_length);
    status = out.valid() ? INOX_OK : INOX_ERR_OOM;
  }

  inox_child_process_result_dispose(allocator, &result);

  if (status != INOX_OK) {
    inox_child_process_throw_failed("child_process.execFileSync failed");
    return inox::String();
  }

  return out;
}

inox::Value child_process::spawnSync(
  inox::StringView file,
  const inox::StringView* args,
  size_t arg_count,
  const inox::Value& options,
  const inox_shape* shape
) const {
  inox_allocator* allocator = &inox_default_allocator;
  inox_value raw_options = options.raw();
  ChildProcessResult result;
  inox_status status = inox_child_process_result_init(allocator, &result);

  if (status == INOX_OK) {
    status = inox_child_process_run_file(allocator, file, args, arg_count, raw_options, &result);
  }

  inox_value out = inox_undefined_value();

  if (status == INOX_OK) {
    status = inox_child_process_spawn_result_object(allocator, &result, shape, &out);
  }

  inox_child_process_result_dispose(allocator, &result);

  if (status != INOX_OK) {
    inox_child_process_throw_failed("child_process.spawnSync failed");
    return inox::Value();
  }

  return inox::adopt(out);
}

class child_process child_process;

static inox_status inox_child_process_string(inox_value value, const char** bytes, size_t* len) {
  if (bytes == 0 || len == 0 || value.tag != INOX_TAG_STRING || value.as.ref == 0) {
    return INOX_ERR_TYPE;
  }

  inox_string* string = (inox_string*)value.as.ref;
  *bytes = string->bytes;
  *len = string->len;

  return INOX_OK;
}

static inox_status inox_child_process_number(inox_value value, long* out) {
  if (out == 0 || value.tag != INOX_TAG_NUMBER) {
    return INOX_ERR_TYPE;
  }

  *out = (long)value.as.number;

  return INOX_OK;
}

static inox_status inox_child_process_options_init(
  inox_allocator* allocator,
  inox_value options,
  ChildProcessOptions* out
) {
  out->ignore_stdio = 0;
  out->has_timeout = 0;
  out->timeout_ms = 0;
  out->cwd_value = inox_undefined_value();
  out->cwd = 0;
  out->cwd_length = 0;
  out->cwd_nul = 0;
  out->env_value = inox_undefined_value();
  out->envp = 0;
  out->env_count = 0;

  if (options.tag == INOX_TAG_UNDEFINED || options.tag == INOX_TAG_NULL) {
    return INOX_OK;
  }

  if (options.tag != INOX_TAG_OBJECT || options.as.ref == 0) {
    return INOX_ERR_TYPE;
  }

  inox_value value = inox_undefined_value();
  int found = 0;
  inox_status status = inox_child_process_option_get(options, "cwd", 3, &value, &found);

  if (status != INOX_OK) {
    return status;
  }

  if (found) {
    status = inox_child_process_string(value, &out->cwd, &out->cwd_length);

    if (status != INOX_OK) {
      inox_release(value);
      return status;
    }

    out->cwd_nul = inox_child_process_copy_nul(allocator, out->cwd, out->cwd_length);

    if (out->cwd_nul == 0) {
      inox_release(value);
      return INOX_ERR_OOM;
    }

    out->cwd_value = value;
  }

  value = inox_undefined_value();
  found = 0;
  status = inox_child_process_option_get(options, "stdio", 5, &value, &found);

  if (status != INOX_OK) {
    return status;
  }

  if (found) {
    const char* bytes = 0;
    size_t len = 0;
    status = inox_child_process_string(value, &bytes, &len);

    if (status == INOX_OK && len == 6 && strncmp(bytes, "ignore", 6) == 0) {
      out->ignore_stdio = 1;
    }

    inox_release(value);

    if (status != INOX_OK) {
      return status;
    }
  }

  value = inox_undefined_value();
  found = 0;
  status = inox_child_process_option_get(options, "timeout", 7, &value, &found);

  if (status != INOX_OK) {
    return status;
  }

  if (found) {
    status = inox_child_process_number(value, &out->timeout_ms);
    inox_release(value);

    if (status != INOX_OK) {
      return status;
    }

    out->has_timeout = 1;
  }

  value = inox_undefined_value();
  found = 0;
  status = inox_child_process_option_get(options, "env", 3, &value, &found);

  if (status != INOX_OK) {
    return status;
  }

  if (found) {
    status = inox_child_process_envp_from_object(allocator, value, &out->envp, &out->env_count);

    if (status != INOX_OK) {
      inox_release(value);
      return status;
    }

    out->env_value = value;
  }

  return INOX_OK;
}

static void inox_child_process_options_dispose(inox_allocator* allocator, ChildProcessOptions* options) {
  if (options->cwd_nul != 0) {
    allocator->free(allocator->user, options->cwd_nul, options->cwd_length + 1, alignof(char));
  }

  inox_release(options->cwd_value);
  inox_release(options->env_value);
  inox_child_process_envp_free(allocator, options->envp, options->env_count);
}

static inox_status inox_child_process_option_get(
  inox_value options,
  const char* name,
  size_t name_len,
  inox_value* out,
  int* found
) {
  *found = 0;
  *out = inox_undefined_value();
  inox_status status = inox_object_get(options, name, name_len, out);

  if (status == INOX_ERR_FIELD) {
    return INOX_OK;
  }

  if (status == INOX_OK) {
    *found = 1;
  }

  return status;
}

static inox_status inox_child_process_envp_from_object(
  inox_allocator* allocator,
  inox_value env,
  char*** out,
  size_t* out_count
) {
  if (env.tag != INOX_TAG_OBJECT || env.as.ref == 0) {
    return INOX_ERR_TYPE;
  }

  inox_object* object = (inox_object*)env.as.ref;
  char** envp = (char**)allocator->alloc(allocator->user, sizeof(char*) * (object->shape->field_count + 1), alignof(char*));

  if (envp == 0) {
    return INOX_ERR_OOM;
  }

  for (uint32_t index = 0; index <= object->shape->field_count; index += 1) {
    envp[index] = 0;
  }

  for (uint32_t index = 0; index < object->shape->field_count; index += 1) {
    inox_value value = inox_undefined_value();
    inox_status status = inox_object_get_known(env, index, &value);

    if (status != INOX_OK) {
      inox_child_process_envp_free(allocator, envp, index);
      return status;
    }

    const char* value_bytes = 0;
    size_t value_len = 0;
    status = inox_child_process_string(value, &value_bytes, &value_len);

    if (status != INOX_OK) {
      inox_release(value);
      inox_child_process_envp_free(allocator, envp, index);
      return status;
    }

    const char* key = object->shape->fields[index].name == 0 ? "" : object->shape->fields[index].name;
    size_t key_len = strlen(key);
    char* entry = inox_child_process_alloc(allocator, key_len + 1 + value_len);

    if (entry == 0) {
      inox_release(value);
      inox_child_process_envp_free(allocator, envp, index);
      return INOX_ERR_OOM;
    }

    memcpy(entry, key, key_len);
    entry[key_len] = '=';
    memcpy(entry + key_len + 1, value_bytes, value_len);
    envp[index] = entry;
    inox_release(value);
  }

  *out = envp;
  *out_count = object->shape->field_count;

  return INOX_OK;
}

static void inox_child_process_envp_free(inox_allocator* allocator, char** envp, size_t count) {
  if (envp == 0) {
    return;
  }

  for (size_t index = 0; index < count; index += 1) {
    if (envp[index] != 0) {
      allocator->free(allocator->user, envp[index], strlen(envp[index]) + 1, alignof(char));
    }
  }

  allocator->free(allocator->user, envp, sizeof(char*) * (count + 1), alignof(char*));
}

static inox_status inox_child_process_run_shell(
  inox_allocator* allocator,
  inox::StringView command,
  inox_value options,
  ChildProcessResult* result
) {
  if (command.bytes == 0 && command.len != 0) {
    return INOX_ERR_TYPE;
  }

  char** argv = (char**)allocator->alloc(allocator->user, sizeof(char*) * 4, alignof(char*));

  if (argv == 0) {
    return INOX_ERR_OOM;
  }

  argv[0] = inox_child_process_copy_nul(allocator, "/bin/sh", 7);
  argv[1] = inox_child_process_copy_nul(allocator, "-c", 2);
  argv[2] = inox_child_process_copy_nul(allocator, command.bytes, command.len);
  argv[3] = 0;

  if (argv[0] == 0 || argv[1] == 0 || argv[2] == 0) {
    inox_child_process_free_argv(allocator, argv);
    return INOX_ERR_OOM;
  }

  inox_status status = inox_child_process_run_argv(allocator, argv, options, result);
  inox_child_process_free_argv(allocator, argv);

  return status;
}

static inox_status inox_child_process_run_file(
  inox_allocator* allocator,
  inox::StringView file,
  const inox::StringView* args,
  size_t arg_count,
  inox_value options,
  ChildProcessResult* result
) {
  char** argv = 0;
  inox_status status = inox_child_process_build_argv(allocator, file, args, arg_count, &argv);

  if (status != INOX_OK) {
    return status;
  }

  status = inox_child_process_run_argv(allocator, argv, options, result);
  inox_child_process_free_argv(allocator, argv);

  return status;
}

static inox_status inox_child_process_run_argv(
  inox_allocator* allocator,
  char** argv,
  inox_value options_value,
  ChildProcessResult* result
) {
  ChildProcessOptions options;
  inox_status status = inox_child_process_options_init(allocator, options_value, &options);

  if (status != INOX_OK) {
    return status;
  }

  int stdout_pipe[2] = { -1, -1 };
  int stderr_pipe[2] = { -1, -1 };

  if (!options.ignore_stdio && (pipe(stdout_pipe) != 0 || pipe(stderr_pipe) != 0)) {
    inox_child_process_options_dispose(allocator, &options);
    return INOX_ERR_UNSUPPORTED;
  }

  pid_t pid = fork();

  if (pid < 0) {
    if (stdout_pipe[0] >= 0) {
      close(stdout_pipe[0]);
      close(stdout_pipe[1]);
    }

    if (stderr_pipe[0] >= 0) {
      close(stderr_pipe[0]);
      close(stderr_pipe[1]);
    }

    inox_child_process_options_dispose(allocator, &options);
    return INOX_ERR_UNSUPPORTED;
  }

  if (pid == 0) {
    if (options.ignore_stdio) {
      int devnull = open("/dev/null", O_RDWR);

      if (devnull >= 0) {
        dup2(devnull, STDIN_FILENO);
        dup2(devnull, STDOUT_FILENO);
        dup2(devnull, STDERR_FILENO);
        close(devnull);
      }
    } else {
      close(stdout_pipe[0]);
      close(stderr_pipe[0]);
      dup2(stdout_pipe[1], STDOUT_FILENO);
      dup2(stderr_pipe[1], STDERR_FILENO);
      close(stdout_pipe[1]);
      close(stderr_pipe[1]);
    }

    inox_child_process_exec_child(argv, &options);
  }

  if (!options.ignore_stdio) {
    close(stdout_pipe[1]);
    close(stderr_pipe[1]);
  }

  int stdout_open = !options.ignore_stdio;
  int stderr_open = !options.ignore_stdio;
  int exited = 0;
  int child_status = 0;
  long start = inox_child_process_now_ms();
  int timed_out = 0;

  while (stdout_open || stderr_open || !exited) {
    if (!exited) {
      pid_t waited = waitpid(pid, &child_status, WNOHANG);

      if (waited == pid) {
        exited = 1;
      }
    }

    if (!exited && options.has_timeout && options.timeout_ms >= 0 && inox_child_process_now_ms() - start >= options.timeout_ms) {
      kill(pid, SIGKILL);
      waitpid(pid, &child_status, 0);
      exited = 1;
      timed_out = 1;
    }

    if (!stdout_open && !stderr_open) {
      if (!exited) {
        usleep(1000);
      }
      continue;
    }

    fd_set readfds;
    FD_ZERO(&readfds);
    int max_fd = -1;

    if (stdout_open) {
      FD_SET(stdout_pipe[0], &readfds);
      max_fd = stdout_pipe[0] > max_fd ? stdout_pipe[0] : max_fd;
    }

    if (stderr_open) {
      FD_SET(stderr_pipe[0], &readfds);
      max_fd = stderr_pipe[0] > max_fd ? stderr_pipe[0] : max_fd;
    }

    struct timeval timeout;
    timeout.tv_sec = 0;
    timeout.tv_usec = 10000;
    int ready = select(max_fd + 1, &readfds, 0, 0, &timeout);

    if (ready < 0 && errno != EINTR) {
      status = INOX_ERR_UNSUPPORTED;
      break;
    }

    char buffer[4096];

    if (ready > 0 && stdout_open && FD_ISSET(stdout_pipe[0], &readfds)) {
      ssize_t count = read(stdout_pipe[0], buffer, sizeof(buffer));

      if (count > 0) {
        status = inox_child_process_result_append(
          allocator, &result->stdout_bytes, &result->stdout_length, &result->stdout_capacity, buffer, (size_t)count
        );

        if (status != INOX_OK) {
          break;
        }
      } else if (count == 0) {
        close(stdout_pipe[0]);
        stdout_open = 0;
      }
    }

    if (ready > 0 && stderr_open && FD_ISSET(stderr_pipe[0], &readfds)) {
      ssize_t count = read(stderr_pipe[0], buffer, sizeof(buffer));

      if (count > 0) {
        status = inox_child_process_result_append(
          allocator, &result->stderr_bytes, &result->stderr_length, &result->stderr_capacity, buffer, (size_t)count
        );

        if (status != INOX_OK) {
          break;
        }
      } else if (count == 0) {
        close(stderr_pipe[0]);
        stderr_open = 0;
      }
    }
  }

  if (stdout_open) {
    close(stdout_pipe[0]);
  }

  if (stderr_open) {
    close(stderr_pipe[0]);
  }

  if (!exited) {
    kill(pid, SIGKILL);
    waitpid(pid, &child_status, 0);
  }

  if (status == INOX_OK) {
    if (timed_out) {
      result->status = -1;
    } else if (WIFEXITED(child_status)) {
      result->status = WEXITSTATUS(child_status);
    } else if (WIFSIGNALED(child_status)) {
      result->status = 128 + WTERMSIG(child_status);
    } else {
      result->status = -1;
    }
  }

  inox_child_process_options_dispose(allocator, &options);

  return status;
}

static inox_status inox_child_process_build_argv(
  inox_allocator* allocator,
  inox::StringView file,
  const inox::StringView* args,
  size_t arg_count,
  char*** out
) {
  if ((file.bytes == 0 && file.len != 0) || (args == 0 && arg_count != 0)) {
    return INOX_ERR_TYPE;
  }

  char** argv = (char**)allocator->alloc(allocator->user, sizeof(char*) * (arg_count + 2), alignof(char*));

  if (argv == 0) {
    return INOX_ERR_OOM;
  }

  for (size_t index = 0; index < arg_count + 2; index += 1) {
    argv[index] = 0;
  }

  argv[0] = inox_child_process_copy_nul(allocator, file.bytes, file.len);

  if (argv[0] == 0) {
    inox_child_process_free_argv(allocator, argv);
    return INOX_ERR_OOM;
  }

  for (size_t index = 0; index < arg_count; index += 1) {
    if (args[index].bytes == 0 && args[index].len != 0) {
      inox_child_process_free_argv(allocator, argv);
      return INOX_ERR_TYPE;
    }

    argv[index + 1] = inox_child_process_copy_nul(allocator, args[index].bytes, args[index].len);

    if (argv[index + 1] == 0) {
      inox_child_process_free_argv(allocator, argv);
      return INOX_ERR_OOM;
    }
  }

  *out = argv;

  return INOX_OK;
}

static void inox_child_process_free_argv(inox_allocator* allocator, char** argv) {
  if (argv == 0) {
    return;
  }

  size_t index = 0;

  while (argv[index] != 0) {
    allocator->free(allocator->user, argv[index], strlen(argv[index]) + 1, alignof(char));
    index += 1;
  }

  allocator->free(allocator->user, argv, sizeof(char*) * (index + 1), alignof(char*));
}

static inox_status inox_child_process_result_init(inox_allocator* allocator, ChildProcessResult* result) {
  result->status = 0;
  result->stdout_length = 0;
  result->stdout_capacity = 256;
  result->stderr_length = 0;
  result->stderr_capacity = 256;
  result->stdout_bytes = inox_child_process_alloc(allocator, result->stdout_capacity);
  result->stderr_bytes = inox_child_process_alloc(allocator, result->stderr_capacity);

  if (result->stdout_bytes == 0 || result->stderr_bytes == 0) {
    inox_child_process_result_dispose(allocator, result);
    return INOX_ERR_OOM;
  }

  return INOX_OK;
}

static void inox_child_process_result_dispose(inox_allocator* allocator, ChildProcessResult* result) {
  if (result->stdout_bytes != 0) {
    allocator->free(allocator->user, result->stdout_bytes, result->stdout_capacity + 1, alignof(char));
  }

  if (result->stderr_bytes != 0) {
    allocator->free(allocator->user, result->stderr_bytes, result->stderr_capacity + 1, alignof(char));
  }
}

static inox_status inox_child_process_result_append(
  inox_allocator* allocator,
  char** bytes,
  size_t* len,
  size_t* cap,
  const char* chunk,
  size_t chunk_len
) {
  if (*len + chunk_len > *cap) {
    size_t next_cap = *cap;

    while (*len + chunk_len > next_cap) {
      next_cap *= 2;
    }

    char* next = (char*)allocator->realloc(allocator->user, *bytes, *cap + 1, next_cap + 1, alignof(char));

    if (next == 0) {
      return INOX_ERR_OOM;
    }

    *bytes = next;
    *cap = next_cap;
  }

  memcpy(*bytes + *len, chunk, chunk_len);
  *len += chunk_len;
  (*bytes)[*len] = 0;

  return INOX_OK;
}

static inox_status inox_child_process_spawn_result_object(
  inox_allocator* allocator,
  const ChildProcessResult* result,
  const inox_shape* shape,
  inox_value* out
) {
  inox_value object = inox_undefined_value();
  inox_status status = inox_object_new(allocator, shape, &object);
  inox::String stdout_value;
  inox::String stderr_value;

  if (status == INOX_OK) {
    status = inox_object_init_known(object, 0, inox_number_value((inox_number)result->status));
  }

  if (status == INOX_OK) {
    stdout_value = inox::String(result->stdout_bytes, result->stdout_length);
    status = stdout_value.valid() ? INOX_OK : INOX_ERR_OOM;
  }

  if (status == INOX_OK) {
    status = inox_object_init_known(object, 1, stdout_value);
  }

  if (status == INOX_OK) {
    stderr_value = inox::String(result->stderr_bytes, result->stderr_length);
    status = stderr_value.valid() ? INOX_OK : INOX_ERR_OOM;
  }

  if (status == INOX_OK) {
    status = inox_object_init_known(object, 2, stderr_value);
  }

  if (status == INOX_OK) {
    *out = object;
    return INOX_OK;
  }

  inox_release(object);
  *out = inox_undefined_value();

  return status;
}

static void inox_child_process_exec_child(char** argv, const ChildProcessOptions* options) {
  if (options->cwd_nul != 0 && chdir(options->cwd_nul) != 0) {
    _exit(127);
  }

  if (options->envp == 0) {
    execvp(argv[0], argv);
    _exit(127);
  }

  if (strchr(argv[0], '/') != 0) {
    execve(argv[0], argv, options->envp);
    _exit(127);
  }

  const char* path = "/usr/bin:/bin";

  for (size_t index = 0; index < options->env_count; index += 1) {
    if (strncmp(options->envp[index], "PATH=", 5) == 0) {
      path = options->envp[index] + 5;
      break;
    }
  }

  const char* cursor = path;

  while (*cursor != 0) {
    const char* end = cursor;

    while (*end != 0 && *end != ':') {
      end += 1;
    }

    size_t dir_len = (size_t)(end - cursor);
    size_t file_len = strlen(argv[0]);
    char stack_path[4096];

    if (dir_len + 1 + file_len < sizeof(stack_path)) {
      memcpy(stack_path, cursor, dir_len);
      stack_path[dir_len] = '/';
      memcpy(stack_path + dir_len + 1, argv[0], file_len + 1);
      execve(stack_path, argv, options->envp);
    }

    cursor = *end == ':' ? end + 1 : end;
  }

  _exit(127);
}

static long inox_child_process_now_ms(void) {
  struct timeval value;

  if (gettimeofday(&value, 0) != 0) {
    return 0;
  }

  return (long)value.tv_sec * 1000L + (long)(value.tv_usec / 1000L);
}

static char* inox_child_process_alloc(inox_allocator* allocator, size_t len) {
  if (allocator == 0 || allocator->alloc == 0) {
    return 0;
  }

  char* bytes = (char*)allocator->alloc(allocator->user, len + 1, alignof(char));

  if (bytes != 0) {
    bytes[len] = 0;
  }

  return bytes;
}

static char* inox_child_process_copy_nul(inox_allocator* allocator, const char* bytes, size_t len) {
  char* out = inox_child_process_alloc(allocator, len);

  if (out != 0) {
    memcpy(out, bytes, len);
  }

  return out;
}
