// ai-chat.js (v15.0) - FINAL ROBUST VERSION

const express = require('express');
const admin = require('firebase-admin');
const { Polly } = require('@aws-sdk/client-polly');
const { getMasterPrompt } = require('./system_prompts.js');
const { loadTrainingData } = require('./agent_memory.js');

// --- STARTUP CHECK: Verify all environment variables are present ---
const requiredEnvVars = [
    'FIREBASE_SERVICE_ACCOUNT_KEY',
    'AWS_REGION',
    'AWS_ACCESS_KEY_ID',
    'AWS_SECRET_ACCESS_KEY',
    'GEMINI_API_KEY'
];

const missingVars = requiredEnvVars.filter(varName => !process.env[varName]);

if (missingVars.length > 0) {
    console.error('FATAL ERROR: The following required environment variables are not set:');
    console.error(missingVars.join('\n'));
    console.error('Please set them in your hosting provider (Render.com) and restart the server.');
    process.exit(1); // Stop the server from starting
}
// --- END OF STARTUP CHECK ---

const app = express();
app.use(express.json());
app.use(express.static('public'));

// --- Firebase Initialization ---
let serviceAccount;
try {
    serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_KEY);
} catch (e) {
    console.error('FATAL ERROR: FIREBASE_SERVICE_ACCOUNT_KEY is not a valid JSON object.');
    process.exit(1);
}

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
  databaseURL: "https://jigar-team-chatbot-default-rtdb.firebaseio.com"
});
const db = admin.database();

// --- AWS Polly Initialization ---
const pollyClient = new Polly({
    region: process.env.AWS_REGION,
    credentials: {
        accessKeyId: process.env.AWS_ACCESS_KEY_ID,
        secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY
    }
});

// --- RAG Training Data Loading ---
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
    // ... (rest of the code is the same as v14.0 and is correct) ...
    const { userId, userQuery, fullChatHistory } = req.body;

    if (!userId || !userQuery) {
        return res.status(400).json({ error: 'userId and userQuery are required.' });
    }

    try {
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
            safetySettings: [
                { category: 'HARM_CATEGORY_HARASSMENT', threshold: 'BLOCK_NONE' },
                { category: 'HARM_CATEGORY_HATE_SPEECH', threshold: 'BLOCK_NONE' },
                { category: 'HARM_CATEGORY_SEXUALLY_EXPLICIT', threshold: 'BLOCK_NONE' },
                { category: 'HARM_CATEGORY_DANGEROUS_CONTENT', threshold: 'BLOCK_NONE' },
            ]
        };
        
        const fetch = (await import('node-fetch')).default;
        const apiResponse = await fetch(API_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });

        if (!apiResponse.ok) {
            const errorText = await apiResponse.text();
            console.error('Google API Error Response:', errorText);
            throw new Error(`Google API request failed with status ${apiResponse.status}: ${errorText}`);
        }

        const data = await apiResponse.json();
        
        let aiResponseText;
        if (data && data.candidates && data.candidates.length > 0 && data.candidates[0].content && data.candidates[0].content.parts && data.candidates[0].content.parts.length > 0 && data.candidates[0].content.parts[0].text) {
            aiResponseText = data.candidates[0].content.parts[0].text;
        } else {
            console.error("Invalid response structure from Google API:", JSON.stringify(data, null, 2));
            throw new Error('Failed to extract AI response from Google API.');
        }
        
        const pollyParams = {
            Engine: 'neural',
            OutputFormat: 'mp3',
            Text: aiResponseText,
            VoiceId: 'Kajal',
            LanguageCode: 'hi-IN'
        };
        const audioStream = (await pollyClient.synthesizeSpeech(pollyParams)).AudioStream;
        const audioBuffer = await streamToBuffer(audioStream);
        const audioBase64 = audioBuffer.toString('base64');

        const userMessageRef = db.ref(`chats/${userId}`).push();
        await userMessageRef.set({ role: 'user', content: userQuery, timestamp: Date.now() });

        const aiMessageRef = db.ref(`chats/${userId}`).push();
        await aiMessageRef.set({ role: 'model', content: aiResponseText, timestamp: Date.now() });

        res.json({
            aiResponse: aiResponseText,
            audioData: audioBase64
        });

    } catch (error) {
        console.error('Error in /api/chat:', error);
        res.status(500).json({ error: 'An internal server error occurred. Please check server logs.' });
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

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
});
