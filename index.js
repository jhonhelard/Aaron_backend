require('dotenv').config();
const express = require('express');
const cors = require('cors');
const OpenAI = require('openai');

const app = express();
const PORT = process.env.PORT || 3000;

// Initialize OpenAI (with error handling for unsupported regions)
let openai = null;
let openaiAvailable = false;

if (process.env.OPENAI_API_KEY) {
  try {
    openai = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY,
    });
    openaiAvailable = true;
  } catch (error) {
    console.warn('⚠️  OpenAI initialization failed:', error.message);
    openaiAvailable = false;
  }
}

// Middleware
app.use(cors({
  origin: "*",
  credentials: true
}));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Health check route
app.get('/health', (req, res) => {
  res.json({
    status: 'OK',
    service: 'Portfolio Chatbot Backend',
    timestamp: new Date().toISOString()
  });
});

// Minimal fallback when OpenAI is unavailable
const getFallbackResponse = () => {
  return `I'm temporarily unable to fetch an AI response. Please try again in a moment.`;
};

// Chat endpoint with fallback system
app.post('/api/chat', async (req, res) => {
  try {
    const { message, conversationHistory = [] } = req.body;

    if (!message || typeof message !== 'string' || message.trim().length === 0) {
    return res.status(400).json({
      success: false,
        error: 'Message is required and must be a non-empty string'
      });
    }

    // Always try OpenAI first if API key is available
    if (process.env.OPENAI_API_KEY) {
      try {
        console.log('🤖 Attempting to use OpenAI API...');
        
        // Create system prompt for Aaron's portfolio assistant (enriched)
        const systemPrompt = `You are Aaron Lim's AI assistant for his portfolio website.

CONTEXT (authoritative facts extracted from the site):
- Name: Aaron Lim
- Location: Singapore
- University: James Cook University, Singapore (JCU)
- Current Program: Bachelor of Technology (B.Tech) in Computer Science & Engineering — specialization in Artificial Intelligence & Machine Learning (2021–Present)
- Prior Education: Pre‑University College (2019–2021) — CGPA 8.5; Secondary High School (2012–2019) — CGPA 9.09

Core Skills:
- Advanced: Python, JavaScript
- Intermediate: React.js, Node.js, Next.js, C++, Machine Learning, AI, CSS
- Beginner: Blockchain

Projects (with categories):
- AI/ML: Income Tax Fraud Detection (ML pipeline with preprocessing, feature engineering, training); Oral Cancer Classification using Neural Networks (image classification with CNNs; data collection and evaluation); Credit Card Fraud Detection (Kaggle dataset, transaction classification); Contextualized Topic Modeling (BERT embeddings + topic models for coherent topics and doc classification)
- Web: E‑commerce Platform (auth, catalog, payments); Personal Portfolio (responsive site)
- Blockchain: Blockchain Explorer (web UI to explore blockchain data and transactions)
- IoT: Smart Home Dashboard (monitor/control devices)

Interests: exploring new technologies, solving algorithmic challenges, open‑source, building web apps.

POLICY:
- Provide accurate, concise answers grounded in the context above.
- If asked about age or unknown private details, respond that it is not listed.
- When asked to introduce or list projects, cover multiple categories (AI/ML, Web, Blockchain, IoT) rather than only AI.
- If the user asks about a specific project, summarize its goal and tech stack.
- Keep a professional helpful tone.`;

        // Prepare messages for OpenAI
        const messages = [
          { role: 'system', content: systemPrompt },
          ...conversationHistory.map(msg => ({
            role: msg.type === 'user' ? 'user' : 'assistant',
            content: msg.text
          })),
          { role: 'user', content: message.trim() }
        ];

        // Call OpenAI API
        const completion = await openai.chat.completions.create({
          model: 'gpt-4o',
          messages: messages,
          max_tokens: 500,
          temperature: 0.7,
          presence_penalty: 0.1,
          frequency_penalty: 0.1
        });

        const response = completion.choices[0]?.message?.content;

        if (response) {
          console.log('✅ OpenAI response received successfully');
          return res.json({
    success: true,
            response: response.trim(),
            timestamp: new Date().toISOString(),
            source: 'openai'
          });
        }
      } catch (openaiError) {
        console.error('❌ OpenAI API Error:', openaiError.message);
        console.error('Error details:', {
          code: openaiError.code,
          status: openaiError.status,
          type: openaiError.type
        });
        
        // Handle specific OpenAI errors
        if (openaiError.code === 'unsupported_country_region_territory' || 
            openaiError.code === 'permission_denied' ||
            openaiError.status === 403) {
          console.log('🔄 OpenAI not available in this region, using fallback system');
          openaiAvailable = false; // Mark as unavailable for future requests
        } else if (openaiError.code === 'insufficient_quota') {
          console.log('💳 OpenAI quota exceeded, using fallback system');
        } else if (openaiError.code === 'invalid_api_key') {
          console.log('🔑 Invalid OpenAI API key, using fallback system');
        }
        
        // Continue to fallback system
      }
    }

    // Use fallback system only if OpenAI fails
    console.log('🔄 Using fallback AI system');
    const fallbackResponse = getFallbackResponse();
  
  res.json({
    success: true,
      response: fallbackResponse,
      timestamp: new Date().toISOString(),
      source: 'fallback'
    });

  } catch (error) {
    console.error('Chat Error:', error);
    
    res.status(500).json({
      success: false,
      error: 'Failed to process chat message. Please try again.',
      details: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

// 404 handler
app.use('*', (req, res) => {
  res.status(404).json({
    success: false,
    error: 'Route not found',
    availableRoutes: ['/health', '/api/chat']
  });
});

// Error handling middleware
app.use((err, req, res, next) => {
  console.error('Server Error:', err.stack);
  res.status(500).json({
    success: false,
    error: 'Internal server error',
    details: process.env.NODE_ENV === 'development' ? err.message : undefined
  });
});

// Start server
app.listen(PORT, () => {
  console.log(`🤖 Portfolio Chatbot Backend is running on port ${PORT}`);
  console.log(`📍 Local: http://localhost:${PORT}`);
  console.log(`🔗 Health check: http://localhost:${PORT}/health`);
  console.log(`💬 Chat endpoint: http://localhost:${PORT}/api/chat`);
  
  // Check OpenAI availability
  if (!process.env.OPENAI_API_KEY) {
    console.log('🔄 Using fallback AI system (no OpenAI API key)');
    console.log('   Add OPENAI_API_KEY to .env file to enable OpenAI integration');
  } else {
    console.log('✅ OpenAI API key is configured');
    console.log('🤖 Will attempt to use GPT-4o for responses');
    console.log('🔄 Fallback system available if OpenAI fails');
  }
  
  console.log('💡 Chatbot will prioritize OpenAI, fallback to intelligent responses if needed');
});

module.exports = app;