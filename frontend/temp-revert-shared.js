const fs = require('fs');
const path = require('path');

const srcDir = 'c:/Users/ASUS/Desktop/thryftverse/frontend/src';

function processFile(filePath) {
  let content = fs.readFileSync(filePath, 'utf8');
  const original = content;

  // Remove the extra Reanimated import we added
  content = content.replace(/import Reanimated from 'react-native-reanimated';\r?\n/g, '');

  // Revert tag replacements back to SharedTransitionImage/SharedTransitionView
  content = content.replace(/<Reanimated\.Image/g, '<SharedTransitionImage');
  content = content.replace(/<\/Reanimated\.Image>/g, '</SharedTransitionImage>');
  content = content.replace(/<Reanimated\.View/g, '<SharedTransitionView');
  content = content.replace(/<\/Reanimated\.View>/g, '</SharedTransitionView>');

  // Add back the import lines for the wrappers
  if (content.includes('SharedTransitionImage') && !content.includes("from '../components/SharedTransitionImage'") && !content.includes("from '../../components/SharedTransitionImage'")) {
    content = "import { SharedTransitionImage } from '../components/SharedTransitionImage';\n" + content;
  }
  if (content.includes('SharedTransitionView') && !content.includes("from '../components/SharedTransitionView'") && !content.includes("from '../../components/SharedTransitionView'")) {
    content = "import { SharedTransitionView } from '../components/SharedTransitionView';\n" + content;
  }

  if (content !== original) {
    fs.writeFileSync(filePath, content, 'utf8');
    console.log('Reverted:', path.relative(srcDir, filePath));
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
