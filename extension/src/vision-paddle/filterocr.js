export function filterOCRResults(results) {
  let result = [];

  for (const item of results) {

    const confidence = item.confidence * 100;

    if (confidence > 75) {
      result.push(item);
    }
  }

  return result
  
}
