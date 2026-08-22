const fs = require('fs');
const c = fs.readFileSync('backend/api/src/config.ts', 'utf8');
const lines = c.split('\n');
for (let i = lines.length - 1; i >= 0; i--) {
  if (lines[i].includes('}')) {
    console.log((i + 1) + ': ' + lines[i]);
    break;
  }
}
