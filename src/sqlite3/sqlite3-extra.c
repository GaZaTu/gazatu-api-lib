#include <stdbool.h>
#include <stdlib.h>
#include <stdint.h>
#include <string.h>
#include "sqlite3.h"

#define _EXPORT __attribute__((__visibility__("default")))

typedef struct _env_var_t {
  int64_t value_len;
  char* value;
  int64_t name_len;
  char* name;
  bool in_use;
} env_var_t;
typedef struct _env_t {
  env_var_t vars[16];
  sqlite3* db;
} env_t;
static env_t _ENV[16] = {0};
static uint8_t _ENV_SIZE = sizeof(_ENV) / sizeof(env_t);
static uint8_t _ENV_VARS_SIZE = sizeof(_ENV[0].vars) / sizeof(env_var_t);

static void env_set_for_db(sqlite3* db) {
  for (uint8_t i = 0; i < _ENV_SIZE; i++) {
    if (_ENV[i].db != NULL) {
      continue;
    }
    _ENV[i].db = db;
    break;
  }
}

static env_t* env_get_by_db(sqlite3* db) {
  for (uint8_t i = 0; i < _ENV_SIZE; i++) {
    if (_ENV[i].db != db) {
      continue;
    }
    return &_ENV[i];
  }
  return NULL;
}

static int8_t env_indexof(env_t* env, const char* name, int64_t name_len) {
  for (uint8_t i = 0; i < _ENV_VARS_SIZE; i++) {
    env_var_t* var = &env->vars[i];
    if (!var->in_use) {
      continue;
    }
    if (var->name_len != name_len) {
      continue;
    }
    if (strncmp(var->name, name, name_len) == 0) {
      return i;
    }
  }
  return -1;
}

_EXPORT
env_var_t* sqlite3_getenv_impl(sqlite3* db, const char* name, int64_t name_len) {
  env_t* env = env_get_by_db(db);
  if (!env) {
    return NULL;
  }
  int8_t index = env_indexof(env, name, name_len);
  if (index < 0) {
    return NULL;
  }
  return &env->vars[index];
}

_EXPORT
void sqlite3_setenv_impl(sqlite3* db, const char* name, int64_t name_len, const char* value, int64_t value_len) {
  env_t* env = env_get_by_db(db);
  if (!env) {
    return;
  }
  int8_t index = env_indexof(env, name, name_len);
  bool found = index != -1;
  if (index == -1) {
    for (uint8_t i = 0; i < _ENV_VARS_SIZE; i++) {
      if (!env->vars[i].in_use) {
        index = i;
        break;
      }
    }
  }
  if (index == -1) {
    // too many env vars
    return;
  }

  env_var_t* var = &env->vars[index];

  if (found) {
    free(var->name);
    free(var->value);
  }

  if (!value) {
    var->in_use = false;
    return;
  }

  var->name = malloc(name_len);
  var->name_len = name_len;
  memcpy(var->name, name, name_len);
  var->value = malloc(value_len);
  var->value_len = value_len;
  memcpy(var->value, value, value_len);
  var->in_use = true;
}

static void sqlite3_getenv(sqlite3_context* ctx, int argc, sqlite3_value** args) {
  const char* name = (const char*)sqlite3_value_text(args[0]);
  int32_t name_len = sqlite3_value_bytes(args[0]);

  env_var_t* env_var = sqlite3_getenv_impl(sqlite3_context_db_handle(ctx), name, name_len);
  if (env_var) {
    sqlite3_result_text(ctx, env_var->value, env_var->value_len, SQLITE_STATIC);
  } else {
    sqlite3_result_null(ctx);
  }
}

static void sqlite3_setenv(sqlite3_context* ctx, int argc, sqlite3_value** args) {
  const char* name = (const char*)sqlite3_value_text(args[0]);
  int32_t name_len = sqlite3_value_bytes(args[0]);
  const char* value = (const char*)sqlite3_value_text(args[0]);
  int32_t value_len = sqlite3_value_bytes(args[0]);

  sqlite3_setenv_impl(sqlite3_context_db_handle(ctx), name, name_len, value, value_len);
}

_EXPORT
void sqlite3_register_env(sqlite3* db) {
  env_set_for_db(db);

  sqlite3_create_function(db, "getenv", 1, SQLITE_UTF8, NULL, sqlite3_getenv, NULL, NULL);
  sqlite3_create_function(db, "setenv", 2, SQLITE_UTF8, NULL, sqlite3_setenv, NULL, NULL);
}

typedef struct _updates_t {
  int16_t len;
  struct {
    int32_t name_len;
    const char* name;
  } tables[32];
  sqlite3* db;
} updates_t;
static updates_t _UPDATES[16] = {0};
static uint8_t _UPDATES_SIZE = sizeof(_UPDATES) / sizeof(updates_t);

static void updates_set_for_db(sqlite3* db) {
  for (uint8_t i = 0; i < _UPDATES_SIZE; i++) {
    if (_UPDATES[i].db != NULL) {
      continue;
    }
    _UPDATES[i].db = db;
    break;
  }
}

static updates_t* updates_get_by_db(sqlite3* db) {
  for (uint8_t i = 0; i < _UPDATES_SIZE; i++) {
    if (_UPDATES[i].db == NULL) {
      break;
    }
    if (_UPDATES[i].db != db) {
      continue;
    }
    return &_UPDATES[i];
  }
  return NULL;
}

static void handle_sqlite3_update(void* _db, int op, const char* _, const char* tbl, sqlite3_int64 rowid) {
  int tbl_len = strlen(tbl);

  updates_t* updates = updates_get_by_db((sqlite3*)_db);

  for (uint8_t i = 0; i < updates->len; i++) {
    if (updates->tables[i].name_len != tbl_len) {
      continue;
    }
    if (strncmp(updates->tables[i].name, tbl, tbl_len) == 0) {
      return;
    }
  }

  updates->tables[updates->len].name = tbl;
  updates->tables[updates->len].name_len = tbl_len;
  updates->len += 1;
}

_EXPORT
void sqlite3_start_collecting_updated_tables(sqlite3* db) {
  updates_set_for_db(db);

  sqlite3_update_hook(db, handle_sqlite3_update, db);
}

#define ENCODE_VALUE(DATA, DATA_LEN, TYPE, VALUE)\
  *((TYPE*)&DATA[DATA_LEN]) = VALUE;\
  DATA_LEN += sizeof(TYPE);

#define ENCODE_BYTES(DATA, DATA_LEN, SOURCE, SOURCE_LEN)\
  ENCODE_VALUE(DATA, DATA_LEN, int32_t, SOURCE_LEN)\
  memcpy(&DATA[DATA_LEN], SOURCE, SOURCE_LEN);\
  DATA_LEN += SOURCE_LEN;

#define DECODE_VALUE(DATA, DATA_IDX, TYPE, NAME)\
  TYPE NAME = *((TYPE*)&DATA[DATA_IDX]);\
  DATA_IDX += sizeof(TYPE);

#define DECODE_BYTES(DATA, DATA_IDX, NAME, BYTES_LEN)\
  DECODE_VALUE(DATA, DATA_IDX, int32_t, BYTES_LEN)\
  typeof(DATA) NAME = &DATA[DATA_IDX];\
  DATA_IDX += BYTES_LEN;

#define DECODE_VALUE_INTO(DATA, DATA_IDX, NAME)\
  NAME = *((typeof(NAME)*)&DATA[DATA_IDX]);\
  DATA_IDX += sizeof(typeof(NAME));

/*
  ##RESULT FORMAT:
  i64 changes
  i16 updates_count
  (i32 table_len + char* table) * updates_count
  i16 column_count
  (i32 column_len + char* column) * column_count
  i16 row_count
  ((i8 scalar type + scalar) || (i8 binary type + i32 binary_len + binary)) * row_count
*/
_EXPORT
int32_t sqlite3_step_all(sqlite3_stmt* stmt, const uint8_t* args, uint8_t* result, uint32_t* result_size) {
  uint32_t result_capacity = *result_size;
  uint32_t length = 0;

  int args_idx = 0;
  DECODE_VALUE(args, args_idx, int16_t, argc);
  for (int i = 1; i <= argc; i++) {
    DECODE_VALUE(args, args_idx, int8_t, type);

    int32_t bloblen = 0;

    switch (type) {
    case SQLITE_NULL:
      sqlite3_bind_null(stmt, i);
      break;
    case SQLITE_INTEGER:
      sqlite3_bind_int64(stmt, i, *((int64_t*)&args[args_idx]));
      args_idx += sizeof(int64_t);
      break;
    case SQLITE_FLOAT:
      sqlite3_bind_double(stmt, i, *((double*)&args[args_idx]));
      args_idx += sizeof(double);
      break;
    case SQLITE_TEXT:
      DECODE_VALUE_INTO(args, args_idx, bloblen);
      sqlite3_bind_text(stmt, i, (const char*)&args[args_idx], bloblen, SQLITE_STATIC);
      args_idx += bloblen;
      break;
    case SQLITE_BLOB:
      DECODE_VALUE_INTO(args, args_idx, bloblen);
      sqlite3_bind_blob(stmt, i, (const void*)&args[args_idx], bloblen, SQLITE_STATIC);
      args_idx += bloblen;
      break;
    }
  }

  sqlite3* db = sqlite3_db_handle(stmt);

  updates_t* updates = updates_get_by_db(db);
  updates->len = 0;

  int status = sqlite3_step(stmt);

  ENCODE_VALUE(result, length, int64_t, sqlite3_changes64(db));

  ENCODE_VALUE(result, length, int16_t, updates->len);
  for (int i = 0; i < updates->len; i++) {
    ENCODE_BYTES(result, length, updates->tables[i].name, updates->tables[i].name_len);
  }

  int col_count = sqlite3_column_count(stmt);
  ENCODE_VALUE(result, length, int16_t, col_count);
  for (int i = 0; i < col_count; i++) {
    const char* name = sqlite3_column_name(stmt, i);
    int name_len = strlen(name);

    ENCODE_BYTES(result, length, name, name_len);
  }

  int16_t* row_count = ((int16_t*)&result[length]);
  length += sizeof(int16_t);
  *row_count = 0;
  while (status == SQLITE_ROW) {
    for (int i = 0; i < col_count; i++) {
      int type = sqlite3_column_type(stmt, i);

      ENCODE_VALUE(result, length, int8_t, (int8_t)type);

      int32_t bloblen = 0;

      switch (type) {
      case SQLITE_NULL:
        // type already encoded
        break;
      case SQLITE_INTEGER:
        ENCODE_VALUE(result, length, int64_t, sqlite3_column_int64(stmt, i));
        break;
      case SQLITE_FLOAT:
        ENCODE_VALUE(result, length, double, sqlite3_column_double(stmt, i));
        break;
      case SQLITE_TEXT:
        bloblen = sqlite3_column_bytes(stmt, i);
        ENCODE_BYTES(result, length, sqlite3_column_text(stmt, i), bloblen);
        break;
      case SQLITE_BLOB:
        bloblen = sqlite3_column_bytes(stmt, i);
        ENCODE_BYTES(result, length, sqlite3_column_blob(stmt, i), bloblen);
        break;
      }
    }

    *row_count += 1;
    status = sqlite3_step(stmt);
  }

  sqlite3_reset(stmt);
  if (argc > 0) {
    sqlite3_clear_bindings(stmt);
  }

  *result_size = length;
  return status;
}
