import React, { useState } from 'react';
import { FileCode, BookOpen, Terminal, CheckCircle2, AlertCircle, Info, Settings, FileText } from 'lucide-react';
import { motion } from 'motion/react';

const C_CODE = `#include "termcolors.h"
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <unistd.h>
#include <sys/stat.h>
#include <limits.h>
#include <ctype.h>
#include <stdarg.h>

static void debug_print(const char *fmt, ...) {
    static int debug = -1;
    if (debug == -1) {
        char *env = getenv("TERMINAL_COLORS_DEBUG");
        debug = (env && strcmp(env, "all") == 0) ? 1 : 0;
    }
    if (debug) {
        va_list args;
        va_start(args, fmt);
        fprintf(stderr, "libtermcolors: ");
        vfprintf(stderr, fmt, args);
        fprintf(stderr, "\\n");
        va_end(args);
    }
}

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
    if (getenv("NO_COLOR")) {
        debug_print("NO_COLOR environment variable found, disabling colorization");
        return TERMCOLORS_DISABLED;
    }

    // 2. Prepare directories to search in priority order
    char *dirs[2] = { NULL, NULL };
    int dir_count = 0;

    // User-specific directory
    char *xdg_config = getenv("XDG_CONFIG_HOME");
    if (xdg_config && xdg_config[0] != '\\0') {
        char buf[PATH_MAX];
        snprintf(buf, sizeof(buf), "%s/terminal-colors.d", xdg_config);
        dirs[dir_count++] = strdup(buf);
        debug_print("Adding XDG_CONFIG_HOME directory: %s", buf);
    } else {
        char *home = getenv("HOME");
        if (home) {
            char buf[PATH_MAX];
            snprintf(buf, sizeof(buf), "%s/.config/terminal-colors.d", home);
            dirs[dir_count++] = strdup(buf);
            debug_print("Adding HOME directory: %s", buf);
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
        debug_print("Adding system-wide directory: %s", buf);
    }

    // 3. Search directories
    int result = TERMCOLORS_NOT_FOUND;
    for (int i = 0; i < dir_count; i++) {
        const char *dir = dirs[i];
        struct stat st;
        
        if (result != TERMCOLORS_NOT_FOUND) break;

        // Skip if directory doesn't exist or isn't a directory
        if (stat(dir, &st) != 0 || !S_ISDIR(st.st_mode)) {
            debug_print("Directory %s not found or not a directory", dir);
            continue;
        }

        debug_print("Searching in directory: %s", dir);

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
                    if (term && term[0] != '\\0')
                        snprintf(candidate, sizeof(candidate), patterns[j].fmt, name, term);
                    else
                        skip = 1;
                    break;
                case 1:
                    snprintf(candidate, sizeof(candidate), patterns[j].fmt, name);
                    break;
                case 2:
                    if (term && term[0] != '\\0')
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
                debug_print("Checking candidate file: %s", p);
                if (access(p, F_OK) == 0) {
                    debug_print("Found candidate file: %s", p);
                    if (patterns[j].type == M_DISABLE) {
                        debug_print("Colorization disabled by %s", p);
                        free(p);
                        result = TERMCOLORS_DISABLED;
                    } else if (patterns[j].type == M_ENABLE) {
                        debug_print("Colorization explicitly enabled by %s", p);
                        free(p);
                        result = TERMCOLORS_SUCCESS;
                    } else {
                        debug_print("Using colorscheme from %s", p);
                        *filename = p;
                        result = TERMCOLORS_SUCCESS;
                    }
                    break;
                }
                free(p);
            }
        }
    }

    for (int i = 0; i < dir_count; i++) if (dirs[i]) free(dirs[i]);
    return result;
}

/**
 * Translates escape sequences in a string according to terminal-colors.d(5).
 * 
 * Supported sequences: \\a, \\b, \\e, \\f, \\n, \\r, \\t, \\v, \\\\, \\_.
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
        if (*s == '\\\\') {
            s++;
            if (!*s) break;
            switch (*s) {
                case 'a': *d++ = '\\a'; break;
                case 'b': *d++ = '\\b'; break;
                case 'e': *d++ = '\\033'; break;
                case 'f': *d++ = '\\f'; break;
                case 'n': *d++ = '\\n'; break;
                case 'r': *d++ = '\\r'; break;
                case 't': *d++ = '\\t'; break;
                case 'v': *d++ = '\\v'; break;
                case '_': *d++ = ' '; break;
                default:  *d++ = *s; break;
            }
            s++;
        } else {
            *d++ = *s++;
        }
    }
    *d = '\\0';
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
        if (*p == '#' || *p == '\\0') continue;

        char *name_start = p;
        while (*p && !isspace(*p)) p++;
        
        size_t name_len = p - name_start;
        if (name_len == strlen(name) && strncmp(name_start, name, name_len) == 0) {
            while (isspace(*p)) p++;
            if (*p == '\\0') continue;

            char *end = p + strlen(p) - 1;
            while (end > p && isspace(*end)) {
                *end = '\\0';
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
    debug_print("Requesting color '%s' from colorscheme %s", name, filename);
    int res = color_sequence(filename, name, &raw);
    if (res != TERMCOLORS_SUCCESS) {
        debug_print("Color '%s' not found in colorscheme %s", name, filename);
        return res;
    }

    res = converter(raw, sequence);
    free(raw);
    return res;
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

    debug_print("Converting raw sequence: %s", raw);

    const char *code = get_color_code(raw);
    if (code) {
        size_t len = strlen(code) + 5; // \\033[ + code + m + \\0
        *sequence = malloc(len);
        if (*sequence) snprintf(*sequence, len, "\\033[%sm", code);
        debug_print("Converted to ANSI sequence via color name: %s", *sequence);
        return *sequence ? TERMCOLORS_SUCCESS : TERMCOLORS_NOT_FOUND;
    }

    if (is_ansi_sequence(raw)) {
        size_t len = strlen(raw) + 5;
        *sequence = malloc(len);
        if (*sequence) snprintf(*sequence, len, "\\033[%sm", raw);
        debug_print("Converted to ANSI sequence via raw code: %s", *sequence);
        return *sequence ? TERMCOLORS_SUCCESS : TERMCOLORS_NOT_FOUND;
    }

    // Treated as raw escape
    *sequence = unquote_escapes(raw);
    debug_print("Converted to raw escape sequence: %s", *sequence);
    return *sequence ? TERMCOLORS_SUCCESS : TERMCOLORS_NOT_FOUND;
}

/**
 * Finds a logical color name in a colorscheme file and returns its ANSI escape sequence.
 * 
 * @param filename Path to the colorscheme file
 * @param name     Logical color name (e.g., "header")
 * @param sequence Output pointer for the allocated sequence string
 * @return TERMCOLORS_SUCCESS on success, TERMCOLORS_NOT_FOUND if file not found, TERMCOLORS_UNKNOWN_COLOR if color not defined.
 */
int ansi_color(const char *filename, const char *name, char **sequence) {
    char *raw = NULL;
    int res = color_sequence(filename, name, &raw);
    if (res != TERMCOLORS_SUCCESS) return res;

    res = ansi_sequence(raw, sequence);
    free(raw);
    return res;
}
`;

const H_CODE = `#ifndef TERMCOLORS_H
#define TERMCOLORS_H

#ifdef HAVE_CONFIG_H
#include <config.h>
#endif

/**
 * Error codes for colorscheme function.
 */
#define TERMCOLORS_SUCCESS 0
#define TERMCOLORS_DISABLED 1
#define TERMCOLORS_NOT_FOUND 2
#define TERMCOLORS_UNKNOWN_COLOR 3

/**
 * Detects which file must be used as a colorization scheme according to terminal-colors.d(5).
 * 
 * On success the function allocates space for the file name found in \`filename\` 
 * and returns TERMCOLORS_SUCCESS. 
 * 
 * If an error is encountered or coloring is disabled, it sets \`filename\` to NULL.
 * 
 * @param name     Utility name (e.g., "dmesg")
 * @param term     Terminal name (e.g., "xterm"), can be NULL
 * @param filename Output pointer for the allocated filename string
 * @return TERMCOLORS_SUCCESS on success, 
 *         TERMCOLORS_DISABLED if coloring is disabled, 
 *         TERMCOLORS_NOT_FOUND if no appropriate scheme is found.
 */
int colorscheme(char *name, char *term, char **filename);

/**
 * Translates escape sequences in a string according to terminal-colors.d(5).
 * 
 * Supported sequences: \\a, \\b, \\e, \\f, \\n, \\r, \\t, \\v, \\\\, \\_.
 * Any other character preceded by a backslash is interpreted as that character.
 * 
 * @param sequence Source string
 * @return Allocated translated string, or NULL on error.
 */
char *unquote_escapes(const char *sequence);

/**
 * Finds a logical color name in a colorscheme file and returns its raw sequence.
 * 
 * On success the function allocates space for the sequence found in \`sequence\`
 * and returns TERMCOLORS_SUCCESS.
 * 
 * If an error is encountered, it sets \`sequence\` to NULL.
 * 
 * @param filename Path to the colorscheme file
 * @param name     Logical color name (e.g., "header")
 * @param sequence Output pointer for the allocated sequence string
 * @return TERMCOLORS_SUCCESS on success,
 *         TERMCOLORS_NOT_FOUND if the file is not found,
 *         TERMCOLORS_UNKNOWN_COLOR if the color name is not defined.
 */
int color_sequence(const char *filename, const char *name, char **sequence);

/**
 * Finds a logical color name in a colorscheme file and returns its color sequence.
 * 
 * This function finds the raw sequence for a logical color name and converts it
 * using the provided converter function.
 * 
 * @param filename  Path to the colorscheme file
 * @param name      Logical color name (e.g., "header")
 * @param converter Function to convert raw sequence to terminal-specific sequence
 * @param sequence  Output pointer for the allocated sequence string
 * @return TERMCOLORS_SUCCESS on success,
 *         TERMCOLORS_NOT_FOUND if the file is not found,
 *         TERMCOLORS_UNKNOWN_COLOR if the color name is not defined.
 */
int get_color(const char *filename, const char *name, int (*converter)(const char *, char **), char **sequence);

/**
 * Backward compatibility macro for ANSI terminals.
 */
#define ansi_color(f, n, s) get_color(f, n, ansi_sequence, s)

/**
 * Converts a raw color string (color name, ANSI sequence, or raw escape) to an ANSI escape sequence.
 * 
 * @param raw      Raw color string
 * @param sequence Output pointer for the allocated sequence string
 * @return TERMCOLORS_SUCCESS on success, TERMCOLORS_NOT_FOUND on error.
 */
int ansi_sequence(const char *raw, char **sequence);

#endif /* TERMCOLORS_H */`;

const CONFIGURE_AC = `AC_PREREQ([2.69])
AC_INIT([libtermcolors], [1.0.0], [frbrgeorge@gmail.com])
AC_CONFIG_SRCDIR([src/termcolors.c])
AC_CONFIG_HEADERS([config.h])
AC_CONFIG_MACRO_DIR([m4])

AM_INIT_AUTOMAKE([foreign -Wall -Werror])
LT_INIT

# Checks for programs.
AC_PROG_CC
AM_PROG_AR

# Checks for libraries.

# Checks for header files.
AC_CHECK_HEADERS([stdlib.h string.h unistd.h sys/stat.h])

# Checks for typedefs, structures, and compiler characteristics.
AC_TYPE_SIZE_T

# Checks for library functions.
AC_FUNC_MALLOC
AC_CHECK_FUNCS([getenv strdup strtok_r snprintf stat access])

AC_CONFIG_FILES([Makefile
                 src/Makefile
                 tests/Makefile
                 src/libtermcolors.pc])
AC_OUTPUT`;

const MAKEFILE_AM = `ACLOCAL_AMFLAGS = -I m4
SUBDIRS = src tests`;

const TESTS_MAKEFILE_AM = `check_PROGRAMS = test_termcolors example
test_termcolors_SOURCES = test_termcolors.c
test_termcolors_LDADD = $(top_builddir)/src/libtermcolors.la
test_termcolors_CPPFLAGS = -I$(top_srcdir)/src -I$(top_builddir)

example_SOURCES = example.c
example_LDADD = $(top_builddir)/src/libtermcolors.la
example_CPPFLAGS = -I$(top_srcdir)/src -I$(top_builddir)

TESTS = test_termcolors example`;

const SRC_MAKEFILE_AM = `lib_LTLIBRARIES = libtermcolors.la
libtermcolors_la_SOURCES = termcolors.c
libtermcolors_la_CPPFLAGS = -DSYSCONFDIR='"$(sysconfdir)"' -I$(top_builddir)
libtermcolors_la_LDFLAGS = -version-info 1:0:0

include_HEADERS = termcolors.h

pkgconfigdir = $(libdir)/pkgconfig
pkgconfig_DATA = libtermcolors.pc

man3_MANS = libtermcolors.3
EXTRA_DIST = $(man3_MANS)`;

const MAN_PAGE = `.TH libtermcolors 3 "2026-03-28" "libtermcolors 1.0.0" "Library Functions Manual"
.SH NAME
colorscheme, color_sequence, unquote_escapes, get_color, ansi_sequence \\- terminal colorization scheme handling
.SH SYNOPSIS
.nf
.B #include <termcolors.h>
.sp
.BI "int colorscheme(char *" name ", char *" term ", char **" filename ");"
.sp
.BI "int color_sequence(const char *" filename ", const char *" name ", char **" sequence ");"
.sp
.BI "char *unquote_escapes(const char *" sequence ");"
.sp
.BI "int get_color(const char *" filename ", const char *" name ", int (*" converter ")(const char *, char **), char **" sequence ");"
.sp
.BI "int ansi_color(const char *" filename ", const char *" name ", char **" sequence ");"
.sp
.BI "int ansi_sequence(const char *" raw ", char **" sequence ");"
.fi
.SH DESCRIPTION
The
.BR colorscheme ()
function detects which file must be used as a colorization scheme according to the
.BR terminal-colors.d (5)
specification.
.PP
The
.BR color_sequence ()
function finds a logical color name in a colorscheme file and returns its raw sequence.
.PP
The
.BR unquote_escapes ()
function translates escape sequences in a string according to
.BR terminal-colors.d (5).
Supported sequences: \\\\a, \\\\b, \\\\e, \\\\f, \\\\n, \\\\r, \\\\t, \\\\v, \\\\\\\\, \\\\_.
.PP
The
.BR get_color ()
function finds a logical color name in a colorscheme file and returns its color sequence using the provided
.I converter
function.
.PP
The
.BR ansi_color ()
macro is a backward compatibility wrapper for
.BR get_color ()
that uses
.BR ansi_sequence ()
as the converter.
.PP
The
.BR ansi_sequence ()
function converts a raw color string (color name, ANSI sequence, or raw escape) to an ANSI escape sequence.
.PP
Supported color names: black, blue, brown, cyan, darkgray, gray, green, 
lightblue, lightcyan, lightgray, lightgreen, lightmagenta, lightred, 
magenta, red, white, yellow.
.PP
Supported attribute names: blink, bold, halfbright, reset, reverse.
.SH RETURN VALUE
On success,
.BR colorscheme (),
.BR color_sequence (),
.BR get_color (),
and
.BR ansi_sequence ()
return
.B TERMCOLORS_SUCCESS
(0).
.PP
.BR unquote_escapes ()
returns an allocated string on success, or NULL on error.
.SH ENVIRONMENT
.TP
.B NO_COLOR
If set to any value, colorization is disabled. This variable has the highest priority.
.SH FILES
The function searches for configuration files in the following directories (in order of priority):
.IP 1.
.I $XDG_CONFIG_HOME/terminal-colors.d
(or
.I $HOME/.config/terminal-colors.d
if
.I $XDG_CONFIG_HOME
is not set)
.IP 2.
.I SYSCONFDIR/terminal-colors.d
(where
.I SYSCONFDIR
is determined at build time, typically
.IR /etc ).
.PP
Within each directory, the following files are searched (first match wins):
.IP 1.
.I name@term.enable
.IP 2.
.I name@term.disable
.IP 3.
.I name@term.scheme
.IP 4.
.I name.enable
.IP 5.
.I name.disable
.IP 6.
.I name.scheme
.IP 7.
.I @term.enable
.IP 8.
.I @term.disable
.IP 9.
.I @term.scheme
.IP 10.
.I disable
.SH SEE ALSO
.BR terminal-colors.d (5)`;

const README_MD = `# libtermcolors

A library for terminal colorization scheme handling according to the \`terminal-colors.d(5)\` specification.

## Usage Example

\`\`\`c
#include <termcolors.h>
#include <stdio.h>
#include <stdlib.h>

int main() {
    char *filename = NULL;
    int res = colorscheme("mytool", "xterm", &filename);
    
    if (res == TERMCOLORS_SUCCESS && filename) {
        char *seq = NULL;
        char *reset = NULL;
        ansi_sequence("reset", &reset);
        if (ansi_color(filename, "header", &seq) == TERMCOLORS_SUCCESS) {
            printf("%sThis is a header%s\\n", seq, reset);
            free(seq);
        }
        free(reset);
        free(filename);
    }
    
    return 0;
}
\`\`\`

## Build and Install

\`\`\`bash
autoreconf -fi
./configure
make
sudo make install
\`\`\`
`;

export default function App() {
  const [activeTab, setActiveTab] = useState<'code' | 'build' | 'man' | 'readme'>('readme');

  return (
    <div className="min-h-screen bg-[#0a0a0a] text-[#e0e0e0] font-sans selection:bg-[#F27D26] selection:text-white">
      {/* Header */}
      <header className="border-b border-[#333] p-6 flex items-center justify-between bg-[#111]">
        <div className="flex items-center gap-3">
          <div className="bg-[#F27D26] p-2 rounded-lg">
            <Terminal className="text-white w-6 h-6" />
          </div>
          <div>
            <h1 className="text-xl font-bold tracking-tight uppercase">libtermcolors</h1>
            <p className="text-xs text-[#888] font-mono">Autotools Library / terminal-colors.d(5)</p>
          </div>
        </div>
        <nav className="flex gap-1 bg-[#222] p-1 rounded-md">
          <button
            onClick={() => setActiveTab('readme')}
            className={`px-4 py-1.5 rounded text-sm font-medium transition-all ${
              activeTab === 'readme' ? 'bg-[#F27D26] text-white' : 'text-[#888] hover:text-white'
            }`}
          >
            <BookOpen className="inline-block w-4 h-4 mr-2" />
            README
          </button>
          <button
            onClick={() => setActiveTab('code')}
            className={`px-4 py-1.5 rounded text-sm font-medium transition-all ${
              activeTab === 'code' ? 'bg-[#F27D26] text-white' : 'text-[#888] hover:text-white'
            }`}
          >
            <FileCode className="inline-block w-4 h-4 mr-2" />
            Source
          </button>
          <button
            onClick={() => setActiveTab('build')}
            className={`px-4 py-1.5 rounded text-sm font-medium transition-all ${
              activeTab === 'build' ? 'bg-[#F27D26] text-white' : 'text-[#888] hover:text-white'
            }`}
          >
            <Settings className="inline-block w-4 h-4 mr-2" />
            Build
          </button>
          <button
            onClick={() => setActiveTab('man')}
            className={`px-4 py-1.5 rounded text-sm font-medium transition-all ${
              activeTab === 'man' ? 'bg-[#F27D26] text-white' : 'text-[#888] hover:text-white'
            }`}
          >
            <FileText className="inline-block w-4 h-4 mr-2" />
            Manual
          </button>
        </nav>
      </header>

      <main className="max-w-6xl mx-auto p-8">
        {activeTab === 'readme' && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="bg-[#151619] rounded-xl border border-[#333] overflow-hidden shadow-2xl p-8"
          >
            <div className="prose prose-invert max-w-none">
              <div className="flex items-center gap-2 mb-6 text-[#F27D26]">
                <BookOpen className="w-5 h-5" />
                <span className="text-xs font-mono uppercase tracking-widest">README.md</span>
              </div>
              <div className="text-[#d1d1d1] leading-relaxed">
                <h1 className="text-3xl font-bold mb-4 text-white border-b border-[#333] pb-2">libtermcolors</h1>
                <p className="mb-6">A library for terminal colorization scheme handling according to the <code className="bg-[#222] px-1 rounded text-[#F27D26]">terminal-colors.d(5)</code> specification.</p>
                
                <h2 className="text-xl font-bold mb-4 text-white">Usage Example</h2>
                <pre className="bg-[#111] p-4 rounded mb-6 font-mono text-sm border border-[#333]">
                  {`#include <termcolors.h>
#include <stdio.h>
#include <stdlib.h>

int main() {
    char *filename = NULL;
    int res = colorscheme("mytool", "xterm", &filename);
    
    if (res == TERMCOLORS_SUCCESS && filename) {
        char *seq = NULL;
        char *reset = NULL;
        ansi_sequence("reset", &reset);
        if (ansi_color(filename, "header", &seq) == TERMCOLORS_SUCCESS) {
            printf("%sThis is a header%s\\n", seq, reset);
            free(seq);
        }
        free(reset);
        free(filename);
    }
    
    return 0;
}`}
                </pre>

                <h2 className="text-xl font-bold mb-4 text-white">Build and Install</h2>
                <pre className="bg-[#111] p-4 rounded mb-6 font-mono text-sm border border-[#333]">
                  {`autoreconf -fi
./configure
make
sudo make install`}
                </pre>
              </div>
            </div>
          </motion.div>
        )}

        {activeTab === 'code' && (
          <div className="grid grid-cols-1 gap-8">
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              className="bg-[#151619] rounded-xl border border-[#333] overflow-hidden shadow-2xl"
            >
              <div className="bg-[#1c1d21] px-4 py-2 border-b border-[#333] flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div className="w-3 h-3 rounded-full bg-[#ff5f56]" />
                  <div className="w-3 h-3 rounded-full bg-[#ffbd2e]" />
                  <div className="w-3 h-3 rounded-full bg-[#27c93f]" />
                  <span className="ml-4 text-xs font-mono text-[#666]">src/termcolors.h</span>
                </div>
              </div>
              <pre className="p-6 overflow-x-auto text-sm font-mono leading-relaxed text-[#d1d1d1]">
                <code>{H_CODE}</code>
              </pre>
            </motion.div>

            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.1 }}
              className="bg-[#151619] rounded-xl border border-[#333] overflow-hidden shadow-2xl"
            >
              <div className="bg-[#1c1d21] px-4 py-2 border-b border-[#333] flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div className="w-3 h-3 rounded-full bg-[#ff5f56]" />
                  <div className="w-3 h-3 rounded-full bg-[#ffbd2e]" />
                  <div className="w-3 h-3 rounded-full bg-[#27c93f]" />
                  <span className="ml-4 text-xs font-mono text-[#666]">src/termcolors.c</span>
                </div>
              </div>
              <pre className="p-6 overflow-x-auto text-sm font-mono leading-relaxed text-[#d1d1d1]">
                <code>{C_CODE}</code>
              </pre>
            </motion.div>
          </div>
        )}

        {activeTab === 'build' && (
          <div className="grid grid-cols-1 gap-8">
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              className="bg-[#151619] rounded-xl border border-[#333] overflow-hidden shadow-2xl"
            >
              <div className="bg-[#1c1d21] px-4 py-2 border-b border-[#333] flex items-center gap-2">
                <Settings className="w-4 h-4 text-[#F27D26]" />
                <span className="text-xs font-mono text-[#666]">configure.ac</span>
              </div>
              <pre className="p-6 overflow-x-auto text-sm font-mono leading-relaxed text-[#d1d1d1]">
                <code>{CONFIGURE_AC}</code>
              </pre>
            </motion.div>

            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.1 }}
              className="bg-[#151619] rounded-xl border border-[#333] overflow-hidden shadow-2xl"
            >
              <div className="bg-[#1c1d21] px-4 py-2 border-b border-[#333] flex items-center gap-2">
                <Settings className="w-4 h-4 text-[#F27D26]" />
                <span className="text-xs font-mono text-[#666]">Makefile.am</span>
              </div>
              <pre className="p-6 overflow-x-auto text-sm font-mono leading-relaxed text-[#d1d1d1]">
                <code>{MAKEFILE_AM}</code>
              </pre>
            </motion.div>

            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.2 }}
              className="bg-[#151619] rounded-xl border border-[#333] overflow-hidden shadow-2xl"
            >
              <div className="bg-[#1c1d21] px-4 py-2 border-b border-[#333] flex items-center gap-2">
                <Settings className="w-4 h-4 text-[#F27D26]" />
                <span className="text-xs font-mono text-[#666]">src/Makefile.am</span>
              </div>
              <pre className="p-6 overflow-x-auto text-sm font-mono leading-relaxed text-[#d1d1d1]">
                <code>{SRC_MAKEFILE_AM}</code>
              </pre>
            </motion.div>

            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.3 }}
              className="bg-[#151619] rounded-xl border border-[#333] overflow-hidden shadow-2xl"
            >
              <div className="bg-[#1c1d21] px-4 py-2 border-b border-[#333] flex items-center gap-2">
                <Settings className="w-4 h-4 text-[#F27D26]" />
                <span className="text-xs font-mono text-[#666]">tests/Makefile.am</span>
              </div>
              <pre className="p-6 overflow-x-auto text-sm font-mono leading-relaxed text-[#d1d1d1]">
                <code>{TESTS_MAKEFILE_AM}</code>
              </pre>
            </motion.div>
          </div>
        )}

        {activeTab === 'man' && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="bg-[#151619] rounded-xl border border-[#333] overflow-hidden shadow-2xl"
          >
            <div className="bg-[#1c1d21] px-4 py-2 border-b border-[#333] flex items-center gap-2">
              <FileText className="w-4 h-4 text-[#F27D26]" />
              <span className="text-xs font-mono text-[#666]">libtermcolors.3</span>
            </div>
            <div className="p-8 font-serif text-[#d1d1d1] leading-relaxed max-w-3xl mx-auto">
              <h2 className="text-2xl font-bold border-b border-[#333] pb-2 mb-6">NAME</h2>
              <p className="mb-6">colorscheme - detect terminal colorization scheme file</p>
              
              <h2 className="text-2xl font-bold border-b border-[#333] pb-2 mb-6">SYNOPSIS</h2>
              <pre className="bg-[#111] p-4 rounded mb-6 font-mono text-sm">
                #include &lt;termcolors.h&gt;{"\n\n"}
                int colorscheme(char *name, char *term, char **filename);
              </pre>

              <h2 className="text-2xl font-bold border-b border-[#333] pb-2 mb-6">DESCRIPTION</h2>
              <p className="mb-4">
                The <span className="font-bold">colorscheme()</span> function detects which file must be used as a colorization scheme according to the <span className="font-bold">terminal-colors.d(5)</span> specification.
              </p>
              <p className="mb-4">
                The <span className="italic">name</span> argument is the name of the utility (e.g., "dmesg").
              </p>
              <p className="mb-4">
                The <span className="italic">term</span> argument is the terminal name (e.g., "xterm"). It can be NULL if the terminal name is unknown.
              </p>
              <p className="mb-4">
                The <span className="italic">filename</span> argument is a pointer to a string pointer. On success, the function allocates a new string containing the path to the found scheme file and stores it in <span className="italic">*filename</span>.
              </p>

              <h2 className="text-2xl font-bold border-b border-[#333] pb-2 mb-6">RETURN VALUE</h2>
              <div className="space-y-4">
                <p><span className="font-mono font-bold">TERMCOLORS_SUCCESS (0)</span>: Success.</p>
                <p><span className="font-mono font-bold">TERMCOLORS_DISABLED (1)</span>: Coloring is disabled.</p>
                <p><span className="font-mono font-bold">TERMCOLORS_NOT_FOUND (2)</span>: No appropriate scheme was found.</p>
              </div>

              <h2 className="text-2xl font-bold border-b border-[#333] pb-2 mb-6 mt-8">ENVIRONMENT</h2>
              <div className="space-y-4 mb-8">
                <p><span className="font-bold font-mono">NO_COLOR</span>: If set to any value, colorization is disabled. This variable has the highest priority.</p>
              </div>

              <h2 className="text-2xl font-bold border-b border-[#333] pb-2 mb-6 mt-8">FILES</h2>
              <p className="mb-4">The function searches for configuration files in the following directories (in order of priority):</p>
              <ol className="list-decimal list-inside space-y-2 mb-6">
                <li><span className="italic font-mono">$XDG_CONFIG_HOME/terminal-colors.d</span> (or <span className="italic font-mono">$HOME/.config/terminal-colors.d</span>)</li>
                <li><span className="italic font-mono">SYSCONFDIR/terminal-colors.d</span> (typically <span className="italic font-mono">/etc/terminal-colors.d</span>)</li>
              </ol>

              <p className="mb-4">Within each directory, the following files are searched (first match wins):</p>
              <ol className="list-decimal list-inside space-y-2 mb-4 font-mono text-sm">
                <li>name@term.enable</li>
                <li>name@term.disable</li>
                <li>name@term.scheme</li>
                <li>name.enable</li>
                <li>name.disable</li>
                <li>name.scheme</li>
                <li>@term.enable</li>
                <li>@term.disable</li>
                <li>@term.scheme</li>
                <li>disable</li>
              </ol>
            </div>
          </motion.div>
        )}
      </main>

      <footer className="mt-auto border-t border-[#333] p-8 text-center text-[#555] text-xs uppercase tracking-widest">
        libtermcolors v1.0.0 / frbrgeorge@gmail.com
      </footer>
    </div>
  );
}
