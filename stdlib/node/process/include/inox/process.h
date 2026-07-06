#ifndef INOX_PROCESS_H
#define INOX_PROCESS_H

#include "inox/value.h"

#ifdef __cplusplus

#include "inox/main.h"
#include "inox/string.h"

enum class process_number_reader {
  argvLength,
  pid
};

class process_number_property {
private:
  process_number_reader read_;

public:
  explicit process_number_property(process_number_reader read);

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
  process_argv();

  process_number_property length;

  inox::String operator[](int index) const;
};

class process_env {
public:
  inox::String get(inox::StringView name) const;
};

class process_versions : public inox::Value {
public:
  inox::String node;

  using inox::Value::operator=;

  void init();
};

class process : public inox::Value {
public:
  process();

  inox::String arch;
  process_argv argv;
  inox::String argv0;
  process_env env;
  inox::String execPath;
  process_exit_code_property exitCode;
  process_number_property pid;
  inox::String platform;
  inox::String version;
  process_versions versions;

  using inox::Value::operator=;

  void init();
  inox::String cwd() const;
  void exit(int code = 0) const;
  inox::Value hrtime() const;
  inox::Value hrtime(inox_value previous) const;
  inox::Value memoryUsage() const;
};

extern process process;

namespace inox {

int return_code();
int main(int argc, char** argv, AppMain app_main);
int main(int argc, char** argv, inox::StringView entry_path, AppMain app_main);

} // namespace inox

#endif

#endif
