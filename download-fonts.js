
const fs = require('fs');
const https = require('https');
const path = require('path');

const fonts = [
    { name: 'Cinzel-Bold.ttf', url: 'https://github.com/google/fonts/raw/main/ofl/cinzel/Cinzel-Bold.ttf' },
    { name: 'Cairo-Bold.ttf', url: 'https://github.com/google/fonts/raw/main/ofl/cairo/Cairo-Bold.ttf' },
    { name: 'RobotoMono-Bold.ttf', url: 'https://github.com/google/fonts/raw/main/apache/robotomono/RobotoMono-Bold.ttf' }
];

const destDir = path.join(__dirname, 'assets', 'fonts');

if (!fs.existsSync(destDir)) {
    fs.mkdirSync(destDir, { recursive: true });
}

function downloadFile(url, dest) {
    return new Promise((resolve, reject) => {
        const file = fs.createWriteStream(dest);
        https.get(url, (response) => {
            if (response.statusCode === 302 || response.statusCode === 301) {
                downloadFile(response.headers.location, dest).then(resolve).catch(reject);
                return;
            }
            response.pipe(file);
            file.on('finish', () => {
                file.close(() => resolve());
            });
        }).on('error', (err) => {
            fs.unlink(dest, () => reject(err));
        });
    });
}

(async () => {
    for (const font of fonts) {
        console.log(`Downloading ${font.name}...`);
        try {
            await downloadFile(font.url, path.join(destDir, font.name));
            console.log(`Downloaded ${font.name}`);
        } catch (err) {
            console.error(`Failed to download ${font.name}:`, err.message);
        }
    }
})();
