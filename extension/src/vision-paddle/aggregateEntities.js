export function aggregatePIIEntities(
    tokens,
    threshold
) {

    // console.log("Tokens: ", tokens);
    
    const entities = [];

    let current = null;

    for (const token of tokens) {

        // Ignore low-confidence predictions
        if (token.score < threshold) {

            // Finish the current entity
            if (current) {
                entities.push(current);
                current = null;
            }

            continue;
        }


        const entity =
            token.entity;


        // Start a new entity
        if (!current) {

            current = {
                entity,
                score: token.score,
                startIndex: token.index,
                endIndex: token.index,
                word: cleanToken(token.word)
            };

            continue;
        }


        // Same entity and consecutive token
        if (
            current.entity === entity &&
            token.index === current.endIndex + 1
        ) {

            current.word +=
                cleanToken(token.word);

            current.endIndex =
                token.index;

            current.score =
                Math.min(
                    current.score,
                    token.score
                );

        }

        // Different entity
        else {

            entities.push(current);

            current = {
                entity,
                score: token.score,
                startIndex: token.index,
                endIndex: token.index,
                word: cleanToken(token.word)
            };
        }
    }


    // Don't forget final entity
    if (current) {
        entities.push(current);
    }


    return entities;
}


function cleanToken(token) {

    // BERT WordPiece:
    //
    // bid
    // ##yu
    // ##t
    //
    // becomes:
    //
    // bidyut

    if (token.startsWith("##")) {
        return token.substring(2);
    }

    return token;
}