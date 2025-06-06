import express from "express";
import { handleLithicEvent } from "../controllers/lithic-webhook-controller.js";
import * as lithicService from '../../services/lithic-service.js';
import * as cardService from '../../services/card-service.js';
import logger from '../../utils/logger.js';

const router = express.Router();

router.post("/lithic", handleLithicEvent);

// New endpoint for real transaction simulation
router.post('/simulate', async (req, res) => {
  const requestId = req.headers['x-request-id'] || 'unknown';
  
  try {
    const { cardToken, amount, descriptor, mcc, merchant_acceptor_id, city, state, country } = req.body;
    
    // Validate required fields
    if (!cardToken || !amount || !descriptor) {
      return res.status(400).json({
        success: false,
        error: 'Missing required fields: cardToken, amount, descriptor'
      });
    }
    
    // Get card details to retrieve PAN
    logger.info({ requestId, cardToken }, 'Retrieving card details for simulation');
    const cardDetails = await cardService.getCardDetails(cardToken);
    
    if (!cardDetails || !cardDetails.pan) {
      return res.status(404).json({
        success: false,
        error: 'Card not found or PAN not available'
      });
    }
    
    // Simulate the transaction using real Lithic API
    const simulationOptions = {};
    if (mcc) simulationOptions.mcc = mcc;
    if (merchant_acceptor_id) simulationOptions.merchant_acceptor_id = merchant_acceptor_id;
    
    logger.info({ 
      requestId, 
      cardToken,
      amount,
      descriptor,
      mcc: simulationOptions.mcc 
    }, 'Simulating transaction with Lithic API');
    
    const simulation = await lithicService.simulateTransaction(
      cardDetails.pan,
      amount,
      descriptor,
      simulationOptions
    );
    
    logger.info({ 
      requestId,
      simulationToken: simulation.token,
      status: simulation.status,
      result: simulation.result 
    }, 'Transaction simulation completed');
    
    res.json({
      success: true,
      simulation: {
        token: simulation.token,
        status: simulation.status,
        result: simulation.result,
        cardToken: cardToken,
        amount: amount,
        descriptor: descriptor,
        mcc: simulationOptions.mcc,
        message: 'Real transaction simulated successfully using Lithic API'
      }
    });
    
  } catch (error) {
    logger.error({ 
      requestId,
      error: error.message,
      stack: error.stack 
    }, 'Transaction simulation failed');
    
    res.status(500).json({
      success: false,
      error: error.message || 'Transaction simulation failed'
    });
  }
});

export default router;
