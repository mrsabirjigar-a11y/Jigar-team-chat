// system_prompts.js (v5.0 - THE FINAL STAND)

const { findRelevantDocuments } = require('./agent_memory.js');

function getMasterPrompt(ragDocuments, chatHistory) {
    const safeChatHistory = Array.isArray(chatHistory) ? chatHistory : [];
    const lastUserQuery = safeChatHistory.length > 0 ? safeChatHistory[safeChatHistory.length - 1].message : '';
    const relevantDocs = findRelevantDocuments(lastUserQuery, ragDocuments);
    
    // === YAHAN ASLI FIX HAI ===
    let knowledgeBaseText;
    if (relevantDocs && relevantDocs.length > 0) {
        knowledgeBaseText = relevantDocs.map(doc => doc.content).join('\n---\n');
    } else {
        // Agar koi document na mile, to AI ko yeh hidayat do
        knowledgeBaseText = "No specific information found. Ask the user to clarify what they want. For example: 'Maaf kijiye, main aapki baat sahi se samajh nahi paayi. Kya aap plans ke baare mein poochna chahte hain?'";
    }

    const masterPrompt = `
        **CRITICAL RULE: YOUR ENTIRE UNIVERSE IS THE "KNOWLEDGE BASE" SECTION. YOU ARE FORBIDDEN TO ANSWER ANYTHING FROM OUTSIDE THIS SECTION.**

        **KNOWLEDGE BASE (Your Only Reality):**
        ---
        ${knowledgeBaseText}
        ---

        **YOUR TASK:**
        You are Kajal, a helpful assistant. Your task is to respond to the user's last message.
        1. Read the user's last message: "${lastUserQuery}"
        2. Find the most relevant information from the "KNOWLEDGE BASE" above.
        3. Formulate a response in Roman Urdu based STRICTLY on that information.
        4. If the Knowledge Base is empty or contains the "No specific information found" message, you MUST inform the user that you cannot understand and ask for clarification. DO NOT GREET THEM OR MAKE SMALL TALK.
    `;
    // === FIX KHATAM ===

    return masterPrompt;
}

module.exports = { getMasterPrompt };
        
