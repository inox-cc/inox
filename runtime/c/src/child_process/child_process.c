#include "ccjs/child_process.h"

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
#include "ccjs/string.h"

typedef struct ccjs_child_process_options {
  int ignore_stdio;
  int has_timeout;
  long timeout_ms;
  ccjs_value cwd_value;
  const char* cwd;
  size_t cwd_len;
  char* cwd_nul;
  ccjs_value env_value;
  char** envp;
  size_t env_count;
} ccjs_child_process_options;

typedef struct ccjs_child_process_result {
  int status;
  char* stdout_bytes;
  size_t stdout_len;
  size_t stdout_cap;
  char* stderr_bytes;
  size_t stderr_len;
  size_t stderr_cap;
} ccjs_child_process_result;

static ccjs_status ccjs_child_process_string(ccjs_value value, const char** bytes, size_t* len);
static ccjs_status ccjs_child_process_number(ccjs_value value, long* out);
static ccjs_status ccjs_child_process_options_init(
  ccjs_allocator* allocator,
  ccjs_value options,
  ccjs_child_process_options* out
);
static void ccjs_child_process_options_dispose(ccjs_allocator* allocator, ccjs_child_process_options* options);
static ccjs_status ccjs_child_process_option_get(
  ccjs_value options,
  const char* name,
  size_t name_len,
  ccjs_value* out,
  int* found
);
static ccjs_status ccjs_child_process_envp_from_object(
  ccjs_allocator* allocator,
  ccjs_value env,
  char*** out,
  size_t* out_count
);
static void ccjs_child_process_envp_free(ccjs_allocator* allocator, char** envp, size_t count);
static ccjs_status ccjs_child_process_run_shell(
  ccjs_allocator* allocator,
  ccjs_value command,
  ccjs_value options,
  ccjs_child_process_result* result
);
static ccjs_status ccjs_child_process_run_file(
  ccjs_allocator* allocator,
  ccjs_value file,
  const ccjs_value* args,
  size_t arg_count,
  ccjs_value options,
  ccjs_child_process_result* result
);
static ccjs_status ccjs_child_process_run_argv(
  ccjs_allocator* allocator,
  char** argv,
  ccjs_value options,
  ccjs_child_process_result* result
);
static ccjs_status ccjs_child_process_build_argv(
  ccjs_allocator* allocator,
  ccjs_value file,
  const ccjs_value* args,
  size_t arg_count,
  char*** out
);
static void ccjs_child_process_free_argv(ccjs_allocator* allocator, char** argv);
static ccjs_status ccjs_child_process_result_init(ccjs_allocator* allocator, ccjs_child_process_result* result);
static void ccjs_child_process_result_dispose(ccjs_allocator* allocator, ccjs_child_process_result* result);
static ccjs_status ccjs_child_process_result_append(
  ccjs_allocator* allocator,
  char** bytes,
  size_t* len,
  size_t* cap,
  const char* chunk,
  size_t chunk_len
);
static ccjs_status ccjs_child_process_spawn_result_object(
  ccjs_allocator* allocator,
  const ccjs_child_process_result* result,
  const ccjs_shape* shape,
  ccjs_value* out
);
static ccjs_status ccjs_child_process_stdout_string(
  ccjs_allocator* allocator,
  const ccjs_child_process_result* result,
  ccjs_value* out
);
static void ccjs_child_process_exec_child(char** argv, const ccjs_child_process_options* options);
static long ccjs_child_process_now_ms(void);
static char* ccjs_child_process_alloc(ccjs_allocator* allocator, size_t len);
static char* ccjs_child_process_copy_nul(ccjs_allocator* allocator, const char* bytes, size_t len);

ccjs_status ccjs_child_process_exec_sync(
  ccjs_allocator* allocator,
  ccjs_value command,
  ccjs_value options,
  ccjs_value* out
) {
  ccjs_child_process_result result;
  ccjs_status status = ccjs_child_process_result_init(allocator, &result);

  if (status == CCJS_OK) {
    status = ccjs_child_process_run_shell(allocator, command, options, &result);
  }

  if (status == CCJS_OK && result.status != 0) {
    status = CCJS_ERR_UNSUPPORTED;
  }

  if (status == CCJS_OK) {
    status = ccjs_child_process_stdout_string(allocator, &result, out);
  }

  ccjs_child_process_result_dispose(allocator, &result);

  return status;
}

ccjs_status ccjs_child_process_exec_file_sync(
  ccjs_allocator* allocator,
  ccjs_value file,
  const ccjs_value* args,
  size_t arg_count,
  ccjs_value options,
  ccjs_value* out
) {
  ccjs_child_process_result result;
  ccjs_status status = ccjs_child_process_result_init(allocator, &result);

  if (status == CCJS_OK) {
    status = ccjs_child_process_run_file(allocator, file, args, arg_count, options, &result);
  }

  if (status == CCJS_OK && result.status != 0) {
    status = CCJS_ERR_UNSUPPORTED;
  }

  if (status == CCJS_OK) {
    status = ccjs_child_process_stdout_string(allocator, &result, out);
  }

  ccjs_child_process_result_dispose(allocator, &result);

  return status;
}

ccjs_status ccjs_child_process_spawn_sync(
  ccjs_allocator* allocator,
  ccjs_value file,
  const ccjs_value* args,
  size_t arg_count,
  ccjs_value options,
  const ccjs_shape* shape,
  ccjs_value* out
) {
  ccjs_child_process_result result;
  ccjs_status status = ccjs_child_process_result_init(allocator, &result);

  if (status == CCJS_OK) {
    status = ccjs_child_process_run_file(allocator, file, args, arg_count, options, &result);
  }

  if (status == CCJS_OK) {
    status = ccjs_child_process_spawn_result_object(allocator, &result, shape, out);
  }

  ccjs_child_process_result_dispose(allocator, &result);

  return status;
}

static ccjs_status ccjs_child_process_string(ccjs_value value, const char** bytes, size_t* len) {
  if (bytes == 0 || len == 0 || value.tag != CCJS_TAG_STRING || value.as.ref == 0) {
    return CCJS_ERR_TYPE;
  }

  ccjs_string* string = (ccjs_string*)value.as.ref;
  *bytes = string->bytes;
  *len = string->len;

  return CCJS_OK;
}

static ccjs_status ccjs_child_process_number(ccjs_value value, long* out) {
  if (out == 0 || value.tag != CCJS_TAG_NUMBER) {
    return CCJS_ERR_TYPE;
  }

  *out = (long)value.as.number;

  return CCJS_OK;
}

static ccjs_status ccjs_child_process_options_init(
  ccjs_allocator* allocator,
  ccjs_value options,
  ccjs_child_process_options* out
) {
  out->ignore_stdio = 0;
  out->has_timeout = 0;
  out->timeout_ms = 0;
  out->cwd_value = ccjs_undefined_value();
  out->cwd = 0;
  out->cwd_len = 0;
  out->cwd_nul = 0;
  out->env_value = ccjs_undefined_value();
  out->envp = 0;
  out->env_count = 0;

  if (options.tag == CCJS_TAG_UNDEFINED || options.tag == CCJS_TAG_NULL) {
    return CCJS_OK;
  }

  if (options.tag != CCJS_TAG_OBJECT || options.as.ref == 0) {
    return CCJS_ERR_TYPE;
  }

  ccjs_value value = ccjs_undefined_value();
  int found = 0;
  ccjs_status status = ccjs_child_process_option_get(options, "cwd", 3, &value, &found);

  if (status != CCJS_OK) {
    return status;
  }

  if (found) {
    status = ccjs_child_process_string(value, &out->cwd, &out->cwd_len);

    if (status != CCJS_OK) {
      ccjs_release(value);
      return status;
    }

    out->cwd_nul = ccjs_child_process_copy_nul(allocator, out->cwd, out->cwd_len);

    if (out->cwd_nul == 0) {
      ccjs_release(value);
      return CCJS_ERR_OOM;
    }

    out->cwd_value = value;
  }

  value = ccjs_undefined_value();
  found = 0;
  status = ccjs_child_process_option_get(options, "stdio", 5, &value, &found);

  if (status != CCJS_OK) {
    return status;
  }

  if (found) {
    const char* bytes = 0;
    size_t len = 0;
    status = ccjs_child_process_string(value, &bytes, &len);

    if (status == CCJS_OK && len == 6 && strncmp(bytes, "ignore", 6) == 0) {
      out->ignore_stdio = 1;
    }

    ccjs_release(value);

    if (status != CCJS_OK) {
      return status;
    }
  }

  value = ccjs_undefined_value();
  found = 0;
  status = ccjs_child_process_option_get(options, "timeout", 7, &value, &found);

  if (status != CCJS_OK) {
    return status;
  }

  if (found) {
    status = ccjs_child_process_number(value, &out->timeout_ms);
    ccjs_release(value);

    if (status != CCJS_OK) {
      return status;
    }

    out->has_timeout = 1;
  }

  value = ccjs_undefined_value();
  found = 0;
  status = ccjs_child_process_option_get(options, "env", 3, &value, &found);

  if (status != CCJS_OK) {
    return status;
  }

  if (found) {
    status = ccjs_child_process_envp_from_object(allocator, value, &out->envp, &out->env_count);

    if (status != CCJS_OK) {
      ccjs_release(value);
      return status;
    }

    out->env_value = value;
  }

  return CCJS_OK;
}

static void ccjs_child_process_options_dispose(ccjs_allocator* allocator, ccjs_child_process_options* options) {
  if (options->cwd_nul != 0) {
    allocator->free(allocator->user, options->cwd_nul, options->cwd_len + 1, _Alignof(char));
  }

  ccjs_release(options->cwd_value);
  ccjs_release(options->env_value);
  ccjs_child_process_envp_free(allocator, options->envp, options->env_count);
}

static ccjs_status ccjs_child_process_option_get(
  ccjs_value options,
  const char* name,
  size_t name_len,
  ccjs_value* out,
  int* found
) {
  *found = 0;
  *out = ccjs_undefined_value();
  ccjs_status status = ccjs_object_get(options, name, name_len, out);

  if (status == CCJS_ERR_FIELD) {
    return CCJS_OK;
  }

  if (status == CCJS_OK) {
    *found = 1;
  }

  return status;
}

static ccjs_status ccjs_child_process_envp_from_object(
  ccjs_allocator* allocator,
  ccjs_value env,
  char*** out,
  size_t* out_count
) {
  if (env.tag != CCJS_TAG_OBJECT || env.as.ref == 0) {
    return CCJS_ERR_TYPE;
  }

  ccjs_object* object = (ccjs_object*)env.as.ref;
  char** envp = allocator->alloc(allocator->user, sizeof(char*) * (object->shape->field_count + 1), _Alignof(char*));

  if (envp == 0) {
    return CCJS_ERR_OOM;
  }

  for (uint32_t index = 0; index <= object->shape->field_count; index += 1) {
    envp[index] = 0;
  }

  for (uint32_t index = 0; index < object->shape->field_count; index += 1) {
    ccjs_value value = ccjs_undefined_value();
    ccjs_status status = ccjs_object_get_known(env, index, &value);

    if (status != CCJS_OK) {
      ccjs_child_process_envp_free(allocator, envp, index);
      return status;
    }

    const char* value_bytes = 0;
    size_t value_len = 0;
    status = ccjs_child_process_string(value, &value_bytes, &value_len);

    if (status != CCJS_OK) {
      ccjs_release(value);
      ccjs_child_process_envp_free(allocator, envp, index);
      return status;
    }

    const char* key = object->shape->fields[index].name == 0 ? "" : object->shape->fields[index].name;
    size_t key_len = strlen(key);
    char* entry = ccjs_child_process_alloc(allocator, key_len + 1 + value_len);

    if (entry == 0) {
      ccjs_release(value);
      ccjs_child_process_envp_free(allocator, envp, index);
      return CCJS_ERR_OOM;
    }

    memcpy(entry, key, key_len);
    entry[key_len] = '=';
    memcpy(entry + key_len + 1, value_bytes, value_len);
    envp[index] = entry;
    ccjs_release(value);
  }

  *out = envp;
  *out_count = object->shape->field_count;

  return CCJS_OK;
}

static void ccjs_child_process_envp_free(ccjs_allocator* allocator, char** envp, size_t count) {
  if (envp == 0) {
    return;
  }

  for (size_t index = 0; index < count; index += 1) {
    if (envp[index] != 0) {
      allocator->free(allocator->user, envp[index], strlen(envp[index]) + 1, _Alignof(char));
    }
  }

  allocator->free(allocator->user, envp, sizeof(char*) * (count + 1), _Alignof(char*));
}

static ccjs_status ccjs_child_process_run_shell(
  ccjs_allocator* allocator,
  ccjs_value command,
  ccjs_value options,
  ccjs_child_process_result* result
) {
  const char* command_bytes = 0;
  size_t command_len = 0;
  ccjs_status status = ccjs_child_process_string(command, &command_bytes, &command_len);

  if (status != CCJS_OK) {
    return status;
  }

  char** argv = allocator->alloc(allocator->user, sizeof(char*) * 4, _Alignof(char*));

  if (argv == 0) {
    return CCJS_ERR_OOM;
  }

  argv[0] = ccjs_child_process_copy_nul(allocator, "/bin/sh", 7);
  argv[1] = ccjs_child_process_copy_nul(allocator, "-c", 2);
  argv[2] = ccjs_child_process_copy_nul(allocator, command_bytes, command_len);
  argv[3] = 0;

  if (argv[0] == 0 || argv[1] == 0 || argv[2] == 0) {
    ccjs_child_process_free_argv(allocator, argv);
    return CCJS_ERR_OOM;
  }

  status = ccjs_child_process_run_argv(allocator, argv, options, result);
  ccjs_child_process_free_argv(allocator, argv);

  return status;
}

static ccjs_status ccjs_child_process_run_file(
  ccjs_allocator* allocator,
  ccjs_value file,
  const ccjs_value* args,
  size_t arg_count,
  ccjs_value options,
  ccjs_child_process_result* result
) {
  char** argv = 0;
  ccjs_status status = ccjs_child_process_build_argv(allocator, file, args, arg_count, &argv);

  if (status != CCJS_OK) {
    return status;
  }

  status = ccjs_child_process_run_argv(allocator, argv, options, result);
  ccjs_child_process_free_argv(allocator, argv);

  return status;
}

static ccjs_status ccjs_child_process_run_argv(
  ccjs_allocator* allocator,
  char** argv,
  ccjs_value options_value,
  ccjs_child_process_result* result
) {
  ccjs_child_process_options options;
  ccjs_status status = ccjs_child_process_options_init(allocator, options_value, &options);

  if (status != CCJS_OK) {
    return status;
  }

  int stdout_pipe[2] = { -1, -1 };
  int stderr_pipe[2] = { -1, -1 };

  if (!options.ignore_stdio && (pipe(stdout_pipe) != 0 || pipe(stderr_pipe) != 0)) {
    ccjs_child_process_options_dispose(allocator, &options);
    return CCJS_ERR_UNSUPPORTED;
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

    ccjs_child_process_options_dispose(allocator, &options);
    return CCJS_ERR_UNSUPPORTED;
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

    ccjs_child_process_exec_child(argv, &options);
  }

  if (!options.ignore_stdio) {
    close(stdout_pipe[1]);
    close(stderr_pipe[1]);
  }

  int stdout_open = !options.ignore_stdio;
  int stderr_open = !options.ignore_stdio;
  int exited = 0;
  int child_status = 0;
  long start = ccjs_child_process_now_ms();
  int timed_out = 0;

  while (stdout_open || stderr_open || !exited) {
    if (!exited) {
      pid_t waited = waitpid(pid, &child_status, WNOHANG);

      if (waited == pid) {
        exited = 1;
      }
    }

    if (!exited && options.has_timeout && options.timeout_ms >= 0 && ccjs_child_process_now_ms() - start >= options.timeout_ms) {
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
      status = CCJS_ERR_UNSUPPORTED;
      break;
    }

    char buffer[4096];

    if (ready > 0 && stdout_open && FD_ISSET(stdout_pipe[0], &readfds)) {
      ssize_t count = read(stdout_pipe[0], buffer, sizeof(buffer));

      if (count > 0) {
        status = ccjs_child_process_result_append(
          allocator, &result->stdout_bytes, &result->stdout_len, &result->stdout_cap, buffer, (size_t)count
        );

        if (status != CCJS_OK) {
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
        status = ccjs_child_process_result_append(
          allocator, &result->stderr_bytes, &result->stderr_len, &result->stderr_cap, buffer, (size_t)count
        );

        if (status != CCJS_OK) {
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

  if (status == CCJS_OK) {
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

  ccjs_child_process_options_dispose(allocator, &options);

  return status;
}

static ccjs_status ccjs_child_process_build_argv(
  ccjs_allocator* allocator,
  ccjs_value file,
  const ccjs_value* args,
  size_t arg_count,
  char*** out
) {
  const char* file_bytes = 0;
  size_t file_len = 0;
  ccjs_status status = ccjs_child_process_string(file, &file_bytes, &file_len);

  if (status != CCJS_OK) {
    return status;
  }

  char** argv = allocator->alloc(allocator->user, sizeof(char*) * (arg_count + 2), _Alignof(char*));

  if (argv == 0) {
    return CCJS_ERR_OOM;
  }

  for (size_t index = 0; index < arg_count + 2; index += 1) {
    argv[index] = 0;
  }

  argv[0] = ccjs_child_process_copy_nul(allocator, file_bytes, file_len);

  if (argv[0] == 0) {
    ccjs_child_process_free_argv(allocator, argv);
    return CCJS_ERR_OOM;
  }

  for (size_t index = 0; index < arg_count; index += 1) {
    const char* arg_bytes = 0;
    size_t arg_len = 0;
    status = ccjs_child_process_string(args[index], &arg_bytes, &arg_len);

    if (status != CCJS_OK) {
      ccjs_child_process_free_argv(allocator, argv);
      return status;
    }

    argv[index + 1] = ccjs_child_process_copy_nul(allocator, arg_bytes, arg_len);

    if (argv[index + 1] == 0) {
      ccjs_child_process_free_argv(allocator, argv);
      return CCJS_ERR_OOM;
    }
  }

  *out = argv;

  return CCJS_OK;
}

static void ccjs_child_process_free_argv(ccjs_allocator* allocator, char** argv) {
  if (argv == 0) {
    return;
  }

  size_t index = 0;

  while (argv[index] != 0) {
    allocator->free(allocator->user, argv[index], strlen(argv[index]) + 1, _Alignof(char));
    index += 1;
  }

  allocator->free(allocator->user, argv, sizeof(char*) * (index + 1), _Alignof(char*));
}

static ccjs_status ccjs_child_process_result_init(ccjs_allocator* allocator, ccjs_child_process_result* result) {
  result->status = 0;
  result->stdout_len = 0;
  result->stdout_cap = 256;
  result->stderr_len = 0;
  result->stderr_cap = 256;
  result->stdout_bytes = ccjs_child_process_alloc(allocator, result->stdout_cap);
  result->stderr_bytes = ccjs_child_process_alloc(allocator, result->stderr_cap);

  if (result->stdout_bytes == 0 || result->stderr_bytes == 0) {
    ccjs_child_process_result_dispose(allocator, result);
    return CCJS_ERR_OOM;
  }

  return CCJS_OK;
}

static void ccjs_child_process_result_dispose(ccjs_allocator* allocator, ccjs_child_process_result* result) {
  if (result->stdout_bytes != 0) {
    allocator->free(allocator->user, result->stdout_bytes, result->stdout_cap + 1, _Alignof(char));
  }

  if (result->stderr_bytes != 0) {
    allocator->free(allocator->user, result->stderr_bytes, result->stderr_cap + 1, _Alignof(char));
  }
}

static ccjs_status ccjs_child_process_result_append(
  ccjs_allocator* allocator,
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

    char* next = allocator->realloc(allocator->user, *bytes, *cap + 1, next_cap + 1, _Alignof(char));

    if (next == 0) {
      return CCJS_ERR_OOM;
    }

    *bytes = next;
    *cap = next_cap;
  }

  memcpy(*bytes + *len, chunk, chunk_len);
  *len += chunk_len;
  (*bytes)[*len] = 0;

  return CCJS_OK;
}

static ccjs_status ccjs_child_process_spawn_result_object(
  ccjs_allocator* allocator,
  const ccjs_child_process_result* result,
  const ccjs_shape* shape,
  ccjs_value* out
) {
  ccjs_value object = ccjs_undefined_value();
  ccjs_status status = ccjs_object_new(allocator, shape, &object);
  ccjs_value stdout_value = ccjs_undefined_value();
  ccjs_value stderr_value = ccjs_undefined_value();

  if (status == CCJS_OK) {
    status = ccjs_object_init_known(object, 0, ccjs_number_value((ccjs_number)result->status));
  }

  if (status == CCJS_OK) {
    status = ccjs_string_from_literal(allocator, result->stdout_bytes, result->stdout_len, &stdout_value);
  }

  if (status == CCJS_OK) {
    status = ccjs_object_init_known(object, 1, stdout_value);
  }

  if (status == CCJS_OK) {
    status = ccjs_string_from_literal(allocator, result->stderr_bytes, result->stderr_len, &stderr_value);
  }

  if (status == CCJS_OK) {
    status = ccjs_object_init_known(object, 2, stderr_value);
  }

  ccjs_release(stdout_value);
  ccjs_release(stderr_value);

  if (status == CCJS_OK) {
    *out = object;
    return CCJS_OK;
  }

  ccjs_release(object);
  *out = ccjs_undefined_value();

  return status;
}

static ccjs_status ccjs_child_process_stdout_string(
  ccjs_allocator* allocator,
  const ccjs_child_process_result* result,
  ccjs_value* out
) {
  return ccjs_string_from_literal(allocator, result->stdout_bytes, result->stdout_len, out);
}

static void ccjs_child_process_exec_child(char** argv, const ccjs_child_process_options* options) {
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

static long ccjs_child_process_now_ms(void) {
  struct timeval value;

  if (gettimeofday(&value, 0) != 0) {
    return 0;
  }

  return (long)value.tv_sec * 1000L + (long)(value.tv_usec / 1000L);
}

static char* ccjs_child_process_alloc(ccjs_allocator* allocator, size_t len) {
  if (allocator == 0 || allocator->alloc == 0) {
    return 0;
  }

  char* bytes = allocator->alloc(allocator->user, len + 1, _Alignof(char));

  if (bytes != 0) {
    bytes[len] = 0;
  }

  return bytes;
}

static char* ccjs_child_process_copy_nul(ccjs_allocator* allocator, const char* bytes, size_t len) {
  char* out = ccjs_child_process_alloc(allocator, len);

  if (out != 0) {
    memcpy(out, bytes, len);
  }

  return out;
}
