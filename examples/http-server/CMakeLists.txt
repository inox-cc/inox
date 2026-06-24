cmake_minimum_required(VERSION 3.20)

project(inox_http_server_example C)

set(CMAKE_C_STANDARD 11)
set(CMAKE_C_STANDARD_REQUIRED ON)

find_program(NODE_EXECUTABLE node REQUIRED)

set(INOX_REPO_ROOT "${CMAKE_CURRENT_SOURCE_DIR}/../..")
set(INOX_LOOP_BACKEND "libuv" CACHE STRING "inox C runtime event loop backend")
set_property(CACHE INOX_LOOP_BACKEND PROPERTY STRINGS libuv)

set(INOX_CLI "${INOX_REPO_ROOT}/bin/cli.ts")
set(INOX_ENTRY "${CMAKE_CURRENT_SOURCE_DIR}/index.ts")
set(INOX_GENERATED_DIR "${CMAKE_CURRENT_BINARY_DIR}/generated")
set(INOX_GENERATED_C "${INOX_GENERATED_DIR}/index.c")

add_subdirectory("${INOX_REPO_ROOT}/runtime" "${CMAKE_CURRENT_BINARY_DIR}/inox_runtime")

file(GLOB_RECURSE INOX_COMPILER_SOURCES CONFIGURE_DEPENDS
  "${INOX_REPO_ROOT}/bin/*.ts"
  "${INOX_REPO_ROOT}/compiler/*.ts"
)

add_custom_command(
  OUTPUT "${INOX_GENERATED_C}"
  COMMAND "${NODE_EXECUTABLE}" "${INOX_CLI}" "${INOX_ENTRY}" --emit c --loop-backend "${INOX_LOOP_BACKEND}" -o "${INOX_GENERATED_C}"
  MAIN_DEPENDENCY "${INOX_ENTRY}"
  DEPENDS "${INOX_ENTRY}" ${INOX_COMPILER_SOURCES}
  WORKING_DIRECTORY "${INOX_REPO_ROOT}"
  VERBATIM
)

add_executable(inox_http_server_example "${INOX_GENERATED_C}")
target_link_libraries(inox_http_server_example PRIVATE inox_runtime)
