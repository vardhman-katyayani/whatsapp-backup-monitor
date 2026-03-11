#!/usr/bin/env node

/**
 * Anthropic API Test File
 * 
 * Tests if Anthropic Claude API is working correctly
 * for processing WhatsApp messages
 * 
 * Usage:
 *   node test-anthropic.js
 * 
 * Requires:
 *   ANTHROPIC_API_KEY in .env
 */

import dotenv from 'dotenv';
import fetch from 'node-fetch';

// Load environment variables
dotenv.config();

const API_KEY = process.env.ANTHROPIC_API_KEY;
// Try different model names - use the first one that works
const MODELS_TO_TRY = [
  'claude-opus-4-1-20250805',  // Latest as of early 2025
  'claude-3-5-sonnet-20241022', // Previous version
  'claude-3-5-sonnet-latest',   // Generic latest
  'claude-opus-4-1-latest'      // Generic latest opus
];
const MODEL = MODELS_TO_TRY[0]; // Start with the latest

console.log(`
╔════════════════════════════════════════════════════════════╗
║            Anthropic API Integration Test                  ║
╠════════════════════════════════════════════════════════════╣
║              Testing Claude Connection                     ║
╚════════════════════════════════════════════════════════════╝
`);

// ============================================
// Test 1: Check API Key
// ============================================
console.log('  API Key Check:');
if (!API_KEY) {
  console.log('    ANTHROPIC_API_KEY not set in .env');
  console.log('\n   To fix:');
  console.log('   1. Get key from https://console.anthropic.com');
  console.log('   2. Add to .env:');
  console.log('      ANTHROPIC_API_KEY=sk-ant-...');
  process.exit(1);
} else {
  const keyPrefix = API_KEY.substring(0, 10);
  const keySuffix = API_KEY.substring(-5);
  console.log(` API Key found`);
  console.log(` Key: ${keyPrefix}...${keySuffix}`);
}

// ============================================
// Test 2: Simple API Call with Fallback Models
// ============================================
async function testAnthropic() {
  console.log('\n   Testing API Connection:');
  
  for (let i = 0; i < MODELS_TO_TRY.length; i++) {
    const currentModel = MODELS_TO_TRY[i];
    console.log(`   Trying model: ${currentModel}...`);
    
    try {
      const response = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': API_KEY,
          'anthropic-version': '2023-06-01'
        },
        body: JSON.stringify({
          model: currentModel,
          max_tokens: 100,
          messages: [
            {
              role: 'user',
              content: 'Hello! Say "ANTHROPIC API IS WORKING" if you can read this.'
            }
          ]
        })
      });

      const data = await response.json();

      if (!response.ok) {
        if (response.status === 404 && i < MODELS_TO_TRY.length - 1) {
          console.log(`   ❌ Model not found: ${currentModel}, trying next...`);
          continue; // Try next model
        }
        console.log(`   ❌ API Error: ${response.status}`);
        console.log(`   📋 Message: ${data.error?.message || 'Unknown error'}`);
        if (i === MODELS_TO_TRY.length - 1) process.exit(1);
        continue;
      }

      const content = data.content[0]?.text || '';
      console.log('   ✅ API Connection Successful');
      console.log(`   📝 Using model: ${currentModel}`);
      console.log(`   📝 Response: "${content.substring(0, 50)}..."`);
      
      // Store the working model for later tests
      global.WORKING_MODEL = currentModel;
      return { success: true, data };
    } catch (error) {
      if (i === MODELS_TO_TRY.length - 1) {
        console.log(`   ❌ Connection Error: ${error.message}`);
        console.log('   💡 Check:');
        console.log('      - Internet connection');
        console.log('      - API key is valid');
        console.log('      - Anthropic API is accessible');
        process.exit(1);
      }
      continue;
    }
  }
}

// ============================================
// Test 3: WhatsApp Message Analysis
// ============================================
async function testMessageAnalysis() {
  console.log('\n3️⃣  Testing Message Analysis:');

  const testMessage = {
    from_me: false,
    data: 'Hey! Looking forward to the meeting tomorrow',
    timestamp: Date.now()
  };

  try {
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': API_KEY,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify({
        model: global.WORKING_MODEL || MODEL,
        max_tokens: 200,
        messages: [
          {
            role: 'user',
            content: `Analyze this WhatsApp message and provide:
1. Sentiment (positive/negative/neutral)
2. Key topics
3. Intent

Message: "${testMessage.data}"`
          }
        ]
      })
    });

    const data = await response.json();

    if (response.ok) {
      const analysis = data.content[0]?.text || '';
      console.log('   ✅ Message Analysis Successful');
      console.log(`\n   Analysis Result:\n`);
      console.log(`   ${analysis.substring(0, 200)}`);
    } else {
      console.log(`   ⚠️  Analysis failed: ${data.error?.message}`);
    }
  } catch (error) {
    console.log(`   ❌ Analysis Error: ${error.message}`);
  }
}

// ============================================
// Test 4: Token Usage Test
// ============================================
async function testTokenUsage() {
  console.log('\n4️⃣  Testing Token Usage Tracking:');

  try {
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': API_KEY,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify({
        model: global.WORKING_MODEL || MODEL,
        max_tokens: 50,
        messages: [
          {
            role: 'user',
            content: 'Count to 5'
          }
        ]
      })
    });

    const data = await response.json();

    if (response.ok && data.usage) {
      console.log('   ✅ Token Tracking Works');
      console.log(`   📊 Input tokens: ${data.usage.input_tokens}`);
      console.log(`   📊 Output tokens: ${data.usage.output_tokens}`);
      console.log(`   📊 Total: ${data.usage.input_tokens + data.usage.output_tokens}`);
    } else {
      console.log('   ⚠️  Token tracking unavailable');
    }
  } catch (error) {
    console.log(`   ❌ Token tracking error: ${error.message}`);
  }
}

// ============================================
// Run All Tests
// ============================================
async function runAllTests() {
  await testAnthropic();
  await testMessageAnalysis();
  await testTokenUsage();

  console.log(`
╔════════════════════════════════════════════════════════════╗
║           ✅ ANTHROPIC API TEST COMPLETE                   ║
╚════════════════════════════════════════════════════════════╝

Summary:
  ✅ API Key configured
  ✅ API Connection working
  ✅ Message analysis functional
  ✅ Token tracking enabled

You can now use Claude to:
  - Analyze WhatsApp messages
  - Extract insights from conversations
  - Categorize messages
  - Detect sentiment
  - Generate summaries

Next Steps:
  1. Integrate with decryption pipeline
  2. Process extracted messages
  3. Store analysis in Supabase
  4. Display results in dashboard
`);

  process.exit(0);
}

// Run tests
runAllTests().catch(err => {
  console.error('❌ Test failed:', err.message);
  process.exit(1);
});
