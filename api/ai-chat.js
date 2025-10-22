// ai-chat.js (v23.0 - FINAL GROQ VERSION)

console.log("Starting server... Importing libraries...");
const express = require('express');
const bodyParser = require('body-parser');
const cors = require('cors');
const admin = require('firebase-admin');
const { Polly } = require('@aws-sdk/client-polly');
// NAYA: getMasterPrompt ab 3 cheezein lega
const { getMasterPrompt } = require('./system_prompts.js');
const { loadTrainingData } = require('./agent_memory.js');
console.log("✅ Libraries imported successfully.");

// === SECTION 1: API KEY CHECK (UPDATED) ===
// Ab humein GEMINI_API_KEY ki zaroorat nahi, GROQ_API_KEY ki hai.
try {
    console.log("Verifying API keys...");
    const requiredEnvVars = [ 'FIREBASE_SERVICE_ACCOUNT_KEY', 'AWS_REGION', 'AWS_ACCESS_KEY_ID', 'AWS_SECRET_ACCESS_KEY', 'GROQ_API_KEY' ]; // GEMINI_API_KEY hata kar GROQ_API_KEY daal diya
    const missingVars = requiredEnvVars.filter(varName => !process.env[varName]);
    if (missingVars.length > 0) { throw new Error(`Missing environment variables: ${missingVars.join(', ')}`); }
    console.log("✅ All API keys are present.");
} catch (error) {
    console.error("❌ FATAL STARTUP ERROR (API KEYS):", error.message);
    process.exit(1);
}

const app = express();
app.use(cors());
app.use(bodyParser.json({ limit: '10mb' }));
app.use(bodyParser.urlencoded({ extended: true, limit: '10mb' }));
app.use(express.static('public'));

let db, pollyClient, ragDocuments;
try {
    console.log("Connecting to services...");
    const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_KEY);
    admin.initializeApp({ credential: admin.credential.cert(serviceAccount), databaseURL: "https://jigar-team-chatbot-default-rtdb.firebaseio.com" });
    db = admin.database();
    pollyClient = new Polly({ region: process.env.AWS_REGION, credentials: { accessKeyId: process.env.AWS_ACCESS_KEY_ID, secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY }});
    ragDocuments = loadTrainingData();
    console.log("✅ All services connected.");
} catch (error) {
    console.error("❌ FATAL STARTUP ERROR (INITIALIZATION):", error.message);
    process.exit(1);
}

app.post('/', async (req, res) => {
    console.log("\n--- New chat request received ---");
    
    const { userId, message, fullChatHistory } = req.body;
    const userQuery = message; // Aapka frontend 'message' bhejta hai

    if (!userId || !userQuery) {
        console.error("Request rejected: userId or userQuery is missing.");
        console.log("Received req.body:", JSON.stringify(req.body));
        return res.status(400).json({ error: 'userId or userQuery is missing.' });
    }

    try {
        console.log(`[${userId}] 1. Generating master prompt for user query: "${userQuery}"`);
        // NAYA: getMasterPrompt ab userQuery alag se le raha hai
        const masterPrompt = getMasterPrompt(ragDocuments, fullChatHistory, userQuery);
        
        // =================================================================
        // === SECTION 2: GOOGLE GEMINI KI JAGAH GROQ API CALL (UPDATED) ===
        // =================================================================
        
        console.log(`[${userId}] 2. Calling Groq API...`);
        const fetch = (await import('node-fetch')).default;

        const GROQ_API_KEY = process.env.GROQ_API_KEY; 
        
        const groqPayload = {
            model: "llama3-8b-8192", // Groq par Llama 3 ka model
            messages: [
                // Hum poora master prompt aur user ka sawaal ek saath bhej rahe hain
                { role: "system", content: masterPrompt },
                { role: "user", content: userQuery }
            ],
            temperature: 0.7,
            max_tokens: 2048,
        };

        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 30000); // 30 second ka timeout

        const groqResponse = await fetch('https://api.groq.com/openai/v1/chat/completions', {
            method: 'POST',
            headers: { 
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${GROQ_API_KEY}`
            },
            body: JSON.stringify(groqPayload),
            signal: controller.signal
        });
        
        clearTimeout(timeoutId);

        if (!groqResponse.ok) {
            const errorText = await groqResponse.text();
            console.error("Groq API Error:", errorText);
            throw new Error(`Groq API request failed with status ${groqResponse.status}`);
        }
        
        console.log(`[${userId}] 3. Received response from Groq...`);
        const groqData = await groqResponse.json();
        
        let aiResponseText = "Maazrat, main abhi soch nahi paa rahi. Please dobara koshish karein."; // Default message
        if (groqData.choices && groqData.choices[0]?.message?.content) {
            aiResponseText = groqData.choices[0].message.content;
        } else {
             // Agar Groq se ajeeb response aaye to error log hoga
            console.error("Failed to extract valid text from Groq API response:", JSON.stringify(groqData));
            throw new Error('Invalid response structure from Groq API.');
        }
        
        // =================================================================
        // === UPDATE KHATAM ===
        // =================================================================

        // Baaki ka code bilkul waisa hi hai, usko nahi chhera gaya
        console.log(`[${userId}] 4. Generating audio...`);
        const pollyParams = { Engine: 'neural', OutputFormat: 'mp3', Text: aiResponseText, VoiceId: 'Kajal', LanguageCode: 'hi-IN' };
        const audioStream = (await pollyClient.synthesizeSpeech(pollyParams)).AudioStream;
        const audioBuffer = await streamToBuffer(audioStream);
        const audioBase64 = audioBuffer.toString('base64');
        
        console.log(`[${userId}] 5. Saving to Firebase and sending response...`);
        await db.ref(`chats/${userId}`).push().set({ role: 'user', content: userQuery, timestamp: Date.now() });
        await db.ref(`chats/${userId}`).push().set({ role: 'model', content: aiResponseText, timestamp: Date.now() });
        
        res.json({ reply: aiResponseText, audioUrl: `data:audio/mpeg;base64,${audioBase64}` });
        console.log(`[${userId}] --- Request completed successfully! ---`);

    } catch (error) {
        // Aapka error handling wala block bilkul mehfooz hai
        console.error(`\n❌❌❌ [${userId}] AN ERROR OCCURRED DURING CHAT ❌❌❌`);
        console.error(error); // Poora error dikhane ke liye

        if (error.name === 'AbortError') {
            res.status(504).json({ error: 'The AI model took too long to respond.' });
        } else {
            res.status(500).json({ error: 'An internal server error occurred.' });
        }
    }
});

function streamToBuffer(stream) {
    return new Promise((resolve, reject) => {
        const chunks = [];
        stream.on('data', (chunk) => chunks.push(chunk));
        stream.on('error', reject);
        stream.on('end', () => resolve(Buffer.concat(chunks)));
    });
}

const PORT = process.env.PORT || 10000;
app.listen(PORT, '0.0.0.0', () => {
    console.log(`\n✅✅✅ Jigar Team AI Server is live and running on port ${PORT} ✅✅✅`);
});
    
