#include "inox/process.h"

namespace inox {
namespace node_process {

static String string(inox_status (*read)(inox_allocator*, inox_value*)) {
  inox_value value = inox_undefined_value();

  if (read(&inox_default_allocator, &value) != INOX_OK) {
    return String();
  }

  return String(adopt(value));
}

static Value value(inox_status (*read)(inox_allocator*, inox_value*)) {
  inox_value result = inox_undefined_value();

  if (read(&inox_default_allocator, &result) != INOX_OK) {
    return Value();
  }

  return adopt(result);
}

} // namespace node_process
} // namespace inox

process_number_property::process_number_property(int (*read)()) : read_(read) {}

double process_number_property::value() const {
  return read_ == nullptr ? 0 : (double)read_();
}

process_number_property::operator double() const {
  return value();
}

double process_exit_code_property::value() const {
  return (double)inox_process_get_exit_code();
}

process_exit_code_property::operator double() const {
  return value();
}

process_exit_code_property& process_exit_code_property::operator=(int code) {
  inox_process_set_exit_code(code);
  return *this;
}

process_exit_code_property& process_exit_code_property::operator=(double code) {
  inox_process_set_exit_code((int)code);
  return *this;
}

inox::String process_argv::operator[](int index) const {
  inox_value value = inox_undefined_value();

  if (inox_process_argv(&inox_default_allocator, index, &value) != INOX_OK) {
    return inox::String();
  }

  return inox::String(inox::adopt(value));
}

inox::String process_env::get(const char* name, size_t name_len) const {
  inox_value value = inox_undefined_value();

  if (inox_process_env(&inox_default_allocator, name, name_len, &value) != INOX_OK) {
    return inox::String();
  }

  return inox::String(inox::adopt(value));
}

inox::String process_env::get(inox::StringView name) const {
  return get(name.bytes, name.len);
}

void process_versions::init() {
  node = inox::node_process::string(inox_process_versions_node);
}

inox::Value process_versions::value() const {
  return inox::node_process::value(inox_process_versions);
}

void process::init() {
  arch = inox::node_process::string(inox_process_arch);
  argv0 = inox::node_process::string(inox_process_argv0);
  execPath = inox::node_process::string(inox_process_execPath);
  platform = inox::node_process::string(inox_process_platform);
  version = inox::node_process::string(inox_process_version);
  versions.init();
}

inox::String process::cwd() const {
  return inox::node_process::string(inox_process_cwd);
}

void process::exit(int code) const {
  inox_process_exit(code);
}

inox::Value process::hrtime() const {
  return hrtime(inox_undefined_value(), 0);
}

inox::Value process::hrtime(inox_value previous) const {
  return hrtime(previous, 1);
}

inox::Value process::hrtime(const inox::Value& previous) const {
  return hrtime(previous.raw(), 1);
}

inox::Value process::memoryUsage() const {
  return inox::node_process::value(inox_process_memoryUsage);
}

inox::Value process::value() const {
  return inox::node_process::value(inox_process);
}

inox::Value process::hrtime(inox_value previous, int has_previous) const {
  inox_value value = inox_undefined_value();

  if (inox_process_hrtime(&inox_default_allocator, previous, has_previous, &value) != INOX_OK) {
    return inox::Value();
  }

  return inox::adopt(value);
}

int inox::return_code() {
  return inox::return_code(inox_process_get_exit_code());
}

int inox::main(int argc, char** argv, AppMain app_main) {
  inox_process_init(argc, argv);
  ::process.init();
  const int code = run_app(app_main);

  if (code != 0) {
    return return_code(code);
  }

  return return_code();
}

int inox::main(int argc, char** argv, const char* entry_path, AppMain app_main) {
  inox_process_init_with_entry(argc, argv, entry_path);
  ::process.init();
  const int code = run_app(app_main);

  if (code != 0) {
    return return_code(code);
  }

  return return_code();
}
