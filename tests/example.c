#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <termcolors.h>

int main() {
    char *filename = NULL;
    // We use "mytool" as utility name and "xterm" as terminal name for this example.
    int res = colorscheme("mytool", "xterm", &filename);
    
    if (res == TERMCOLORS_DISABLED) {
        printf("Coloring is disabled.\n");
        return 0;
    }
    
    if (res == TERMCOLORS_NOT_FOUND) {
        printf("No colorscheme found for mytool@xterm.\n");
        // We can still use default ANSI colors if we want, or just exit.
        // For this example, we'll try to get a reset sequence anyway.
    }

    char *reset = NULL;
    if (ansi_sequence("reset", &reset) != TERMCOLORS_SUCCESS) {
        fprintf(stderr, "Failed to get reset sequence\n");
        free(filename);
        return 1;
    }

    if (res == TERMCOLORS_SUCCESS && filename) {
        printf("Using colorscheme: %s\n", filename);
        
        char *seq = NULL;
        
        // Using get_color with ansi_sequence converter
        if (get_color(filename, "header", ansi_sequence, &seq) == TERMCOLORS_SUCCESS) {
            printf("%sThis is a header%s\n", seq, reset);
            free(seq);
        } else {
            printf("Color 'header' not found in %s\n", filename);
        }
        
        // Or using the backward compatibility macro
        if (ansi_color(filename, "error", &seq) == TERMCOLORS_SUCCESS) {
            printf("%sThis is an error%s\n", seq, reset);
            free(seq);
        } else {
            printf("Color 'error' not found in %s\n", filename);
        }

        free(filename);
    } else {
        // If no colorscheme found, we could use hardcoded ANSI sequences as fallback
        char *red = NULL;
        if (ansi_sequence("red", &red) == TERMCOLORS_SUCCESS) {
            printf("%sThis is a fallback red error%s\n", red, reset);
            free(red);
        }
    }

    free(reset);
    return 0;
}
