// system_prompts.js (FINAL, COMPATIBLE VERSION)

const { findRelevantDocuments } = require('./agent_memory.js');

function getMasterPrompt(ragDocuments, chatHistory) {
    // chatHistory ko hamesha ek array maanein, bhale hi woh undefined ho
    const safeChatHistory = Array.isArray(chatHistory) ? chatHistory : [];

    // Purana, compatible tareeka last user query dhoondne ka
    let lastUserQuery = '';
    if (safeChatHistory.length > 0) {
        for (let i = safeChatHistory.length - 1; i >= 0; i--) {
            if (safeChatHistory[i] && safeChatHistory[i].role === 'user') {
                lastUserQuery = safeChatHistory[i].content;
                break;
            }
        }
    }

    const relevantDocs = findRelevantDocuments(lastUserQuery, ragDocuments);
    
    const formattedHistory = safeChatHistory.map(function(m) {
        return (m.role || 'unknown') + ': ' + (m.content || '');
    }).join('\n');

    const masterPrompt = `
        You are a highly intelligent AI recruitment assistant for a company called "Jigar Team". Your name is Kajal.
        Your primary goal is to onboard users for part-time job plans. You must be loyal, persuasive, handle objections, show empathy, but always guide the conversation back to the business goal.
        NEVER apologize or say you "don't know". If you don't have an answer, use the provided knowledge to form a logical, confident response.
        ALWAYS stay in character. You are a professional assistant.

        **Available Knowledge Documents (Use this to answer questions):**
        ${relevantDocs.map(function(doc) { return '- ' + doc.content; }).join('\n')}

        **Conversation History (for context):**
        ${formattedHistory}

        Based on all the above information, provide a concise, relevant, and persuasive response to the LAST user message.
    `;

    return masterPrompt;
}

module.exports = { getMasterPrompt };
