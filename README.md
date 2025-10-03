# 🏴‍☠️ Pirate Adventure Game with LangGraph.js

A sophisticated pirate-themed adventure game built with LangGraph.js, featuring intelligent AI agents, automatic retry mechanisms, and comprehensive tool systems for dynamic gameplay.

## 🚀 Features

### **LangGraph.js Implementation**
- **Graph Structure**: START → processWithTools → END
- **Intelligent Retry System**: AI can automatically retry failed tool calls with better parameters
- **11+ Structured Tools** with comprehensive schemas
- **Automatic Tool Binding** and execution
- **Smart Error Recovery** with fallback strategies

### **Game Features** 
- **Dynamic Pirate Adventure**: Immersive narrative-driven gameplay
- **Real-time State Management**: Health, gold, inventory, objectives tracking
- **Procedural Content**: Dynamic enemy and item generation
- **Interactive UI**: Modern web interface with conversation history

## 📦 Installation

### Prerequisites
- Node.js 18+
- Ollama running locally with `gpt-oss:20b` model
- Port 3001 available

### Setup
```bash
# Clone the repository
git clone <repository-url>
cd langChain

# Install dependencies
npm install

# Start the development server
npm run dev
```

### Dependencies
```json
{
  "@langchain/core": "^0.3.0",
  "@langchain/langgraph": "^0.2.0", 
  "@langchain/ollama": "^0.1.0",
  "express": "^4.18.2",
  "cors": "^2.8.5",
  "zod": "^3.22.0"
}
```

## 🏗️ Architecture

### **Backend (server.js)**

#### **LangGraph Workflow**
```javascript
const workflow = new StateGraph({ channels: graphStateData });
workflow.addNode("processWithTools", processWithToolsNode);
workflow.addEdge(START, "processWithTools");
workflow.addEdge("processWithTools", END);
```

#### **Intelligent Retry System**
The AI agent can automatically retry failed tool calls up to 2 times:

1. **Tool Execution** → If tools fail with recoverable errors
2. **Error Analysis** → System identifies if failure is recoverable
3. **Automatic Retry** → AI receives suggestions and retries with better parameters
4. **Success or Final Failure** → Process completes with best possible result

#### **Tool Categories**

**Enemy Management Tools (5)**
- `GetEnemyInfoTool` - Retrieve enemy details with fuzzy matching
- `GetRandomEnemyTool` - Get random enemies by category 
- `CreateEnemyTool` - Create new enemies with full stats
- `ListAllEnemiesTag` - List all available enemies
- `ListEnemyCategoriesTool` - Show enemy categories and structure

**Item Management Tools (6)**
- `GetItemInfoTool` - Retrieve item details with fuzzy matching
- `GetShopItemsTool` - Get shop inventory by type/count
- `GetRandomItemsTool` - Random item selection
- `AddItemToItemsListTool` - Create new items
- `ListItemTypesTool` - Show available item types
- `ListItemCategoriesTool` - Show item categories and structure

### **Frontend (index.html + ollama.js)**
- **Game State Management**: Real-time tracking of player stats, inventory, objectives
- **Conversation Interface**: Message history with markdown rendering
- **State Parsing**: Automatic game state updates from AI responses
- **Responsive Design**: Modern pirate-themed UI

## 🔄 Request Flow

### **Standard Flow**
```
User Input → Frontend → API (/api/chat) → LangGraph → processWithToolsNode → Tools → LLM → Response → Frontend
```

### **Retry Flow (NEW)**
```
User Input → API → LangGraph → processWithToolsNode 
    → Tool Fails → Retry Logic → Discovery Tools → Original Tool (Success) → Final Response
```

### **Example Retry Scenario**
1. **User**: "Tell me about a fire dragon"
2. **AI calls**: `get_enemies_info(category: "mythical", name: "fire dragon")` → **FAILS**
3. **System detects**: Recoverable failure
4. **AI automatically calls**: `listEnemyCategories()` → **SUCCESS** 
5. **AI calls again**: `get_enemies_info(category: "dragons", name: "fire dragon")` → **SUCCESS**
6. **Final response**: Detailed fire dragon information

## 🧪 Testing

### **API Testing with Postman**

**Endpoint**: `POST http://localhost:3001/api/chat`

**Headers**:
```json
{
  "Content-Type": "application/json"
}
```

**Body**:
```json
{
  "messages": [
    {
      "role": "user",
      "content": "Tell me about available weapons in the game"
    }
  ],
  "model": "gpt-oss:20b"
}
```

### **Test Scenarios**

1. **Basic Tool Usage**: Request item/enemy information
2. **Error Recovery**: Request non-existent items to test retry system
3. **Game State**: Ask about inventory, health, location
4. **Complex Queries**: Multi-step requests requiring multiple tools

## 📊 Performance Features

### **Automatic Optimizations**
- **Message History Trimming**: Maintains performance with long conversations
- **State Updates**: Efficient game state synchronization
- **Tool Result Caching**: Optimized repeated queries
- **Error Boundaries**: Graceful failure handling

### **Monitoring & Debugging**
- **Comprehensive Logging**: Detailed tool execution tracking
- **Performance Metrics**: Response time and retry statistics  
- **Error Reporting**: Clear error messages with suggestions

## 🎮 Game Mechanics

### **Player Management**
- Health/Gold tracking
- Dynamic inventory system
- Location and sub-location tracking
- Objective/quest management

### **Content Systems**
- **Enemies**: Pirates, Navy, Mythical creatures, Ghosts, Town NPCs
- **Items**: Weapons, Clothing, Ammunition, Consumables, Treasure
- **Locations**: Multiple islands and areas to explore

## 🔧 Configuration

### **LLM Configuration**
```javascript
const llm = new ChatOllama({ 
  baseUrl: 'http://golem:11434',  // Update for your Ollama instance
  model: 'gpt-oss:20b'            // Update for your preferred model
});
```

### **Retry Configuration**
```javascript
const maxRetries = 2;  // Adjust retry attempts
```

## 📈 Enhancement Opportunities

### **Potential Improvements**
1. **Conditional Edges**: Add graph branching based on game state
2. **Tool Chaining**: Automatic multi-tool workflows
3. **Persistent Storage**: Database integration for game saves
4. **Multiplayer**: Real-time collaborative adventures
5. **Advanced AI**: Context-aware personality systems

### **Scaling Considerations**
- Redis for session management
- Database for persistent game worlds
- Load balancing for multiple users
- Caching layers for frequently accessed data

## 🤝 Contributing

1. Fork the repository
2. Create feature branch (`git checkout -b feature/amazing-feature`)
3. Commit changes (`git commit -m 'Add amazing feature'`)
4. Push to branch (`git push origin feature/amazing-feature`)
5. Open Pull Request

## 📝 License

This project is licensed under the MIT License - see the LICENSE file for details.

## 🙏 Acknowledgments

- **LangChain Team** for the excellent framework
- **Ollama** for local LLM capabilities
- **Pirate Adventure Theme** inspired by classic text adventures

---

*Ahoy! Set sail on your coding adventure! ⚓*