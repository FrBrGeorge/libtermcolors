#include "termcolors.h"
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <unistd.h>
#include <sys/stat.h>
#include <limits.h>
#include <ctype.h>

/**
 * Helper to join directory and filename.
 * 
 * @param dir  Directory path
 * @param file Filename
 * @return Allocated path string, or NULL on error.
 */
static char *join_path(const char *dir, const char *file) {
    if (!dir || !file) return NULL;
    size_t len = strlen(dir) + strlen(file) + 2;
    char *path = malloc(len);
    if (path) {
        snprintf(path, len, "%s/%s", dir, file);
    }
    return path;
}

/**
 * Detects which file must be used as a colorization scheme according to terminal-colors.d(5).
 * 
 * @param name     Utility name (e.g., "dmesg")
 * @param term     Terminal name (e.g., "xterm"), can be NULL
 * @param filename Output pointer for the allocated filename string
 * @return TERMCOLORS_SUCCESS on success, TERMCOLORS_DISABLED if coloring is disabled, TERMCOLORS_NOT_FOUND if no scheme found.
 */
int colorscheme(char *name, char *term, char **filename) {
    if (!name || !filename) return TERMCOLORS_NOT_FOUND;
    *filename = NULL;

    // 1. Check environment variables (highest priority)
    if (getenv("NO_COLOR")) return TERMCOLORS_DISABLED;

    // 2. Prepare directories to search in priority order
    char *dirs[2] = { NULL, NULL };
    int dir_count = 0;

    // User-specific directory
    char *xdg_config = getenv("XDG_CONFIG_HOME");
    if (xdg_config && xdg_config[0] != '\0') {
        char buf[PATH_MAX];
        snprintf(buf, sizeof(buf), "%s/terminal-colors.d", xdg_config);
        dirs[dir_count++] = strdup(buf);
    } else {
        char *home = getenv("HOME");
        if (home) {
            char buf[PATH_MAX];
            snprintf(buf, sizeof(buf), "%s/.config/terminal-colors.d", home);
            dirs[dir_count++] = strdup(buf);
        }
    }

    // System-wide directory (from --sysconfdir)
#ifndef SYSCONFDIR
#define SYSCONFDIR "/etc"
#endif
    {
        char buf[PATH_MAX];
        snprintf(buf, sizeof(buf), "%s/terminal-colors.d", SYSCONFDIR);
        dirs[dir_count++] = strdup(buf);
    }

    // 3. Search directories
    int result = TERMCOLORS_NOT_FOUND;
    for (int i = 0; i < dir_count; i++) {
        const char *dir = dirs[i];
        struct stat st;
        
        if (result != TERMCOLORS_NOT_FOUND) break;

        // Skip if directory doesn't exist or isn't a directory
        if (stat(dir, &st) != 0 || !S_ISDIR(st.st_mode)) continue;

        enum { M_SCHEME, M_DISABLE, M_ENABLE };
        struct {
            const char *fmt;
            int type;
            int mode; // 0: name+term, 1: name, 2: term, 3: static
        } patterns[] = {
            {"%s@%s.enable",  M_ENABLE,  0},
            {"%s@%s.disable", M_DISABLE, 0},
            {"%s@%s.scheme",  M_SCHEME,  0},
            {"%s.enable",     M_ENABLE,  1},
            {"%s.disable",    M_DISABLE, 1},
            {"%s.scheme",     M_SCHEME,  1},
            {"@%s.enable",    M_ENABLE,  2},
            {"@%s.disable",   M_DISABLE, 2},
            {"@%s.scheme",    M_SCHEME,  2},
            {"disable",       M_DISABLE, 3}
        };

        for (int j = 0; j < 10; j++) {
            char candidate[PATH_MAX];
            int skip = 0;

            switch (patterns[j].mode) {
                case 0:
                    if (term && term[0] != '\0')
                        snprintf(candidate, sizeof(candidate), patterns[j].fmt, name, term);
                    else
                        skip = 1;
                    break;
                case 1:
                    snprintf(candidate, sizeof(candidate), patterns[j].fmt, name);
                    break;
                case 2:
                    if (term && term[0] != '\0')
                        snprintf(candidate, sizeof(candidate), patterns[j].fmt, term);
                    else
                        skip = 1;
                    break;
                case 3:
                    strncpy(candidate, patterns[j].fmt, sizeof(candidate));
                    break;
            }

            if (skip) continue;

            char *p = join_path(dir, candidate);
            if (p) {
                if (access(p, F_OK) == 0) {
                    if (patterns[j].type == M_DISABLE) {
                        free(p);
                        result = TERMCOLORS_DISABLED;
                    } else if (patterns[j].type == M_ENABLE) {
                        free(p);
                        result = TERMCOLORS_SUCCESS;
                    } else {
                        *filename = p;
                        result = TERMCOLORS_SUCCESS;
                    }
                    break;
                }
                free(p);
            }
        }
    }

    for (int i = 0; i < dir_count; i++) free(dirs[i]);
    return result;
}

/**
 * Translates escape sequences in a string according to terminal-colors.d(5).
 * 
 * Supported sequences: \a, \b, \e, \f, \n, \r, \t, \v, \\, \_.
 * Any other character preceded by a backslash is interpreted as that character.
 * 
 * @param sequence Source string
 * @return Allocated translated string, or NULL on error.
 */
char *unquote_escapes(const char *sequence) {
    if (!sequence) return NULL;
    size_t len = strlen(sequence);
    char *dest = malloc(len + 1);
    if (!dest) return NULL;

    char *d = dest;
    const char *s = sequence;

    while (*s) {
        if (*s == '\\') {
            s++;
            if (!*s) break;
            switch (*s) {
                case 'a': *d++ = '\a'; break;
                case 'b': *d++ = '\b'; break;
                case 'e': *d++ = '\033'; break;
                case 'f': *d++ = '\f'; break;
                case 'n': *d++ = '\n'; break;
                case 'r': *d++ = '\r'; break;
                case 't': *d++ = '\t'; break;
                case 'v': *d++ = '\v'; break;
                case '_': *d++ = ' '; break;
                default:  *d++ = *s; break;
            }
            s++;
        } else {
            *d++ = *s++;
        }
    }
    *d = '\0';
    return dest;
}

/**
 * Finds a logical color name in a colorscheme file and returns its raw sequence.
 * 
 * @param filename Path to the colorscheme file
 * @param name     Logical color name (e.g., "header")
 * @param sequence Output pointer for the allocated sequence string
 * @return TERMCOLORS_SUCCESS on success, TERMCOLORS_NOT_FOUND if file not found, TERMCOLORS_UNKNOWN_COLOR if color not defined.
 */
int color_sequence(const char *filename, const char *name, char **sequence) {
    if (!filename || !name || !sequence) return TERMCOLORS_NOT_FOUND;
    *sequence = NULL;

    FILE *f = fopen(filename, "r");
    if (!f) return TERMCOLORS_NOT_FOUND;

    char *line = NULL;
    size_t len = 0;
    ssize_t read;
    int found = 0;

    while ((read = getline(&line, &len, f)) != -1) {
        char *p = line;
        while (isspace(*p)) p++;
        if (*p == '#' || *p == '\0') continue;

        char *name_start = p;
        while (*p && !isspace(*p)) p++;
        
        size_t name_len = p - name_start;
        if (name_len == strlen(name) && strncmp(name_start, name, name_len) == 0) {
            while (isspace(*p)) p++;
            if (*p == '\0') continue;

            char *end = p + strlen(p) - 1;
            while (end > p && isspace(*end)) {
                *end = '\0';
                end--;
            }

            *sequence = strdup(p);
            found = 1;
            break;
        }
    }

    free(line);
    fclose(f);

    if (found) return TERMCOLORS_SUCCESS;
    return TERMCOLORS_UNKNOWN_COLOR;
}

/**
 * Maps a standard color or attribute name to its ANSI escape code.
 * 
 * Supported color names: black, blue, brown, cyan, darkgray, gray, green, 
 * lightblue, lightcyan, lightgray, lightgreen, lightmagenta, lightred, 
 * magenta, red, white, yellow.
 * 
 * Supported attribute names: blink, bold, halfbright, reset, reverse.
 * 
 * @param name Color or attribute name
 * @return ANSI code string (e.g., "31" for red), or NULL if unknown.
 */
static const char *get_color_code(const char *name) {
    // Attributes
    if (strcmp(name, "blink") == 0) return "5";
    if (strcmp(name, "bold") == 0) return "1";
    if (strcmp(name, "halfbright") == 0) return "2";
    if (strcmp(name, "reset") == 0) return "0";
    if (strcmp(name, "reverse") == 0) return "7";

    // Standard colors
    if (strcmp(name, "black") == 0) return "30";
    if (strcmp(name, "red") == 0) return "31";
    if (strcmp(name, "green") == 0) return "32";
    if (strcmp(name, "brown") == 0) return "33";
    if (strcmp(name, "blue") == 0) return "34";
    if (strcmp(name, "magenta") == 0) return "35";
    if (strcmp(name, "cyan") == 0) return "36";
    if (strcmp(name, "gray") == 0) return "37";

    // Bright colors
    if (strcmp(name, "darkgray") == 0) return "1;30";
    if (strcmp(name, "lightred") == 0) return "1;31";
    if (strcmp(name, "lightgreen") == 0) return "1;32";
    if (strcmp(name, "yellow") == 0) return "1;33";
    if (strcmp(name, "lightblue") == 0) return "1;34";
    if (strcmp(name, "lightmagenta") == 0) return "1;35";
    if (strcmp(name, "lightcyan") == 0) return "1;36";
    if (strcmp(name, "lightgray") == 0) return "1;37";
    if (strcmp(name, "white") == 0) return "1;37";
    
    return NULL;
}

// TODO: write curses_color() function that calculates color sequence for non-ansi terminals.

/**
 * Checks if a string is a valid ANSI color sequence (digits and semicolons).
 * 
 * @param s String to check
 * @return 1 if it's an ANSI sequence, 0 otherwise.
 */
static int is_ansi_sequence(const char *s) {
    if (!*s) return 0;
    while (*s) {
        if (!isdigit(*s) && *s != ';') return 0;
        s++;
    }
    return 1;
}

/**
 * Converts a raw color string (color name, ANSI sequence, or raw escape) to an ANSI escape sequence.
 * 
 * @param raw      Raw color string
 * @param sequence Output pointer for the allocated sequence string
 * @return TERMCOLORS_SUCCESS on success, TERMCOLORS_NOT_FOUND on error.
 */
int ansi_sequence(const char *raw, char **sequence) {
    if (!raw || !sequence) return TERMCOLORS_NOT_FOUND;
    *sequence = NULL;

    const char *code = get_color_code(raw);
    if (code) {
        size_t len = strlen(code) + 5; // \033[ + code + m + \0
        *sequence = malloc(len);
        if (*sequence) snprintf(*sequence, len, "\033[%sm", code);
        return *sequence ? TERMCOLORS_SUCCESS : TERMCOLORS_NOT_FOUND;
    }

    if (is_ansi_sequence(raw)) {
        size_t len = strlen(raw) + 5;
        *sequence = malloc(len);
        if (*sequence) snprintf(*sequence, len, "\033[%sm", raw);
        return *sequence ? TERMCOLORS_SUCCESS : TERMCOLORS_NOT_FOUND;
    }

    // Treated as raw escape
    *sequence = unquote_escapes(raw);
    return *sequence ? TERMCOLORS_SUCCESS : TERMCOLORS_NOT_FOUND;
}

/**
 * Finds a logical color name in a colorscheme file and returns its color sequence.
 * 
 * @param filename  Path to the colorscheme file
 * @param name      Logical color name (e.g., "header")
 * @param converter Function to convert raw sequence to terminal-specific sequence
 * @param sequence  Output pointer for the allocated sequence string
 * @return TERMCOLORS_SUCCESS on success, TERMCOLORS_NOT_FOUND if file not found, TERMCOLORS_UNKNOWN_COLOR if color not defined.
 */
int get_color(const char *filename, const char *name, int (*converter)(const char *, char **), char **sequence) {
    char *raw = NULL;
    int res = color_sequence(filename, name, &raw);
    if (res != TERMCOLORS_SUCCESS) return res;

    res = converter(raw, sequence);
    free(raw);
    return res;
}
