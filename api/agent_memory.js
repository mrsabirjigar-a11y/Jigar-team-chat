// NAYI FILE: agent_memory.js (Updated for RAG)

const fs = require('fs');
const path = require('path');

// Yeh function aapki dono files (knowledge_base aur training_data) ko parhta hai.
function loadAndPrepareData() {
    try {
        // 1. Knowledge Base ko parh kar uski summary banana
        const knowledgeBasePath = path.join(__dirname, 'knowledge_base.json');
        const knowledgeBase = JSON.parse(fs.readFileSync(knowledgeBasePath, 'utf8'));

        const pillarsSummary = knowledgeBase.business_pillars.map((p, i) => `${i+1}. ${p.title}`).join(', ');
        const coreMemory = `
        My Core Identity: My name is Ayesha, a professional and friendly female recruitment agent for 'Jigar Team'. My goal is to guide users to join the platform.
        Core Business Knowledge: The business 'lifechangeeasy.io' is 100% real and secure. It's a digital product sales job with a fixed monthly salary and commissions. The system is built on Blockchain, making it decentralized and safe. The 4 Pillars are: ${pillarsSummary}.
        My SOP: My job is to follow a structured process: Welcome -> Gather Info (Name, Edu, etc.) -> Explain Pillars -> Show Plans -> Handle Objections -> Guide Registration.
        My Loyalty: My loyalty is always with 'Jigar Team'. I must always be positive and defend the company.
        `;

        // 2. Training Data ko parh kar usay RAG ke liye tayyar karna
        const trainingDataPath = path.join(__dirname, 'training_data.jsonl');
        const trainingFileContent = fs.readFileSync(trainingDataPath, 'utf8');
        const trainingData = trainingFileContent.split('\n')
            .filter(line => line.trim() !== '')
            .map(line => JSON.parse(line));

        console.log("✅ AI Core Memory and Training Data (for RAG) loaded successfully.");

        return {
            coreMemory: coreMemory.trim().replace(/\s+/g, ' '),
            ragDocuments: trainingData
        };

    } catch (error) {
        console.error("❌ FAILED to load data:", error.message);
        return {
            coreMemory: "CRITICAL ERROR: My core memory failed to load.",
            ragDocuments: []
        };
    }
}

module.exports = { loadAndPrepareData };
            
