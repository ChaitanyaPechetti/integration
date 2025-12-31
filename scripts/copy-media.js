const fs = require('fs');
const path = require('path');

const srcDir = path.join(__dirname, '..', 'src', 'webview');
const destDir = path.join(__dirname, '..', 'media');

// Create media directory if it doesn't exist
if (!fs.existsSync(destDir)) {
    fs.mkdirSync(destDir, { recursive: true });
}

// Copy JavaScript file
const jsSource = path.join(srcDir, 'ragPanel.js');
const jsDest = path.join(destDir, 'ragPanel.js');
if (fs.existsSync(jsSource)) {
    fs.copyFileSync(jsSource, jsDest);
    console.log('Copied ragPanel.js to media/');
}

// Copy CSS file
const cssSource = path.join(srcDir, 'ragPanel.css');
const cssDest = path.join(destDir, 'ragPanel.css');
if (fs.existsSync(cssSource)) {
    fs.copyFileSync(cssSource, cssDest);
    console.log('Copied ragPanel.css to media/');
}

console.log('Media files copied successfully');

