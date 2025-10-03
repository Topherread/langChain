const express = require('express');
const cors = require('cors');
const fs = require('fs');
const path = require('path');
const { ChatOllama } = require('@langchain/ollama');
const { HumanMessage, SystemMessage } =require('@langchain/core/messages');
const { StateGraph, START, END } = require('@langchain/langgraph');
const { StructuredTool } = require('@langchain/core/tools');
const { z } = require('zod');

const PORT = 3001;
const llm = new ChatOllama({ 
  baseUrl: 'http://golem:11434',
  model: 'gpt-oss:20b'
});

const app = express();
app.use(cors());
app.use(express.json());
app.use(express.static(__dirname));

const ENEMIES_JSON_PATH = path.join(__dirname, 'enemies.json');
const ITEMS_JSON_PATH = path.join(__dirname, 'items.json');

//fs functions
function loadEnemies() {
    const data = fs.readFileSync(ENEMIES_JSON_PATH, 'utf-8');
    return JSON.parse(data);
}

function saveEnemies(enemies) {
    fs.writeFileSync(ENEMIES_JSON_PATH, JSON.stringify(enemies, null, 2), 'utf-8');
}

function loadItems() {
    const data = fs.readFileSync(ITEMS_JSON_PATH, 'utf-8');
    return JSON.parse(data);
}

function saveItems(items) {
    fs.writeFileSync(ITEMS_JSON_PATH, JSON.stringify(items, null, 2), 'utf-8');
}

function getAllItems() {
    delete require.cache[require.resolve('./items.json')];
    const ITEMS = loadItems();
    const all = [];
    
    function extractItems(obj, path = []) {
        for (const key in obj) {
            const value = obj[key];
            if (value && typeof value === 'object') {
                if (value.name && typeof value.name === 'string') {
                    all.push(value);
                } else {
                    extractItems(value, [...path, key]);
                }
            }
        }
    }
    
    extractItems(ITEMS);
    return all;
}

//enemy tools
class GetEnemyInfoTool extends StructuredTool {
    name = "get_enemies_info";
    description = "Get detailed information about an enemy in the game world";

    schema = z.object({
        category: z.string().describe("The category of the enemy (e.g., pirates, navy, mythical, ghost, town)"),
        name: z.string().describe("The name of the enemy")
    });

    async _call({ category, name }) {
        const ENEMIES_DATA = loadEnemies();
        
        if (!ENEMIES_DATA[category]) {
            const availableCategories = Object.keys(ENEMIES_DATA);
            throw new Error(`Category not found: ${category}. Available categories: ${availableCategories.join(', ')}. Use listEnemyCategories tool to see all available categories.`);
        }
        
        const group = ENEMIES_DATA[category];
        
        for (const key in group) {
            if (group[key].name.toLowerCase() === name.toLowerCase()) {
                return { category, ...group[key] };
            }
        }
        
        const partialMatches = [];
        for (const key in group) {
            if (group[key].name.toLowerCase().includes(name.toLowerCase()) || 
                name.toLowerCase().includes(group[key].name.toLowerCase())) {
                partialMatches.push({ category, ...group[key] });
            }
        }
        
        if (partialMatches.length > 0) {
            return {
                exactMatch: false,
                suggestedEnemies: partialMatches,
                message: `No exact match found for "${name}" in category "${category}". Found ${partialMatches.length} similar enemies.`
            };
        }
        
        const availableEnemies = Object.values(group).map(e => e.name);
        throw new Error(`Enemy not found: ${name} in category ${category}. Available enemies in this category: ${availableEnemies.join(', ')}. Use createEnemy tool to create this enemy if it should exist.`);
    }
}

class GetRandomEnemyTool extends StructuredTool {
    name = "getRandomEnemy";
    description = "Get a random enemy from the game world";

    schema = z.object({
        category: z.string().describe("The category of enemy to retrieve (e.g., pirates, navy, mythical, ghost, town)"),
        name: z.string().optional().describe("The name of the enemy to retrieve (optional)"),
        count: z.number().describe("The number of random enemies to return")
    });

    async _call({ category, name, count }) {
        const ENEMIES_DATA = loadEnemies();
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
}

class CreateEnemyTool extends StructuredTool {
    name = "createEnemy";
    description = "Create a new enemy in the game world";

    schema = z.object({
        category: z.string().describe("The category of the enemy (e.g., pirates, navy, mythical, ghost, town)"),
        name: z.string().describe("The name of the enemy"),
        health: z.number().describe("The health points of the enemy"),
        damage: z.number().describe("The damage the enemy can inflict"),
        skill: z.number().describe("The skill level of the enemy"),
        loot: z.array(z.string()).describe("Possible loot dropped by the enemy"),
        description: z.string().describe("A description of the enemy"),
        weaknesses: z.array(z.string()).optional().describe("The enemy's weaknesses"),
        resistances: z.array(z.string()).optional().describe("The enemy's resistances")
    });

    async _call({ category, name, health, damage, skill, loot, description, weaknesses, resistances }) {
        const ENEMIES_DATA = loadEnemies();
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
}

class ListAllEnemiesTag extends StructuredTool {
    name = "listAllEnemies";
    description = "List all enemy categories and the specific enemies in each category";

    schema = z.object({});

    async _call() {
        const ENEMIES_DATA = loadEnemies();
        const result = {};
        for (const category in ENEMIES_DATA) {
            result[category] = Object.values(ENEMIES_DATA[category]).map(enemy => enemy.name);
        }
        return result;
    }
}

//items tools
class GetItemInfoTool extends StructuredTool {
    name = "get_item_info";
    description = "Get detailed information about an item in the game world";

    schema = z.object({
        name: z.string().describe("The name of the item")
    });

    async _call({ name }) {
        const allItems = getAllItems();
        const validItems = allItems.filter(i => i && i.name && typeof i.name === 'string');
        
        let item = validItems.find(i => i.name.toLowerCase() === name.toLowerCase());
        if (item) {
            return item;
        }
        
        const partialMatches = validItems.filter(i => 
            i.name.toLowerCase().includes(name.toLowerCase()) || 
            name.toLowerCase().includes(i.name.toLowerCase())
        );
        
        if (partialMatches.length > 0) {
            return {
                exactMatch: false,
                suggestedItems: partialMatches,
                message: `No exact match found for "${name}". Found ${partialMatches.length} similar items.`
            };
        }
        
        const availableTypes = [...new Set(allItems.map(i => i.type))];
        throw new Error(`Item not found: ${name}. REQUIRED WORKFLOW: 1) Call listItemCategories, 2) Call addItemToItemsList to create '${name}', 3) Call get_item_info again. Available types: ${availableTypes.join(', ')}.`);
    }
}

class GetShopItemsTool extends StructuredTool {
    name = "getShopItems";
    description = "Get a list of items available in a shop, filtered by type and limited by count";

    schema = z.object({
        type: z.string().describe("The category/type of items to retrieve (e.g., weapon, clothing, ammo, consumable, currency, quest)"),
        count: z.number().describe("The number of items to return")
    });

    getItemsFromCategory(categoryData) {
        const items = [];
        if (typeof categoryData === 'object') {
            for (const key in categoryData) {
                if (categoryData[key] && typeof categoryData[key] === 'object') {
                    if (categoryData[key].name) {
                        items.push(categoryData[key]);
                    } else {
                        items.push(...this.getItemsFromCategory(categoryData[key]));
                    }
                }
            }
        }
        return items;
    }

    async _call({ type, count }) {
        let allItems = getAllItems();
        if (type && type !== 'any') {
            let filteredItems = allItems.filter(item => item.type === type);
            
            if (filteredItems.length === 0) {
                const ITEMS = loadItems();
                const availableCategories = Object.keys(ITEMS);
                
                const similarCategories = availableCategories.filter(cat => 
                    cat.toLowerCase().includes(type.toLowerCase()) || 
                    type.toLowerCase().includes(cat.toLowerCase()) ||
                    (type === 'weapon' && cat === 'weapons') ||
                    (type === 'weapons' && cat === 'weapon')
                );
                
                if (similarCategories.length > 0) {
                    for (const category of similarCategories) {
                        const categoryItems = this.getItemsFromCategory(ITEMS[category]);
                        filteredItems.push(...categoryItems);
                    }
                }
            }
            
            allItems = filteredItems;
            
            if (allItems.length === 0) {
                const availableTypes = [...new Set(getAllItems().map(i => i.type))];
                throw new Error(`No items found for type '${type}'. Available types: ${availableTypes.join(', ')}. Try using listItemCategories to see all available categories.`);
            }
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
}

class GetRandomItemsTool extends StructuredTool {
    name = "getRandomItems";
    description = "Get a random selection of items from the game world";

    schema = z.object({
        count: z.number().describe("The number of random items to return")
    });

    async _call({ count }) {
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
}

class AddItemToItemsListTool extends StructuredTool {
    name = "addItemToItemsList";
    description = "Add a new item to the ITEMS list if it does not already exist";

    schema = z.object({
        category: z.string().describe("The top-level category for the item (e.g., weapons, clothing, ammo, consumables, treasure)"),
        subcategory: z.string().optional().describe("The subcategory for the item, if any (e.g., head, body, legs, feet)"),
        key: z.string().describe("The unique key for the item within its category/subcategory"),
        itemData: z.object({
            name: z.string().describe("The display name of the item"),
            type: z.string().describe("The type of item (e.g., weapon, clothing, consumable)"),
            description: z.string().describe("A detailed description of the item"),
            damage: z.number().optional().describe("Damage value for weapons"),
            value: z.number().optional().describe("Gold value of the item"),
            condition: z.string().optional().describe("Condition of the item (poor, good, excellent)"),
            size: z.number().optional().describe("Size of the item"),
            rarity: z.string().optional().describe("Rarity of the item (common, rare, legendary)"),
            weight: z.number().optional().describe("Weight of the item")
        }).describe("The full item object to add with its properties")
    });

    async _call({ category, subcategory, key, itemData }) {
        if (!itemData || !itemData.name) {
            throw new Error(`Invalid itemData: missing name property. Received: ${JSON.stringify(itemData)}`);
        }
    
        const ITEMS = loadItems();
        if (!ITEMS[category]) ITEMS[category] = {};
        if (subcategory) {
            if (!ITEMS[category][subcategory]) ITEMS[category][subcategory] = {};
            if (ITEMS[category][subcategory][key] && Object.keys(ITEMS[category][subcategory][key]).length > 0) {
                throw new Error(`Item already exists: ${key}. The item is already in the database. Use get_item_info to retrieve information about this existing item.`);
            }
            ITEMS[category][subcategory][key] = itemData;
        } else {
            if (ITEMS[category][key] && Object.keys(ITEMS[category][key]).length > 0) {
                throw new Error(`Item already exists: ${key}. The item is already in the database. Use get_item_info to retrieve information about this existing item.`);
            }
            ITEMS[category][key] = itemData;
        }
        saveItems(ITEMS);
        return true;
    }
}

class ListItemTypesTool extends StructuredTool {
    name = "listItemTypes";
    description = "List all available item types in the game world";

    schema = z.object({});

    async _call() {
        const allItems = getAllItems();
        const types = new Set();
        for (const item of allItems) {
            if (item.type) types.add(item.type);
        }
        return Array.from(types);
    }
}

class ListItemCategoriesTool extends StructuredTool {
    name = "listItemCategories";
    description = "List all available item categories and subcategories in the game world";

    schema = z.object({});

    async _call() {
        const ITEMS = loadItems();
        const categories = {};
        for (const category in ITEMS) {
            categories[category] = [];
            const group = ITEMS[category];
            if (typeof group === 'object') {
                for (const key in group) {
                    if (typeof group[key] === 'object' && group[key].name) {
                        categories[category].push(key);
                    } else if (typeof group[key] === 'object') {
                        categories[category].push(key);
                    }
                }
            }
        }
        return categories;
    }
}

class ListEnemyCategoriesTool extends StructuredTool {
    name = "listEnemyCategories";
    description = "List all available enemy categories in the game world";

    schema = z.object({});

    async _call() {
        const ENEMIES_DATA = loadEnemies();
        const categories = {};
        for (const category in ENEMIES_DATA) {
            categories[category] = Object.keys(ENEMIES_DATA[category]);
        }
        return categories;
    }
}

const getEnemyInfoTool = new GetEnemyInfoTool();
const getRandomEnemyTool = new GetRandomEnemyTool();
const createEnemyTool = new CreateEnemyTool();
const listAllEnemiesTag = new ListAllEnemiesTag();
const getItemInfoTool = new GetItemInfoTool();
const getShopItemsTool = new GetShopItemsTool();
const getRandomItemsTool = new GetRandomItemsTool();
const addItemToItemsListTool = new AddItemToItemsListTool();
const listItemTypesTool = new ListItemTypesTool();
const listItemCategoriesTool = new ListItemCategoriesTool();
const listEnemyCategoriesTool = new ListEnemyCategoriesTool();

const allTools = [
    getEnemyInfoTool,
    getRandomEnemyTool,
    createEnemyTool,
    listAllEnemiesTag,
    getItemInfoTool,
    getShopItemsTool,
    getRandomItemsTool,
    addItemToItemsListTool,
    listItemTypesTool,
    listItemCategoriesTool,
    listEnemyCategoriesTool
];

const graphStateData = {
    messages: [],
    result: ""
};

async function processWithToolsNode(state) {

    const maxRetries = 6; // Allow up to 6 retry attempts for complex workflows
    let currentAttempt = 0;
    let currentMessages = [...state.messages];
    let hasFailures = false; // Track if we've had any failures in this conversation
    
    while (currentAttempt <= maxRetries) {
        //bind the llm with tools
        const llmWithTools = llm.bind({ tools: allTools });
        
        let response;
        try {
            //initial call to llm with tools
            response = await llmWithTools.invoke(currentMessages);
            

            
        } catch (llmError) {
            console.error("LLM Error:", llmError.message);
            
            return {
                messages: [...currentMessages],
                result: `LLM Error: ${llmError.message}.`
            };
        }
        //if the llm requested any tool calls execute them
        if (response.tool_calls && response.tool_calls.length > 0) {

            const toolResults = [];
            let currentBatchHasFailures = false;
            
            for (const toolCall of response.tool_calls) {
                console.log(`→ ${toolCall.name}: ${JSON.stringify(toolCall.args)}`);
                
                const tool = allTools.find(t => t.name === toolCall.name);
                if (tool) {
                    try {
                        const toolResult = await tool.invoke(toolCall.args);
                        console.log(`✓ ${toolCall.name}: Success`);
                        toolResults.push({
                            tool_call_id: toolCall.id,
                            role: "tool",
                            name: toolCall.name,
                            content: JSON.stringify(toolResult)
                        });
                    } catch (error) {
                        console.log(`✗ ${toolCall.name}: ${error.message}`);
                        
                        // Mark that we have failures and can retry
                        if (currentAttempt < maxRetries) {
                            currentBatchHasFailures = true;
                            hasFailures = true;
                        }
                        
                        let fallbackSuggestion = error.message;
                        
                        if (toolCall.name === 'get_item_info' && error.message.includes('not found')) {
                            fallbackSuggestion += '. Suggestion: Use listItemCategories tool to see available categories, or use addItemToItemsList tool to create this item if it should exist.';
                        }
                        
                        if (toolCall.name === 'get_enemies_info' && error.message.includes('not found')) {
                            fallbackSuggestion += '. Suggestion: Use listEnemyCategories tool to see available categories, or use createEnemy tool to create this enemy if it should exist.';
                        }
                        
                        if (toolCall.name === 'addItemToItemsList' && error.message.includes('already exists')) {
                            fallbackSuggestion += '. The item already exists in the database. Use get_item_info to retrieve information about this existing item.';
                        }
                        
                        if (toolCall.name === 'getShopItems' && error.message.includes('Category not found')) {
                            fallbackSuggestion += '. Suggestion: Use listItemCategories tool to see available item categories first.';
                        }
                        
                        if (toolCall.name === 'getRandomEnemy' && error.message.includes('Category not found')) {
                            fallbackSuggestion += '. Suggestion: Use listEnemyCategories tool to see available enemy categories first.';
                        }
                        
                        toolResults.push({
                            tool_call_id: toolCall.id,
                            role: "tool",
                            name: toolCall.name,
                            content: `Error: ${fallbackSuggestion}`
                        });
                    }
                } else {
                    console.log(`✗ Unknown tool: ${toolCall.name}`);
                    toolResults.push({
                    tool_call_id: toolCall.id,
                    role: "tool",
                    name: toolCall.name,
                    content: `Error: Tool ${toolCall.name} not found`
                    });
                }
            }

            //append the llm response and tool results to the message history
            currentMessages = [...currentMessages, response, ...toolResults];

        
            // Check if we made successful progress in creation tools
            const hadSuccessfulCreation = toolResults.some(tr => 
                (tr.name === 'addItemToItemsList' || tr.name === 'createEnemy') && 
                tr.content === 'true'
            );
            
            // Also check if we discovered that items already exist (this resolves the original failure)
            const discoveredExistingItem = toolResults.some(tr => 
                (tr.name === 'addItemToItemsList' || tr.name === 'createEnemy') && 
                tr.content && tr.content.includes('already exists')
            );
            
            // Reset failure tracking after successful creation or discovering existing items
            if (hadSuccessfulCreation || discoveredExistingItem) {
                hasFailures = false;
            }
            
            // Continue retrying if:
            // 1. We had failures in this batch, OR
            // 2. We had previous failures and are still working on them, OR  
            // 3. We're using discovery tools (indicating we're in a workflow sequence)
            // BUT NOT if we just successfully created something - then we should try the original request again
            const usingDiscoveryTools = response.tool_calls.some(tc => 
                ['listItemCategories', 'listEnemyCategories'].includes(tc.name)
            );
            
            // Should retry if:
            // 1. Current batch has failures, OR
            // 2. We had previous failures and haven't made progress yet, OR  
            // 3. We're using discovery tools, OR
            // 4. We just successfully created something (should try original request again) - BUT only once
            const shouldRetryAfterCreation = hadSuccessfulCreation && currentAttempt < maxRetries;
            const shouldRetry = (currentBatchHasFailures || hasFailures || usingDiscoveryTools || shouldRetryAfterCreation) && currentAttempt < maxRetries;
            
            if (shouldRetry) {
                
                let retryGuidanceContent;
                if (hadSuccessfulCreation) {
                    retryGuidanceContent = "✅ ITEM CREATED SUCCESSFULLY! The item has been added to the database. STOP creating items. Now IMMEDIATELY call get_item_info with the original item name to retrieve the information and provide it to the user. DO NOT call addItemToItemsList again.";
                } else if (discoveredExistingItem) {
                    retryGuidanceContent = "ITEM EXISTS: The item you tried to create already exists in the database. Now retry the original request (like get_item_info) since the item is available.";
                } else {
                    retryGuidanceContent = "WORKFLOW CONTINUATION REQUIRED: Some tools failed but you've gathered more information. Now continue the workflow by using the suggested tools in sequence. For example: if get_item_info failed but listItemCategories showed the item exists, now call addItemToItemsList to create it, then call get_item_info again. Complete the full workflow to satisfy the user's original request.";
                }
                
                // response with guidance to use discovery tools
                const retryGuidanceMessage = {
                    role: "system",
                    content: retryGuidanceContent
                };
                currentMessages.push(retryGuidanceMessage);
                
                currentAttempt++;
                continue;
            }

            
            let finalResponse;
            try {
                // Extract the LAST user query from the messages (most recent)
                const userMessages = state.messages.filter(msg => msg.constructor.name === 'HumanMessage');
                const userQuery = userMessages[userMessages.length - 1]?.content || "the player's request";
                

                
                // Create a simplified final message without tool binding
                const simplifiedMessages = [
                    new SystemMessage("You are a pirate game narrator. Based on the tool results provided, give a narrative response about what the player discovered. Do not make any tool calls - just provide story content."),
                    new HumanMessage(`The player asked: "${userQuery}". Here are the tool results: ${JSON.stringify(toolResults.map(tr => ({tool: tr.name, result: tr.content})), null, 2)}. Provide a narrative response about what the player discovered based on their original question.`)
                ];
                
                // Use LLM without tools for final response
                finalResponse = await llm.invoke(simplifiedMessages);

            } catch (finalError) {
                console.error("Final response error:", finalError.message);
                return {
                    messages: currentMessages,
                    result: `Error in final LLM response: ${finalError.message}. Tool results were: ${JSON.stringify(toolResults.map(tr => ({tool: tr.name, result: tr.content})), null, 2)}`
                };
            }
            
            let finalContent = finalResponse?.content;
            
            if (!finalContent || finalContent.trim() === '') {
                finalContent = `The tools were executed successfully, but the LLM failed to generate a proper response. Tool results: ${JSON.stringify(toolResults.map(tr => ({tool: tr.name, result: tr.content})), null, 2)}`;
            }
            
            return {
                messages: currentMessages,
                result: finalContent
            };
        } else {

            const content = response.content || "I apologize, but I couldn't generate a proper response. Please try rephrasing your request.";
            return {
                messages: [...currentMessages, response],
                result: content
            };
        }
    } 
}



//define the state graph
const workflow = new StateGraph({ channels: graphStateData });
//define nodes
workflow.addNode("processWithTools", processWithToolsNode);
//define edgs
workflow.addEdge(START, "processWithTools");
workflow.addEdge("processWithTools", END);

//compile the graph workflow
const graph = workflow.compile();


app.post('/api/chat', async (req, res) => {
    try {
        const { messages, model } = req.body;

        
        if (!messages || !Array.isArray(messages)) {
            return res.status(400).json({ error: 'Messages array required' });
        }


        const langChainMessages = messages.map(msg => {
            if (msg.role === 'user') {
                return new HumanMessage(msg.content);
            } else if (msg.role === 'system') {
                return new SystemMessage(msg.content);
            }
            return msg;
        });
        
        const toolGuidanceMessage = new SystemMessage(`
INTELLIGENT TOOL USAGE GUIDELINES:

CRITICAL: You can make multiple tool calls in a single response. When an item is not found, make ALL necessary tool calls at once:

ITEM CREATION WORKFLOW - Make these tool calls in ONE response:
1. If get_item_info fails: Call addItemToItemsList AND get_item_info in the same response
2. For addItemToItemsList, use category "weapons" for weapon items
3. Create appropriate item data with name, type, damage, description, etc.

ENEMY CREATION WORKFLOW - Make these tool calls in ONE response:
1. If get_enemies_info fails: Call createEnemy AND get_enemies_info in the same response
2. Use appropriate enemy categories

MANDATORY RULES:
- Make multiple tool calls in a single response when needed
- Don't wait for tool results - chain the calls together
- Create realistic item/enemy data that fits the pirate theme
- After tool calls succeed, the system will generate narrative content automatically

AVAILABLE TOOLS FOR DISCOVERY:
- listItemCategories: Shows all item categories and structure
- listEnemyCategories: Shows all enemy categories and structure
- listAllEnemies: Lists all enemies by category
- listItemTypes: Shows all item types available

Remember: You are capable of creating content dynamically. Use this power!
        `);
        
        //adds guidance message at the start of the conversation
        langChainMessages.unshift(toolGuidanceMessage);

        const result = await graph.invoke({
            messages: langChainMessages,
            result: ""
        });


        
        const finalContent = result.result || "I'm sorry, I encountered an issue processing your request. Please try again.";
        
        res.json({ 
            message: {
                role: 'assistant',
                content: finalContent
            }
        });
    } catch (error) {
        console.error('API Error:', error.message);
        res.status(500).json({ 
            error: 'Internal server error',
            details: error.message 
        });
    }
});

app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});

