export async function blobToDataURL(blob) {
    return await new Promise((resolve, reject) => {

        const reader = new FileReader();

        reader.onloadend = () => {
            resolve(reader.result);
        };

        reader.onerror = reject;

        reader.readAsDataURL(blob);
    });
}