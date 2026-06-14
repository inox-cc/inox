cmake_minimum_required(VERSION 3.20)

project(ccjs_c_runtime C)

set(CCJS_LOOP_BACKEND "embedded" CACHE STRING "ccjs C runtime event loop backend")
set_property(CACHE CCJS_LOOP_BACKEND PROPERTY STRINGS embedded libuv)

set(CCJS_RUNTIME_DIR "${CMAKE_CURRENT_LIST_DIR}")
set(CCJS_REPO_ROOT "${CCJS_RUNTIME_DIR}/../..")

set(CCJS_RUNTIME_SOURCES
  "${CCJS_RUNTIME_DIR}/src/arrays/array.c"
  "${CCJS_RUNTIME_DIR}/src/async/promise.c"
  "${CCJS_RUNTIME_DIR}/src/binary/binary.c"
  "${CCJS_RUNTIME_DIR}/src/collections/map.c"
  "${CCJS_RUNTIME_DIR}/src/collections/set.c"
  "${CCJS_RUNTIME_DIR}/src/console/console.c"
  "${CCJS_RUNTIME_DIR}/src/core/allocator.c"
  "${CCJS_RUNTIME_DIR}/src/core/callback.c"
  "${CCJS_RUNTIME_DIR}/src/core/value.c"
  "${CCJS_RUNTIME_DIR}/src/fs/fs.c"
  "${CCJS_RUNTIME_DIR}/src/json/json.c"
  "${CCJS_RUNTIME_DIR}/src/network/dgram.c"
  "${CCJS_RUNTIME_DIR}/src/objects/object.c"
  "${CCJS_RUNTIME_DIR}/src/strings/string.c"
  "${CCJS_RUNTIME_DIR}/src/time/time.c"
)

if(CCJS_LOOP_BACKEND STREQUAL "embedded")
  list(APPEND CCJS_RUNTIME_SOURCES "${CCJS_RUNTIME_DIR}/src/async/loop.c")
elseif(CCJS_LOOP_BACKEND STREQUAL "libuv")
  set(CCJS_LIBUV_DIR "${CCJS_REPO_ROOT}/third_party/libuv")

  if(NOT EXISTS "${CCJS_LIBUV_DIR}/include/uv.h")
    message(FATAL_ERROR "libuv submodule is not initialized. Run `pnpm run bootstrap:libuv` from the repository root.")
  endif()

  set(LIBUV_BUILD_SHARED OFF CACHE BOOL "Build shared libuv" FORCE)
  set(LIBUV_BUILD_TESTS OFF CACHE BOOL "Build libuv tests" FORCE)
  set(LIBUV_BUILD_BENCH OFF CACHE BOOL "Build libuv benchmarks" FORCE)
  add_subdirectory("${CCJS_LIBUV_DIR}" "${CMAKE_CURRENT_BINARY_DIR}/libuv" EXCLUDE_FROM_ALL)

  list(APPEND CCJS_RUNTIME_SOURCES "${CCJS_RUNTIME_DIR}/src/async/loop-libuv.c")
else()
  message(FATAL_ERROR "Unsupported CCJS_LOOP_BACKEND=${CCJS_LOOP_BACKEND}. Expected embedded or libuv.")
endif()

add_library(ccjs_runtime STATIC ${CCJS_RUNTIME_SOURCES})
target_include_directories(ccjs_runtime PUBLIC
  "${CCJS_RUNTIME_DIR}/include"
)

if(CCJS_LOOP_BACKEND STREQUAL "libuv")
  target_link_libraries(ccjs_runtime PUBLIC uv_a)
  target_compile_definitions(ccjs_runtime PUBLIC CCJS_LOOP_BACKEND_LIBUV=1)
else()
  target_compile_definitions(ccjs_runtime PUBLIC CCJS_LOOP_BACKEND_EMBEDDED=1)
endif()
