// ai-chat.js (v13.0) - Corrected Model Name & Payload Format

const express = require('express');
const admin = require('firebase-admin');
const { Polly } = require('@aws-sdk/client-polly');
const { getMasterPrompt } = require('./system_prompts.js');
const { loadTrainingData } = require('./agent_memory.js');

const app = express();
app.use(express.json());
app.use(express.static('public')); // Serve static files like index.html

// --- Firebase Initialization ---
const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_KEY);
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
    process.exit(1); // Exit if training data fails to load
}

// --- API Endpoint to Handle Chat ---
app.post('/api/chat', async (req, res) => {
    const { userId, userQuery, fullChatHistory } = req.body;

    if (!userId || !userQuery) {
        return res.status(400).json({ error: 'userId and userQuery are required.' });
    }

    try {
        // 1. Get Master Prompt (System Instructions)
        const masterPrompt = getMasterPrompt(ragDocuments, fullChatHistory);

        // 2. Construct the payload for Google Gemini API
        const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
        
        // --- FIX: CORRECTED MODEL NAME IN THE URL ---
        const API_URL = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-pro:generateContent?key=${GEMINI_API_KEY}`;

        // --- CORRECTED CONTENTS CONSTRUCTION ---
        const contents = [];

        // Add the master prompt first
        contents.push({
            role: "user",
            parts: [{ text: masterPrompt }]
        });
        // Add a placeholder model response to establish the conversation flow
        contents.push({
            role: "model",
            parts: [{ text: "Jee, mai Jigar Team ki AI assistant hu. Mai aapki kya sahayata kar sakti hu?" }]
        });

        // Add the actual chat history in the correct format
        if (Array.isArray(fullChatHistory)) {
            fullChatHistory.forEach(message => {
                const role = message.role === 'user' ? 'user' : 'model';
                contents.push({
                    role: role,
                    parts: [{ text: message.content }]
                });
            });
        }
        
        // Finally, add the latest user query
        contents.push({
            role: "user",
            parts: [{ text: userQuery }]
        });
        // --- END OF CORRECTION ---

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
        
        // 3. Call Google Gemini API
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
        
        // 4. Extract AI Response
        let aiResponseText;
        if (data.candidates && data.candidates[0]?.content?.parts[0]?.text) {
            aiResponseText = data.candidates[0].content.parts[0].text;
        } else {
            console.error("Invalid response structure from Google API:", JSON.stringify(data, null, 2));
            throw new Error('Failed to extract AI response from Google API.');
        }
        
        // 5. Generate Audio with AWS Polly
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

        // 6. Save to Firebase and respond to client
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

// Helper function to convert stream to buffer
function streamToBuffer(stream) {
    return new Promise((resolve, reject) => {
        const chunks = [];
        stream.on('data', (chunk) => chunks.push(chunk));
        stream.on('error', reject);
        stream.on('end', () => resolve(Buffer.concat(chunks)));
    });
}

// --- Server Start ---
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
});
    
