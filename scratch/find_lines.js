import fs from 'fs';
import readline from 'readline';

const fpath = 'control.js';
const keywords = ['ctrl-btn-pipeline', 'DOMContentLoaded', 'ctrl-btn-bulk-assets'];

async function search() {
    const fileStream = fs.createReadStream(fpath);
    const rl = readline.createInterface({
        input: fileStream,
        crlfDelay: Infinity
    });

    let i = 1;
    for await (const line of rl) {
        for (const kw of keywords) {
            if (line.includes(kw)) {
                console.log(`${i} [${kw}] -> ${line.trim()}`);
            }
        }
        i++;
    }
}
search();
