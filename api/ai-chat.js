// ai-chat.js (v17.0) - FINAL TIMEOUT & SAFETY SETTINGS FIX

const express = require('express');
const admin = require('firebase-admin');
const { Polly } = require('@aws-sdk/client-polly');
const { getMasterPrompt } = require('./system_prompts.js');
const { loadTrainingData } = require('./agent_memory.js');

// --- STARTUP CHECK ---
// (This part is correct and remains the same)
const requiredEnvVars = [ 'FIREBASE_SERVICE_ACCOUNT_KEY', 'AWS_REGION', 'AWS_ACCESS_KEY_ID', 'AWS_SECRET_ACCESS_KEY', 'GEMINI_API_KEY' ];
const missingVars = requiredEnvVars.filter(varName => !process.env[varName]);
if (missingVars.length > 0) {
    console.error('FATAL ERROR: Missing environment variables:', missingVars.join(', '));
    process.exit(1);
}

const app = express();
app.use(express.json());
app.use(express.static('public'));

// --- Initializations (Firebase, Polly, RAG) ---
// (This part is correct and remains the same)
let serviceAccount;
try {
    serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_KEY);
} catch (e) {
    console.error('FATAL ERROR: FIREBASE_SERVICE_ACCOUNT_KEY is not valid JSON.');
    process.exit(1);
}
admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
  databaseURL: "https://jigar-team-chatbot-default-rtdb.firebaseio.com"
});
const db = admin.database();
const pollyClient = new Polly({ region: process.env.AWS_REGION, credentials: { accessKeyId: process.env.AWS_ACCESS_KEY_ID, secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY }});
let ragDocuments = {};
try {
    ragDocuments = loadTrainingData();
    console.log("RAG training data loaded successfully.");
} catch (error) {
    console.error("Fatal Error: Could not load RAG training data.", error);
    process.exit(1);
}


// --- API Endpoint to Handle Chat ---
app.post('/api/chat', async (req, res) => {
    console.log("Received a new chat request..."); // Added log
    const { userId, userQuery, fullChatHistory } = req.body;

    if (!userId || !userQuery) {
        console.error("Request rejected: userId or userQuery missing.");
        return res.status(400).json({ error: 'userId and userQuery are required.' });
    }

    try {
        console.log("1. Generating master prompt...");
        const masterPrompt = getMasterPrompt(ragDocuments, fullChatHistory);
        
        const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
        const API_URL = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-pro:generateContent?key=${GEMINI_API_KEY}`;

        const contents = [];
        contents.push({ role: "user", parts: [{ text: masterPrompt }] });
        contents.push({ role: "model", parts: [{ text: "Jee, mai Jigar Team ki AI assistant hu. Mai aapki kya sahayata kar sakti hu?" }] });

        if (Array.isArray(fullChatHistory)) {
            fullChatHistory.forEach(message => {
                const role = message.role === 'user' ? 'user' : 'model';
                contents.push({ role: role, parts: [{ text: message.content }] });
            });
        }
        contents.push({ role: "user", parts: [{ text: userQuery }] });

        const payload = {
            contents: contents,
            generationConfig: {
                temperature: 0.7,
                topP: 1,
                topK: 1,
                maxOutputTokens: 2048,
            },
            // --- FIX: ADDED CORRECT SAFETY SETTINGS ---
            safetySettings: [
                { category: 'HARM_CATEGORY_HARASSMENT', threshold: 'BLOCK_MEDIUM_AND_ABOVE' },
                { category: 'HARM_CATEGORY_HATE_SPEECH', threshold: 'BLOCK_MEDIUM_AND_ABOVE' },
                { category: 'HARM_CATEGORY_SEXUALLY_EXPLICIT', threshold: 'BLOCK_MEDIUM_AND_ABOVE' },
                { category: 'HARM_CATEGORY_DANGEROUS_CONTENT', threshold: 'BLOCK_MEDIUM_AND_ABOVE' },
            ]
        };
        
        console.log("2. Calling Google Gemini API...");
        const fetch = (await import('node-fetch')).default;
        
        // --- FIX: ADDED TIMEOUT CONTROLLER ---
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 30000); // 30-second timeout

        const apiResponse = await fetch(API_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload),
            signal: controller.signal // Attach the timeout controller
        });
        
        clearTimeout(timeoutId); // Clear the timeout if response is received
        // --- END OF FIX ---

        if (!apiResponse.ok) {
            const errorText = await apiResponse.text();
            console.error('Google API Error Response:', errorText);
            throw new Error(`Google API request failed with status ${apiResponse.status}: ${errorText}`);
        }

        console.log("3. Received response from Google. Parsing data...");
        const data = await apiResponse.json();
        
        let aiResponseText;
        if (data.candidates && data.candidates[0]?.content?.parts[0]?.text) {
            aiResponseText = data.candidates[0].content.parts[0].text;
        } else {
            console.error("Invalid response from Google API:", JSON.stringify(data, null, 2));
            // Check for safety blocks
            if (data.promptFeedback?.blockReason) {
                 throw new Error(`Request was blocked by Google for: ${data.promptFeedback.blockReason}`);
            }
            throw new Error('Failed to extract AI response from Google API.');
        }
        
        console.log("4. Generating audio with AWS Polly...");
        const pollyParams = { Engine: 'neural', OutputFormat: 'mp3', Text: aiResponseText, VoiceId: 'Kajal', LanguageCode: 'hi-IN' };
        const audioStream = (await pollyClient.synthesizeSpeech(pollyParams)).AudioStream;
        const audioBuffer = await streamToBuffer(audioStream);
        const audioBase64 = audioBuffer.toString('base64');

        console.log("5. Saving to Firebase and sending response to client...");
        const userMessageRef = db.ref(`chats/${userId}`).push();
        await userMessageRef.set({ role: 'user', content: userQuery, timestamp: Date.now() });
        const aiMessageRef = db.ref(`chats/${userId}`).push();
        await aiMessageRef.set({ role: 'model', content: aiResponseText, timestamp: Date.now() });

        res.json({ aiResponse: aiResponseText, audioData: audioBase64 });
        console.log("6. Response sent successfully!");

    } catch (error) {
        if (error.name === 'AbortError') {
            console.error('Error in /api/chat: Google API request timed out after 30 seconds.');
            res.status(504).json({ error: 'The AI model took too long to respond. Please try again.' });
        } else {
            console.error('Error in /api/chat:', error);
            res.status(500).json({ error: 'An internal server error occurred. Please check server logs.' });
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
    console.log(`Server is live and running on port ${PORT}`);
});
                                    
