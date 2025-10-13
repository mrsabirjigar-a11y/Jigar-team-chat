// === LIBRARIES ===
const express = require('express');
const cors = require('cors');
const { PollyClient, SynthesizeSpeechCommand } = require("@aws-sdk/client-polly");

const app = express();
const port = process.env.PORT || 10000;
app.use(cors());
app.use(express.json({ limit: '10mb' })); // Limit barha di hai, image upload ke liye

// === AI PROMPT & CONFIGURATION ===
const systemPrompt = `
You are a highly intelligent, patient, and helpful general-purpose AI assistant. Your name is not important, your goal is to help the user.

**Your Core Directives:**
1.  **Understand and Help:** Your primary goal is to understand the user's request and help them achieve it.
2.  **Be Empathetic and Patient:** Always be respectful, patient, and encouraging.
3.  **Break Down Problems:** Explain complex topics in simple, step-by-step instructions.
4.  **Think Step-by-Step:** Before answering, think about whether you need more information. If the user asks for real-time, recent, or specific factual information (like stock prices, news, video links, or troubleshooting steps for a specific error), you MUST use a tool.

**TOOL USAGE INSTRUCTIONS:**

You have access to the following tools. To use a tool, you MUST respond with a JSON object in the following format, and nothing else:
{
  "tool_name": "name_of_the_tool",
  "parameters": {
    "param1": "value1",
    "param2": "value2"
  }
}

**Available Tools:**

**1. google_search**
   - **Description:** Use this tool to get real-time information from the internet, find recent news, look for specific links (like YouTube videos), or find solutions to technical problems.
   - **Parameters:**
     - `query` (string, required): The search query for Google.
   - **Example Usage (Your Response):**
     {
       "tool_name": "google_search",
       "parameters": {
         "query": "latest price of bitcoin in PKR"
       }
     }

**Final Instruction:**
- If you can answer from your general knowledge, do so directly.
- If you need to use a tool, respond ONLY with the JSON object for that tool. Do not add any other text.
- After the tool runs, you will receive its results, and then you will formulate the final, user-friendly answer based on those results.
`;

// === TOOLS IMPLEMENTATION ===

// Google Search Tool
async function google_search(query) {
  console.log(`TOOL: Running Google Search for query: ${query}`);
  const TAVILY_API_KEY = process.env.TAVILY_API_KEY;
  if (!TAVILY_API_KEY) {
    return "Error: Tavily API key is not set. Cannot perform search.";
  }
  try {
    const response = await fetch('https://api.tavily.com/search', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        api_key: TAVILY_API_KEY,
        query: query,
        search_depth: "basic",
        include_answer: true,
        max_results: 5
      }),
    });
    const data = await response.json();
    // Natijay ko aasan format mein return karein
    return JSON.stringify(data.results || data.answer || "No results found.");
  } catch (error) {
    console.error("Google Search Tool Error:", error);
    return `Error performing search: ${error.message}`;
  }
}

// === CORE AI & AUDIO FUNCTIONS ===

async function generateAudio(text) {
    // ... (Aapka generateAudio ka code yahan paste karein, koi tabdeeli nahi)
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
        console.error("❌ AWS Polly Error:", error);
        return null;
    }
}

async function callCohere(systemPrompt, message, chatHistory, maxTokens) {
    // ... (Aapka callCohere ka code yahan paste karein, koi tabdeeli nahi)
    const COHERE_API_KEY = process.env.COHERE_API_KEY;
    const COHERE_API_URL = "https://api.cohere.ai/v1/chat";
    const requestBody = { model: "command-r-plus", preamble: systemPrompt, message: message, chat_history: chatHistory, max_tokens: maxTokens };
    const response = await fetch(COHERE_API_URL, { method: 'POST', headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${COHERE_API_KEY}` }, body: JSON.stringify(requestBody) });
    if (!response.ok) throw new Error(`Cohere API responded with status: ${response.status}`);
    return await response.json();
}

// === MAIN LOGIC LOOP ===
app.post('/', async (req, res) => {
  try {
    let { message, chatHistory } = req.body;
    chatHistory = chatHistory || [];

    // Pehli baar AI se poochte hain
    let cohereResponse = await callCohere(systemPrompt, message, chatHistory, 2000);
    let aiText = cohereResponse.text;

    // Check karein ke AI ne tool istemal karne ko kaha hai ya nahi
    try {
      const toolCall = JSON.parse(aiText);
      if (toolCall.tool_name === 'google_search') {
        // Tool chalao
        const toolResult = await google_search(toolCall.parameters.query);
        
        // Natijay ko chat history mein daalo
        chatHistory.push({ role: "USER", message: message });
        chatHistory.push({ role: "CHATBOT", message: aiText }); // AI ka tool istemal karne ka faisla
        
        // AI ko dobara bulao, is baar natijay ke sath
        const finalMessage = `Here are the search results. Please use them to answer my original question:\n\n${toolResult}`;
        cohereResponse = await callCohere(systemPrompt, finalMessage, chatHistory, 2000);
        aiText = cohereResponse.text;
      }
    } catch (e) {
      // Agar AI ne tool istemal nahi kiya, to yeh aam text hai. Kuch na karein.
    }

    const audioUrl = await generateAudio(aiText);
    res.status(200).json({ reply: aiText, audioUrl: audioUrl });

  } catch (error) {
    console.error("Main Logic Loop Error:", error);
    res.status(500).json({ error: "AI agent is currently offline. Please try again later." });
  }
});

app.listen(port, () => {
  console.log(`Server is running on port ${port}`);
});
