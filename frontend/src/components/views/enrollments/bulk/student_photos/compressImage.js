// Resize/recompress an image in the browser before upload.
// Target: ID-card / profile photos render small (~200px), so 700px on the
// long edge at quality 0.8 is plenty and trims size by ~30-40x vs. a raw
// phone capture. If the result is still > TARGET_MAX_BYTES we re-encode
// once at a lower quality so a 100-photo batch never blows past reverse-
// proxy body limits. Falls back to the original file on any failure.
const TARGET_MAX_BYTES = 600 * 1024; // ~600 KB — keeps a 10-file batch < 6 MB

export async function compressImage(file, maxDim = 700, quality = 0.8) {
    if (!file || !file.type || !file.type.startsWith("image/")) return file;
    let bitmap;
    try {
        if (typeof window !== "undefined" && window.createImageBitmap) {
            bitmap = await createImageBitmap(file);
        } else {
            bitmap = await new Promise((resolve, reject) => {
                const img = new Image();
                img.onload = () => resolve(img);
                img.onerror = reject;
                img.src = URL.createObjectURL(file);
            });
        }
        const w = bitmap.width;
        const h = bitmap.height;
        if (!w || !h) return file;
        // Cheap skip: already small AND under target → don't re-encode (would
        // strip metadata for no real gain and can grow PNG screenshots).
        if (Math.max(w, h) <= maxDim && file.size <= TARGET_MAX_BYTES) return file;
        const scale = Math.min(1, maxDim / Math.max(w, h));
        const tw = Math.max(1, Math.round(w * scale));
        const th = Math.max(1, Math.round(h * scale));
        const canvas = document.createElement("canvas");
        canvas.width = tw;
        canvas.height = th;
        const ctx = canvas.getContext("2d");
        ctx.drawImage(bitmap, 0, 0, tw, th);
        let blob = await new Promise((res) =>
            canvas.toBlob(res, "image/jpeg", quality)
        );
        // Safety net: if the first pass is still too big (very busy HDR shots
        // with high entropy), re-encode once at a lower quality.
        if (blob && blob.size > TARGET_MAX_BYTES && quality > 0.55) {
            const retry = await new Promise((res) =>
                canvas.toBlob(res, "image/jpeg", 0.6)
            );
            if (retry && retry.size < blob.size) blob = retry;
        }
        if (!blob || blob.size >= file.size) return file;
        const baseName =
            (file.name || "photo").replace(/\.[^.]+$/, "") + ".jpg";
        return new File([blob], baseName, {
            type: "image/jpeg",
            lastModified: Date.now(),
        });
    } catch (err) {
        if (process.env.NODE_ENV !== "production") {
            console.warn("Image compression failed, using original:", err);
        }
        return file;
    } finally {
        if (bitmap && bitmap.close) bitmap.close();
    }
}

// Run an async fn over `items` with a fixed concurrency. Used so we don't
// fire 100 canvas encodes at once and starve the browser's main thread.
export async function mapWithConcurrency(items, limit, fn) {
    let i = 0;
    const workers = Array.from(
        { length: Math.min(limit, items.length) },
        async () => {
            while (true) {
                const idx = i++;
                if (idx >= items.length) return;
                await fn(items[idx], idx);
            }
        }
    );
    await Promise.all(workers);
}
