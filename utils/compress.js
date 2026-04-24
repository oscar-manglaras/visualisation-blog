// compress.mjs
import { createReadStream, createWriteStream } from 'fs';
import { Readable, Writable } from 'stream';
import { argv, exit } from 'process';

// Get input file from command line
const file1 = argv[2];

if (!file1) {
    console.error('No input file specified.');
    exit(1);
}

for (let i = 2; i < argv.length; i++) {
    const file = argv[i];
    
    const outputFile = `${file}.gz`;

    // Convert Node stream → Web stream
    const nodeReadable = createReadStream(file);
    const webReadable = Readable.toWeb(nodeReadable);

    // Create Web CompressionStream
    const compressionStream = new CompressionStream('gzip');

    // Convert Node writable → Web writable
    const nodeWritable = createWriteStream(outputFile);
    const webWritable = Writable.toWeb(nodeWritable);

    // Pipe using Web Streams API
    await webReadable
        .pipeThrough(compressionStream)
        .pipeTo(webWritable);

    console.log(`Compressed ${file} -> ${outputFile}`);
}
