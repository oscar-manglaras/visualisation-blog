

export async function decompressBlob(blob: Blob): Promise<string> {
    const ds = new DecompressionStream('gzip');
    const decompressedStream = blob.stream().pipeThrough(ds);
    return await new Response(decompressedStream).text();
}

export async function fetchCompressedFile(uri: string, compression?: 'gzip'|'deflate'): Promise<string|null> {
    const response = await fetch(uri);
    if (!response.ok) return null;

    const ds = new DecompressionStream(compression ?? 'gzip');
    const decompressedStream = response.body?.pipeThrough(ds);

    return await new Response(decompressedStream).text();
}
