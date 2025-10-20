// === LIBRARIES ===
const express = require('express');
const cors = require('cors');
const admin = require('firebase-admin');
const fs = require('fs');
const path = require('path');
const { getSystemPrompt } = require('./system_prompts');

// === FIREBASE & KNOWLEDGE BASE INITIALIZATION ===
let knowledgeBase;
try {
    // Behtar logging: Shuruat mein message
    console.log("Initializing application...");
    const serviceAccountPath = '/etc/secrets/firebase_credentials.json'; 
    const serviceAccount = JSON.parse(fs.readFileSync(serviceAccountPath, 'utf8'));
    admin.initializeApp({
        credential: admin.credential.cert(serviceAccount),
        databaseURL: "https://life-change-easy-default-rtdb.firebaseio.com"
    });
    console.log("✅ Firebase Yaddasht (Memory) Connected!");

    const knowledgeBasePath = path.join(__dirname, 'knowledge_base.json');
    knowledgeBase = JSON.parse(fs.readFileSync(knowledgeBasePath, 'utf8'));
    console.log("✅ AI ka Dimaagh (Knowledge Base) Successfully Loaded!");
} catch (error) {
    // Behtar logging: Ghalti ki poori tafseel
    console.error("❌ CRITICAL INITIALIZATION FAILED:", error.message);
    console.error("Stack Trace:", error.stack); // Yeh line ghalti ki jagah batati hai
    process.exit(1); 
}

const db = admin.database();

// === EXPRESS APP SETUP ===
const app = express();
const port = process.env.PORT || 10000;
app.use(cors());
app.use(express.json({ limit: '10mb' }));

// NAYA callCohere FUNCTION (SIRF LOGGING ADD HUI HAI)
async function callCohere(systemPrompt, message, chatHistory) {
    // --- YEH NAYA LOGGING CODE HAI ---
    if (systemPrompt && systemPrompt.includes("CRITICAL INSTRUCTION")) {
        console.log("✅ System Prompts se hidayat utha li gayi hain.");
    } else {
        console.warn("⚠️ WARNING: System Prompts theek se load nahi hue ya istemal nahi ho rahe.");
    }
    // --- NAYA LOGGING CODE KHATAM ---
    
    console.log("[callCohere] Calling Cohere API...");
    const COHERE_API_KEY = process.env.COHERE_API_KEY;
    if (!COHERE_API_KEY) throw new Error("Cohere API Key not found!");
        
    const COHERE_API_URL = "https://api.cohere.ai/v1/chat";
    const requestBody = { model: "command-r-plus-08-2024", preamble: systemPrompt, message: message, chat_history: chatHistory, max_tokens: 1500 };
        
    const response = await fetch(COHERE_API_URL, { method: 'POST', headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${COHERE_API_KEY}` }, body: JSON.stringify(requestBody) });
        
    if (!response.ok) {
        const errorBody = await response.text();
        console.error(`[callCohere] Cohere API Error Response: ${errorBody}`);
        throw new Error(`Cohere API responded with status: ${response.status}`);
    }
        
    console.log("[callCohere] Successfully received response from Cohere.");
    return await response.json();
                         }


                                                       
async function generateAudio(text) {
    // Aapke is function mein pehle se try...catch laga hua tha, jo ke bohat acha hai.
    // Maine sirf error logging ko thora behtar kiya hai.
    console.log("[generateAudio] Attempting to generate audio...");
    try {
        const { PollyClient, SynthesizeSpeechCommand } = require("@aws-sdk/client-polly");
        const AWS_ACCESS_KEY_ID = process.env.MY_AWS_ACCESS_KEY_ID;
        const AWS_SECRET_ACCESS_KEY = process.env.MY_AWS_SECRET_ACCESS_KEY;
        const AWS_REGION = process.env.MY_AWS_REGION;
        if (!AWS_ACCESS_KEY_ID || !AWS_SECRET_ACCESS_KEY || !AWS_REGION) {
            console.warn("[generateAudio] AWS credentials not found. Skipping audio generation.");
            return null;
        }
        const pollyClient = new PollyClient({ region: AWS_REGION, credentials: { accessKeyId: AWS_ACCESS_KEY_ID, secretAccessKey: AWS_SECRET_ACCESS_KEY } });
        const params = { Text: text, OutputFormat: "mp3", VoiceId: "Kajal", Engine: "neural", LanguageCode: "hi-IN" };
        const command = new SynthesizeSpeechCommand(params);
        const { AudioStream } = await pollyClient.send(command);
        const chunks = [];
        for await (const chunk of AudioStream) { chunks.push(chunk); }
        const buffer = Buffer.concat(chunks);
        console.log("[generateAudio] Audio generated successfully.");
        return `data:audio/mpeg;base64,${buffer.toString("base64")}`;
    } catch (error) {
        // Behtar error logging
        console.error("❌ [generateAudio] Audio Generation FAILED:");
        console.error("Error Message:", error.message);
        console.error("Stack Trace:", error.stack);
        return null; // App crash hone se bachane ke liye null return karein
    }
                                                                                }


// === NAYA FUNCTION: USER KE MESSAGE KA MATLAB SAMAJHNE KE LIYE (IMPROVED WITH ERROR HANDLING) ===
async function getIntent(userMessage, currentState, chatHistory) {
    console.log(`[getIntent] User ke message ka matlab samajhne ki koshish... State: ${currentState}`);
    // Is ahem function ko try...catch mein daala gaya hai
    try {
        const intentSystemPrompt = `
            You are an expert intent detection AI. Your only job is to analyze the user's message and the conversation context, and classify the user's intent into one of the following categories.
            Respond with ONLY ONE of these words: 
            'confirm', 'reject', 'cheaper', 'better', 'ask_question', 'provide_info', 'help', 'general_chat'.

            - 'confirm': User is agreeing, saying yes, okay, ready, next, etc. (e.g., "theek hai", "chalo aage barho", "ji main ready hoon", "wallet ban gaya hai", "dollars aa gaye hain").
            - 'reject': User is disagreeing, saying no, not interested, etc. (e.g., "nahi karna", "main interested nahi").
            - 'cheaper': User is asking for a cheaper, lower price, or budget plan. (e.g., "isse sasta dikhao", "budget kam hai").
            - 'better': User is asking for a better, more expensive, or higher salary plan. (e.g., "isse behtar plan hai?", "aur zyada salary wala?").
            - 'ask_question': User is asking a question about the business, plans, or process. (e.g., "kaam kya hai?", "company kya kamati hai?").
            - 'provide_info': User is providing the information that was asked for (like their name, age, city, or referrer info).
            - 'help': User is explicitly asking for help or is confused. (e.g., "madad chahiye", "samajh nahi aa rahi").
            - 'general_chat': The message is a general greeting, a random statement, or off-topic.
        `;

        const cohereResponse = await callCohere(intentSystemPrompt, userMessage, chatHistory);
        // Agar cohereResponse.text na ho to ghalti se bachne ke liye check
        const potentialIntent = (cohereResponse.text || '').toLowerCase().trim().replace(/['".]/g, '');
        const validIntents = ['confirm', 'reject', 'cheaper', 'better', 'ask_question', 'provide_info', 'help', 'general_chat'];
        const intent = validIntents.includes(potentialIntent) ? potentialIntent : 'general_chat';
        
        console.log(`[getIntent] AI ne matlab samjha: '${intent}'`);
        return intent;
    } catch (error) {
        console.error("❌ [getIntent] FAILED to detect intent:");
        console.error("Error Message:", error.message);
        console.error("Stack Trace:", error.stack);
        // Agar ghalti ho to 'general_chat' return karein taake app crash na ho
        return 'general_chat';
    }
}

// === NAYA, ZYADA STRICT routeUserQuery FUNCTION ===
async function routeUserQuery(intent, state) {
    const currentState = state || 'onboarding_entry';
    console.log(`[Router] Routing based on Intent: '${intent}' and State: '${currentState}'`);

    // Rule #1: Agar user koi aam sawal ya aam baat kar raha hai,
    // LEKIN woh abhi business flow ke shuru mein hai (onboarding),
    // to usay business logic mein hi rakho.
    if ((intent === 'ask_question' || intent === 'general_chat') && currentState.startsWith('onboarding_')) {
        console.log("[Router] Decision: User is in onboarding, keeping in business logic.");
        return 'business_logic';
    }

    // Rule #2: Agar user koi aam sawal ya aam baat kar raha hai,
    // aur woh business flow ke beech mein NAHI hai, tab usay General Brain ke paas bhejo.
    if (intent === 'ask_question' || intent === 'general_chat') {
        console.log("[Router] Decision: User is asking a general question, sending to general brain.");
        return 'general_conversation';
    }

    // Rule #3: Baaki har surat mein (confirm, reject, provide_info, etc.),
    // hamesha Business Logic Brain istemal karo.
    console.log("[Router] Decision: Intent is business-related, sending to business logic.");
    return 'business_logic';
}
    


// === MUKAMMAL AUR SYNTAX-CORRECTED handleBusinessLogic FUNCTION ===
async function handleBusinessLogic(userData, userMessage, intent) {
    // Is poore function ko ek bare try...catch block mein daal diya gaya hai
    // taake iske andar kisi bhi 'if' block mein ghalti ho to pakri ja sake.
    try {
        const state = userData.conversation_state;
        let nextState = state;
        let instructionForAI = ""; 

        // Dono logging lines yahan hain
        console.log(`[handleBusinessLogic] Current State: ${state}, Intent: ${intent}`);
        console.log(`[handleBusinessLogic] Knowledge Base se state '${state}' ka data dhoond raha hoon...`);

        // --- Neeche aapka poora if/else if ka structure hai ---
        if (state === 'onboarding_entry') {
            const entryPoint = knowledgeBase.onboarding_flow.entry_point;
            const isIslamic = userMessage.toLowerCase().includes("salam");
            instructionForAI = isIslamic ? entryPoint.responses.islamic_greeting : entryPoint.responses.generic_greeting;
            nextState = 'onboarding_introduction';
        } 
        else if (state === 'onboarding_introduction' && intent === 'confirm') {
            instructionForAI = knowledgeBase.onboarding_flow.introduction.content;
            nextState = 'gathering_name';
        }
        else if (state === 'gathering_name' && intent === 'provide_info') {
            userData.details.name = userMessage;
            const question = knowledgeBase.onboarding_flow.information_gathering.find(q => q.id === 'age').query;
            instructionForAI = question.replace('{user_name}', userData.details.name);
            nextState = 'gathering_age';
        }
        else if (state === 'gathering_age' && intent === 'provide_info') {
            userData.details.age = userMessage;
            const question = knowledgeBase.onboarding_flow.information_gathering.find(q => q.id === 'city').query;
            instructionForAI = question.replace('{user_name}', userData.details.name);
            nextState = 'gathering_city';
        }
        else if (state === 'gathering_city' && intent === 'provide_info') {
            userData.details.city = userMessage;
            const successMsg = knowledgeBase.onboarding_flow.information_gathering.find(q => q.id === 'city').success_response;
            const nextQuestion = knowledgeBase.onboarding_flow.information_gathering.find(q => q.id === 'device_and_experience').query;
            instructionForAI = `${successMsg.replace('{user_city}', userMessage)}\n\n${nextQuestion.replace('{user_name}', userData.details.name)}`;
            nextState = 'gathering_device';
        }
        else if (state === 'gathering_device' && intent === 'provide_info') {
            userData.details.device_experience = userMessage;
            const question = knowledgeBase.onboarding_flow.information_gathering.find(q => q.id === 'current_profession').query;
            instructionForAI = question.replace('{user_name}', userData.details.name);
            nextState = 'gathering_profession';
        }
        else if (state === 'gathering_profession' && intent === 'provide_info') {
            userData.details.profession = userMessage;
            const pauseMessage = knowledgeBase.onboarding_flow.verification_pause.content;
            instructionForAI = pauseMessage.replace('{user_name}', userData.details.name);
            nextState = 'verification_paused';
        }
        else if (state === 'verification_paused' && intent === 'confirm') {
            instructionForAI = knowledgeBase.business_pillars[0].content;
            nextState = 'presenting_pillar_2';
        }
        else if (state === 'presenting_pillar_2' && intent === 'confirm') {
            instructionForAI = knowledgeBase.business_pillars[1].content;
            nextState = 'presenting_pillar_3';
        }
        else if (state === 'presenting_pillar_3' && intent === 'confirm') {
            instructionForAI = knowledgeBase.business_pillars[2].content;
            nextState = 'presenting_pillar_4';
        }
        else if (state === 'presenting_pillar_4' && intent === 'confirm') {
            instructionForAI = knowledgeBase.business_pillars[3].content;
            nextState = 'explaining_profit_model';
        }
        else if (state === 'explaining_profit_model' && intent === 'confirm') {
            instructionForAI = knowledgeBase.company_profit_model.content;
            nextState = 'proposing_starter_plan';
        }
        else if (state === 'proposing_starter_plan' && intent === 'confirm') {
            const starterPlan = knowledgeBase.job_plans.find(p => p.level === 3);
            instructionForAI = `Aapki tamam maloomat aur aapke buland iraday dekh kar, main ne aap ke liye ek behtareen 'Starter Job Package' muntakhib (select) kiya hai jo aap ke liye is shandar career ka pehla qadam sabit ho sakta hai.\n\n` +
                           `**Package Name: ${starterPlan.name} (Level ${starterPlan.level})**\n\n` +
                           `**Registration Fee (Zindagi mein sirf ek baar):**\n` +
                           `- Kul Qeemat: ${starterPlan.price.pkr.toLocaleString()} PKR (ya $${starterPlan.price.total_usd})\n\n` +
                           `**Iske Badle Mein Aapko Kya Milega:**\n` +
                           `- Monthly Salary: **${starterPlan.salary.pkr.toLocaleString()} PKR** (ya $${starterPlan.salary.usd})\n` +
                           `- Monthly Target: ${starterPlan.target}\n\n` +
                           `Yeh package na sirf aap ki jaib par halka hai, balke aap ko ek zabardast mustaqil salary tak pohnchane ki poori salahiyat rakhta hai.\n\n` +
                           `Aap batayein, kya aap is package ke sath apna career shuru karna chahenge? Ya aap is se behtar (zyada salary wala) ya kam budget wala package dekhna chahte hain? Faisla aap ka hai.`;
            userData.details.last_plan_shown = 3;
            nextState = 'handling_plan_feedback';
        }
        else if (state === 'handling_plan_feedback') {
            let newPlanLevel = userData.details.last_plan_shown;
            let responsePrefix = "";
            
            if (intent === 'cheaper') {
                newPlanLevel--;
            } else if (intent === 'better') {
                newPlanLevel++;
            } else if (intent === 'confirm') {
                const finalPlan = knowledgeBase.job_plans.find(p => p.level === newPlanLevel);
                instructionForAI = `Bohat khoob! Aapne '${finalPlan.name}' package ka intekhab kiya hai. Yeh ek shandar faisla hai. Ab agle marhalay mein, main aapko is plan ke fayde aur kaam karne ka tareeka samjhaunga.`;
                userData.details.final_plan_level = newPlanLevel;
                userData.details.benefit_step = 0;
                nextState = 'explaining_plan_benefits';
                const finalSystemPrompt = getSystemPrompt('business_logic', userData, instructionForAI);
                const cohereResponse = await callCohere(finalSystemPrompt, userMessage, userData.chat_history);
                userData.conversation_state = nextState;
                return { responseText: cohereResponse.text, updatedUserData: userData };
            }

            if (newPlanLevel < 1) {
                responsePrefix = "Maazrat, is se sasta aur koi plan mojood nahin hai. Level 1 hamara sab se buniyadi package hai.";
                newPlanLevel = 1;
            } else if (newPlanLevel > 12) {
                responsePrefix = "Masha'Allah, aapke iraday bohat buland hain! Filhal, Level 12 hamara sab se senior package hai.";
                newPlanLevel = 12;
            }

            const newPlan = knowledgeBase.job_plans.find(p => p.level === newPlanLevel);
            const planMessage = `\n\nBilkul! Pesh-e-khidmat hai Level ${newPlan.level} ka package:\n\n` +
                                `**Package Name: ${newPlan.name} (Level ${newPlan.level})**\n\n` +
                                `**Registration Fee:**\n` +
                                `- Kul Qeemat: ${newPlan.price.pkr.toLocaleString()} PKR (ya $${newPlan.price.total_usd})\n\n` +
                                `**Iske Badle Mein Aapko Kya Milega:**\n` +
                                `- Monthly Salary: **${newPlan.salary.pkr.toLocaleString()} PKR** (ya $${newPlan.salary.usd})\n` +
                                `- Monthly Target: ${newPlan.target}\n\n` +
                                `Ab aap batayein, kya yeh plan aapke liye munasib hai? Ya is se bhi sasta/behtar plan dekhna chahenge?`;
            
            instructionForAI = (responsePrefix === "") ? planMessage.trim() : responsePrefix + planMessage;
            userData.details.last_plan_shown = newPlanLevel;
            nextState = 'handling_plan_feedback';
        }
        else if (state === 'explaining_plan_benefits' && intent === 'confirm') {
            const planLevel = userData.details.final_plan_level;
            const benefitStep = userData.details.benefit_step || 0;
            const planBenefits = knowledgeBase.plan_benefits[`level_${planLevel}`];

            if (planBenefits && planBenefits[benefitStep]) {
                instructionForAI = planBenefits[benefitStep].content;
                userData.details.benefit_step = benefitStep + 1;
                nextState = 'explaining_plan_benefits';
            } else {
                instructionForAI = knowledgeBase.final_objections.step_1_live_proof.content;
                userData.details.objection_step = 1;
                nextState = 'handling_final_objections';
            }
        }
        else if (state === 'handling_final_objections' && intent === 'confirm') {
            const objectionStep = userData.details.objection_step || 1;
            if (objectionStep === 1) {
                instructionForAI = knowledgeBase.final_objections.step_2_personal_reassurance.content;
                userData.details.objection_step = 2;
                nextState = 'handling_final_objections';
            } else if (objectionStep === 2) {
                instructionForAI = knowledgeBase.final_objections.step_3_urgency_reminder.content;
                userData.details.objection_step = 3;
                nextState = 'handling_final_objections';
            } else {
                instructionForAI = "Zabardast! Aapke tamam sawalat ke jawab de diye gaye hain. Ab aap registration ke aakhri marhalay ke liye tayyar hain, jahan aapko payment kar ke apne digital programs khareedne honge.";
                nextState = 'ready_for_payment';
            }
        }
                else if (state === 'ready_for_payment' && intent === 'confirm') {
            instructionForAI = knowledgeBase.registration_process.step_1_wallet_creation.content;
            nextState = 'waiting_for_wallet_creation';
        }
        else if (state === 'waiting_for_wallet_creation' && intent === 'confirm') {
            instructionForAI = knowledgeBase.registration_process.step_2_dollar_purchase.content;
            nextState = 'waiting_for_dollar_option';
        }
        else if (state === 'waiting_for_dollar_option') {
            let instructions = knowledgeBase.registration_process.step_2_dollar_purchase.option_2_instructions;
            instructionForAI = instructions.replace('{final_plan_level}', userData.details.final_plan_level || 'selected');
            nextState = 'waiting_for_dollar_purchase';
        }
        else if (state === 'waiting_for_dollar_purchase' && intent === 'confirm') {
            instructionForAI = knowledgeBase.referral_engine.initial_query;
            nextState = 'gathering_referral_info';
        }
        else if (state === 'gathering_referral_info' && intent === 'provide_info') {
            const userMessageLower = userMessage.toLowerCase();
            let leaderFound = null;
            for (const leader of knowledgeBase.referral_engine.leaders) {
                if (userMessageLower.includes(leader.name.toLowerCase()) && userMessage.includes(leader.link)) {
                    leaderFound = leader;
                    break;
                }
            }
            
            if (leaderFound) {
                instructionForAI = `${knowledgeBase.referral_engine.verification_success_intro}\n\n${leaderFound.motivation_story}\n\n${knowledgeBase.referral_engine.final_instructions}`;
            } else {
                const founder = knowledgeBase.referral_engine.leaders.find(l => l.id === 1);
                instructionForAI = `${knowledgeBase.referral_engine.verification_failure_intro}\n\n${knowledgeBase.referral_engine.failure_solution_offer}\n\n${founder.motivation_story}\n\n${knowledgeBase.referral_engine.final_instructions}`;
            }
            nextState = 'waiting_for_final_registration';
        }
        else if (state === 'waiting_for_final_registration' && intent === 'confirm') {
            let welcomeMsg = knowledgeBase.training_and_support.welcome_message.replace('{user_name}', userData.details.name);
            let trainingMsg = knowledgeBase.training_and_support.training_instructions;
            instructionForAI = `${welcomeMsg}\n\n${trainingMsg}`;
            nextState = 'conversation_completed';
        }
        else if (intent === 'help') {
            instructionForAI = knowledgeBase.help_desk.content;
            nextState = state;
        }
        else {
            console.log(`[handleBusinessLogic] State/Intent match nahi hua. General Brain ko call kar raha hoon...`);
            const generalSystemPrompt = getSystemPrompt('general_conversation', userData);
            const cohereResponse = await callCohere(generalSystemPrompt, userMessage, userData.chat_history);
            userData.conversation_state = state; 
            return { responseText: cohereResponse.text, updatedUserData: userData };
        }

        // --- AI ko call karke final, insani jawab hasil karna ---
        const finalSystemPrompt = getSystemPrompt('business_logic', userData, instructionForAI);
        const cohereResponse = await callCohere(finalSystemPrompt, userMessage, userData.chat_history);
        
        userData.conversation_state = nextState;
        return { responseText: cohereResponse.text, updatedUserData: userData };

    } catch (error) {
        // Agar upar 'try' block mein kahin bhi ghalti hui to woh yahan pakri jayegi
        console.error(`❌ [handleBusinessLogic] FAILED during State: ${userData.conversation_state} & Intent: ${intent}`);
        console.error("Error Message:", error.message);
        console.error("Stack Trace:", error.stack);
        // Is ghalti ko aage bhejein taake main route handler isay handle kar le
        throw error;
    }
    }

        
    
        
// === FINAL, MOST INTELLIGENT app.post FUNCTION (v5) ===
app.post('/', async (req, res) => {
    const { userId, message } = req.body;
    if (!userId) {
        console.error("❌ Request received without userId.");
        return res.status(400).json({ error: "User ID is required." });
    }

    console.log(`\n--- [${userId}] New Request --- Message: "${message}" ---`);

    try {
        const userRef = db.ref(`chat_users/${userId}`);
        const userSnapshot = await userRef.once('value');
        let userData = userSnapshot.val();

        let isNewUser = false; // Ek flag banaya
        if (!userData || !userData.conversation_state) {
            console.log(`[${userId}] New or incomplete user. Creating/Resetting data.`);
            isNewUser = true; // Flag ko set kiya
            userData = {
                details: userData?.details || {}, 
                chat_history: userData?.chat_history || [],
                conversation_state: "onboarding_entry" 
            };
            await userRef.set(userData); 
            console.log(`[${userId}] Initial data for user saved/reset in Firebase.`);
        } else {
            console.log(`[${userId}] Existing user. Current state: ${userData.conversation_state}`);
        }
        
        if (!userData.chat_history) {
            userData.chat_history = [];
        }

        // --- YAHI ASAL, AAKHRI AUR FINAL FIX HAI ---
        let queryType;
        let intent;

        // Agar user bilkul naya hai, to AI se intent poochne ki zaroorat hi nahi!
        // Zabardasti usay 'business_logic' mein bhejo.
        if (isNewUser) {
            console.log(`[Router] User is brand new. Forcing 'business_logic'.`);
            queryType = 'business_logic';
            intent = 'confirm'; // Hum farz kar lete hain ke usne confirm kiya hai
        } else {
            // Agar purana user hai, tab AI se intent poocho
            intent = await getIntent(message, userData.conversation_state, userData.chat_history);
            queryType = await routeUserQuery(intent, userData.conversation_state);
        }
        // --- FIX KHATAM ---
        
        let result;
        console.log(`[Router] Faisla: Message ko '${queryType}' brain ke paas bheja ja raha hai.`);

        if (queryType === 'business_logic') {
            console.log(`[${userId}] Using Business Logic Brain...`);
            result = await handleBusinessLogic(userData, message, intent);
        } else { 
            console.log(`[${userId}] Using General Conversation Brain...`);
            const generalSystemPrompt = getSystemPrompt('general_conversation', userData);
            const cohereResponse = await callCohere(generalSystemPrompt, message, userData.chat_history);
            result = {
                responseText: cohereResponse.text,
                updatedUserData: userData 
            };
        }

        let { responseText, updatedUserData } = result;

        if (!updatedUserData.chat_history) {
            updatedUserData.chat_history = [];
        }

        updatedUserData.chat_history.push({ role: "USER", message: message });
        updatedUserData.chat_history.push({ role: "CHATBOT", message: responseText });
        
        await userRef.set(updatedUserData);
        console.log(`[${userId}] State updated to: ${updatedUserData.conversation_state}. Firebase sync complete.`);

        const audioUrl = await generateAudio(responseText);
        
        console.log(`[${userId}] Sending final response to user.`);
        res.status(200).json({ reply: responseText, audioUrl: audioUrl });

    } catch (error) {
        console.error(`\n!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!`);
        console.error(`[${userId}] XXX A FATAL ERROR OCCURRED IN THE MAIN ROUTE HANDLER XXX`);
        console.error("Error Message:", error.message);
        console.error("Full Error Stack:", error.stack);
        console.error(`!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!\n`);
        
        res.status(500).json({ error: "Maazrat, AI agent mein ek andruni ghalti hogayi hai." });
    }
});
    
// === SERVER START ===
app.listen(port, () => {
    console.log(`✅ Recruitment Agent Server v1.2 (Robust Edition 2.0) is running on port ${port}`);
});
 