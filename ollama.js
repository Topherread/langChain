const ollamaApi = "http://localhost:3001/api/chat";const model = "gpt-oss:120b";
let prompt = document.querySelector('#prompt');
let sendButton = document.querySelector('#sendButton');
let conversationHistory = document.querySelector('#conversationHistory');

let displayHistory = [];

let gameState = {
    player: {
        name: "Captain Redbeard",
        health: 100,
        maxHealth: 100,
        gold: 25,
        location: "Port Haven",
        subLocation: "town square", 
        inventory: ["rusty cutlass", "leather boots", "linen shirt", "cotton trousers", "bandana", "torn map fragment"]
    },
    story: {
        currentObjectives: [
            {
                id: "acquire_ship",
                title: "Find a way to acquire a ship",
                description: "You need a ship to sail to other locations and begin your pirate adventures",
                promisedReward: null,
                giver: null,
                location: "Port Haven"
            },
            {
                id: "explore_port_haven", 
                title: "Explore Port Haven",
                description: "Get familiar with the island settlement and its inhabitants",
                promisedReward: "Knowledge of the area",
                giver: null,
                location: "Port Haven"
            }
        ],
        knownLocations: ["Port Haven"],
        completedObjectives: []
    },
    locations: {
        "Port Haven": {
            type: "town",
            description: "A small island settlement with a busy harbor",
            features: ["tavern", "dock", "market", "blacksmith"],
            npcs: ["Tavern Keeper", "Harbor Master", "Old Sailor"],
            discovered: true
        }
    },
    ship: {
        hasShip: false,
        type: null,
        name: null,
        crew: 0,
        maxCrew: 0,
        inventory: [],
        hull: 0,
        maxHull: 0,
        cannons: 0,
        sails: 0,
        maxSails: 0
    }
};

function buildSystemPrompt() {
    const playerStatus = `
PLAYER STATUS:
- Name: ${gameState.player.name}
- Health: ${gameState.player.health}/${gameState.player.maxHealth}
- Gold: ${gameState.player.gold} pieces
- Current Location: ${gameState.player.location}${gameState.player.subLocation ? ` (${gameState.player.subLocation})` : ''}
- Inventory: ${gameState.player.inventory.join(', ')}

STORY PROGRESS:
- Current Objectives: ${gameState.story.currentObjectives.map(obj => `${obj.title}${obj.promisedReward ? ` (Reward: ${obj.promisedReward})` : ''}`).join(', ')}
- Known Locations: ${gameState.story.knownLocations.join(', ')}
- Completed Objectives: ${gameState.story.completedObjectives.map(obj => `${obj.title} (${obj.actualReward || 'No reward tracked'})`).join(', ')}

CURRENT LOCATION (${gameState.player.location}):
- Type: ${gameState.locations[gameState.player.location].type}
- Description: ${gameState.locations[gameState.player.location].description}
- Available Features: ${gameState.locations[gameState.player.location].features.join(', ')}
- NPCs Present: ${gameState.locations[gameState.player.location].npcs.join(', ')}

SHIP STATUS:
${gameState.ship.hasShip ? 
    `- Ship: ${gameState.ship.name} (${gameState.ship.type})
- Crew: ${gameState.ship.crew}/${gameState.ship.maxCrew}
- Hull: ${gameState.ship.hull}/${gameState.ship.maxHull}
- Cannons: ${gameState.ship.cannons}
- Sails: ${gameState.ship.sails}/${gameState.ship.maxSails}
- Ship Inventory: ${gameState.ship.inventory.join(', ') || 'Empty'}` : 
    '- No ship currently owned (must acquire one to sail to other locations)'
}`;

     return `You are the narrator of an epic pirate adventure game. The player is Captain Redbeard, starting their adventure on a small island. You describe scenes vividly, present meaningful choices, and respond to player actions with exciting consequences. Require smart decision making and resource management. The life of a pirate is dangerous the wrong decision or a lack of preparedness can lead to difficulty or great peril. Keep responses detailed but concise only 1-2 short paragraphs. 

${playerStatus}

IMPORTANT RULES:
1. The player CANNOT sail to other locations without a ship
2. Track all changes to game state (health, gold, inventory, objectives, etc.)
3. When significant state changes occur, clearly indicate them in your response
4. Present 2-3 meaningful action choices at the end of each response
5. Be creative with encounters but respect the current game state
6. The player must steal, buy, or earn a ship before they can leave Port Haven
7. TOOL USAGE INSTRUCTIONS:
For any item-related queries (such as what items exist, what a shop has for sale, or item details), you have access to item management tools. Use them to get accurate information about items rather than making them up.
For any enemy-related queries (such as details about specific enemies, random enemies, or creating new enemies), you have access to enemy management tools. Use them to get accurate information about enemies rather than inventing them.
The tools are automatically available and will be called when needed - you don't need to explicitly invoke them.



GAME STATE UPDATES:
If any game state changes occur during your response, include them at the very end in this exact format:

[GAME_UPDATE]
health: +5 or -10 (for health changes)
gold: +50 or -25 (for gold changes)
inventory_add: item name (to add items)
inventory_remove: item name (to remove items)
location: new location name (when player moves to different island/area)
sublocation: area name (when moving within current location, e.g., tavern, dock, market)
objective_add: quest_id|title|description|promised_reward|giver|location (for new quests)
objective_complete: quest_id|actual_reward (when quest finished, record what was actually received)
location_discover: location name (when new places are learned about)
ship_acquire: ship_type|ship_name|crew|hull|cannons|sails (when getting a ship)
[/GAME_UPDATE]

Only include the [GAME_UPDATE] section if changes actually occur. Do not include it for simple conversations or descriptions.

Respond to player actions with immersive narrative and present the next choices.`;
}

function parseGameStateUpdates(aiResponse) {
    const updateMatch = aiResponse.match(/\[GAME_UPDATE\](.*?)\[\/GAME_UPDATE\]/s);
    if (!updateMatch) return;
    const updates = updateMatch[1].trim().split('\n');
    let stateChanged = false;
    
    updates.forEach(update => {
        const colonIndex = update.indexOf(':');
        if (colonIndex === -1) return;
        
        const key = update.substring(0, colonIndex).trim();
        const value = update.substring(colonIndex + 1).trim();
        
        switch(key) {
            case 'health':
                const healthChange = parseInt(value);
                gameState.player.health = Math.max(0, Math.min(gameState.player.maxHealth, gameState.player.health + healthChange));
                stateChanged = true;
                console.log(`Health ${healthChange > 0 ? 'gained' : 'lost'}: ${Math.abs(healthChange)}`);
                break;
                
            case 'gold':
                const goldChange = parseInt(value);
                gameState.player.gold = Math.max(0, gameState.player.gold + goldChange);
                stateChanged = true;
                console.log(`Gold ${goldChange > 0 ? 'gained' : 'lost'}: ${Math.abs(goldChange)}`);
                break;
                
            case 'inventory_add':
                if (!gameState.player.inventory.includes(value)) {
                    gameState.player.inventory.push(value);
                    stateChanged = true;
                    console.log(`Item acquired: ${value}`);
                }
                break;
                
            case 'inventory_remove':
                const removeIndex = gameState.player.inventory.indexOf(value);
                if (removeIndex > -1) {
                    gameState.player.inventory.splice(removeIndex, 1);
                    stateChanged = true;
                    console.log(`Item removed: ${value}`);
                }
                break;
                
            case 'location':
                if (gameState.story.knownLocations.includes(value)) {
                    gameState.player.location = value;
                    gameState.player.subLocation = null;
                    stateChanged = true;
                    console.log(`Moved to: ${value}`);
                }
                break;
                
            case 'sublocation':
                gameState.player.subLocation = value;
                stateChanged = true;
                console.log(`Entered: ${value} in ${gameState.player.location}`);
                break;
                
            case 'objective_add':
                const questData = value.split('|');
                if (questData.length >= 2) {
                    const newQuest = {
                        id: questData[0] || `quest_${Date.now()}`,
                        title: questData[1] || value,
                        description: questData[2] || questData[1],
                        promisedReward: questData[3] || null,
                        giver: questData[4] || null,
                        location: questData[5] || gameState.player.location
                    };
                    
                    if (!gameState.story.currentObjectives.find(obj => obj.id === newQuest.id)) {
                        gameState.story.currentObjectives.push(newQuest);
                        stateChanged = true;
                        console.log(`New objective: ${newQuest.title} (Reward: ${newQuest.promisedReward || 'Unknown'})`);
                    }
                } else {
                    const simpleQuest = {
                        id: `quest_${Date.now()}`,
                        title: value,
                        description: value,
                        promisedReward: null,
                        giver: null,
                        location: gameState.player.location
                    };
                    gameState.story.currentObjectives.push(simpleQuest);
                    stateChanged = true;
                    console.log(`New objective: ${value}`);
                }
                break;
                
            case 'objective_complete':
                const completeData = value.split('|');
                const questId = completeData[0];
                const actualReward = completeData[1] || 'No reward';
                
                const questIndex = gameState.story.currentObjectives.findIndex(obj => 
                    obj.id === questId || obj.title === questId || obj.title === value
                );
                
                if (questIndex > -1) {
                    const completedQuest = gameState.story.currentObjectives[questIndex];
                    completedQuest.actualReward = actualReward;
                    completedQuest.completedAt = new Date().toISOString();
                    
                    gameState.story.currentObjectives.splice(questIndex, 1);
                    gameState.story.completedObjectives.push(completedQuest);
                    stateChanged = true;
                    
                    const rewardNote = completedQuest.promisedReward !== actualReward ? 
                        ` (Promised: ${completedQuest.promisedReward}, Received: ${actualReward})` : 
                        ` (Received: ${actualReward})`;
                    
                    console.log(`Objective completed: ${completedQuest.title}${rewardNote}`);
                }
                break;
                
            case 'location_discover':
                if (!gameState.story.knownLocations.includes(value)) {
                    gameState.story.knownLocations.push(value);
                    if (!gameState.locations[value]) {
                        gameState.locations[value] = {
                            type: "unknown",
                            description: "A location you've heard about",
                            features: [],
                            npcs: [],
                            discovered: false
                        };
                    }
                    stateChanged = true;
                    console.log(`Location discovered: ${value}`);
                }
                break;
                
            case 'ship_acquire':
                const shipData = value.split('|');
                if (shipData.length >= 6) {
                    gameState.ship = {
                        hasShip: true,
                        type: shipData[0],
                        name: shipData[1],
                        crew: parseInt(shipData[2]) || 0,
                        maxCrew: parseInt(shipData[2]) || 0,
                        inventory: [],
                        hull: parseInt(shipData[3]) || 100,
                        maxHull: parseInt(shipData[3]) || 100,
                        cannons: parseInt(shipData[4]) || 0,
                        sails: parseInt(shipData[5]) || 100,
                        maxSails: parseInt(shipData[5]) || 100
                    };
                    stateChanged = true;
                    console.log(`Ship acquired: ${shipData[1]} (${shipData[0]})`);
                }
                break;
        }
    });
    
    return stateChanged;
}

function addMessageToDisplay(content, isUser = false) {
    const messageDiv = document.createElement('div');
    messageDiv.className = `message ${isUser ? 'user-message' : 'assistant-message'}`;
    
    const headerDiv = document.createElement('div');
    headerDiv.className = 'message-header';
    headerDiv.textContent = isUser ? '👤 Captain Redbeard' : '🏴‍☠️ Narrator';
    
    const contentDiv = document.createElement('div');
    contentDiv.innerHTML = isUser ? content : marked.parse(content);
    
    messageDiv.appendChild(headerDiv);
    messageDiv.appendChild(contentDiv);
    
    conversationHistory.appendChild(messageDiv);

    const messages = conversationHistory.querySelectorAll('.message');
    if (messages.length > 21) {
        for (let i = 1; i <= messages.length - 21; i++) {
            messages[i].remove();
        }
    }
    conversationHistory.scrollTop = conversationHistory.scrollHeight;
}

function showThinking() {
    const thinkingDiv = document.createElement('div');
    thinkingDiv.className = 'message thinking-message';
    thinkingDiv.id = 'thinking';
    
    const headerDiv = document.createElement('div');
    headerDiv.className = 'message-header';
    headerDiv.textContent = '🤔 Thinking...';
    
    const contentDiv = document.createElement('div');
    contentDiv.textContent = 'The narrator is crafting your next adventure...';
    
    thinkingDiv.appendChild(headerDiv);
    thinkingDiv.appendChild(contentDiv);
    
    conversationHistory.appendChild(thinkingDiv);
    conversationHistory.scrollTop = conversationHistory.scrollHeight;
}

function removeThinking() {
    const thinking = document.getElementById('thinking');
    if (thinking) {
        thinking.remove();
    }
}

function updateGameStateDisplay() {
    const locationDisplay = gameState.player.subLocation 
        ? `${gameState.player.location} (${gameState.player.subLocation})`
        : gameState.player.location;
        
    document.getElementById('playerStats').textContent = 
        `Health: ${gameState.player.health}/${gameState.player.maxHealth} | Gold: ${gameState.player.gold} | Location: ${locationDisplay}`;
    
    document.getElementById('playerInventory').textContent = 
        gameState.player.inventory.join(', ') || 'Empty';
    
    const shipStatusElement = document.getElementById('shipStatus');
    if (gameState.ship.hasShip) {
        shipStatusElement.textContent = 
            `${gameState.ship.name} (${gameState.ship.type}) - Crew: ${gameState.ship.crew}/${gameState.ship.maxCrew} - Hull: ${gameState.ship.hull}/${gameState.ship.maxHull}`;
    } else {
        shipStatusElement.textContent = 'No ship owned';
    }
    
    const objectiveTexts = gameState.story.currentObjectives.map(obj => {
        let text = obj.title || obj;
        if (typeof obj === 'object' && obj.promisedReward) {
            text += ` (${obj.promisedReward})`;
        }
        return text;
    });
    document.getElementById('currentObjectives').textContent = 
        objectiveTexts.join(', ') || 'No current objectives';
}

let messageList = [
    {
        "role":"system",
        "content": buildSystemPrompt()
    }
];

async function sendPrompt(newPrompt){
    messageList.push({role:'user', content: newPrompt});

    if (messageList.length > 12) {
        const systemPrompt = messageList[0];
        const recentMessages = messageList.slice(-10);
        messageList = [systemPrompt, ...recentMessages];
        console.log('Message history trimmed to maintain performance');
    }
    
    if (messageList.length > 1 && (messageList.length - 1) % 5 === 0) {
        messageList[0].content = buildSystemPrompt();
    }
    
    const response = await fetch(`${ollamaApi}`, {
        method: "POST",
        headers: {
            "Content-Type": "application/json"
        },
        body: JSON.stringify({
            messages: messageList,
            model: model,
            stream: false
        })
    });
    
    if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
    }
    
    const data = await response.json();
    const assistantMessage = data.message.content;
    messageList.push({
        role: 'assistant', 
        content: assistantMessage
    });

    const stateChanged = parseGameStateUpdates(assistantMessage);
    const cleanResponse = assistantMessage
        .replace(/\[GAME_UPDATE\].*?\[\/GAME_UPDATE\]/s, '')
        .trim();

    if (stateChanged) {
        messageList[0].content = buildSystemPrompt();
    }

    return cleanResponse;
}

sendButton.addEventListener('click', async () => {
    let newPrompt = prompt.value.trim();
    if (!newPrompt) return;

    addMessageToDisplay(newPrompt, true);

    prompt.value = '';

    showThinking();

    try { 
        const agentResponse = await sendPrompt(newPrompt);

        removeThinking();
        addMessageToDisplay(agentResponse, false);

        updateGameStateDisplay();
        
    } catch (error) {
        removeThinking();
        addMessageToDisplay(`Error: ${error.message}`, false);
    }
});

prompt.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        sendButton.click();
    }
});

document.addEventListener('DOMContentLoaded', () => {
    updateGameStateDisplay();
});
