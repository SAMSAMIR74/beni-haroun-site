const fs = require('fs');
const path = require('path');

const surfacePath = path.join(__dirname, 'data', 'surface.csv');
const volumePath = path.join(__dirname, 'data', 'volume.csv');
const outputPath = path.join(__dirname, 'data.js');

try {
    const surfaceContent = fs.readFileSync(surfacePath, 'utf8');
    const volumeContent = fs.readFileSync(volumePath, 'utf8');

    const fileContent = `// Preloaded Data to avoid CORS/Fetch issues
const CSV_DATA = {
    surface: \`${surfaceContent.replace(/`/g, '\\`')}\`,
    volume: \`${volumeContent.replace(/`/g, '\\`')}\`
};`;

    fs.writeFileSync(outputPath, fileContent);
    console.log('Successfully created data.js with embedded CSV data.');
} catch (error) {
    console.error('Error converting data:', error);
}
