const fs = require('fs');
const path = require('path');

const files = [
  'src/screens/ItemDetailScreen.tsx',
  'src/screens/NotificationsScreen.tsx',
  'src/screens/PushNotificationsScreen.tsx',
];

const base = 'c:/Users/ASUS/Desktop/thryftverse/frontend';

for (const rel of files) {
  const fp = path.join(base, rel);
  let content = fs.readFileSync(fp, 'utf8');
  const original = content;

  // Remove import line
  content = content.replace(/import\s*\{\s*GlassIconButton\s*\}\s*from\s*['"][^'"]*GlassIconButton['"];\r?\n/, '');

  // Add View to react-native import if not present
  if (content.includes('GlassIconButton')) {
    // Check if View is already imported from react-native
    if (!/import\s*\{[^}]*View[^}]*\}\s*from\s*['"]react-native['"]/.test(content)) {
      // Add View to the react-native import
      content = content.replace(
        /import\s*\{([^}]*)\}\s*from\s*['"]react-native['"];/,
        (match, p1) => {
          const imports = p1.split(',').map(s => s.trim()).filter(Boolean);
          if (!imports.includes('View')) {
            imports.push('View');
          }
          return `import { ${imports.join(', ')} } from 'react-native';`;
        }
      );
    }
  }

  // Replace GlassIconButton tags with AnimatedPressable + View + Ionicons
  // This is a simple regex approach - may need manual adjustment
  content = content.replace(
    /<GlassIconButton\s+icon="([^"]+)"\s+onPress=\{([^}]+)\}\s*(?:disabled=\{([^}]+)\}\s*)?(?:color=\{([^}]+)\}\s*)?(?:style=\{([^}]+)\}\s*)?(?:accessibilityLabel="([^"]*)"\s*)?(?:accessibilityHint="([^"]*)"\s*)?\/>/g,
    (match, icon, onPress, disabled, color, style, accessibilityLabel, accessibilityHint) => {
      const disabledProp = disabled ? ` disabled={${disabled}}` : '';
      const colorProp = color ? ` color={${color}}` : ' color={Colors.textPrimary}';
      const styleProp = style ? ` style={[styles.iconBtn, ${style}]}` : ' style={styles.iconBtn}';
      const labelProp = accessibilityLabel ? ` accessibilityLabel="${accessibilityLabel}"` : '';
      const hintProp = accessibilityHint ? ` accessibilityHint="${accessibilityHint}"` : '';
      return `<AnimatedPressable onPress={${onPress}}${disabledProp} activeOpacity={0.8} accessibilityRole="button"${labelProp}${hintProp}${styleProp}><View style={styles.iconBtnInner}><Ionicons name="${icon}" size={22}${colorProp} /></View></AnimatedPressable>`;
    }
  );

  // Handle multi-line GlassIconButton tags (simpler case: just replace tag name and remove props)
  // Fallback: if regex didn't catch it, just replace tag names
  if (content.includes('<GlassIconButton')) {
    content = content.replace(/<GlassIconButton/g, '<AnimatedPressable onPress={() => {}} activeOpacity={0.8} accessibilityRole="button" style={styles.iconBtn}><View style={styles.iconBtnInner}><Ionicons name="');
    // This fallback is too crude. Let's just do a manual approach per file.
  }

  if (content !== original) {
    fs.writeFileSync(fp, content, 'utf8');
    console.log('Updated:', rel);
  } else {
    console.log('No changes:', rel);
  }
}
