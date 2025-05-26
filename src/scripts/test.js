import "dotenv/config";
import {
  lithic,
  getNewestTransaction,
  saveTransactionToSupabase,
  getTransactionDetails as getTransactionDetailsFromDb,
  getTransactionStats,
  simulateTransaction,
  listCards,
  getCardDetails,
} from "./index.js";

// Helper function to generate a random merchant acceptor ID
function generateRandomAcceptorId(length = 12) {
  const characters =
    "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
  let result = "";
  for (let i = 0; i < length; i++) {
    result += characters.charAt(Math.floor(Math.random() * characters.length));
  }
  return result;
}

// A list of common MCCs to pick from randomly
const commonMCCs = [
  "5411", // Grocery Stores, Supermarkets
  "5812", // Restaurants
  "5814", // Fast Food Restaurants
  "5541", // Service Stations
  "5311", // Department Stores
  "7832", // Motion Picture Theaters
  "4121", // Taxicabs and Limousines
  "5942", // Book Stores
  "5499", // Misc Food Stores
  "5912", // Drug Stores
  "7372", // Computer Programming Services
  "5734", // Computer Software Stores
  "5999", // Miscellaneous Retail Stores
  "4900", // Utilities
  "5045", // Computers and Equipment
];

function getRandomMCC() {
  return commonMCCs[Math.floor(Math.random() * commonMCCs.length)];
}

// Generate random merchant names based on MCC
function generateMerchantName(mcc) {
  const merchantNames = {
    5411: ["QuickMart", "FreshFoods", "SuperSave", "GroceryPlus"],
    5812: ["Bella Vista", "Downtown Grill", "Corner Cafe", "Sunset Bistro"],
    5814: ["Fast Bites", "Quick Eats", "Speedy Burger", "Rush Food"],
    5541: ["Shell Station", "Gas & Go", "Fuel Stop", "Quick Fill"],
    5311: ["MegaStore", "Department Plus", "All-In-One", "Shopping Central"],
    7832: ["Cinema World", "Movie Palace", "Star Theater", "Film House"],
    4121: ["City Cab", "Quick Ride", "Metro Taxi", "Urban Transport"],
    5942: ["Book Nook", "Reading Corner", "Literary Hub", "Page Turner"],
    5499: ["Corner Store", "Mini Mart", "Quick Stop", "Local Shop"],
    5912: ["Health Plus", "Med Store", "Pharmacy First", "Care Drugs"],
    7372: ["TechSoft", "CodeWorks", "DevSolutions", "Programming Pro"],
    5734: ["Software Hub", "Tech Store", "Digital Solutions", "App Market"],
    5999: ["General Store", "Variety Shop", "Everything Plus", "Mix & Match"],
    4900: ["Power Co", "Utility Services", "Energy Plus", "Service Corp"],
    5045: ["Computer World", "Tech Hub", "PC Store", "Digital Equipment"],
  };

  const names = merchantNames[mcc] || [
    "Generic Store",
    "Random Merchant",
    "Unknown Shop",
    "Test Business",
  ];
  return names[Math.floor(Math.random() * names.length)];
}

async function test() {
  try {
    console.log(
      "🧪 Testing Enhanced Lithic Client Integration with Multiple Merchants\n",
    );

    // Test 1: List cards
    console.log("1️⃣ Listing available cards...");
    const cards = await listCards();

    if (cards.length === 0) {
      console.log(
        "❌ No cards found. Please create a card in Lithic sandbox first.",
      );
      return;
    }

    const testCard = cards[0]; // This contains the card token
    console.log(
      `✅ Found ${cards.length} cards. Using card token: ${testCard.token}, last four: ${testCard.last_four}`,
    );

    // Test 1.5: Get full card details to retrieve PAN
    console.log("\n1.5️⃣ Fetching full card details for PAN...");
    const fullCardDetails = await getCardDetails(testCard.token);
    if (!fullCardDetails || !fullCardDetails.pan) {
      console.log(
        "❌ Could not retrieve PAN for the card. Ensure getCardDetails from cards.js returns the PAN and is exported correctly.",
      );
      return;
    }
    const cardPAN = fullCardDetails.pan;
    console.log(
      `✅ Retrieved PAN: ${cardPAN.slice(0, 4)}...${cardPAN.slice(-4)}`,
    );

    // Test 2: Generate 5 merchants with random number of transactions each
    console.log("\n2️⃣ Generating 5 merchants with random transactions...");

    const merchants = [];
    const allTransactionTokens = [];

    // Generate 5 merchants
    for (let merchantIndex = 1; merchantIndex <= 5; merchantIndex++) {
      const mcc = getRandomMCC();
      const acceptorId = generateRandomAcceptorId();
      const merchantName = generateMerchantName(mcc);
      const numTransactions = Math.floor(Math.random() * 5) + 1; // 1-5 transactions per merchant

      const merchant = {
        id: merchantIndex,
        name: merchantName,
        mcc: mcc,
        acceptorId: acceptorId,
        numTransactions: numTransactions,
        transactions: [],
      };

      console.log(`\n📊 Merchant ${merchantIndex}: ${merchantName}`);
      console.log(`   MCC: ${mcc}, Acceptor ID: ${acceptorId}`);
      console.log(`   Generating ${numTransactions} transactions...`);

      // Generate transactions for this merchant
      for (let txIndex = 1; txIndex <= numTransactions; txIndex++) {
        const amount = Math.floor(Math.random() * 5000) + 500; // Random amount between $5 and $55

        try {
          const transaction = await simulateTransaction(
            cardPAN,
            amount,
            `${merchantName} Transaction ${txIndex}`,
            {
              mcc: mcc,
              merchant_acceptor_id: acceptorId,
            },
          );

          merchant.transactions.push({
            token: transaction.token,
            amount: amount,
            descriptor: `${merchantName} Transaction ${txIndex}`,
          });

          allTransactionTokens.push(transaction.token);

          console.log(
            `   ✅ Transaction ${txIndex}: ${transaction.token} - $${(amount / 100).toFixed(2)}`,
          );

          // Small delay between transactions to avoid rate limiting
          await new Promise((resolve) => setTimeout(resolve, 500));
        } catch (error) {
          console.error(
            `   ❌ Failed to create transaction ${txIndex} for ${merchantName}:`,
            error.message,
          );
        }
      }

      merchants.push(merchant);

      // Longer delay between merchants
      if (merchantIndex < 5) {
        console.log("   ⏳ Waiting before next merchant...");
        await new Promise((resolve) => setTimeout(resolve, 1000));
      }
    }

    console.log(
      `\n✅ Generated ${merchants.length} merchants with ${allTransactionTokens.length} total transactions`,
    );

    // Wait for transactions to be processed by Lithic
    console.log("\n⏳ Waiting for transactions to process...");
    await new Promise((resolve) => setTimeout(resolve, 5000));

    // Test 3: Save all transactions to Supabase
    console.log("\n3️⃣ Saving all transactions to Supabase...");
    let savedCount = 0;

    for (const token of allTransactionTokens) {
      try {
        const transactionFromApi = await lithic.transactions.retrieve(token);
        await saveTransactionToSupabase(transactionFromApi);
        savedCount++;
        console.log(`   ✅ Saved transaction: ${token}`);
      } catch (error) {
        console.error(
          `   ❌ Failed to save transaction ${token}:`,
          error.message,
        );
      }
    }

    console.log(
      `✅ Successfully saved ${savedCount}/${allTransactionTokens.length} transactions`,
    );

    // Test 4: Display merchant summary
    console.log("\n4️⃣ Merchant Summary:");
    merchants.forEach((merchant) => {
      const totalAmount = merchant.transactions.reduce(
        (sum, tx) => sum + tx.amount,
        0,
      );
      console.log(`\n📈 ${merchant.name}:`);
      console.log(
        `   MCC: ${merchant.mcc} | Acceptor ID: ${merchant.acceptorId}`,
      );
      console.log(`   Transactions: ${merchant.transactions.length}`);
      console.log(`   Total Amount: $${(totalAmount / 100).toFixed(2)}`);
      console.log(
        `   Avg Amount: $${(totalAmount / merchant.transactions.length / 100).toFixed(2)}`,
      );
    });

    // Test 5: Get updated statistics
    console.log("\n5️⃣ Getting updated transaction statistics...");
    try {
      const stats = await getTransactionStats();
      console.log("✅ Overall Statistics:");
      console.log(`   Total Transactions: ${stats.total_transactions}`);
      console.log(`   Approval Rate: ${stats.approval_rate}`);
      console.log(`   Average Transaction: ${stats.average_transaction}`);
    } catch (error) {
      console.log(
        "⚠️ Could not retrieve statistics (may need database views set up)",
      );
    }

    // Test 6: Sample a few transaction details from database
    console.log("\n6️⃣ Sampling transaction details from database...");
    const sampleTokens = allTransactionTokens.slice(0, 3); // Sample first 3 transactions

    for (const token of sampleTokens) {
      try {
        const details = await getTransactionDetailsFromDb(token);
        console.log(`\n🔍 Transaction ${token}:`);
        console.log(
          `   Amount: ${details.formatted_cardholder_amount || "N/A"}`,
        );
        console.log(`   Merchant: ${details.merchant_name || "N/A"}`);
        console.log(`   Status: ${details.result || "N/A"}`);
        console.log(`   Network: ${details.network_info?.type || "Unknown"}`);
      } catch (error) {
        console.log(
          `   ⚠️ Could not retrieve details for ${token} (may need database views)`,
        );
      }
    }

    console.log("\n🎉 Multi-merchant test completed successfully!");
    console.log(
      `📊 Final Summary: ${merchants.length} merchants, ${allTransactionTokens.length} transactions`,
    );
  } catch (error) {
    console.error("\n❌ Test failed:", error.message);
    if (error.error?.message)
      console.error("   API Error Details:", error.error.message);
    if (error.error?.debugging_request_id)
      console.error(
        "   Debugging Request ID:",
        error.error.debugging_request_id,
      );
    if (error.stack) console.error("   Stacktrace:", error.stack);
  }
}

test();
