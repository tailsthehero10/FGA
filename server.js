const { Client, GatewayIntentBits, Events } = require('discord.js');
const axios = require('axios');
const express = require('express');

// Express framework setup to satisfy Render's port binding requirements
const app = express();
const PORT = process.env.PORT || 3000;

app.get('/', (req, res) => {
    res.send('🤖 ReWorked-Games Tracker Bot is running perfectly!');
});

app.listen(PORT, () => {
    console.log(`📡 Render web listener successfully bound to port \${PORT}`);
});

// CONFIGURATION ENVIRONMENT VARIABLES (Managed via Render Control Panel)
const BOT_TOKEN = process.env.DISCORD_BOT_TOKEN;
const TARGET_CHANNEL_ID = process.env.DISCORD_CHANNEL_ID;
const ROBLOX_GROUP_ID = 223811537; // ReWorked-Games

const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent
    ]
});

let cachedShoutText = "";
const activePollsMap = new Map();

async function checkRobloxGroupShout() {
    try {
        const res = await axios.get(`https://roproxy.com\${ROBLOX_GROUP_ID}`);
        if (!res.data || !res.data.shout) return;

        const currentShout = res.data.shout.body;
        const author = res.data.shout.poster.username;
        const groupName = res.data.name;

        if (cachedShoutText === "") {
            cachedShoutText = currentShout;
            console.log(`System baseline established. Monitoring shout: "\${cachedShoutText}"`);
            return;
        }

        if (currentShout !== cachedShoutText) {
            cachedShoutText = currentShout;
            console.log(`🚨 Change detected! Generating live poll structure...`);
            await dispatchNativelyTrackedPoll(currentShout, author, groupName);
        }
    } catch (err) {
        console.error("Error contacting group API proxy:", err.message);
    }
}

async function dispatchNativelyTrackedPoll(rawShout, author, groupName) {
    try {
        const channel = await client.channels.fetch(TARGET_CHANNEL_ID);
        if (!channel) return;

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

        const sentMessage = await channel.send({
            content: `# 📢 **\${groupName.toUpperCase()} UPDATE**\n**Posted by @\({author}:**\n>\){mainContent}`,
            poll: {
                question: { text: pollQuestion.substring(0, 300) },
                answers: pollAnswers,
                duration: 24,
                allowMultiselect: false
            }
        });

        activePollsMap.set(sentMessage.id, {
            question: pollQuestion,
            choices: pollAnswers.map((a, index) => ({ id: index + 1, text: a.pollMedia.text })),
            votersRegistry: {}
        });
    } catch (error) {
        console.error("Failed to dispatch native poll card:", error.message);
    }
}

client.on(Events.MessagePollVoteAdd, async (pollAnswer, userId) => {
    try {
        const messageId = pollAnswer.message.id;
        if (!activePollsMap.has(messageId)) return;
        
        const pollMetadata = activePollsMap.get(messageId);
        const userInstance = await client.users.fetch(userId);
        if (userInstance.bot) return;

        const chosenAnswerId = pollAnswer.answerId;
        const choiceObject = pollMetadata.choices.find(c => c.id === chosenAnswerId);
        const selectionText = choiceObject ? choiceObject.text : "Unknown Option";

        pollMetadata.votersRegistry[userInstance.username] = selectionText;

        let registryDisplayString = `\n\n### 📊 **Live Voter Verification Logs:**`;
        const registryEntries = Object.entries(pollMetadata.votersRegistry);

        registryEntries.forEach(([username, choice]) => {
            registryDisplayString += `\n* **@\${username}** selected option: \`${choice}\``;
        });

        const baseContent = pollAnswer.message.content.split('\n\n### 📊')[0];
        await pollAnswer.message.edit({
            content: baseContent + registryDisplayString
        });
    } catch (e) {
        console.error("Error tracking live gateway vote:", e.message);
    }
});

client.once(Events.ClientReady, () => {
    console.log(`🤖 Logged in as ${client.user.tag}. System link active!`);
    setInterval(checkRobloxGroupShout, 60000); // Check group shout state metrics every 60 seconds
});

client.login(BOT_TOKEN);
