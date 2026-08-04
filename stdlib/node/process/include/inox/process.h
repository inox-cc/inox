#ifndef INOX_PROCESS_H
#define INOX_PROCESS_H

#include "inox/value.h"

#ifdef __cplusplus

#include "inox/array.h"
#include "inox/string.h"

namespace inox {

int process_main(int argc, char** argv, void (*app_main)(void));
int process_main(int argc, char** argv, StringView entry_path, void (*app_main)(void));

} // namespace inox

enum class process_number_reader {
  argvLength,
  pid
};

class process_number_property {
private:
  process_number_reader read_;

public:
  explicit process_number_property(process_number_reader read);

  operator double() const;
};

class process_exit_code_property {
public:
  operator double() const;
  process_exit_code_property& operator=(int code);
  process_exit_code_property& operator=(double code);
};

class ProcessArgv {
public:
  ProcessArgv();

  process_number_property length;

  inox::String operator[](int index) const;
};

class ProcessEnv {
public:
  inox::Value operator[](inox::StringView name) const;
};

class ProcessVersions : public inox::Value {
private:
  void init();
  friend class Process;

public:
  inox::String inoxVersion;
};

class ProcessMemoryUsage : public inox::Value {
public:
  ProcessMemoryUsage();

  double rss;
  double heapTotal;
  double heapUsed;
  double external;
  double arrayBuffers;
};

class Process : public inox::Value {
private:
  void init();
  friend int inox::process_main(int argc, char** argv, void (*app_main)(void));
  friend int inox::process_main(int argc, char** argv, inox::StringView entry_path, void (*app_main)(void));

public:
  Process();

  inox::String arch;
  ProcessArgv argv;
  inox::String argv0;
  ProcessEnv env;
  inox::String execPath;
  process_exit_code_property exitCode;
  process_number_property pid;
  inox::String platform;
  inox::String version;
  ProcessVersions versions;

  inox::String cwd() const;
  void exit(int code = 0) const;
  Array hrtime() const;
  Array hrtime(const inox::Value& previous) const;
  ProcessMemoryUsage memoryUsage() const;
};

extern Process process;

#endif

#endif
