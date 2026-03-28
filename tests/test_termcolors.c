#include "../src/termcolors.h"
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <unistd.h>
#include <sys/stat.h>
#include <assert.h>
#include <errno.h>

static char tmp_dir[] = "/tmp/termcolors_test_XXXXXX";

static void setup_test_dir() {
    if (mkdtemp(tmp_dir) == NULL) {
        perror("mkdtemp");
        exit(1);
    }
    setenv("XDG_CONFIG_HOME", tmp_dir, 1);
}

static void cleanup_test_dir() {
    char cmd[1024];
    snprintf(cmd, sizeof(cmd), "rm -rf %s", tmp_dir);
    if (system(cmd) != 0) {
        // Ignore errors during cleanup
    }
}

static void create_file(const char *rel_path) {
    char path[1024];
    snprintf(path, sizeof(path), "%s/terminal-colors.d/%s", tmp_dir, rel_path);
    
    // Ensure parent dir exists
    char dir[1024];
    snprintf(dir, sizeof(dir), "%s/terminal-colors.d", tmp_dir);
    mkdir(dir, 0755);

    FILE *f = fopen(path, "w");
    if (f == NULL) {
        perror("fopen");
        exit(1);
    }
    // Write realistic scheme content
    fprintf(f, "# Realistic scheme file\n");
    fprintf(f, "header 1;34\n");
    fprintf(f, "error  1;31\n");
    fclose(f);
}

static void test_terminal_application_specific() {
    printf("Testing terminal+application-specific scheme...\n");
    create_file("testapp@xterm.scheme");
    char *filename = NULL;
    int res = colorscheme("testapp", "xterm", &filename);
    assert(res == TERMCOLORS_SUCCESS);
    assert(strstr(filename, "testapp@xterm.scheme") != NULL);
    free(filename);
}

static void test_application_specific() {
    printf("Testing application-specific scheme...\n");
    create_file("testapp.scheme");
    char *filename = NULL;
    int res = colorscheme("testapp", "xterm", &filename);
    assert(res == TERMCOLORS_SUCCESS);
    assert(strstr(filename, "testapp.scheme") != NULL);
    free(filename);
}

static void test_terminal_specific() {
    printf("Testing terminal-specific scheme...\n");
    create_file("@xterm.scheme");
    char *filename = NULL;
    int res = colorscheme("otherapp", "xterm", &filename);
    assert(res == TERMCOLORS_SUCCESS);
    assert(strstr(filename, "@xterm.scheme") != NULL);
    free(filename);
}

static void test_not_found() {
    printf("Testing not found scheme...\n");
    char *filename = NULL;
    int res = colorscheme("missingapp", "missingterm", &filename);
    assert(res == TERMCOLORS_NOT_FOUND);
}

static void test_application_disabling() {
    printf("Testing application-specific disabling...\n");
    create_file("testapp.disable");
    char *filename = NULL;
    int res = colorscheme("testapp", "xterm", &filename);
    assert(res == TERMCOLORS_DISABLED);
}

static void test_terminal_disabling() {
    printf("Testing terminal-specific disabling...\n");
    create_file("@vt100.disable");
    char *filename = NULL;
    int res = colorscheme("anyapp", "vt100", &filename);
    assert(res == TERMCOLORS_DISABLED);
}

static void test_global_disabling() {
    printf("Testing global disabling...\n");
    create_file("disable");
    char *filename = NULL;
    int res = colorscheme("anyapp", "anyterm", &filename);
    assert(res == TERMCOLORS_DISABLED);
}

static void test_no_color() {
    printf("Testing NO_COLOR environment variable...\n");
    setenv("NO_COLOR", "1", 1);
    char *filename = NULL;
    int res = colorscheme("anyapp", "anyterm", &filename);
    assert(res == TERMCOLORS_DISABLED);
    unsetenv("NO_COLOR");
}

static void test_priority_order() {
    printf("Testing priority order...\n");
    
    // 1. name@term.disable vs 2. name@term.scheme
    create_file("testapp@xterm.disable");
    create_file("testapp@xterm.scheme");
    char *filename = NULL;
    int res = colorscheme("testapp", "xterm", &filename);
    assert(res == TERMCOLORS_DISABLED);
    
    // Remove disable, scheme should win
    char path[1024];
    snprintf(path, sizeof(path), "%s/terminal-colors.d/testapp@xterm.disable", tmp_dir);
    unlink(path);
    res = colorscheme("testapp", "xterm", &filename);
    assert(res == TERMCOLORS_SUCCESS);
    assert(strstr(filename, "testapp@xterm.scheme") != NULL);
    free(filename);

    // 2. name@term.scheme vs 3. name.disable
    create_file("testapp.disable");
    res = colorscheme("testapp", "xterm", &filename);
    assert(res == TERMCOLORS_SUCCESS);
    assert(strstr(filename, "testapp@xterm.scheme") != NULL);
    free(filename);

    // Remove scheme, name.disable should win
    snprintf(path, sizeof(path), "%s/terminal-colors.d/testapp@xterm.scheme", tmp_dir);
    unlink(path);
    res = colorscheme("testapp", "xterm", &filename);
    assert(res == TERMCOLORS_DISABLED);
}

static void test_enable_files() {
    printf("Testing .enable files...\n");
    
    // Test that name@term.enable overrides name@term.disable
    create_file("testapp@xterm.enable");
    create_file("testapp@xterm.disable");
    char *filename = NULL;
    int res = colorscheme("testapp", "xterm", &filename);
    assert(res == TERMCOLORS_SUCCESS);
    assert(filename == NULL);
    
    // Test that name.enable overrides global disable
    create_file("testapp.enable");
    create_file("disable");
    res = colorscheme("testapp", "otherterm", &filename);
    assert(res == TERMCOLORS_SUCCESS);
    assert(filename == NULL);
}

static void test_color_sequence() {
    printf("Testing color_sequence (raw strings)...\n");

    const char *scheme_file = "test.scheme";
    FILE *f = fopen(scheme_file, "w");
    fprintf(f, "# This is a comment\n");
    fprintf(f, "header 1;34\n");
    fprintf(f, "error  red\n");
    fprintf(f, "warning 1;33  \n");
    fprintf(f, "color_name green\n");
    fprintf(f, "reset 0\n");
    fprintf(f, "complex 1;34;42\n");
    fprintf(f, "raw_esc \\e[1;35m\n");
    fclose(f);

    char *seq = NULL;
    int res;

    // Test 1: Successful read of ANSI color sequence (raw)
    res = color_sequence(scheme_file, "header", &seq);
    assert(res == TERMCOLORS_SUCCESS);
    assert(seq != NULL);
    assert(strcmp(seq, "1;34") == 0);
    free(seq);

    // Test 2: Successful read with trailing spaces (raw)
    res = color_sequence(scheme_file, "warning", &seq);
    assert(res == TERMCOLORS_SUCCESS);
    assert(seq != NULL);
    assert(strcmp(seq, "1;33") == 0);
    free(seq);

    // Test 3: Color name support (raw)
    res = color_sequence(scheme_file, "color_name", &seq);
    assert(res == TERMCOLORS_SUCCESS);
    assert(seq != NULL);
    assert(strcmp(seq, "green") == 0);
    free(seq);

    // Test 4: Reset sequence (raw)
    res = color_sequence(scheme_file, "reset", &seq);
    assert(res == TERMCOLORS_SUCCESS);
    assert(seq != NULL);
    assert(strcmp(seq, "0") == 0);
    free(seq);

    // Test 5: Complex ANSI sequence (raw)
    res = color_sequence(scheme_file, "complex", &seq);
    assert(res == TERMCOLORS_SUCCESS);
    assert(seq != NULL);
    assert(strcmp(seq, "1;34;42") == 0);
    free(seq);

    // Test 6: Raw escape sequence with \e (raw)
    res = color_sequence(scheme_file, "raw_esc", &seq);
    assert(res == TERMCOLORS_SUCCESS);
    assert(seq != NULL);
    assert(strcmp(seq, "\\e[1;35m") == 0);
    free(seq);

    // Test 7: Unknown color name
    res = color_sequence(scheme_file, "nonexistent", &seq);
    assert(res == TERMCOLORS_UNKNOWN_COLOR);
    assert(seq == NULL);

    // Test 8: File not found
    res = color_sequence("nonexistent.scheme", "header", &seq);
    assert(res == TERMCOLORS_NOT_FOUND);
    assert(seq == NULL);

    unlink(scheme_file);
    printf("color_sequence tests passed!\n");
}

static void test_unquote_escapes() {
    printf("Testing unquote_escapes...\n");

    char *t;

    t = unquote_escapes("1;34");
    assert(strcmp(t, "1;34") == 0);
    free(t);

    t = unquote_escapes("\\e[1;34m");
    assert(strcmp(t, "\033[1;34m") == 0);
    free(t);

    t = unquote_escapes("\\a\\b\\f\\n\\r\\t\\v\\\\\\_");
    assert(strcmp(t, "\a\b\f\n\r\t\v\\ ") == 0);
    free(t);

    t = unquote_escapes("\\x"); // Any other character preceded by a backslash is interpreted as that character
    assert(strcmp(t, "x") == 0);
    free(t);

    printf("unquote_escapes tests passed!\n");
}

static void test_ansi_color() {
    printf("Testing ansi_color...\n");

    const char *scheme_file = "test_ansi.scheme";
    FILE *f = fopen(scheme_file, "w");
    fprintf(f, "header 1;34\n");
    fprintf(f, "error  red\n");
    fprintf(f, "bold_attr bold\n");
    fprintf(f, "bright_err lightred\n");
    fprintf(f, "brown_color brown\n");
    fprintf(f, "white_color white\n");
    fprintf(f, "raw_esc \\e[1;35m\n");
    fprintf(f, "plain_text some_text\n");
    fclose(f);

    char *seq = NULL;
    int res;

    // Test 1: ANSI sequence
    res = ansi_color(scheme_file, "header", &seq);
    assert(res == TERMCOLORS_SUCCESS);
    assert(strcmp(seq, "\033[1;34m") == 0);
    free(seq);

    // Test 2: Color name
    res = ansi_color(scheme_file, "error", &seq);
    assert(res == TERMCOLORS_SUCCESS);
    assert(strcmp(seq, "\033[31m") == 0);
    free(seq);

    // Test 3: Attribute name
    res = ansi_color(scheme_file, "bold_attr", &seq);
    assert(res == TERMCOLORS_SUCCESS);
    assert(strcmp(seq, "\033[1m") == 0);
    free(seq);

    // Test 4: Bright color name
    res = ansi_color(scheme_file, "bright_err", &seq);
    assert(res == TERMCOLORS_SUCCESS);
    assert(strcmp(seq, "\033[1;31m") == 0);
    free(seq);

    // Test 5: Brown color
    res = ansi_color(scheme_file, "brown_color", &seq);
    assert(res == TERMCOLORS_SUCCESS);
    assert(strcmp(seq, "\033[33m") == 0);
    free(seq);

    // Test 6: White color
    res = ansi_color(scheme_file, "white_color", &seq);
    assert(res == TERMCOLORS_SUCCESS);
    assert(strcmp(seq, "\033[37m") == 0);
    free(seq);

    // Test 7: Raw escape
    res = ansi_color(scheme_file, "raw_esc", &seq);
    assert(res == TERMCOLORS_SUCCESS);
    assert(strcmp(seq, "\033[1;35m") == 0);
    free(seq);

    // Test 8: Plain text treated as raw escape (unquoted)
    res = ansi_color(scheme_file, "plain_text", &seq);
    assert(res == TERMCOLORS_SUCCESS);
    assert(strcmp(seq, "some_text") == 0);
    free(seq);

    unlink(scheme_file);
    printf("ansi_color tests passed!\n");
}

int main() {
    setup_test_dir();
    
    test_terminal_application_specific();
    cleanup_test_dir();
    setup_test_dir();

    test_application_specific();
    cleanup_test_dir();
    setup_test_dir();

    test_terminal_specific();
    cleanup_test_dir();
    setup_test_dir();

    test_not_found();
    
    test_application_disabling();
    cleanup_test_dir();
    setup_test_dir();

    test_terminal_disabling();
    cleanup_test_dir();
    setup_test_dir();

    test_global_disabling();
    test_no_color();
    test_priority_order();
    test_enable_files();
    test_color_sequence();
    test_unquote_escapes();
    test_ansi_color();

    cleanup_test_dir();
    printf("All tests passed!\n");
    return 0;
}
