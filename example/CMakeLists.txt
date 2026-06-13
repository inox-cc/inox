cmake_minimum_required(VERSION 3.20)

project(ccjs_cmake_example C)

set(CMAKE_C_STANDARD 11)
set(CMAKE_C_STANDARD_REQUIRED ON)

find_program(NODE_EXECUTABLE node REQUIRED)

set(CCJS_CLI "../bin/ccjs.ts")
set(CCJS_RUNTIME_DIR "../runtime/c")
set(CCJS_ENTRY "src/index.ts")
set(CCJS_GENERATED_C "${CMAKE_CURRENT_BINARY_DIR}/generated/index.c")

file(GLOB_RECURSE CCJS_TS_SOURCES CONFIGURE_DEPENDS
  "src/*.ts"
)

set(CCJS_RUNTIME_SOURCES
  "${CCJS_RUNTIME_DIR}/src/arrays/array.c"
  "${CCJS_RUNTIME_DIR}/src/async/loop.c"
  "${CCJS_RUNTIME_DIR}/src/async/promise.c"
  "${CCJS_RUNTIME_DIR}/src/binary/binary.c"
  "${CCJS_RUNTIME_DIR}/src/collections/map.c"
  "${CCJS_RUNTIME_DIR}/src/collections/set.c"
  "${CCJS_RUNTIME_DIR}/src/core/allocator.c"
  "${CCJS_RUNTIME_DIR}/src/core/callback.c"
  "${CCJS_RUNTIME_DIR}/src/core/value.c"
  "${CCJS_RUNTIME_DIR}/src/fs/fs.c"
  "${CCJS_RUNTIME_DIR}/src/json/json.c"
  "${CCJS_RUNTIME_DIR}/src/objects/object.c"
  "${CCJS_RUNTIME_DIR}/src/strings/string.c"
  "${CCJS_RUNTIME_DIR}/src/time/time.c"
)

add_library(ccjs_runtime STATIC ${CCJS_RUNTIME_SOURCES})
target_include_directories(ccjs_runtime PUBLIC
  "${CCJS_RUNTIME_DIR}/include"
)

add_custom_command(
  OUTPUT "${CCJS_GENERATED_C}"
  COMMAND "${NODE_EXECUTABLE}" "${CCJS_CLI}" "${CCJS_ENTRY}" --emit c -o "${CCJS_GENERATED_C}"
  MAIN_DEPENDENCY "${CCJS_ENTRY}"
  DEPENDS ${CCJS_TS_SOURCES}
  WORKING_DIRECTORY "${CMAKE_CURRENT_SOURCE_DIR}"
  VERBATIM
)

add_executable(ccjs_cmake_example "${CCJS_GENERATED_C}")
target_link_libraries(ccjs_cmake_example PRIVATE ccjs_runtime)

