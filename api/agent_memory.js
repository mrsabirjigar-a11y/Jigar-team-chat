// agent_memory.js (v3.0 - THE DEBUGGING CAMERA EDITION)

const fs = require('fs');
const path = require('path');

function loadTrainingData() {
    try {
        const filePath = path.join(__dirname, 'training_data.jsonl');
        const fileContent = fs.readFileSync(filePath, 'utf8');
        const lines = fileContent.trim().split('\n');
        const documents = lines.map(line => JSON.parse(line));
        const formattedData = {
            documents: documents.map(doc => ({ content: doc.text || '' }))
        };
        console.log(`✅ Training data loaded. Found ${formattedData.documents.length} documents.`); // Naya Log
        return formattedData;
    } catch (error) {
        console.error("Fatal Error: Could not read or process training_data.jsonl", error);
        throw error;
    }
}

function findRelevantDocuments(query, ragDocuments) {
    // === YAHAN DEBUGGING CAMERA HAI ===
    console.log(`[DEBUG] Searching for documents related to query: "${query}"`);
    if (!query || !ragDocuments || !Array.isArray(ragDocuments.documents)) {
        console.log(`[DEBUG] Invalid inputs to findRelevantDocuments. Returning empty.`);
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

    const relevantDocs = scoredDocs.filter(doc => doc.score > 0);
    relevantDocs.sort((a, b) => b.score - a.score);
    
    const topDocs = relevantDocs.slice(0, 5); // Hum 5 documents nikalenge
    
    console.log(`[DEBUG] Found ${topDocs.length} relevant documents.`);
    if (topDocs.length > 0) {
        console.log(`[DEBUG] Top relevant document found: "${topDocs[0].content.substring(0, 70)}..."`);
    }
    // === DEBUGGING KHATAM ===

    return topDocs;
}

module.exports = { loadTrainingData, findRelevantDocuments };
