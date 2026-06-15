/*
 * hfsql_bridge - A stdin/stdout JSON bridge for HFSQL via iODBC
 * Reads SQL queries from stdin (JSON), executes via iODBC, returns JSON results to stdout.
 *
 * Protocol:
 *   Input:  {"sql": "SELECT ..."}  (one JSON object per line)
 *   Output: {"rows": [...], "columns": [...]} or {"error": "message"}
 *   Special: {"cmd": "quit"} to exit
 *
 * Build: gcc -o hfsql_bridge hfsql_bridge.c -I/usr/include/iodbc -liodbc -liodbcinst
 */
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <sql.h>
#include <sqlext.h>

#define MAX_COLS 256
#define MAX_COL_NAME 256
#define MAX_DATA 65536
/* 64 MB — must fit one line of {"sql":"..."}. Binary uploads embed the
 * blob as a hex literal (x'aabbcc...'), so a 25 MB file produces a ~50 MB
 * SQL line. Buffers of this size live on the heap (see main); 1 MB used to
 * truncate any upload over ~500 KB and produce HFSQL "string without end"
 * errors at the start of the hex literal. */
#define MAX_INPUT (64 * 1024 * 1024)

static SQLHENV henv = SQL_NULL_HENV;
static SQLHDBC hdbc = SQL_NULL_HDBC;

/* Base64 encoding table */
static const char b64_table[] = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";

/* Base64 encode binary data, returns malloc'd string (caller must free) */
static char *base64_encode(const unsigned char *data, size_t len) {
    size_t out_len = 4 * ((len + 2) / 3);
    char *out = malloc(out_len + 1);
    if (!out) return NULL;
    size_t j = 0;
    for (size_t i = 0; i < len; i += 3) {
        unsigned int n = ((unsigned int)data[i]) << 16;
        if (i + 1 < len) n |= ((unsigned int)data[i + 1]) << 8;
        if (i + 2 < len) n |= (unsigned int)data[i + 2];
        out[j++] = b64_table[(n >> 18) & 0x3F];
        out[j++] = b64_table[(n >> 12) & 0x3F];
        out[j++] = (i + 1 < len) ? b64_table[(n >> 6) & 0x3F] : '=';
        out[j++] = (i + 2 < len) ? b64_table[n & 0x3F] : '=';
    }
    out[j] = '\0';
    return out;
}

/* Check if column type is binary */
static int is_binary_type(SQLSMALLINT type) {
    return type == SQL_BINARY || type == SQL_VARBINARY || type == SQL_LONGVARBINARY
        || type == -2 || type == -3 || type == -4;  /* fallback type codes */
}

#define MAX_BLOB (10 * 1024 * 1024)  /* 10 MB max blob */

/* Escape a string for JSON output */
static void json_escape(const char *src, char *dst, size_t dst_size) {
    size_t j = 0;
    for (size_t i = 0; src[i] && j < dst_size - 2; i++) {
        switch (src[i]) {
            case '"':  dst[j++] = '\\'; dst[j++] = '"'; break;
            case '\\': dst[j++] = '\\'; dst[j++] = '\\'; break;
            case '\n': dst[j++] = '\\'; dst[j++] = 'n'; break;
            case '\r': dst[j++] = '\\'; dst[j++] = 'r'; break;
            case '\t': dst[j++] = '\\'; dst[j++] = 't'; break;
            default:
                if ((unsigned char)src[i] < 0x20) {
                    j += snprintf(dst + j, dst_size - j, "\\u%04x", (unsigned char)src[i]);
                } else {
                    dst[j++] = src[i];
                }
        }
    }
    dst[j] = '\0';
}

static void print_error(const char *msg) {
    char escaped[MAX_DATA];
    json_escape(msg, escaped, sizeof(escaped));
    printf("{\"error\":\"%s\"}\n", escaped);
    fflush(stdout);
}

static void print_odbc_error(SQLSMALLINT type, SQLHANDLE handle) {
    SQLCHAR state[6], msg[1024];
    SQLINTEGER native;
    SQLSMALLINT len;
    if (SQLGetDiagRec(type, handle, 1, state, &native, msg, sizeof(msg), &len) == SQL_SUCCESS) {
        char escaped[2048];
        json_escape((char*)msg, escaped, sizeof(escaped));
        printf("{\"error\":\"[%s] %s\"}\n", state, escaped);
    } else {
        printf("{\"error\":\"Unknown ODBC error\"}\n");
    }
    fflush(stdout);
}

static int connect_db(const char *conn_str) {
    SQLRETURN ret;

    ret = SQLAllocHandle(SQL_HANDLE_ENV, SQL_NULL_HANDLE, &henv);
    if (ret != SQL_SUCCESS && ret != SQL_SUCCESS_WITH_INFO) {
        print_error("Failed to allocate environment handle");
        return -1;
    }

    SQLSetEnvAttr(henv, SQL_ATTR_ODBC_VERSION, (void*)SQL_OV_ODBC3, 0);

    ret = SQLAllocHandle(SQL_HANDLE_DBC, henv, &hdbc);
    if (ret != SQL_SUCCESS && ret != SQL_SUCCESS_WITH_INFO) {
        print_error("Failed to allocate connection handle");
        return -1;
    }

    SQLCHAR outstr[1024];
    SQLSMALLINT outlen;
    ret = SQLDriverConnect(hdbc, NULL, (SQLCHAR*)conn_str, SQL_NTS, outstr, sizeof(outstr), &outlen, SQL_DRIVER_NOPROMPT);
    if (ret != SQL_SUCCESS && ret != SQL_SUCCESS_WITH_INFO) {
        print_odbc_error(SQL_HANDLE_DBC, hdbc);
        return -1;
    }

    return 0;
}

/* When b64text is set, text (non-numeric, non-binary) column VALUES are emitted
 * base64-encoded with a "b64t:" prefix instead of raw. HFSQL stores text as
 * Latin-1; the raw path prints those bytes straight into JSON, so any byte > 0x7F
 * (é, °, …) is invalid UTF-8 and Node decodes it to U+FFFD (lossy). The usual fix
 * is CONVERT(col USING 'UTF-8'), but that requires naming the column — impossible
 * for accented column names (prénom, société) on this driver. b64text sidesteps
 * it: the caller base64-decodes then reads the bytes as Latin-1. Default off. */
static void execute_query(const char *sql, int b64text) {
    SQLHSTMT hstmt = SQL_NULL_HSTMT;
    SQLRETURN ret;

    ret = SQLAllocHandle(SQL_HANDLE_STMT, hdbc, &hstmt);
    if (ret != SQL_SUCCESS) {
        print_odbc_error(SQL_HANDLE_DBC, hdbc);
        return;
    }

    ret = SQLExecDirect(hstmt, (SQLCHAR*)sql, SQL_NTS);
    if (ret != SQL_SUCCESS && ret != SQL_SUCCESS_WITH_INFO) {
        print_odbc_error(SQL_HANDLE_STMT, hstmt);
        SQLFreeHandle(SQL_HANDLE_STMT, hstmt);
        return;
    }

    /* Get column info */
    SQLSMALLINT num_cols;
    SQLNumResultCols(hstmt, &num_cols);

    if (num_cols == 0) {
        /* Non-SELECT statement (INSERT/UPDATE/DELETE) */
        SQLLEN row_count;
        SQLRowCount(hstmt, &row_count);
        printf("{\"rows\":[],\"columns\":[],\"rowCount\":%ld}\n", (long)row_count);
        fflush(stdout);
        SQLFreeHandle(SQL_HANDLE_STMT, hstmt);
        return;
    }

    char col_names[MAX_COLS][MAX_COL_NAME];
    SQLSMALLINT col_types[MAX_COLS];

    printf("{\"columns\":[");
    for (int i = 0; i < num_cols && i < MAX_COLS; i++) {
        SQLSMALLINT name_len, data_type, decimal, nullable;
        SQLULEN col_size;
        SQLDescribeCol(hstmt, i + 1, (SQLCHAR*)col_names[i], MAX_COL_NAME, &name_len, &data_type, &col_size, &decimal, &nullable);
        col_types[i] = data_type;
        char escaped[MAX_COL_NAME * 2];
        json_escape(col_names[i], escaped, sizeof(escaped));
        printf("%s\"%s\"", i > 0 ? "," : "", escaped);
    }
    printf("],\"rows\":[");

    /* Fetch rows */
    int row_num = 0;
    char data[MAX_DATA];
    SQLLEN indicator;

    while (SQLFetch(hstmt) == SQL_SUCCESS) {
        if (row_num > 0) printf(",");
        printf("{");

        for (int i = 0; i < num_cols && i < MAX_COLS; i++) {
            if (i > 0) printf(",");

            char escaped_name[MAX_COL_NAME * 2];
            json_escape(col_names[i], escaped_name, sizeof(escaped_name));

            if (is_binary_type(col_types[i])) {
                /* Binary column: fetch as SQL_C_BINARY and output as base64 with "b64:" prefix */
                unsigned char *blob = malloc(MAX_BLOB);
                if (!blob) {
                    printf("\"%s\":null", escaped_name);
                    continue;
                }
                SQLLEN blob_ind;
                ret = SQLGetData(hstmt, i + 1, SQL_C_BINARY, blob, MAX_BLOB, &blob_ind);
                if (blob_ind == SQL_NULL_DATA || ret != SQL_SUCCESS || blob_ind <= 0) {
                    printf("\"%s\":null", escaped_name);
                } else {
                    size_t blob_len = (size_t)blob_ind;
                    if (blob_len > MAX_BLOB) blob_len = MAX_BLOB;
                    /* Skip single null-terminator blobs */
                    if (blob_len == 1 && blob[0] == 0) {
                        printf("\"%s\":null", escaped_name);
                    } else {
                        char *b64 = base64_encode(blob, blob_len);
                        if (b64) {
                            printf("\"%s\":\"b64:%s\"", escaped_name, b64);
                            free(b64);
                        } else {
                            printf("\"%s\":null", escaped_name);
                        }
                    }
                }
                free(blob);
            } else {
                ret = SQLGetData(hstmt, i + 1, SQL_C_CHAR, data, sizeof(data), &indicator);

                if (indicator == SQL_NULL_DATA || ret != SQL_SUCCESS) {
                    printf("\"%s\":null", escaped_name);
                } else if (data[0] == '\0' || (data[0] == '\x00')) {
                    printf("\"%s\":null", escaped_name);
                } else {
                    /* Check if numeric type */
                    if (col_types[i] == SQL_INTEGER || col_types[i] == SQL_SMALLINT ||
                        col_types[i] == SQL_BIGINT || col_types[i] == SQL_TINYINT) {
                        printf("\"%s\":%s", escaped_name, data);
                    } else if (col_types[i] == SQL_FLOAT || col_types[i] == SQL_DOUBLE ||
                               col_types[i] == SQL_DECIMAL || col_types[i] == SQL_NUMERIC || col_types[i] == SQL_REAL) {
                        printf("\"%s\":%s", escaped_name, data);
                    } else if (b64text) {
                        /* Emit raw bytes base64-encoded so the caller can decode
                         * them as Latin-1 losslessly (handles accented values in
                         * columns we can't CONVERT, e.g. prénom/société). */
                        char *b64 = base64_encode((unsigned char*)data, strlen(data));
                        if (b64) {
                            printf("\"%s\":\"b64t:%s\"", escaped_name, b64);
                            free(b64);
                        } else {
                            printf("\"%s\":null", escaped_name);
                        }
                    } else {
                        char escaped_val[MAX_DATA * 2];
                        json_escape(data, escaped_val, sizeof(escaped_val));
                        printf("\"%s\":\"%s\"", escaped_name, escaped_val);
                    }
                }
            }
        }
        printf("}");
        row_num++;
    }

    printf("]}\n");
    fflush(stdout);
    SQLFreeHandle(SQL_HANDLE_STMT, hstmt);
}

/* Simple JSON string extraction - finds "key":"value" and returns value */
static int json_get_string(const char *json, const char *key, char *value, size_t value_size) {
    char search[256];
    snprintf(search, sizeof(search), "\"%s\":\"", key);
    const char *start = strstr(json, search);
    if (!start) {
        /* Try without quotes for cmd */
        snprintf(search, sizeof(search), "\"%s\":\"", key);
        start = strstr(json, search);
        if (!start) return -1;
    }
    start += strlen(search);

    size_t i = 0;
    while (*start && *start != '"' && i < value_size - 1) {
        if (*start == '\\' && *(start + 1)) {
            start++;
            switch (*start) {
                case '"':  value[i++] = '"'; break;
                case '\\': value[i++] = '\\'; break;
                case 'n':  value[i++] = '\n'; break;
                case 'r':  value[i++] = '\r'; break;
                case 't':  value[i++] = '\t'; break;
                default:   value[i++] = *start; break;
            }
        } else {
            value[i++] = *start;
        }
        start++;
    }
    value[i] = '\0';
    return 0;
}

int main(int argc, char *argv[]) {
    if (argc < 2) {
        fprintf(stderr, "Usage: hfsql_bridge <connection_string>\n");
        return 1;
    }

    /* Disable stdout buffering */
    setvbuf(stdout, NULL, _IONBF, 0);

    if (connect_db(argv[1]) != 0) {
        return 1;
    }

    printf("{\"status\":\"connected\"}\n");
    fflush(stdout);

    /* Heap allocation — MAX_INPUT is 64 MB and would blow the stack twice. */
    char *input = malloc(MAX_INPUT);
    char *sql = malloc(MAX_INPUT);
    if (!input || !sql) {
        fprintf(stderr, "hfsql_bridge: malloc failed for input/sql buffers\n");
        free(input);
        free(sql);
        return 1;
    }

    while (fgets(input, MAX_INPUT, stdin)) {
        /* Remove trailing newline */
        size_t len = strlen(input);
        if (len > 0 && input[len - 1] == '\n') input[len - 1] = '\0';
        if (len > 1 && input[len - 2] == '\r') input[len - 2] = '\0';

        if (strlen(input) == 0) continue;

        /* Check for quit command */
        char cmd[64];
        if (json_get_string(input, "cmd", cmd, sizeof(cmd)) == 0) {
            if (strcmp(cmd, "quit") == 0) break;
        }

        /* Get SQL */
        if (json_get_string(input, "sql", sql, MAX_INPUT) != 0) {
            print_error("Missing 'sql' field");
            continue;
        }

        /* Opt-in base64 text mode — only when the line is prefixed exactly with
         * {"b64text":1,  (constructed by the TS wrapper; never inside the SQL). */
        int b64text = (strncmp(input, "{\"b64text\":1", 12) == 0);

        execute_query(sql, b64text);
    }

    free(input);
    free(sql);

    if (hdbc != SQL_NULL_HDBC) {
        SQLDisconnect(hdbc);
        SQLFreeHandle(SQL_HANDLE_DBC, hdbc);
    }
    if (henv != SQL_NULL_HENV) {
        SQLFreeHandle(SQL_HANDLE_ENV, henv);
    }

    return 0;
}
