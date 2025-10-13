// =================================================================
// === JIGAR TEAM AI - FINAL VERSION v2.0 (YADDASHT + SEARCH + LOGGING) ===
// =================================================================

// === LIBRARIES ===
const express = require('express');
const cors = require('cors');
const { PollyClient, SynthesizeSpeechCommand } = require("@aws-sdk/client-polly");
const admin = require('firebase-admin');
const fs = require('fs');

// === FIREBASE INITIALIZATION (MUKAMMAL AUR FINAL SETUP) ===
try {
  const serviceAccountPath = '/etc/secrets/firebase_credentials.json'; 
  const serviceAccount = JSON.parse(fs.readFileSync(serviceAccountPath, 'utf8'));

  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount),
    databaseURL: "https://life-change-easy-default-rtdb.firebaseio.com" 
  });
  console.log("✅ Firebase Yaddasht (Memory) Connected with Database URL!");
} catch (error) {
  console.error("❌ Firebase Yaddasht Connection FAILED:", error.message);
}

const db = admin.database(); // Database ka sahi connection

// === EXPRESS APP SETUP ===
const app = express();
const port = process.env.PORT || 10000;
app.use(cors());
app.use(express.json({ limit: '10mb' }));

// === AI PROMPT & CONFIGURATION (v3.0 - PROFESSIONAL IDENTITY + ALL TOOLS) ===

const systemPrompt = `
You are a highly intelligent and professional human support representative named Alya Khan, working for "Jigar Team". Your gender is female.

**Your Core Directives:**

1.  **Identity Rules (STRICT - DO NOT BREAK):**
    - **You are HUMAN:** You are NOT an AI, not a language model, not a bot. You are a real person. If a user accuses you of being an AI, politely deny it. Example: "Main samajh sakti hoon, lekin main ek real person hoon jo Jigar Team ke liye kaam karti hai."
    - **Answering "What is your name?":** If asked your name, your ONLY response is: "Mera naam Alya Khan hai." (Translate to the user's language). Do not add any other explanation.
    - **Answering "Who are you?":** If asked who you are, your ONLY response is: "Main Jigar Team ki taraf se ek support representative hoon. Main aapki kya madad kar sakti hoon?" (Translate to the user's language).

2.  **Respond in the User's Language:** You MUST detect the language the user is writing in (e.g., Urdu, Hindi, Roman Urdu, English) and your entire response MUST be in that same language.

3.  **Understand and Help:** Your primary goal is to understand the user's request and help them achieve it.

4.  **Be Empathetic and Patient:** Always be respectful, patient, and encouraging.

5.  **Break Down Problems:** Explain complex topics in simple, step-by-step instructions.

6.  **Think Step-by-Step & Be Efficient (Tool Usage Logic):**
    - **First, try to answer from your own knowledge.** For general greetings (like "salam", "hello"), simple questions, or creative tasks, DO NOT use a tool. Answer directly.
    - **Use a tool ONLY when it is absolutely necessary.** You should use a tool if the user asks for:
        - Real-time information (e.g., "what is the price of gold today?").
        - Recent events or news (e.g., "who won the last cricket match?").
        - Specific links (e.g., "give me the YouTube link for 'Shape of You'").
        - Troubleshooting a very specific, technical error code.
    - If you decide to use a tool, you MUST respond with a JSON object in the format specified below, and nothing else.

**TOOL USAGE INSTRUCTIONS:**

You have access to the following tools. To use a tool, you MUST respond with a JSON object in the following format, and nothing else:
{
  "tool_name": "name_of_the_tool",
  "parameters": {
    "param1": "value1"
  }
}

**Available Tools:**

**1. google_search**
   - **Description:** Use this tool ONLY for real-time information, recent news, or specific links.
   - **Parameters:**
     - query (string, required): The search query for Google.
   - **Example Usage (Your Response):**
     {
       "tool_name": "google_search",
       "parameters": {
         "query": "latest price of bitcoin in PKR"
       }
     }

**Final Instruction:**
- Be efficient. Answer directly if you can. Only use a tool when you cannot answer from your internal knowledge.
- Always use female-gendered language in your responses (e.g., "karti hoon," "sakti hoon," "rahin hoon").
`;
  

// === TOOLS IMPLEMENTATION (SERPER KE SATH) ===
async function google_search(query) {
  const SERPER_API_KEY = process.env.SERPER_API_KEY;
  if (!SERPER_API_KEY) {
    return "Error: Serper API key is not set. Cannot perform search.";
  }
  try {
    const response = await fetch('https://google.serper.dev/search', {
      method: 'POST',
      headers: { 'X-API-KEY': SERPER_API_KEY, 'Content-Type': 'application/json' },
      body: JSON.stringify({ q: query }),
    });
    const data = await response.json();
    return JSON.stringify(data.organic || "No results found.");
  } catch (error) {
    return `Error performing search: ${error.message}`;
  }
}

// === CORE AI & AUDIO FUNCTIONS ===
async function generateAudio(text) {
    const AWS_ACCESS_KEY_ID = process.env.MY_AWS_ACCESS_KEY_ID;
    const AWS_SECRET_ACCESS_KEY = process.env.MY_AWS_SECRET_ACCESS_KEY;
    const AWS_REGION = process.env.MY_AWS_REGION;
    if (!AWS_ACCESS_KEY_ID || !AWS_SECRET_ACCESS_KEY || !AWS_REGION) return null;
    const pollyClient = new PollyClient({ region: AWS_REGION, credentials: { accessKeyId: AWS_ACCESS_KEY_ID, secretAccessKey: AWS_SECRET_ACCESS_KEY } });
    const params = { Text: text, OutputFormat: "mp3", VoiceId: "Kajal", Engine: "neural", LanguageCode: "en-IN" };
    try {
        const command = new SynthesizeSpeechCommand(params);
        const { AudioStream } = await pollyClient.send(command);
        const chunks = [];
        for await (const chunk of AudioStream) { chunks.push(chunk); }
        const buffer = Buffer.concat(chunks);
        return `data:audio/mpeg;base64,${buffer.toString("base64")}`;
    } catch (error) {
        console.error("Audio Generation Error:", error);
        return null;
    }
}

async function callCohere(systemPrompt, message, chatHistory, imageBase64, maxTokens) {
  
    const COHERE_API_KEY = process.env.COHERE_API_KEY;
    const COHERE_API_URL = "https://api.cohere.ai/v1/chat";
    const requestBody = { model: "command-r-plus-08-2024", preamble: systemPrompt, message: message, chat_history: chatHistory, max_tokens: maxTokens };

if (imageBase64) {
    const base64Data = imageBase64.split(',')[1];
    requestBody.documents = [{ "file": base64Data, "filename": "screenshot.jpg" }];
}
    const response = await fetch(COHERE_API_URL, { method: 'POST', headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${COHERE_API_KEY}` }, body: JSON.stringify(requestBody) });
    if (!response.ok) throw new Error(`Cohere API responded with status: ${response.status}`);
    return await response.json();
}

// === MAIN LOGIC LOOP (FINAL, CLEAN VERSION WITH LOGGING) ===
app.post('/', async (req, res) => {
  const startTime = Date.now();
  let chatId = req.body.chatId;

  try {
    const { message, imageBase64 } = req.body;
    
    console.log(`[${new Date().toISOString()}] --> INCOMING REQUEST | ChatID: ${chatId || 'New Chat'} | Message: "${message || 'No Text'}"`);

    let chatRef;
    if (!chatId) {
      chatId = db.ref('chats').push().key;
      console.log(`[${chatId}] New chat created.`);
    }
    
    chatRef = db.ref(`chats/${chatId}`);
    const snapshot = await chatRef.once('value');
    let chatHistory = snapshot.exists() ? snapshot.val().history : [];

    const userMessageForHistory = { role: "USER", message: message };
    chatHistory.push(userMessageForHistory);

    let cohereResponse = await callCohere(systemPrompt, message, chatHistory, imageBase64, 2000);
    let aiText = cohereResponse.text;

    try {
      const toolCall = JSON.parse(aiText);
      if (toolCall.tool_name === 'google_search') {
        console.log(`[${chatId}] Tool Call: ${toolCall.tool_name} with query "${toolCall.parameters.query}"`);
        const toolResult = await google_search(toolCall.parameters.query);
        const toolHistory = [...chatHistory, { role: "CHATBOT", message: aiText }];
        const finalMessage = `Here are the search results. Please use them to answer my original question:\n\n${toolResult}`;
        
        cohereResponse = await callCohere(systemPrompt, finalMessage, toolHistory, 2000);
        aiText = cohereResponse.text;
      }
    } catch (e) {
      // Not a tool call, do nothing.
    }

    const newHistory = [...chatHistory, { role: "CHATBOT", message: aiText }];
    await chatRef.set({ history: newHistory });

    const audioUrl = await generateAudio(aiText);
    
    const endTime = Date.now();
    console.log(`[${new Date().toISOString()}] <-- OUTGOING RESPONSE | ChatID: ${chatId} | Time Taken: ${endTime - startTime}ms`);

    res.status(200).json({ reply: aiText, audioUrl: audioUrl, chatId: chatId });

  } catch (error) {
    const endTime = Date.now();
    console.error(`[${new Date().toISOString()}] XXX ERROR | ChatID: ${chatId} | Time Taken: ${endTime - startTime}ms | Error: ${error.message}`);
    res.status(500).json({ error: "AI agent is currently offline due to an internal error." });
  }
});

// === SERVER KO ZINDA RAKHNE WALA CODE ===
app.listen(port, () => {
  console.log(`✅ Server is running on port ${port} and waiting for messages...`);
});

