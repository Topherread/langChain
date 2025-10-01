
const fs = require('fs');
const path = require('path');
const ENEMIES_JSON_PATH = path.join(__dirname, 'enemies.json');

function loadEnemies() {
    const data = fs.readFileSync(ENEMIES_JSON_PATH, 'utf-8');
    return JSON.parse(data);
}

function saveEnemies(enemies) {
    fs.writeFileSync(ENEMIES_JSON_PATH, JSON.stringify(enemies, null, 2), 'utf-8');
}

let ENEMIES_DATA = loadEnemies();

function get_enemies_info({ category, name }) {
    ENEMIES_DATA = loadEnemies();
    if (!ENEMIES_DATA[category]) throw new Error(`Category not found: ${category}`);
    const group = ENEMIES_DATA[category];
    for (const key in group) {
        if (group[key].name.toLowerCase() === name.toLowerCase()) {
            return { category, ...group[key] };
        }
    }
    throw new Error(`Enemy not found: ${name} in category ${category}`);
}
function getRandomEnemy({ category, name, count }) {
    ENEMIES_DATA = loadEnemies();
    if (!ENEMIES_DATA[category]) throw new Error(`Category not found: ${category}`);
    const group = ENEMIES_DATA[category];
    const found = [];
    for (const key in group) {
        if (!name || group[key].name.toLowerCase() === name.toLowerCase()) {
            found.push({ category, ...group[key] });
        }
    }
    if (found.length === 0) throw new Error(`Enemy not found: ${name} in category ${category}`);
    return found.sort(() => Math.random() - 0.5).slice(0, count);
}
function createEnemy({ category, name, health, damage, skill, loot, description, weaknesses, resistances }) {
    ENEMIES_DATA = loadEnemies();
    if (!ENEMIES_DATA[category]) ENEMIES_DATA[category] = {};
    const key = name.replace(/\s+/g, '_').toLowerCase();
    ENEMIES_DATA[category][key] = {
        name,
        health,
        damage,
        skill,
        loot,
        description,
        weaknesses,
        resistances
    };
    saveEnemies(ENEMIES_DATA);
    return { category, name, health, damage, skill, loot, description, weaknesses, resistances };
}
const listItemTypesSchema = {
    type: "function",
    name: "listItemTypes",
    description: "List all available item types in the game world.",
    parameters: {
        type: "object",
        properties: {},
        required: []
    }
};

function listItemTypes() {
    const allItems = getAllItems();
    const types = new Set();
    for (const item of allItems) {
        if (item.type) types.add(item.type);
    }
    return Array.from(types);
}
const express = require('express');
const cors = require('cors');
const {Ollama} = require('ollama');

const app = express();
const PORT = 3001;

app.use(cors());
app.use(express.json());
app.use(express.static(__dirname));

const ollama = new Ollama({host: 'http://golem:11434'});

const listAllEnemiesToolSchema = {
    "type": "function",
    "name": "listAllEnemies",
    "description": "List all enemy categories and the specific enemies in each category.",
    "parameters": {
        "type": "object",
        "properties": {},
        "required": []
    }
};

function listAllEnemies() {
    ENEMIES_DATA = loadEnemies();
    const result = {};
    for (const category in ENEMIES_DATA) {
        result[category] = Object.values(ENEMIES_DATA[category]).map(enemy => enemy.name);
    }
    return result;
}

const enemiesToolSchema = {
    "type": "function",
    "name": "get_enemies_info",
    "description": "Get detailed information about an enemy in the game world",
    "usage": "Use this function to look up enemies the player encounters or is considering engaging. Provide the enemy name and category as input.",
    "properties": {
        "category": { "type": "string", "description": "The category of the enemy (e.g., pirates, navy, mythical, ghost, town)." },
        "name": { "type": "string", "description": "The name of the enemy." },
        "health": { "type": "number", "description": "The health points of the enemy." },
        "damage": { "type": "number", "description": "The damage the enemy can inflict." },
        "skill": { "type": "number", "description": "The skill level of the enemy." },
        "loot": { "type": "array", "items": { "type": "string" }, "description": "Possible loot dropped by the enemy." },
        "description": { "type": "string", "description": "A description of the enemy." },
        "weaknesses": { "type": "array", "items": { "type": "string" }, "description": "The enemy's weaknesses." },
        "resistances": { "type": "array", "items": { "type": "string" }, "description": "The enemy's resistances." }
    },
    "required": ["category", "name"]
}

function get_enemies_info({ category, name }) {
    ENEMIES_DATA = loadEnemies();
    if (!ENEMIES_DATA[category]) throw new Error(`Category not found: ${category}`);
    const group = ENEMIES_DATA[category];
    for (const key in group) {
        if (group[key].name.toLowerCase() === name.toLowerCase()) {
            return { category, ...group[key] };
        }
    }
    throw new Error(`Enemy not found: ${name} in category ${category}`);
}

const getRandomEnemyToolSchema = {
    "type": "function",
    "name": "getRandomEnemy",
    "description": "Get a random enemy from the game world.",
    "parameters": {
        "category": { "type": "string", "description": "The category of enemy to retrieve (e.g., pirates, navy, mythical, ghost, town)." },
        "name": { "type": "string", "description": "The key name of the enemy to retrieve." },
        "count": { "type": "number", "description": "The number of random enemies to return." }
    },
    "required": ["category", "name", "count"]
};

function getRandomEnemy({ category, name, count }) {
    ENEMIES_DATA = loadEnemies();
    if (!ENEMIES_DATA[category]) throw new Error(`Category not found: ${category}`);
    const group = ENEMIES_DATA[category];
    const found = [];
    for (const key in group) {
        if (!name || group[key].name.toLowerCase() === name.toLowerCase()) {
            found.push({ category, ...group[key] });
        }
    }
    if (found.length === 0) throw new Error(`Enemy not found: ${name} in category ${category}`);
    return found.sort(() => Math.random() - 0.5).slice(0, count);
}

const createEnemyToolSchema = {
    "type": "function",
    "name": "createEnemy",
    "description": "Create a new enemy in the game world.",
    "parameters": {
        "category": { "type": "string", "description": "The category of the enemy (e.g., pirates, navy, mythical, ghost, town)." },
        "name": { "type": "string", "description": "The name of the enemy." },
        "health": { "type": "number", "description": "The health points of the enemy." },
        "damage": { "type": "number", "description": "The damage the enemy can inflict." },
        "skill": { "type": "number", "description": "The skill level of the enemy." },
        "loot": { "type": "array", "items": { "type": "string" }, "description": "Possible loot dropped by the enemy." },
        "description": { "type": "string", "description": "A description of the enemy." },
        "weaknesses": { "type": "array", "items": { "type": "string" }, "description": "The enemy's weaknesses." },
        "resistances": { "type": "array", "items": { "type": "string" }, "description": "The enemy's resistances." }
    },
    "required": ["category", "name", "health", "damage", "skill", "loot", "description"]
};

const itemToolSchema = {
    "type": "function",
    "name": "get_item_info",
    "description": "Get detailed information about an item in the game world",
    "usage": "Use this function to look up items the player encounters, finds, or is considering acquiring. Provide the item name as input.",
    "properties": {
        "name": { "type": "string", "description": "The name of the item." },
        "type": { "type": "string", "description": "The category/type of the item (e.g., weapon, clothing, ammo, consumable, currency)." },
        "description": { "type": "string", "description": "A description of the item." },
        "usage": { "type": "string", "description": "How the item is used (if applicable)." },
        "defense": { "type": "number", "description": "Defense value provided by the item (for clothing).", "optional": true },
        "damage": { "type": "number", "description": "Damage dealt by the item (for weapons).", "optional": true },
        "damagebonus": { "type": "number", "description": "Bonus damage provided by the item (for ammo).", "optional": true },
        "value": { "type": "number", "description": "The value of the item in gold coins.", "optional": true },
        "condition": { "type": "string", "description": "The condition of the item (e.g., worn, good, excellent, poor).", "optional": true },
        "effect": { "type": "object", "description": "The effect of the item (for consumables), e.g., { health: 10 }.", "optional": true },
        "size": { "type": "number", "description": "The size or weight of the item.", "optional": true },
        "quantity": { "type": "number", "description": "The quantity of the item (for ammo, consumables, etc.)", "optional": true },
        "baseValue": { "type": "number", "description": "Base value for currency items.", "optional": true }
    },
    "required": ["name", "type", "description"]
};

const getShopItemsToolSchema = {
    "type": "function",
    "name": "getShopItems",
    "description": "Get a list of items available in a shop, filtered by type and limited by count.",
    "parameters": {
        "type": "object",
        "properties": {
            "type": { "type": "string", "description": "The category/type of items to retrieve (e.g., weapon, clothing, ammo, consumable, currency, quest)." },
            "count": { "type": "number", "description": "The number of items to return." }
        },
        "required": ["type", "count"]
    }
};

const getRandomItemsToolSchema = {
    "type": "function",
    "name": "getRandomItems",
    "description": "Get a random selection of items from the game world.",
    "parameters": {
        "type": "object",
        "properties": {
            "count": { "type": "number", "description": "The number of random items to return." }
        },
        "required": ["count"]
    }
};

const addItemToItemsListToolSchema = {
    "type": "function",
    "name": "addItemToItemsList",
    "description": "Add a new item to the ITEMS list if it does not already exist.",
    "parameters": {
        "type": "object",
        "properties": {
            "category": { "type": "string", "description": "The top-level category for the item (e.g., weapons, clothing, ammo, consumables, treasure)." },
            "subcategory": { "type": "string", "description": "The subcategory for the item, if any (e.g., head, body, legs, feet). Optional." },
            "key": { "type": "string", "description": "The unique key for the item within its category/subcategory." },
            "itemData": { "type": "object", "description": "The full item object to add, matching the item schema." }
        },
        "required": ["category", "key", "itemData"]
    }
};



const ITEMS_JSON_PATH = path.join(__dirname, 'items.json');

function loadItems() {
    const data = fs.readFileSync(ITEMS_JSON_PATH, 'utf-8');
    return JSON.parse(data);
}

function saveItems(items) {
    fs.writeFileSync(ITEMS_JSON_PATH, JSON.stringify(items, null, 2), 'utf-8');
}

let ITEMS = loadItems();

function getAllItems() {
    ITEMS = loadItems();
    const all = [];
    for (const category in ITEMS) {
        const group = ITEMS[category];
        if (typeof group === 'object') {
            for (const subcat in group) {
                if (typeof group[subcat] === 'object') {
                    for (const key in group[subcat]) {
                        all.push(group[subcat][key]);
                    }
                } else {
                    all.push(group[subcat]);
                }
            }
        }
    }
    return all;
}

function getItemInfo({ name }) {
    const allItems = getAllItems();
    const item = allItems.find(i => i.name.toLowerCase() === name.toLowerCase());
    if (!item) {
        throw new Error(`Item not found: ${name}`);
    }
    return item;
}

function addItemToItemsList({ category, subcategory, key, itemData }) {
    ITEMS = loadItems();
    if (!ITEMS[category]) ITEMS[category] = {};
    if (subcategory) {
        if (!ITEMS[category][subcategory]) ITEMS[category][subcategory] = {};
        if (ITEMS[category][subcategory][key]) {
            return false;
        }
        ITEMS[category][subcategory][key] = itemData;
    } else {
        if (ITEMS[category][key]) {
            return false;
        }
        ITEMS[category][key] = itemData;
    }
    saveItems(ITEMS);
    return true;
}

function getShopItems({ type, count }) {
    let allItems = getAllItems();
    if (type && type !== 'any') {
        allItems = allItems.filter(item => item.type === type);
    }
    const selected = [];
    if (allItems.length <= count) {
        selected.push(...allItems);
    } else {
        const usedIndices = new Set();
        while (selected.length < count) {
            const randomIndex = Math.floor(Math.random() * allItems.length);
            if (!usedIndices.has(randomIndex)) {
                usedIndices.add(randomIndex);
                selected.push(allItems[randomIndex]);
            }
        }
    }
    return selected;
}

function getRandomItems({ count }) {
    const allItems = getAllItems();
    const selected = [];
    if (allItems.length <= count) {
        selected.push(...allItems);
    } else {
        const usedIndices = new Set();
        while (selected.length < count) {
            const randomIndex = Math.floor(Math.random() * allItems.length);
            if (!usedIndices.has(randomIndex)) {
                usedIndices.add(randomIndex);
                selected.push(allItems[randomIndex]);
            }
        }
    }
    return selected;
}

const toolSchemas = [
    itemToolSchema,
    getShopItemsToolSchema,
    getRandomItemsToolSchema,
    addItemToItemsListToolSchema,
    listItemTypesSchema,
    enemiesToolSchema,
    getRandomEnemyToolSchema,
    createEnemyToolSchema,
    listAllEnemiesToolSchema
];

const toolFunctions = {
    get_item_info: getItemInfo,
    getShopItems: getShopItems,
    getRandomItems: getRandomItems,
    addItemToItemsList: addItemToItemsList,
    listItemTypes: listItemTypes,
    get_enemies_info: get_enemies_info,
    getRandomEnemy: getRandomEnemy,
    createEnemy: createEnemy,
    listAllEnemies: listAllEnemies
};

async function processToolCalls(messages, tools) {
    const response = await ollama.chat({
        model: 'gpt-oss:120b',
        messages: messages,
        tools: tools,
        stream: false
    });

    if (response.message && response.message.tool_calls && response.message.tool_calls.length > 0) {
        let toolCall = response.message.tool_calls[0];
        console.log(`AI is calling tool: ${toolCall.function.name} with arguments:`, toolCall.function.arguments);
        const fn = toolFunctions[toolCall.function.name];
        if (fn) {
            const args = toolCall.function.arguments;
            const result = await fn(args);

            let newMessages = [
                ...messages,
                response.message,
                {
                    role: "tool",
                    tool_name: toolCall.function.name,
                    content: JSON.stringify(result)
                }
            ];

            return await processToolCalls(newMessages, tools);
        } else {
            throw new Error(`Unknown tool: ${toolCall.function.name}`);
        }
    }

    return response.message;
}

app.post('/api/chat', async (req, res) => {
    try {
        const { messages, model } = req.body;
        console.log('Incoming request:', { messages});
        if (!messages || !Array.isArray(messages)) {
            return res.status(400).json({ error: 'Messages array required' });
        }
        const finalMessage = await processToolCalls(messages, toolSchemas);
        console.log('Final AI response:', finalMessage);
        res.json({ message: finalMessage });
    } catch (error) {
        console.error('API Error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});