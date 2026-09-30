const { Client, GatewayIntentBits, Events } = require('discord.js');
const axios = require('axios');

// CONFIGURATION 
const BOT_TOKEN = "MTU1NDk0MjAxMzI3MzgwNDkxMA.GV3ift.hvDbZEWN6b-nTQwlTKJLmTUxKR7jArOaaaqijw"; // The token you copied in Step 1
const TARGET_CHANNEL_ID = "1529476998169100461"; // Right click your announcement channel -> Copy ID
const ROBLOX_GROUP_ID = 223811537; // ReWorked-Games

// Initialize full intent permissions to read poll interactions natively
const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent
    ]
});

let cachedShoutText = "";
const activePollsMap = new Map(); // Tracks live message IDs and their option mappings

// ====================================================================
// SECTION A: BACKGROUND SENSOR (WATCHES REWORKED-GAMES FOR CHANGES)
// ====================================================================
async function checkRobloxGroupShout() {
    try {
        // Fetch live metadata via proxy bypass
        const res = await axios.get(`https://roproxy.com\${ROBLOX_GROUP_ID}`);
        if (!res.data || !res.data.shout) return;

        const currentShout = res.data.shout.body;
        const author = res.data.shout.poster.username;
        const groupName = res.data.name;

        // Skip initial check to prevent retro-spamming historical posts
        if (cachedShoutText === "") {
            cachedShoutText = currentShout;
            console.log(`System baseline established. Monitoring shout: "\${cachedShoutText}"`);
            return;
        }

        // TRIGGER ACTIVE: Fires instantly if the text body scales or modifies
        if (currentShout !== cachedShoutText) {
            cachedShoutText = currentShout;
            console.log(`New announcement found from \${author}! Generating live poll structure...`);
            
            await dispatchNativelyTrackedPoll(currentShout, author, groupName);
        }
    } catch (err) {
        console.error("Error contacting group api endpoints:", err.message);
    }
}

// Parses your text fields and maps it straight to native interactive component formats
async function dispatchNativelyTrackedPoll(rawShout, author, groupName) {
    const channel = await client.channels.fetch(TARGET_CHANNEL_ID);
    if (!channel) return;

    // Split text fields purely using pipe lines (|)
    const segments = rawShout.split('|').map(s => s.trim());
    const mainContent = segments[0] || rawShout;
    let pollQuestion = "Community Poll";
    let pollAnswers = [
        { pollMedia: { text: "Agree" } },
        { pollMedia: { text: "Disagree" } }
    ];

    if (segments.length > 1) {
        pollQuestion = segments[1];
        if (segments.length > 2) {
            pollAnswers = segments.slice(2, 12).map(choiceText => ({
                pollMedia: { text: choiceText.substring(0, 55) }
            }));
        }
    }

    // Post native interactive vote card directly to the server stream
    const sentMessage = await channel.send({
        content: `# 📢 **\${groupName.toUpperCase()} UPDATE**\n**Posted by \({author}:**\n>\){mainContent}`,
        poll: {
            question: { text: pollQuestion.substring(0, 300) },
            answers: pollAnswers,
            duration: 24,
            allowMultiselect: false
        }
    });

    // Save tracking metadata references into memory arrays to register voter updates later
    activePollsMap.set(sentMessage.id, {
        question: pollQuestion,
        choices: pollAnswers.map((a, index) => ({ id: index + 1, text: a.pollMedia.text })),
        votersRegistry: {} // Stores choice index mappings tied to specific voter usernames
    });
}

// ====================================================================
// SECTION B: REAL INTERACTION GATEWAY (READS REAL VOTES)
// ====================================================================

// Automatically intercepts interactions the instant a real user clicks an answer button
client.on(Events.MessagePollVoteAdd, async (pollAnswer, userId) => {
    const messageId = pollAnswer.message.id;
    
    // Check if the modified poll card was created dynamically by this system loop
    if (!activePollsMap.has(messageId)) return;
    
    const pollMetadata = activePollsMap.get(messageId);
    const userInstance = await client.users.fetch(userId);
    if (userInstance.bot) return;

    // Fetch the answer target user clicked
    const chosenAnswerId = pollAnswer.answerId;
    const choiceObject = pollMetadata.choices.find(c => c.id === chosenAnswerId);
    const selectionText = choiceObject ? choiceObject.text : "Unknown Option";

    // Update real voter registry state values inside memory maps
    pollMetadata.votersRegistry[userInstance.username] = selectionText;

    // Rebuild the text display string block live showing exactly who voted for what
    let registryDisplayString = `\n\n### 📊 **Live Voter Verification Logs:**`;
    const registryEntries = Object.entries(pollMetadata.votersRegistry);

    if (registryEntries.length === 0) {
        registryDisplayString += `\n*No verified votes recorded yet.*`;
    } else {
        registryEntries.forEach(([username, choice]) => {
            registryDisplayString += `\n* **@\${username}** selected option: \`${choice}\``;
        });
    }

    // Edit the text content above the native poll card in real-time
    // The native card updates numbers automatically, this prints their actual profile tags!
    const baseContent = pollAnswer.message.content.split('\n\n### 📊')[0];
    await pollAnswer.message.edit({
        content: baseContent + registryDisplayString
    });
    
    console.log(`Processed real vote verification: ${userInstance.username} selected "${selectionText}"`);
});

// Boot connection
client.once(Events.ClientReady, () => {
    console.log(`🤖 Logged in as ${client.user.tag}. Two-way tracking tracking link active!`);
    
    // Run automated group change scraping loops every 60 seconds
    setInterval(checkRobloxGroupShout, 60000);
});

client.login(BOT_TOKEN);
