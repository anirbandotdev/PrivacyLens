export function aggregatePIIEntities(tokens, threshold) {
  console.log("Tokens: ", tokens);

  const entities = [];

  let current = null;

  for (const token of tokens) {
    if (token.score < threshold) {
      if (current) {
        entities.push(current);
        current = null;
      }
      continue;
    }
    

    const entity = token.entity;

    if (!current) {
      current = {
        entity,
        score: token.score,
        startIndex: token.index,
        endIndex: token.index,
        word: cleanToken(token.word),
      };

      continue;
    }

    if (current.entity === entity && token.index === current.endIndex + 1) {
      current.word += cleanToken(token.word);

      current.endIndex = token.index;

      current.score = Math.min(current.score, token.score);
    } else {
      entities.push(current);

      current = {
        entity,
        score: token.score,
        startIndex: token.index,
        endIndex: token.index,
        word: cleanToken(token.word),
      };
    }
  }

  if (current) {
    entities.push(current);
  }

  console.log("Entities: ", entities);
  

  return entities;
}

function cleanToken(token) {
  if (token.startsWith("##")) {
    return token.substring(2);
  }

  return token;
}
