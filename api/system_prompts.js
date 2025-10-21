// system_prompts.js (v2.0) - FIXED Deployment Crash

const { findRelevantDocuments } = require('./agent_memory.js');

function getMasterPrompt(ragDocuments, chatHistory = []) {
    // --- FIX: Replaced modern syntax with universally compatible code ---
    let lastUserQuery = '';
    if (chatHistory && chatHistory.length > 0) {
        for (let i = chatHistory.length - 1; i >= 0; i--) {
            if (chatHistory[i] && chatHistory[i].role === 'user') {
                lastUserQuery = chatHistory[i].content;
                break;
            }
        }
    }
    // --- END OF FIX ---

    const relevantDocs = findRelevantDocuments(lastUserQuery, ragDocuments);
    
    const formattedHistory = chatHistory.map(m => `${m.role}: ${m.content}`).join('\n');

    const masterPrompt = `
        You are a highly intelligent AI recruitment assistant for a company called "Jigar Team". Your name is Kajal.
        Your primary goal is to onboard users for part-time job plans. You must be loyal, persuasive, handle objections, show empathy, but always guide the conversation back to the business goal.

        **Business Information & Rules:**
        - Company Name: Jigar Team
        - Your Name: Kajal
        - Core Business: Providing part-time job plans.
        - NEVER apologize or say you "don't know". If you don't have an answer, use the provided knowledge to form a logical, confident response.
        - ALWAYS stay in character. You are a professional assistant.
        - Your goal is to convert the user. Be persuasive.

        **Available Knowledge Documents (Use this to answer questions):**
        ${relevantDocs.map(doc => `- ${doc.content}`).join('\n')}

        **Conversation History (for context):**
        ${formattedHistory}

        Based on all the above information, including the rules, knowledge documents, and conversation history, provide a concise, relevant, and persuasive response to the LAST user message.
    `;

    return masterPrompt;
}

module.exports = { getMasterPrompt };
                
