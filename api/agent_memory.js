// agent_memory.js (FINAL, COMPATIBLE VERSION)

const fs = require('fs');
const path = require('path');

function loadTrainingData() {
    try {
        const filePath = path.join(__dirname, 'knowledge_base.json');
        const fileContent = fs.readFileSync(filePath, 'utf8');
        return JSON.parse(fileContent);
    } catch (error) {
        console.error("Fatal Error: Could not read or parse knowledge_base.json", error);
        throw error; // Error ko aage bhejein taake server band ho jaye
    }
}

function findRelevantDocuments(query, ragDocuments) {
    if (!query || !ragDocuments || !Array.isArray(ragDocuments.documents)) {
        return [];
    }

    const queryWords = query.toLowerCase().split(/\s+/);
    const scoredDocs = ragDocuments.documents.map(function(doc) {
        let score = 0;
        const docContent = doc.content.toLowerCase();
        queryWords.forEach(function(word) {
            if (docContent.includes(word)) {
                score++;
            }
        });
        return { content: doc.content, score: score };
    });

    const relevantDocs = scoredDocs.filter(function(doc) {
        return doc.score > 0;
    });

    relevantDocs.sort(function(a, b) {
        return b.score - a.score;
    });

    // Sirf top 3 sabse relevant documents bhejein
    return relevantDocs.slice(0, 3);
}

module.exports = {
    loadTrainingData,
    findRelevantDocuments
};
