#!/usr/bin/env node
/**
 * WhatsApp Backup AI Assistant
 * =================================
 * Interactive CLI to ask questions about WhatsApp backup data
 * Powered by Anthropic Claude AI
 */

import Anthropic from "@anthropic-ai/sdk";
import * as fs from "fs";
import * as path from "path";
import * as readline from "readline";
import * as dotenv from "dotenv";

// Load environment variables
dotenv.config();
dotenv.config({ path: "/home/katyayani/Desktop/whatsapp_backup/whatsapp-backup-monitor/.env" });

const ANTHROPIC_KEY = process.env.ANTHROPIC_API_KEY;
const BACKUP_DATA_DIR =
  "/home/katyayani/Downloads/AndroidData-20260310T103958Z-3-001/extracted_data";

// Initialize Anthropic client
if (!ANTHROPIC_KEY) {
  console.error(
    "❌ Error: ANTHROPIC_API_KEY not found in .env file"
  );
  process.exit(1);
}

const client = new Anthropic({ apiKey: ANTHROPIC_KEY });

class BackupAIAssistant {
  constructor() {
    this.backupData = {};
    this.conversationHistory = [];
    this.loadBackupData();
  }

  loadBackupData() {
    console.log("📂 Loading backup data...");

    const dataFiles = [
      "chat_settings.json",
      "trusted_contacts.json",
      "sent_contact_tokens.json",
      "business_activity.json",
      "sticker_packs.json",
      "premium_messages.json",
      "message_pricing.json",
    ];

    for (const file of dataFiles) {
      const filePath = path.join(BACKUP_DATA_DIR, file);
      if (fs.existsSync(filePath)) {
        try {
          this.backupData[file.replace(".json", "")] = JSON.parse(
            fs.readFileSync(filePath, "utf-8")
          );
          console.log(`   ✓ Loaded ${file}`);
        } catch (e) {
          console.log(`   ⚠ Error loading ${file}`);
        }
      }
    }

    console.log(`\n✓ Backup data loaded successfully!\n`);
  }

  getBackupSummary() {
    return `
WhatsApp Backup Summary:
- Chats/Settings: ${this.backupData.chat_settings?.length || 0} entries
- Contacts (Incoming): ${this.backupData.trusted_contacts?.length || 0}
- Contact Activity: ${this.backupData.sent_contact_tokens?.length || 0} logs
- Business Activity: ${this.backupData.business_activity?.length || 0} events
- Sticker Packs: ${this.backupData.sticker_packs?.length || 0}
- Premium Messages: ${this.backupData.premium_messages?.length || 0}
`;
  }

  async ask(userQuestion) {
    // Add user message to history
    this.conversationHistory.push({
      role: "user",
      content: userQuestion,
    });

    // Create context from backup data
    const backupContext = `
You are a WhatsApp backup data analysis assistant. You have access to the following backup data:

${this.getBackupSummary()}

Available data sources:
${JSON.stringify(
  {
    chat_settings: `${this.backupData.chat_settings?.length || 0} chat configurations`,
    trusted_contacts: `${this.backupData.trusted_contacts?.length || 0} contacts with JID info`,
    sent_contact_tokens: `${this.backupData.sent_contact_tokens?.length || 0} contact activity logs`,
    business_activity: `${this.backupData.business_activity?.length || 0} business insights events`,
    sticker_packs: `${this.backupData.sticker_packs?.length || 0} sticker pack metadata`,
    premium_messages: `${this.backupData.premium_messages?.length || 0} business message templates`,
    message_pricing: `Pricing data by country`,
  },
  null,
  2
)}

When answering questions:
1. Reference specific data from the backup when relevant
2. Provide statistics and summaries
3. Help analyze patterns and trends
4. Suggest insights about their WhatsApp activity
5. Answer questions about backup contents

User Question: ${userQuestion}
`;

    try {
      const response = await client.messages.create({
        model: "claude-3-5-sonnet-20241022",
        max_tokens: 1024,
        system: backupContext,
        messages: this.conversationHistory,
      });

      const assistantMessage =
        response.content[0].type === "text" ? response.content[0].text : "";

      // Add assistant response to history
      this.conversationHistory.push({
        role: "assistant",
        content: assistantMessage,
      });

      return assistantMessage;
    } catch (error) {
      console.error("❌ Error calling Anthropic API:", error.message);
      return "Sorry, I encountered an error processing your question.";
    }
  }

  printWelcome() {
    console.clear();
    console.log(
      "╔═══════════════════════════════════════════════════════════════╗"
    );
    console.log(
      "║       WhatsApp Backup AI Assistant                           ║"
    );
    console.log(
      "║    Ask questions about your backup data in natural language  ║"
    );
    console.log(
      "╚═══════════════════════════════════════════════════════════════╝\n"
    );

    console.log(this.getBackupSummary());

    console.log("Commands:");
    console.log("  • Type your question and press Enter");
    console.log("  • Type 'stats' to see backup statistics");
    console.log("  • Type 'help' for example questions");
    console.log("  • Type 'exit' to quit\n");

    console.log("Example Questions:");
    console.log("  ❓ How many chats do I have?");
    console.log("  ❓ What countries have the highest message costs?");
    console.log("  ❓ Summarize my business activity");
    console.log("  ❓ How many contacts do I have?\n");
  }

  printHelp() {
    console.log(`
Example Questions You Can Ask:

📊 Statistics & Summaries:
  • How many chats do I have?
  • What's my contact count?
  • Show me a summary of business activity
  • What sticker packs do I have?

📈 Analysis:
  • Which countries have the highest message costs?
  • Analyze my contact activity patterns
  • What dates were most active?
  • Summary of business events

💬 Specific Queries:
  • Tell me about my trusted contacts
  • What premium messages do I have?
  • List sticker pack names
  • Show muted chats

🔍 Insights:
  • What can you tell me about my WhatsApp usage?
  • Analyze my backup structure
  • What business features am I using?

Just ask any question about your WhatsApp backup!
`);
  }

  printStats() {
    console.log("\n📊 Detailed Statistics:\n");

    if (this.backupData.chat_settings?.length) {
      const mutedChats = this.backupData.chat_settings.filter(
        (c) => c.muted_notifications
      ).length;
      console.log(`💬 Chats: ${this.backupData.chat_settings.length}`);
      console.log(`   - Muted: ${mutedChats}`);
    }

    if (this.backupData.trusted_contacts?.length) {
      console.log(
        `👥 Incoming Contacts: ${this.backupData.trusted_contacts.length}`
      );
    }

    if (this.backupData.sent_contact_tokens?.length) {
      console.log(
        `📤 Contact Activity Logs: ${this.backupData.sent_contact_tokens.length}`
      );
    }

    if (this.backupData.business_activity?.length) {
      const uniqueChats = new Set(
        this.backupData.business_activity.map((e) => e.chat_jid)
      ).size;
      console.log(
        `📈 Business Events: ${this.backupData.business_activity.length}`
      );
      console.log(`   - Unique Chats: ${uniqueChats}`);
    }

    if (this.backupData.sticker_packs?.length) {
      console.log(
        `🎨 Sticker Packs: ${this.backupData.sticker_packs.length}`
      );
    }

    if (this.backupData.message_pricing?.length) {
      const avgPrice =
        this.backupData.message_pricing.reduce((sum, p) => sum + p.message_cost, 0) /
        this.backupData.message_pricing.length;
      console.log(
        `💰 Countries with Pricing: ${this.backupData.message_pricing.length}`
      );
      console.log(`   - Average Cost: $${avgPrice.toFixed(4)}`);
    }

    console.log();
  }

  async startInteractiveMode() {
    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
    });

    this.printWelcome();

    const askQuestion = () => {
      rl.question("You: ", async (input) => {
        const userInput = input.trim().toLowerCase();

        if (userInput === "exit") {
          console.log("\n👋 Goodbye!");
          rl.close();
          process.exit(0);
        } else if (userInput === "help") {
          this.printHelp();
          askQuestion();
        } else if (userInput === "stats") {
          this.printStats();
          askQuestion();
        } else if (userInput === "") {
          askQuestion();
        } else {
          console.log("\n🤔 Claude is thinking...\n");

          const response = await this.ask(input);

          console.log(`\nClaude: ${response}\n`);
          askQuestion();
        }
      });
    };

    askQuestion();
  }
}

// Main execution
const assistant = new BackupAIAssistant();
assistant.startInteractiveMode();
