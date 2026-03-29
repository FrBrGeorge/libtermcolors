#ifndef TERMCOLORS_H
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
 * On success the function allocates space for the file name found in `filename` 
 * and returns TERMCOLORS_SUCCESS. 
 * 
 * If an error is encountered or coloring is disabled, it sets `filename` to NULL.
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
 * Supported sequences: \a, \b, \e, \f, \n, \r, \t, \v, \\, \_.
 * Any other character preceded by a backslash is interpreted as that character.
 * 
 * @param sequence Source string
 * @return Allocated translated string, or NULL on error.
 */
char *unquote_escapes(const char *sequence);

/**
 * Finds a logical color name in a colorscheme file and returns its raw sequence.
 * 
 * On success the function allocates space for the sequence found in `sequence`
 * and returns TERMCOLORS_SUCCESS.
 * 
 * If an error is encountered, it sets `sequence` to NULL.
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

#endif /* TERMCOLORS_H */
