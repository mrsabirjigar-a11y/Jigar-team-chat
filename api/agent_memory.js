// agent_memory.js (THE REAL FINAL VERSION - Handles .jsonl correctly)

const fs = require('fs');
const path = require('path');

function loadTrainingData() {
    try {
        const filePath = path.join(__dirname, 'training_data.jsonl');
        const fileContent = fs.readFileSync(filePath, 'utf8');

        // === YAHAN ASLI FIX HAI ===
        // .jsonl file ko line-by-line parse karein
        const lines = fileContent.trim().split('\n');
        const documents = lines.map(function(line) {
            try {
                // Har line ko alag se JSON parse karein
                return JSON.parse(line);
            } catch (e) {
                console.error("Warning: Could not parse a line in training_data.jsonl:", line);
                return null; // Agar koi line kharab hai to usko ignore karein
            }
        }).filter(function(doc) {
            // Sirf sahi documents ko rakhein
            return doc !== null;
        });
        
        // Final data ko us format mein rakhein jaisa baaki code expect kar raha hai
        const formattedData = {
            documents: documents.map(function(doc) {
                // Farz karein har line mein 'text' naam ki key hai
                return { content: doc.text || '' }; 
            })
        };

        return formattedData;
        // === FIX KHATAM ===

    } catch (error) {
        console.error("Fatal Error: Could not read or process training_data.jsonl", error);
        throw error;
    }
}

function findRelevantDocuments(query, ragDocuments) {
    if (!query || !ragDocuments || !Array.isArray(ragDocuments.documents)) {
        return [];
    }

    const queryWords = query.toLowerCase().split(/\s+/);
    const scoredDocs = ragDocuments.documents.map(function(doc) {
        let score = 0;
        const docContent = (doc.content || '').toLowerCase();
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

    return relevantDocs.slice(0, 3);
}

module.exports = {
    loadTrainingData,
    findRelevantDocuments
};
                  
