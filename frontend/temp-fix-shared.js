const fs = require('fs');
const path = require('path');

const srcDir = 'c:/Users/ASUS/Desktop/thryftverse/frontend/src';

function processFile(filePath) {
  let content = fs.readFileSync(filePath, 'utf8');
  const original = content;
  let needsReanimated = false;

  // SharedTransitionImage
  if (content.includes('SharedTransitionImage')) {
    content = content.replace(/import\s*\{[^}]*SharedTransitionImage[^}]*\}\s*from\s*['"][^'"]+['"];\r?\n?/g, '');
    content = content.replace(/<SharedTransitionImage/g, '<Reanimated.Image');
    content = content.replace(/<\/SharedTransitionImage>/g, '</Reanimated.Image>');
    needsReanimated = true;
  }

  // SharedTransitionView
  if (content.includes('SharedTransitionView')) {
    content = content.replace(/import\s*\{[^}]*SharedTransitionView[^}]*\}\s*from\s*['"][^'"]+['"];\r?\n?/g, '');
    content = content.replace(/<SharedTransitionView/g, '<Reanimated.View');
    content = content.replace(/<\/SharedTransitionView>/g, '</Reanimated.View>');
    needsReanimated = true;
  }

  if (needsReanimated && !content.includes("import Reanimated from 'react-native-reanimated'")) {
    content = "import Reanimated from 'react-native-reanimated';\n" + content;
  }

  if (content !== original) {
    fs.writeFileSync(filePath, content, 'utf8');
    console.log('Updated:', path.relative(srcDir, filePath));
  }
}

function walk(dir) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      walk(fullPath);
    } else if (entry.name.endsWith('.tsx')) {
      processFile(fullPath);
    }
  }
}

walk(srcDir);
