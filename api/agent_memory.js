// FINAL FILE v4.0: agent_memory.js (Sirf Training Data)

const fs = require('fs');
const path = require('path');

/**
 * Yeh function ab sirf aapki training_data.jsonl file ko parh kar
 * usay AI ke RAG system ke liye tayyar karta hai.
 */
function loadTrainingData() {
    try {
        const trainingDataPath = path.join(__dirname, 'training_data.jsonl');
        const trainingFileContent = fs.readFileSync(trainingDataPath, 'utf8');
        
        // Har line ko parh kar usay JSON object mein tabdeel karna
        const trainingData = trainingFileContent.split('\n')
            .filter(line => line.trim() !== '') // Khali lines ko ignore karna
            .map(line => JSON.parse(line));

        console.log(`✅ ${trainingData.length} training documents loaded successfully for RAG.`);
        
        return trainingData;

    } catch (error) {
        console.error("❌ FAILED to load Training Data from training_data.jsonl:", error.message);
        // Agar file na mile to khali array bhejein taake app crash na ho
        return []; 
    }
}

module.exports = { loadTrainingData };
    
