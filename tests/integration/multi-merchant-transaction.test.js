import "dotenv/config";

// Import services
import * as card_service from "../../src/services/card-service.js";
import * as lithic_service from "../../src/services/lithic-service.js";
import * as supabase_service from "../../src/services/supabase-service.js";
import * as reporting_service from "../../src/services/reporting-service.js";
import logger from "../../src/utils/logger.js";

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

const commonMCCs = [
    "5966", "4829", "6051", "7321", "5968", "7399", "4816", "7995", "7996",
    "5912", "5499", "4722", "8111", "9311", "5967", "7273", "6211", "8398",
    "5122", "7299"
];

function getRandomMCC() {
  return commonMCCs[Math.floor(Math.random() * commonMCCs.length)];
}

// Generate random merchant names based on scam MCC
// Ensures the returned name is at most 19 characters.
function generateMerchantName(mcc) {
  const merchantNames = {
    "5966": ["Global Teleserv", "Win Big Promo", "Consumer Reward", "Nat Survey Grp"],
    "4829": ["Speedy Transfer", "Global Wire Svc", "SecurePay Xfer", "InstaCash Wire"],
    "6051": ["CryptoQuick Ex", "Digital CoinHub", "Secure WalletPy", "FastBit Xfer"],
    "7321": ["Fed Debt Recov", "Nat Credit Bur", "United Collect", "Credit Resolve"],
    "5968": ["Premium Content", "Exclusive Offer", "MonthlySurprise", "VIP Access Svc"],
    "7399": ["Global Solution", "Enterprise Innov", "Universal SvcCo", "StrategicConsult"],
    "4816": ["SecurePC Support", "GlobalTech Help", "Network Defender", "Net Security"],
    "7995": ["LuckySpinCasino", "Royal Slots", "JackpotCityGame", "VirtualBet"],
    "7996": ["MysticVisions", "PsychicPathways", "Cosmic Fortune", "DestinyUnveiled"],
    "5912": ["HealthDirect On", "PharmaXpress Glb", "MediSave Rx", "Wellness Rx Now"],
    "5499": ["Vitality Boost", "Natural Health", "PureForm Nutri", "MiracleWellness"],
    "4722": ["DreamVacationGl", "ParadiseTravel", "GlobalEscapePln", "BudgetHolidayEx"],
    "8111": ["Nat Legal Aid", "Tax Resolve Grp", "LegalShield Svc", "DisputeResolve"],
    "9311": ["Fed Tax PaySvc", "IRS Pay Process", "TaxDebtRelief", "Gov Tax Solution"],
    "5967": ["Cust SupportCtr", "Verify Dept", "AccountSvc Hot", "Prize Claim Ctr"],
    "7273": ["HeartsConnect", "TrueLove Match", "GlobalCompanion", "SoulmateSearch"],
    "6211": ["Global Invest", "Premier Stock", "FutureWealthAdv", "CapitalGrowth"],
    "8398": ["HopeGiversFound", "ChildReliefFund", "Global Aid Net", "CommunitySupprt"],
    "5122": ["GlobalPharmaDir", "ExpressMeds On", "Rx Savers Club", "WellnessPharma"],
    "7299": ["Lifestyle Perks", "EliteMember Svc", "PersonalAdvClub", "ConsumerBenefit"],
  };

  const namesForMcc = merchantNames[mcc] || [
    "Suspicious Svc",
    "Vague Solutions",
    "General Holdings",
    "Unverified Biz",
  ];

  const selectedName = namesForMcc[Math.floor(Math.random() * namesForMcc.length)];
  const maxLength = 19;

  if (selectedName.length > maxLength) {
    logger.warn({ selectedName, maxLength }, "generateMerchantName selected a name longer than target max, truncating.");
    return selectedName.substring(0, maxLength);
  }
  return selectedName;
}

async function runMultiMerchantTest() {
  console.log("🧪 Starting Multi-Merchant Transaction Integration Test\n");

  try {
    // List cards
    console.log("1️⃣ Listing available cards...");
    const cards = await card_service.listCards();

    if (!cards || cards.length === 0) {
      console.error(
        "❌ No cards found. Please create a card in Lithic sandbox first.",
      );
      logger.error("No cards found in listCards response for test.");
      return;
    }

    const testCard = cards[0];
    console.log(
      `✅ Found ${cards.length} cards. Using card token: ${testCard.token}, last four: ${testCard.last_four}`,
    );
    logger.info(
      { cardCount: cards.length, testCardToken: testCard.token },
      "Cards listed for test.",
    );

    // Get full card details to retrieve PAN
    console.log("\n1.5️⃣ Fetching full card details for PAN...");
    const fullCardDetails = await card_service.getCardDetails(testCard.token);
    if (!fullCardDetails || !fullCardDetails.pan) {
      console.error(
        "❌ Could not retrieve PAN for the card. Ensure card_service.getCardDetails returns the PAN.",
      );
      logger.error(
        { cardToken: testCard.token },
        "Failed to retrieve PAN for test card.",
      );
      return;
    }
    const cardPAN = fullCardDetails.pan;
    console.log(
      `✅ Retrieved PAN: ${cardPAN.slice(0, 4)}...${cardPAN.slice(-4)}`,
    );
    logger.info({ cardToken: testCard.token }, "PAN retrieved for test card.");

    // Generate 5 merchants with random number of transactions each
    console.log("\n2️⃣ Generating 5 merchants with random transactions...");

    const merchants = [];
    const allSimulatedTransactions = []; // Store simulated transaction responses

    for (let merchantIndex = 1; merchantIndex <= 3; merchantIndex++) {
      // Reduced to 3 for faster testing
      const mcc = getRandomMCC();
      const acceptorId = generateRandomAcceptorId();
      const merchantName = generateMerchantName(mcc);
      const numTransactions = Math.floor(Math.random() * 2) + 1; // 1-2 transactions per merchant

      const merchant = {
        id: merchantIndex,
        name: merchantName,
        mcc: mcc,
        acceptorId: acceptorId,
        numTransactions: numTransactions,
        transactions: [], // To store simulated transaction tokens and amounts
      };

      console.log(`\n📊 Merchant ${merchantIndex}: ${merchantName}`);
      console.log(`   MCC: ${mcc}, Acceptor ID: ${acceptorId}`);
      console.log(`   Generating ${numTransactions} transactions...`);
      logger.info(
        { merchantIndex, merchantName, mcc, acceptorId, numTransactions },
        "Generating transactions for merchant.",
      );

      for (let txIndex = 1; txIndex <= numTransactions; txIndex++) {
        const amount = Math.floor(Math.random() * 5000) + 500; // Random amount between $1 and $21
        const descriptor = `${merchantName} Tx ${txIndex}`;
        try {
          const simulatedTx = await lithic_service.simulateTransaction(
            cardPAN,
            amount,
            descriptor,
            {
              mcc: mcc,
              merchant_acceptor_id: acceptorId,
            },
          );

          merchant.transactions.push({
            token: simulatedTx.token,
            amount: amount,
            descriptor: descriptor,
          });
          allSimulatedTransactions.push(simulatedTx); // Save the full simulation response

          console.log(
            `   ✅ Transaction ${txIndex}: ${simulatedTx.token} - $${(amount / 100).toFixed(2)} - Result: ${simulatedTx.result}`,
          );
          logger.debug(
            {
              merchantName,
              txIndex,
              token: simulatedTx.token,
              amount,
              result: simulatedTx.result,
            },
            "Transaction simulated.",
          );
          await new Promise((resolve) => setTimeout(resolve, 500)); // Small delay
        } catch (error) {
          console.error(
            `   ❌ Failed to create transaction ${txIndex} for ${merchantName}:`,
            error.message,
          );
          logger.error(
            { err: error, merchantName, txIndex },
            "Failed to simulate transaction.",
          );
        }
      }
      merchants.push(merchant);
      if (merchantIndex < 3) {
        console.log("   ⏳ Waiting before next merchant...");
        await new Promise((resolve) => setTimeout(resolve, 1000));
      }
    }

    console.log(
      `\n✅ Generated ${merchants.length} merchants with ${allSimulatedTransactions.length} total transactions.`,
    );
    logger.info(
      {
        merchantCount: merchants.length,
        transactionCount: allSimulatedTransactions.length,
      },
      "Initial transaction simulation phase complete.",
    );

    console.log(
      "\n⏳ Waiting for transactions to be potentially processed by webhooks/polling (simulating delay)...",
    );
    await new Promise((resolve) => setTimeout(resolve, 5000)); // Wait for Lithic processing & potential webhook/polling

    // Save all transactions to Supabase (using the full transaction object from Lithic API)
    console.log(
      "\n3️⃣ Fetching full details and saving all simulated transactions to Supabase...",
    );
    let savedCount = 0;
    const allTransactionTokens = allSimulatedTransactions.map((tx) => tx.token);

    for (const token of allTransactionTokens) {
      try {
        // Fetch the full transaction object from Lithic API, as webhooks/polling would do
        const transactionFromApi = await lithic_service.getTransaction(token);
        if (transactionFromApi) {
          await supabase_service.saveTransaction(transactionFromApi);
          savedCount++;
          console.log(`   ✅ Saved transaction: ${token}`);
          logger.debug({ token }, "Transaction fetched and saved to Supabase.");
        } else {
          console.warn(
            `   ⚠️ Could not retrieve full details for transaction ${token} from Lithic API. Skipping save.`,
          );
          logger.warn(
            { token },
            "Could not retrieve full transaction details from Lithic API for saving.",
          );
        }
      } catch (error) {
        console.error(
          `   ❌ Failed to fetch or save transaction ${token}:`,
          error.message,
        );
        logger.error(
          { err: error, token },
          "Failed to fetch or save transaction to Supabase.",
        );
      }
    }
    console.log(
      `✅ Successfully saved ${savedCount}/${allTransactionTokens.length} transactions to Supabase.`,
    );
    logger.info(
      { savedCount, totalAttempted: allTransactionTokens.length },
      "Supabase save phase complete.",
    );

    // Display merchant summary
    console.log("\n4️⃣ Merchant Summary (based on simulated data):");
    merchants.forEach((merchant) => {
      const totalAmount = merchant.transactions.reduce(
        (sum, tx) => sum + tx.amount,
        0,
      );
      console.log(`\n📈 ${merchant.name}:`);
      console.log(
        `   MCC: ${merchant.mcc} | Acceptor ID: ${merchant.acceptorId}`,
      );
      console.log(`   Transactions Simulated: ${merchant.transactions.length}`);
      console.log(
        `   Total Amount Simulated: $${(totalAmount / 100).toFixed(2)}`,
      );
      if (merchant.transactions.length > 0) {
        console.log(
          `   Avg Amount Simulated: $${(totalAmount / merchant.transactions.length / 100).toFixed(2)}`,
        );
      }
    });

    // Get updated statistics from Supabase
    console.log("\n5️⃣ Getting updated transaction statistics from Supabase...");
    try {
      const stats = await reporting_service.getTransactionStats();
      console.log("✅ Overall Statistics from Supabase:");
      console.log(`   Total Transactions: ${stats.total_transactions}`);
      console.log(`   Approval Rate: ${stats.approval_rate}`);
      console.log(`   Average Transaction: ${stats.average_transaction}`);
      logger.info({ stats }, "Transaction statistics retrieved from Supabase.");
    } catch (error) {
      console.error(
        "⚠️ Could not retrieve statistics from Supabase:",
        error.message,
      );
      logger.error(
        { err: error },
        "Failed to retrieve transaction statistics.",
      );
    }

    // Sample a few transaction details from Supabase
    console.log("\n6️⃣ Sampling transaction details from Supabase...");
    const sampleTokensToVerify = allTransactionTokens.slice(
      0,
      Math.min(3, allTransactionTokens.length),
    );

    for (const token of sampleTokensToVerify) {
      try {
        const details = await supabase_service.getTransactionDetails(token);
        if (details) {
          console.log(`\n🔍 Transaction ${token} from Supabase:`);
          console.log(
            `   Amount: ${details.formatted_cardholder_amount || "N/A"}`,
          );
          console.log(`   Merchant: ${details.merchant_name || "N/A"}`);
          console.log(`   Status: ${details.result || "N/A"}`);
          console.log(`   Network: ${details.network_info?.type || "Unknown"}`);
          logger.debug(
            { token, details },
            "Transaction details sampled from Supabase.",
          );
        } else {
          console.warn(
            `   ⚠️ Could not retrieve details for ${token} from Supabase.`,
          );
          logger.warn(
            { token },
            "Could not retrieve details for sample token from Supabase.",
          );
        }
      } catch (error) {
        console.error(
          `   ❌ Error retrieving details for ${token} from Supabase:`,
          error.message,
        );
        logger.error(
          { err: error, token },
          "Error retrieving sample transaction details from Supabase.",
        );
      }
    }

    console.log("\n🎉 Multi-Merchant Transaction Integration Test completed!");
    logger.info("Multi-Merchant Transaction Integration Test finished.");
  } catch (error) {
    console.error("\n❌ Test run failed:", error.message);
    logger.fatal(
      { err: error },
      "Multi-Merchant Transaction Integration Test run failed critically.",
    );
    if (error.stack) {
      logger.error({ stack: error.stack }, "Error stacktrace.");
    }
  }
}

// Run the test
runMultiMerchantTest();
