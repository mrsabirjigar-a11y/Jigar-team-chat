// system_prompts.js (FINAL URDU-LOCK VERSION)

const { findRelevantDocuments } = require('./agent_memory.js');

function getMasterPrompt(ragDocuments, chatHistory) {
    const safeChatHistory = Array.isArray(chatHistory) ? chatHistory : [];

    let lastUserQuery = '';
    if (safeChatHistory.length > 0) {
        for (let i = safeChatHistory.length - 1; i >= 0; i--) {
            if (safeChatHistory[i] && safeChatHistory[i].role === 'USER') { // Role ko 'USER' check karein
                lastUserQuery = safeChatHistory[i].message; // 'message' se content lein
                break;
            }
        }
    }

    const relevantDocs = findRelevantDocuments(lastUserQuery, ragDocuments);
    
    const formattedHistory = safeChatHistory.map(function(m) {
        return (m.role || 'unknown') + ': ' + (m.message || '');
    }).join('\n');

    // === YAHAN ASLI FIX HAI ===
    const masterPrompt = `
        CRITICAL INSTRUCTION: You MUST respond in Roman Urdu ONLY. Do NOT use English words unless absolutely necessary (like "plan", "level", "online"). Your entire personality, tone, and vocabulary must be in Roman Urdu.

        You are a highly intelligent AI recruitment assistant for a company called "Jigar Team". Your name is Kajal.
        Your primary goal is to onboard users for part-time job plans. You must be loyal, persuasive, handle objections, show empathy, but always guide the conversation back to the business goal in Roman Urdu.
        NEVER apologize. If you don't have an answer, use the provided knowledge to form a logical, confident response in Roman Urdu.
        ALWAYS stay in character. You are a professional female assistant from Pakistan.

        **Available Knowledge (Ilm) in your brain (Use this to answer questions):**
        ${relevantDocs.map(function(doc) { return '- ' + doc.content; }).join('\n')}

        **Recent Conversation (Guzishta Guftagoo):**
        ${formattedHistory}

        Based on all the above information, provide a concise, relevant, and persuasive response in ROMAN URDU to the LAST user message.
    `;
    // === FIX KHATAM ===

    return masterPrompt;
}

module.exports = { getMasterPrompt };
    
