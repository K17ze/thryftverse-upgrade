#!/usr/bin/env python3
"""
App-wide UI polish script:
Replaces hardcoded theme-aware colors and typography with design system tokens.
Run with: python polish_screens.py
"""

import re
from pathlib import Path

REPO_ROOT = Path(__file__).parent.parent
SCREEN_DIR = REPO_ROOT / "src" / "screens"

# Screens to polish
TARGETS = [
    "MyProfileScreen.tsx",
    "SearchScreen.tsx",
    "ItemDetailScreen.tsx",
    "SellScreen.tsx",
    "CheckoutScreen.tsx",
    "HomeScreen.tsx",
    "InboxScreen.tsx",
    "ChatScreen.tsx",
    "NotificationsScreen.tsx",
]

# Replacement rules: (regex_pattern, replacement)
RULES = [
    # --- MyProfileScreen constants ---
    (r"const PANEL_BG = IS_LIGHT \? '#ffffff' : '#111';", "const PANEL_BG = Colors.surface;"),
    (r"const PANEL_SOFT = IS_LIGHT \? '#f4efe7' : '#171717';", "const PANEL_SOFT = Colors.surfaceAlt;"),
    (r"const PANEL_ICON = IS_LIGHT \? '#ece5d9' : '#1a1a1a';", "const PANEL_ICON = Colors.surfaceAlt;"),
    (r"const PANEL_BORDER = IS_LIGHT \? '#d8d1c6' : '#2a2a2a';", "const PANEL_BORDER = Colors.border;"),

    # --- Common inline ternaries mapped to Colors ---
    (r"IS_LIGHT \? '#e8e4dc' : '#1a1a1a'", "Colors.surfaceAlt"),
    (r"IS_LIGHT \? '#d8d1c6' : '#2a2a2a'", "Colors.border"),
    (r"IS_LIGHT \? '#f5f3f0' : '#2a2a2a'", "Colors.surfaceAlt"),
    (r"IS_LIGHT \? '#ffffff' : '#111111'", "Colors.surface"),
    (r"IS_LIGHT \? '#ffffff' : '#111'", "Colors.surface"),
    (r"IS_LIGHT \? '#ece4d8' : Colors\.surfaceAlt", "Colors.surfaceAlt"),
    (r"IS_LIGHT \? '#fff' : Colors\.textPrimary", "Colors.textPrimary"),
    (r"IS_LIGHT \? '#000' : '#000'", "Colors.textPrimary"),

    # --- Typography.family.* -> direct font names ---
    (r"Typography\.family\.bold", "'Inter_700Bold'"),
    (r"Typography\.family\.semibold", "'Inter_600SemiBold'"),
    (r"Typography\.family\.medium", "'Inter_500Medium'"),
    (r"Typography\.family\.regular", "'Inter_400Regular'"),
    (r"Typography\.family\.light", "'Inter_300Light'"),
]

def process_file(path: Path) -> int:
    original = path.read_text(encoding="utf-8")
    text = original
    changes = 0

    for pattern, repl in RULES:
        new_text, count = re.subn(pattern, repl, text)
        if count:
            text = new_text
            changes += count

    # Remove Typography import if no longer referenced
    if "Typography" not in text:
        text = re.sub(r"import \{ Typography \} from ['\"].*?/constants/typography['\"];\n?", "", text)

    # If IS_LIGHT is no longer used, remove its declaration and simplify imports
    if "IS_LIGHT" not in text:
        text = re.sub(r"const IS_LIGHT = ActiveTheme === 'light';\n?", "", text)
        text = re.sub(r"import \{ ActiveTheme, Colors \} from", "import { Colors } from", text)
        text = re.sub(r"import \{ ActiveTheme \} from .*?/constants/colors['\"];\n?", "", text)

    if text != original:
        path.write_text(text, encoding="utf-8")
        print(f"  {path.name}: {changes} replacements")
    else:
        print(f"  {path.name}: no changes")
    return changes


def main():
    total = 0
    for name in TARGETS:
        path = SCREEN_DIR / name
        if path.exists():
            print(f"Processing {name}...")
            total += process_file(path)
        else:
            print(f"Skipping {name} (not found)")
    print(f"\nTotal replacements: {total}")


if __name__ == "__main__":
    main()
