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

console.log("LLM Configuration:", {
  baseUrl: llm.baseUrl,
  model: llm.model
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
    const ITEMS = loadItems();
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
        
        let item = allItems.find(i => i.name.toLowerCase() === name.toLowerCase());
        if (item) {
            return item;
        }
        
        const partialMatches = allItems.filter(i => 
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
        throw new Error(`Item not found: ${name}. Available item types: ${availableTypes.join(', ')}. Use listItemCategories tool to see all available items or addItemToItemsList tool to create this item.`);
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
                    console.log(`No exact match for type '${type}', trying similar categories:`, similarCategories);
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
        itemData: z.object({}).describe("The full item object to add, matching the item schema")
    });

    async _call({ category, subcategory, key, itemData }) {
        const ITEMS = loadItems();
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
    console.log("=== PROCESSING WITH TOOLS NODE ===");
    console.log("Input state messages:", state.messages.length);
    
    const llmWithTools = llm.bind({ tools: allTools });
    
    let response;
    try {
        console.log("=== CALLING LLM WITH TOOLS ===");
        console.log("Messages to LLM:", state.messages.length);
        console.log("Available tools:", allTools.map(t => t.name));
        
        response = await llmWithTools.invoke(state.messages);
        
        console.log("RAW LLM RESPONSE:", JSON.stringify(response, null, 2));
        console.log("Response content:", response.content);
        console.log("Response content length:", response.content?.length || 0);
        console.log("Tool calls:", response.tool_calls);
        console.log("Tool calls count:", response.tool_calls?.length || 0);
        
    } catch (llmError) {
        console.error("ERROR IN INITIAL LLM CALL:", llmError);
        console.error("LLM Error details:", {
            message: llmError.message,
            stack: llmError.stack,
            baseUrl: llm.baseUrl,
            model: llm.model
        });
        
        return {
            messages: [...state.messages],
            result: `LLM Error: ${llmError.message}. Please check if Ollama is running and the model 'gpt-oss:20b' is available.`
        };
    }

    if (response.tool_calls && response.tool_calls.length > 0) {
        console.log(`=== EXECUTING ${response.tool_calls.length} TOOL(S) ===`);
        const toolResults = [];
        
        for (const toolCall of response.tool_calls) {
            console.log("TOOL REQUESTED BY LLM:", JSON.stringify(toolCall, null, 2));
            
            const tool = allTools.find(t => t.name === toolCall.name);
            if (tool) {
                try {
                    const toolResult = await tool.invoke(toolCall.args);
                    console.log(`TOOL ${toolCall.name} RESULT:`, JSON.stringify(toolResult, null, 2));
                    toolResults.push({
                        tool_call_id: toolCall.id,
                        role: "tool",
                        name: toolCall.name,
                        content: JSON.stringify(toolResult)
                    });
                } catch (error) {
                    console.error(`Error executing tool ${toolCall.name}:`, error);
                    
                    let fallbackSuggestion = error.message;
                    
                    if (toolCall.name === 'get_item_info' && error.message.includes('not found')) {
                        fallbackSuggestion += '. Suggestion: Use listItemCategories tool to see available categories, or use addItemToItemsList tool to create this item if it should exist.';
                    }
                    
                    if (toolCall.name === 'get_enemies_info' && error.message.includes('not found')) {
                        fallbackSuggestion += '. Suggestion: Use listEnemyCategories tool to see available categories, or use createEnemy tool to create this enemy if it should exist.';
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
                console.error(`Tool not found: ${toolCall.name}`);
                toolResults.push({
                    tool_call_id: toolCall.id,
                    role: "tool",
                    name: toolCall.name,
                    content: `Error: Tool ${toolCall.name} not found`
                });
            }
        }

        console.log("=== GENERATING FINAL RESPONSE WITH TOOL RESULTS ===");
        const updatedMessages = [
            ...state.messages,
            response,
            ...toolResults
        ];

        console.log("Updated messages count:", updatedMessages.length);
        
        let finalResponse;
        try {
            finalResponse = await llm.invoke(updatedMessages);
            console.log("FINAL RESPONSE:", JSON.stringify(finalResponse, null, 2));
            console.log("Final content:", finalResponse.content);
            console.log("Final content length:", finalResponse.content?.length || 0);
            console.log("Final content type:", typeof finalResponse.content);
        } catch (finalError) {
            console.error("ERROR IN FINAL LLM CALL:", finalError);
            return {
                messages: updatedMessages,
                result: `Error in final LLM response: ${finalError.message}. Tool results were: ${JSON.stringify(toolResults, null, 2)}`
            };
        }
        
        let finalContent = finalResponse?.content;
        
        if (!finalContent || finalContent.trim() === '') {
            console.warn("WARNING: LLM returned empty content");
            console.log("Full LLM response object:", finalResponse);
            finalContent = `The tools were executed successfully, but the LLM failed to generate a proper response. Tool results: ${JSON.stringify(toolResults.map(tr => ({tool: tr.name, result: tr.content})), null, 2)}`;
        }
        
        return {
            messages: updatedMessages,
            result: finalContent
        };
    } else {
        console.log("=== NO TOOLS CALLED, RETURNING DIRECT RESPONSE ===");
        const content = response.content || "I apologize, but I couldn't generate a proper response. Please try rephrasing your request.";
        return {
            messages: [...state.messages, response],
            result: content
        };
    }
}

const workflow = new StateGraph({ channels: graphStateData });
workflow.addNode("processWithTools", processWithToolsNode);
workflow.addEdge(START, "processWithTools");
workflow.addEdge("processWithTools", END);
const graph = workflow.compile();


app.post('/api/chat', async (req, res) => {
    try {
        const { messages, model } = req.body;
        console.log('=== INCOMING API REQUEST ===');
        console.log('Messages:', JSON.stringify(messages, null, 2));
        
        if (!messages || !Array.isArray(messages)) {
            return res.status(400).json({ error: 'Messages array required' });
        }

        // Convert messages to LangChain format and add intelligent system guidance
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

When tool calls fail, use these fallback strategies:

1. ITEM-RELATED FAILURES:
   - If get_item_info fails with "not found": Use listItemCategories tool to see available categories, then either find a similar item or use addItemToItemsList to create it
   - If getShopItems fails with category error: Use listItemCategories first to see valid categories
   - If unsure about item structure: Use listItemCategories to understand the data organization

2. ENEMY-RELATED FAILURES:
   - If get_enemies_info fails with "not found": Use listEnemyCategories tool to see available categories, then either find a similar enemy or use createEnemy to create it
   - If getRandomEnemy fails with category error: Use listEnemyCategories first to see valid categories
   - If unsure about enemy structure: Use listEnemyCategories to understand the data organization

3. GENERAL STRATEGY:
   - Always explore available options before giving up
   - Use list/discovery tools when specific lookups fail
   - Suggest creating missing content when appropriate
   - Provide helpful alternatives when exact matches aren't found

4. AVAILABLE DISCOVERY TOOLS:
   - listItemCategories: Shows all item categories and their structure
   - listEnemyCategories: Shows all enemy categories and their structure  
   - listAllEnemies: Lists all enemies by category
   - listItemTypes: Shows all item types available

Remember: Your goal is to be helpful and resourceful, not just report failures.
        `);
        
        langChainMessages.unshift(toolGuidanceMessage);

        console.log('Converted LangChain messages:', langChainMessages.length);

        const result = await graph.invoke({
            messages: langChainMessages,
            result: ""
        });

        console.log('=== GRAPH EXECUTION COMPLETE ===');
        console.log('Final AI response length:', result.result?.length || 0);
        console.log('Final AI response:', result.result);
        
        const finalContent = result.result || "I'm sorry, I encountered an issue processing your request. Please try again.";
        
        res.json({ 
            message: {
                role: 'assistant',
                content: finalContent
            }
        });
    } catch (error) {
        console.error('=== API ERROR ===');
        console.error('Error details:', error);
        console.error('Stack trace:', error.stack);
        res.status(500).json({ 
            error: 'Internal server error',
            details: error.message 
        });
    }
});

app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});

