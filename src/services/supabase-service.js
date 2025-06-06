import { supabase_client } from "../config/supabase-client.js";
import {
  parseTransactionDetails,
  parseMerchantInfo,
} from "../utils/parsers.js";
import { lookupMCC } from "./mcc-service.js";
import alertService from "./alert-service.js";
import logger from "../utils/logger.js";

/**
 * Helper function to determine if incoming merchant details differ from existing ones.
 * @param {Object} existingDetails - The current merchant details from the DB.
 * @param {Object} incomingDetails - The new merchant details from the transaction.
 * @returns {boolean} True if details are different, false otherwise.
 */
function areMerchantDetailsDifferent(existingDetails, incomingDetails) {
  if (!existingDetails) return true;

  return (
    existingDetails.descriptor !== incomingDetails.descriptor ||
    existingDetails.city !== (incomingDetails.city || null) ||
    existingDetails.state !== (incomingDetails.state || null) ||
    existingDetails.country !== (incomingDetails.country || null) ||
    existingDetails.mcc !== (incomingDetails.mcc || null)
  );
}

/**
 * Helper function to enrich merchant data with MCC information.
 * @param {Object} merchantInfo - Basic merchant information
 * @returns {Promise<Object>} Enriched merchant information with MCC details
 */
async function enrichMerchantWithMCC(merchantInfo) {
  const enrichedMerchant = { ...merchantInfo };
  
  if (merchantInfo.mcc) {
    try {
      const mccDetails = await lookupMCC(merchantInfo.mcc);
      if (mccDetails) {
        enrichedMerchant.mcc_description = mccDetails.description;
        enrichedMerchant.mcc_category = mccDetails.category;
        logger.debug(`MCC enrichment successful for ${merchantInfo.mcc}: ${mccDetails.description}`);
      } else {
        logger.warn(`MCC ${merchantInfo.mcc} not found in database`);
        enrichedMerchant.mcc_description = null;
        enrichedMerchant.mcc_category = null;
      }
    } catch (error) {
      logger.error(`Error looking up MCC ${merchantInfo.mcc}:`, error);
      enrichedMerchant.mcc_description = null;
      enrichedMerchant.mcc_category = null;
    }
  } else {
    enrichedMerchant.mcc_description = null;
    enrichedMerchant.mcc_category = null;
  }
  
  return enrichedMerchant;
}

/**
 * Save a Lithic transaction to Supabase, including merchant details.
 * Implements robust merchant finding and updating.
 * @param {Object} lithicTransaction - The raw Lithic transaction object.
 * @returns {Promise<Object>} Object indicating success and stored tokens/IDs.
 * @throws {Error} If saving to Supabase fails.
 */
export async function saveTransaction(lithicTransaction) {
  const transactionToken = lithicTransaction?.token || "unknown_token";
  try {
    logger.debug(
      { transactionToken },
      `Attempting to save transaction to Supabase.`,
    );

    const transactionDetailsToSave = parseTransactionDetails(lithicTransaction);
    const merchantInfoToParse = parseMerchantInfo(lithicTransaction);

    let merchantId = null;
    let existingMerchantFullDetails = null;

    // Merchant Handling Logic

    // Try to find merchant by acceptor_id if available
    if (merchantInfoToParse.acceptor_id) {
      logger.debug(
        { transactionToken, acceptorId: merchantInfoToParse.acceptor_id },
        "Attempting to find merchant by acceptor_id.",
      );
      const { data, error } = await supabase_client
        .from("merchants")
        .select("*") // Fetch all fields for comparison and potential update
        .eq("acceptor_id", merchantInfoToParse.acceptor_id)
        .maybeSingle(); // Handles 0 or 1 row without erroring on 0

      if (error) {
        logger.error(
          {
            err: error,
            transactionToken,
            acceptorId: merchantInfoToParse.acceptor_id,
          },
          "Error selecting merchant by acceptor_id.",
        );
        throw error;
      }
      if (data) {
        existingMerchantFullDetails = data;
        merchantId = existingMerchantFullDetails.id;
        logger.debug(
          { transactionToken, merchantId },
          "Merchant found by acceptor_id.",
        );
      }
    }

    // If not found by acceptor_id (or acceptor_id was null), AND descriptor is present, try by combination
    if (!merchantId && merchantInfoToParse.descriptor) {
      logger.debug(
        { transactionToken, details: merchantInfoToParse },
        "Acceptor_id match failed or N/A. Attempting to find merchant by combination (descriptor, city, state, mcc).",
      );

      let query = supabase_client.from("merchants").select("*");
      query = query.eq("descriptor", merchantInfoToParse.descriptor);

      // Handle potentially null city, state, country, mcc for precise matching
      if (merchantInfoToParse.city)
        query = query.eq("city", merchantInfoToParse.city);
      else query = query.is("city", null);

      if (merchantInfoToParse.state)
        query = query.eq("state", merchantInfoToParse.state);
      else query = query.is("state", null);

      if (merchantInfoToParse.country)
        query = query.eq("country", merchantInfoToParse.country);
      else query = query.is("country", null);

      if (merchantInfoToParse.mcc)
        query = query.eq("mcc", merchantInfoToParse.mcc);
      else query = query.is("mcc", null);

      const { data: matchedMerchants, error: comboSelectError } = await query;

      if (comboSelectError) {
        logger.error(
          {
            err: comboSelectError,
            transactionToken,
            details: merchantInfoToParse,
          },
          "Error selecting merchant by combination.",
        );
        throw comboSelectError;
      }

      if (matchedMerchants && matchedMerchants.length === 1) {
        existingMerchantFullDetails = matchedMerchants[0];
        merchantId = existingMerchantFullDetails.id;
        logger.debug(
          { transactionToken, merchantId },
          "Unique merchant found by combination.",
        );
      } else if (matchedMerchants && matchedMerchants.length > 1) {
        logger.warn(
          {
            transactionToken,
            count: matchedMerchants.length,
            details: merchantInfoToParse,
          },
          "Multiple merchants found by combination. Will proceed to create a new merchant if descriptor is present.",
        );
      } else {
        logger.debug(
          { transactionToken, details: merchantInfoToParse },
          "No merchant found by combination.",
        );
      }
    }

    // If an existing merchant was identified (by acceptor_id or combination), update if details changed
    if (merchantId && existingMerchantFullDetails) {
      if (
        areMerchantDetailsDifferent(
          existingMerchantFullDetails,
          merchantInfoToParse,
        )
      ) {
        logger.info(
          { transactionToken, merchantId },
          "Merchant details differ, attempting update.",
        );
        
        // Enrich with MCC details before updating
        const enrichedMerchantInfo = await enrichMerchantWithMCC(merchantInfoToParse);
        
        const detailsToUpdate = {
          descriptor: enrichedMerchantInfo.descriptor,
          city: enrichedMerchantInfo.city || null,
          state: enrichedMerchantInfo.state || null,
          country: enrichedMerchantInfo.country || null,
          mcc: enrichedMerchantInfo.mcc || null,
          mcc_description: enrichedMerchantInfo.mcc_description,
          mcc_category: enrichedMerchantInfo.mcc_category,
        };
        
        if (enrichedMerchantInfo.acceptor_id) {
          detailsToUpdate.acceptor_id = enrichedMerchantInfo.acceptor_id;
        }

        const { error: updateError } = await supabase_client
          .from("merchants")
          .update(detailsToUpdate)
          .eq("id", merchantId);

        if (updateError) {
          logger.error(
            { err: updateError, transactionToken, merchantId, detailsToUpdate },
            "Could not update existing merchant details.",
          );
        } else {
          logger.info(
            { transactionToken, merchantId },
            "Merchant details updated successfully.",
          );
        }
      } else {
        logger.debug(
          { transactionToken, merchantId },
          "Existing merchant details match. No update needed.",
        );
      }
    }
    // If no existing merchant was conclusively identified, and we have a descriptor, create a new one.
    else if (!merchantId && merchantInfoToParse.descriptor) {
      // This block is reached if:
      // - acceptor_id was null OR acceptor_id search yielded no results
      // - AND combo search (if descriptor was present) yielded no unique result
      logger.info(
        { transactionToken, merchantInfo: merchantInfoToParse },
        "Creating new merchant as no definitive existing match was found.",
      );
      
      // Enrich with MCC details before creating
      const enrichedMerchantInfo = await enrichMerchantWithMCC(merchantInfoToParse);
      
      const { data: newMerchant, error: insertError } = await supabase_client
        .from("merchants")
        .insert([enrichedMerchantInfo])
        .select("id")
        .single();

      if (insertError) {
        logger.error(
          {
            err: insertError,
            transactionToken,
            merchantInfo: merchantInfoToParse,
          },
          "Error inserting new merchant.",
        );
        throw insertError;
      }
      merchantId = newMerchant.id;
      logger.info(
        { transactionToken, newMerchantId: merchantId },
        "New merchant created successfully.",
      );
    }
    // If still no merchantId
    else if (!merchantId) {
      logger.warn(
        { transactionToken, merchantInfo: merchantInfoToParse },
        "Could not identify or create a merchant (e.g., missing descriptor for new, or ambiguous match without acceptor_id). Transaction will not be linked to a specific merchant record by this process.",
      );
    }

    logger.debug({ transactionToken }, "Upserting transaction details.");
    const { error: transactionError } = await supabase_client
      .from("transactions")
      .upsert([transactionDetailsToSave], {
        onConflict: "token",
      });

    if (transactionError) {
      logger.error(
        {
          err: transactionError,
          transactionToken,
          details: transactionDetailsToSave,
        },
        "Error upserting transaction.",
      );
      throw transactionError;
    }
    logger.debug(
      { transactionToken },
      "Transaction details upserted successfully.",
    );

    if (merchantId) {
      logger.debug(
        { transactionToken, merchantId },
        "Linking transaction to merchant.",
      );
      const { error: linkError } = await supabase_client
        .from("transaction_merchants")
        .upsert(
          {
            transaction_token: transactionToken,
            merchant_id: merchantId,
          },
          {
            onConflict: "transaction_token,merchant_id",
          },
        );

      if (linkError) {
        logger.warn(
          { err: linkError, transactionToken, merchantId },
          "Error linking transaction to merchant (link might already exist or other issue).",
        );
      } else {
        logger.debug(
          { transactionToken, merchantId },
          "Transaction linked to merchant successfully.",
        );
      }
    } else {
      logger.info(
        { transactionToken },
        "No merchantId available to link transaction.",
      );
    }

    logger.info(
      {
        transactionToken,
        merchantId,
        amount: transactionDetailsToSave.cardholder_amount,
        currency: transactionDetailsToSave.cardholder_currency,
        result: transactionDetailsToSave.result,
      },
      "Transaction processed and saved successfully to Supabase.",
    );

    // NEW: Trigger real-time alert after successful transaction save
    try {
      const alertData = {
        alertType: 'NEW_TRANSACTION',
        timestamp: new Date().toISOString(),
        transactionId: transactionDetailsToSave.token,
        cardToken: transactionDetailsToSave.card_token,
        immediate: {
          amount: `$${(transactionDetailsToSave.cardholder_amount / 100).toFixed(2)}`,
          merchant: merchantInfoToParse.descriptor || 'Unknown Merchant',
          location: [merchantInfoToParse.city, merchantInfoToParse.state, merchantInfoToParse.country]
            .filter(Boolean).join(', ') || 'Unknown Location',
          status: transactionDetailsToSave.result,
          network: transactionDetailsToSave.network_type,
          networkTransactionID: transactionDetailsToSave.network_transaction_id
        },
        verification: {
          mccCode: merchantInfoToParse.mcc || '',
          merchantType: 'Available from MCC lookup',
          merchantCategory: 'Available from MCC lookup',
          authorizationCode: transactionDetailsToSave.authorization_code || '',
          retrievalReference: transactionDetailsToSave.retrieval_reference_number || ''
        },
        intelligence: {
          isFirstTransaction: false, // Can be enhanced later
          newMerchant: merchantId ? false : true,
          amountRange: transactionDetailsToSave.cardholder_amount < 500 ? 'small' : 'normal',
          merchantHistory: merchantId ? 'Known merchant for this card' : 'New merchant for this card',
          geographicPattern: 'Transaction location analysis'
        }
      };

      await alertService.broadcastAlert(transactionDetailsToSave.card_token, alertData);
      
      logger.info({ 
        transactionToken,
        cardToken: transactionDetailsToSave.card_token 
      }, 'Transaction saved and alert broadcast successfully');

    } catch (alertError) {
      // Log alert failure but don't affect transaction save success
      logger.warn({ 
        err: alertError, 
        transactionToken,
        cardToken: transactionDetailsToSave.card_token 
      }, 'Alert broadcast failed after successful transaction save');
    }

    return {
      success: true,
      transaction_token: transactionToken,
      merchant_id: merchantId,
      details: transactionDetailsToSave,
    };
  } catch (error) {
    logger.error(
      {
        err: error,
        transactionToken: lithicTransaction?.token || "unknown_token",
      },
      `Critical error in saveTransaction function.`,
    );
    throw error;
  }
}

/**
 * Get transaction details from the database (likely a view).
 * @param {string} transactionToken - The token of the transaction to fetch.
 * @returns {Promise<Object|null>} Formatted transaction details or null if not found.
 * @throws {Error} If fetching from Supabase fails.
 */
export async function getTransactionDetails(transactionToken) {
  try {
    logger.debug({ transactionToken }, `Fetching transaction details from DB.`);
    const { data, error } = await supabase_client
      .from("transaction_details")
      .select("*")
      .eq("token", transactionToken)
      .single();

    if (error) {
      if (error.code === "PGRST116") {
        logger.warn(
          { transactionToken },
          `Transaction details not found in DB.`,
        );
        return null;
      }
      logger.error(
        { err: error, transactionToken },
        `Error fetching transaction details from DB.`,
      );
      throw error;
    }

    if (!data) {
      // Should be covered by PGRST116 + .single()
      logger.warn(
        { transactionToken },
        `Transaction details not found in DB (no data).`,
      );
      return null;
    }

    logger.debug(
      { transactionToken, data },
      `Transaction details fetched from DB.`,
    );
    return {
      ...data,
      formatted_cardholder_amount: `${data.cardholder_currency} ${data.cardholder_amount_usd?.toFixed(2)}`,
      formatted_merchant_amount: `${data.merchant_currency} ${data.merchant_amount_usd?.toFixed(2)}`,
      is_approved: data.result === "APPROVED",
      network_info: {
        type: data.network_type,
        transaction_id: data.network_transaction_id,
        retrieval_reference: data.retrieval_reference_number,
      },
    };
  } catch (error) {
    logger.error(
      { err: error, transactionToken },
      `Unhandled error fetching transaction details from DB.`,
    );
    throw error;
  }
}

/**
 * Get the timestamp of the latest transaction stored in the database.
 * @returns {Promise<Object|null>} Object with created_at or null if no transactions.
 */
export async function getLatestTransactionTimestamp() {
  try {
    logger.debug("Fetching latest transaction timestamp from DB.");
    const { data, error } = await supabase_client
      .from("transactions")
      .select("created_at")
      .order("created_at", { ascending: false })
      .limit(1)
      .single();

    if (error) {
      if (error.code === "PGRST116") {
        logger.info("No transactions found in DB to get latest timestamp.");
        return null;
      }
      logger.error(
        { err: error },
        "Error fetching latest transaction timestamp:",
      );
      throw error;
    }
    return data;
  } catch (error) {
    logger.error(
      { err: error },
      "Unhandled error fetching latest transaction timestamp:",
    );
    throw error;
  }
}

/**
 * Checks if a transaction with the given token already exists in the database.
 * @param {string} transactionToken - The token of the transaction to check.
 * @returns {Promise<boolean>} True if the transaction exists, false otherwise.
 */
export async function checkIfTransactionExists(transactionToken) {
  try {
    logger.debug({ transactionToken }, `Checking if transaction exists in DB.`);
    const { data, error } = await supabase_client
      .from("transactions")
      .select("token")
      .eq("token", transactionToken)
      .maybeSingle();

    if (error) {
      logger.error(
        { err: error, transactionToken },
        `Error checking if transaction exists:`,
      );
      throw error;
    }
    return !!data;
  } catch (error) {
    logger.error(
      { err: error, transactionToken },
      `Unhandled error checking transaction existence:`,
    );
    throw error;
  }
}

/**
 * Update existing merchants that are missing MCC descriptions and categories.
 * This is a utility function to backfill data for merchants created before MCC enrichment.
 * @returns {Promise<Object>} Results of the update operation
 */
export async function updateMerchantsWithMCCData() {
  try {
    logger.info("Starting MCC enrichment for existing merchants...");
    
    // Get merchants without MCC descriptions
    const { data: merchantsToUpdate, error: selectError } = await supabase_client
      .from("merchants")
      .select("id, mcc, descriptor")
      .is("mcc_description", null)
      .not("mcc", "is", null);

    if (selectError) {
      logger.error("Error fetching merchants for MCC update:", selectError);
      throw selectError;
    }

    if (!merchantsToUpdate || merchantsToUpdate.length === 0) {
      logger.info("No merchants need MCC enrichment");
      return { updated: 0, total: 0 };
    }

    logger.info(`Found ${merchantsToUpdate.length} merchants needing MCC enrichment`);
    
    let updatedCount = 0;
    let errorCount = 0;

    for (const merchant of merchantsToUpdate) {
      try {
        const mccDetails = await lookupMCC(merchant.mcc);
        
        if (mccDetails) {
          const { error: updateError } = await supabase_client
            .from("merchants")
            .update({
              mcc_description: mccDetails.description,
              mcc_category: mccDetails.category
            })
            .eq("id", merchant.id);

          if (updateError) {
            logger.error(`Error updating merchant ${merchant.id}:`, updateError);
            errorCount++;
          } else {
            updatedCount++;
            logger.debug(`Updated merchant ${merchant.descriptor} (${merchant.id}) with MCC ${merchant.mcc}`);
          }
        } else {
          logger.warn(`MCC ${merchant.mcc} not found for merchant ${merchant.descriptor}`);
        }
      } catch (error) {
        logger.error(`Error processing merchant ${merchant.id}:`, error);
        errorCount++;
      }
    }

    logger.info(`MCC enrichment complete: ${updatedCount} updated, ${errorCount} errors`);
    
    return {
      total: merchantsToUpdate.length,
      updated: updatedCount,
      errors: errorCount
    };

  } catch (error) {
    logger.error("Error in updateMerchantsWithMCCData:", error);
    throw error;
  }
}