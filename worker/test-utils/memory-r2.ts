export class MemoryR2 {
  readonly objects = new Map<string, { body: ArrayBuffer; contentType: string; etag: string }>();
  readonly deleteFailures = new Map<string, Error>();

  async put(key: string, value: ArrayBuffer | ArrayBufferView | string | ReadableStream | Blob, options?: R2PutOptions): Promise<void> {
    let body: ArrayBuffer;
    if (value instanceof ArrayBuffer || Object.prototype.toString.call(value) === "[object ArrayBuffer]") body = value as ArrayBuffer;
    else if (ArrayBuffer.isView(value)) body = value.buffer.slice(value.byteOffset, value.byteOffset + value.byteLength);
    else if (typeof value === "object" && value !== null && "arrayBuffer" in value && typeof value.arrayBuffer === "function") body = await value.arrayBuffer();
    else body = await new Response(value as BodyInit).arrayBuffer();
    const metadata = options?.httpMetadata;
    const contentType = metadata && !(metadata instanceof Headers) ? metadata.contentType : undefined;
    this.objects.set(key, { body, contentType: contentType ?? "application/octet-stream", etag: `etag-${crypto.randomUUID()}` });
  }

  get(key: string): Promise<R2ObjectBody | null> {
    const stored = this.objects.get(key);
    if (!stored) return Promise.resolve(null);
    return Promise.resolve({ body: new Response(stored.body).body!, httpEtag: stored.etag, httpMetadata: { contentType: stored.contentType }, key, size: stored.body.byteLength } as R2ObjectBody);
  }

  delete(key: string): Promise<void> { const failure = this.deleteFailures.get(key) ?? this.deleteFailures.get("*"); if (failure) return Promise.reject(failure); this.objects.delete(key); return Promise.resolve(); }
  head(key: string): Promise<R2Object | null> { return Promise.resolve(this.objects.has(key) ? ({ key } as R2Object) : null); }
}
