export async function redactImage(imageDataUrl, piiResults) {
    const response = await fetch(imageDataUrl);
    const blob = await response.blob();

    const bitmap = await createImageBitmap(blob);

    const canvas = new OffscreenCanvas(
        bitmap.width,
        bitmap.height
    );

    const ctx = canvas.getContext("2d");

    // Draw original screenshot
    ctx.drawImage(bitmap, 0, 0);

    for (const result of piiResults) {

        // Only redact if NER found PII
        if (!result.pii || result.pii.length === 0) {
            continue;
        }

        const points = result.box.points;

        if (!points || points.length < 4) {
            continue;
        }

        const xs = points.map(p => p.x);
        const ys = points.map(p => p.y);

        const minX = Math.min(...xs);
        const maxX = Math.max(...xs);
        const minY = Math.min(...ys);
        const maxY = Math.max(...ys);

        console.log("REDACTING:", {
        text: result.text,
        pii: result.pii,
        points: result.box.points
    });

        // Small padding to prevent characters touching the edge
        const padding = 2;

        ctx.fillStyle = "#fefefe";

        ctx.fillRect(
            minX - padding,
            minY - padding,
            (maxX - minX) + padding * 2,
            (maxY - minY) + padding * 2
        );
    }

    const outputBlob = await canvas.convertToBlob({
        type: "image/png"
    });

    return outputBlob;
}