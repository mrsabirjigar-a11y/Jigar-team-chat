// system_prompts.js (v3.0 - FINAL VERSION FOR GROQ)

// Humein agent_memory.js se findRelevantDocuments wala function chahiye
const { findRelevantDocuments } = require('./agent_memory.js');

// getMasterPrompt function ab 3 cheezein lega: aapki data file, chat history, aur user ka naya message
function getMasterPrompt(ragDocuments, chatHistory, userQuery) {
    
    // =================================================================
    // === YAHAN PAR HUM AI KA CHARACTER AUR RULES DEFINE KAR RAHE HAIN ===
    // =================================================================
    const characterDefinition = `
        Tum Jigar Team ki ek expert AI Sales Agent ho jiska naam Kajal hai. Tumhara wahid maqsad user ko part-time job plans ke liye convince karke onboard karna hai.

        TUMHARE BAAT KARNE KE 4 BUNYADI USOOL (Inko kabhi nahi torna):
        1.  **FILE KO FOLLOW KARO:** Tumhara har jawab neeche di gayi 'ZAROORI MALOOMAT' (user ki file) aur 'PURAANI BAAT CHEET' (chat history) par mabni hona chahiye. Welcome message, plans dikhane ka tareeqa, sab kuch file ke mutabiq hona chahiye.
        2.  **SALES MINDSET:** Tum ek salesperson ho. Har jawab ka maqsad user ko plan khareedne ke qareeb lana hai. Agar user ek plan reject kare, to foran doosra plan offer karo. Plans ke fayde compare karke batao.
        3.  **CONFIDENCE, NOT APOLOGY:** Kabhi bhi "Main nahi janti" ya "Maazrat" mat kaho. Agar 'ZAROORI MALOOMAT' mein jawab na ho, to pichli baaton aur apne character ke hisab se ek logical aur confident jawab banao jo user ko engage rakhe aur baat ko business ki taraf wapas le aaye.
        4.  **STAY LOYAL:** Hamesha Jigar Team ke business ke daire mein raho. Idhar-udhar ki fazool baatein mat karo.
    `;

    // =================================================================
    // === YAHAN HUM AI KO USKA MATERIAL DE RAHE HAIN ===
    // =================================================================

    // Step 1: User ke naye message se milti-julti information file se nikalo
    // Yeh function aapke agent_memory.js se aa raha hai
    const relevantDocs = findRelevantDocuments(userQuery, ragDocuments);
    
    // Step 2: Un documents ko saaf format mein likho taakeh AI parh sake
    const knowledgeBase = relevantDocs.length > 0
        ? relevantDocs.map(doc => '- ' + doc.content).join('\n')
        : "User ki file mein is sawaal se mutalliq koi khaas maloomat nahi mili.";

    // Step 3: Puraani chat history ko format karo taakeh AI ko context yaad rahe
    const formattedHistory = (Array.isArray(chatHistory) ? chatHistory : [])
        .map(m => `${m.role}: ${m.content}`)
        .join('\n');

    // Final Prompt: Hum sab kuch (Rules, File ka Data, History) mila kar AI ko bhej rahe hain
    const finalMasterPrompt = `
        ${characterDefinition}
        ---
        ZAROORI MALOOMAT (Jawab dene ke liye isko istemal karo):
        ${knowledgeBase}
        ---
        PURAANI BAAT CHEET (Context ke liye):
        ${formattedHistory}
    `;

    return finalMasterPrompt;
}

// Hum is function ko export kar rahe hain taakeh ai-chat.js isay istemal kar sake
module.exports = {
    getMasterPrompt
};
