import 'dotenv/config';
import {
  lithic,
  getNewestTransaction,
  saveTransactionToSupabase,
  getTransactionDetails as getTransactionDetailsFromDb,
  getTransactionStats,
  simulateTransaction,
  listCards,
  getCardDetails
} from './index.js';

// Helper function to generate a random merchant acceptor ID
function generateRandomAcceptorId(length = 12) {
  const characters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  let result = '';
  for (let i = 0; i < length; i++) {
    result += characters.charAt(Math.floor(Math.random() * characters.length));
  }
  return result;
}

// A list of common MCCs to pick from randomly
const commonMCCs = [
  '5411', // Grocery Stores, Supermarkets
  '5812', // Restaurants
  '5814', // Fast Food Restaurants
  '5541', // Service Stations
  '5311', // Department Stores
  '7832', // Motion Picture Theaters
  '4121', // Taxicabs and Limousines
  '5942', // Book Stores
  '5499', // Misc Food Stores
  '5912', // Drug Stores
];

function getRandomMCC() {
  return commonMCCs[Math.floor(Math.random() * commonMCCs.length)];
}


async function test() {
  try {
    console.log('🧪 Testing Enhanced Lithic Client Integration\n');

    // Test 1: List cards
    console.log('1️⃣ Listing available cards...');
    const cards = await listCards();

    if (cards.length === 0) {
      console.log('❌ No cards found. Please create a card in Lithic sandbox first.');
      return;
    }

    const testCard = cards[0]; // This contains the card token
    console.log(`✅ Found ${cards.length} cards. Using card token: ${testCard.token}, last four: ${testCard.last_four}`);

    // Test 1.5: Get full card details to retrieve PAN
    console.log('\n1.5️⃣ Fetching full card details for PAN...');
    const fullCardDetails = await getCardDetails(testCard.token);
    if (!fullCardDetails || !fullCardDetails.pan) {
        console.log('❌ Could not retrieve PAN for the card. Ensure getCardDetails from cards.js returns the PAN and is exported correctly.');
        return;
    }
    const cardPAN = fullCardDetails.pan;
    console.log(`✅ Retrieved PAN: ${cardPAN.slice(0,4)}...${cardPAN.slice(-4)}`);


    // Test 2: Simulate a standard test transaction
    console.log('\n2️⃣ Simulating a standard test transaction using PAN...');
    const simulatedStandard = await simulateTransaction(
      cardPAN,
      1234, 
      'Testing Merchant'
    );
    console.log(`✅ Created standard test transaction: ${simulatedStandard.token}`);
    await new Promise(resolve => setTimeout(resolve, 1000)); // Short wait


    // New Test 2.5: Simulate transaction with specific acceptor_id and random MCC
    console.log('\n2.5️⃣ Simulating transaction with specific acceptor_id and random MCC...');
    const randomMCC = getRandomMCC();
    const specificAcceptorId = generateRandomAcceptorId();
    const customSimulatedAmount = Math.floor(Math.random() * 5000) + 500; // Random amount between $5 and $55

    const simulatedCustom = await simulateTransaction(
      cardPAN,
      customSimulatedAmount, // e.g., $25.00
      `Custom MCC Merchant ${randomMCC}`,
      { // Options object
        mcc: randomMCC,
        merchant_acceptor_id: specificAcceptorId 
      }
    );
    console.log(`✅ Created custom MCC transaction: ${simulatedCustom.token} (MCC: ${randomMCC}, Acceptor ID: ${specificAcceptorId}, Amount: $${(customSimulatedAmount/100).toFixed(2)})`);

    // Wait a moment for the transaction to be processed by Lithic/Supabase
    console.log('⏳ Waiting for transactions to process...');
    await new Promise(resolve => setTimeout(resolve, 3000)); 

    // Test 3: Fetch the LATEST simulated transaction from Lithic API (the custom one)
    console.log('\n3️⃣ Fetching latest simulated transaction details from Lithic API...');
    const transactionFromApi = await lithic.transactions.retrieve(simulatedCustom.token); // Fetching the custom one
    console.log(`✅ Retrieved transaction from API: ${transactionFromApi.token}, Status: ${transactionFromApi.status}, Result: ${transactionFromApi.events?.[0]?.result}`);

    // Test 4: Save to Supabase (using the object fetched from Lithic API)
    console.log('\n4️⃣ Saving latest simulated transaction to Supabase...');
    await saveTransactionToSupabase(transactionFromApi);
    console.log('✅ Saved successfully');

    // Test 5: Retrieve enhanced details from DB for the LATEST simulated transaction
    console.log('\n5️⃣ Retrieving latest simulated transaction from database...');
    const detailsFromDb = await getTransactionDetailsFromDb(simulatedCustom.token);
    console.log('✅ Transaction Details from DB:');
    console.log(`   Token: ${detailsFromDb.token}`);
    console.log(`   Amount: ${detailsFromDb.formatted_cardholder_amount}`);
    console.log(`   Merchant: ${detailsFromDb.merchant_name || 'N/A'}`); 
    console.log(`   Status: ${detailsFromDb.result}`);
    console.log(`   Network: ${detailsFromDb.network_info?.type || 'Unknown'}`);
    console.log(`   Auth Code: ${detailsFromDb.authorization_code || 'N/A'}`);

    // Test 6: Get statistics
    console.log('\n6️⃣ Getting transaction statistics...');
    const stats = await getTransactionStats();
    console.log('✅ Statistics:');
    console.log(`   Total Transactions: ${stats.total_transactions}`);
    console.log(`   Approval Rate: ${stats.approval_rate}`);
    console.log(`   Average Transaction: ${stats.average_transaction}`);

    // Test 7: Test pagination from Lithic API
    console.log('\n7️⃣ Testing transaction list pagination (from Lithic API)...');
    let transactionCountApi = 0;
    const transactionListFromApi = await lithic.transactions.list({ page_size: 5 }); 

    for await (const t of transactionListFromApi) {
      transactionCountApi++;
      if (transactionCountApi <= 3) { 
        console.log(`   - Token: ${t.token.substring(0, 8)}... | Merchant: ${t.merchant?.descriptor || 'Unknown'} | Amount: $${(t.amount / 100).toFixed(2)} | Status: ${t.status} | Result: ${t.events?.[0]?.result}`);
      }
    }
    console.log(`   Fetched ${transactionCountApi} transactions in this page from API.`);

    // Test 8: Get newest transaction from Lithic API
    console.log('\n8️⃣ Getting newest transaction from Lithic API...');
    const newestTransaction = await getNewestTransaction();
    if (newestTransaction) {
      console.log('✅ Newest Transaction Details (likely the custom simulated one):');
      console.log(`   Token: ${newestTransaction.token}`);
      console.log(`   Amount: $${(newestTransaction.amount / 100).toFixed(2)}`);
      console.log(`   Merchant: ${newestTransaction.merchant?.descriptor || 'Unknown'}`);
      console.log(`   Status: ${newestTransaction.status}`);
      console.log(`   Result: ${newestTransaction.events?.[0]?.result || 'N/A'}`);
      console.log(`   Created At: ${newestTransaction.created}`);
    } else {
      console.log('⚠️ No transactions found or an error occurred while fetching the newest transaction.');
    }

    console.log('\n✅ All tests passed!');

  } catch (error) {
    console.error('\n❌ Test failed:', error.message); // Log error message
    if (error.error?.message) console.error('   API Error Details:', error.error.message);
    if (error.error?.debugging_request_id) console.error('   Debugging Request ID:', error.error.debugging_request_id);
    if (error.stack) console.error('   Stacktrace:', error.stack);
  }
}

test();