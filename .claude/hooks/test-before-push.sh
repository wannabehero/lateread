#!/bin/bash
set -o pipefail

# Extract the bash command from stdin (Claude Code passes tool input as JSON)
COMMAND=$(jq -r '.tool_input.command // empty' 2>/dev/null)

# Check if this is a git push command
if [[ "$COMMAND" =~ git[[:space:]]+push ]]; then
    echo "🧪 Detected git push - running tests first..." >&2

    # Run bun install and tests
    if ! bun install >&2; then
        echo "❌ bun install failed. Push blocked." >&2
        exit 2  # Exit 2 = blocking error in Claude Code hooks
    fi

    if ! bun test >&2; then
        echo "❌ Tests failed. Push blocked." >&2
        exit 2
    fi

    echo "✅ Tests passed! Proceeding with push..." >&2
fi

# Exit 0 = allow the command to proceed
exit 0
