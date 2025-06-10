import express from "express";
import { v4 as uuidv4 } from 'uuid';
import logger from '../../utils/logger.js';
import * as mccService from '../../services/mcc-service.js';
import { config } from "../../config/index.js";

const router = express.Router();

/**
 * Get system information
 */
router.get('/info', async (req, res) => {
  const requestId = req.requestId || uuidv4();
  
  try {
    logger.debug({ requestId }, 'System info endpoint accessed');
    
    const mccStats = await mccService.getMccStatistics();
    
    res.json({
      success: true,
      system: {
        name: 'Honeypot Transaction Monitoring System',
        version: '1.0.0',
        status: 'Production Ready',
        uptime: process.uptime(),
        environment: config.NODE_ENV,
        features: {
          realTimeAlerts: true,
          mcpIntegration: true,
          cardAccess: true,
          transactionIntelligence: true,
          frontendInterface: true
        },
        mccData: mccStats
      }
    });
    
  } catch (error) {
    logger.error({ requestId, error: error.message }, 'Error getting system info');
    res.status(500).json({
      success: false,
      error: 'Failed to retrieve system information'
    });
  }
});

/**
 * Get all MCC codes
 */
router.get('/mcc-codes', async (req, res) => {
  const requestId = req.requestId || uuidv4();
  
  try {
    logger.debug({ requestId }, 'MCC codes endpoint accessed');
    
    const { category, suspicious } = req.query;
    
    let mccCodes;
    if (suspicious === 'true') {
      mccCodes = await mccService.getSuspiciousMccCodes();
    } else if (category) {
      mccCodes = await mccService.getMccCodesByCategory(category);
    } else {
      mccCodes = await mccService.getAllMccCodes();
    }
    
    res.json({
      success: true,
      totalCodes: mccCodes.length,
      mccCodes: mccCodes,
      filters: {
        category: category || null,
        suspicious: suspicious === 'true'
      }
    });
    
  } catch (error) {
    logger.error({ requestId, error: error.message }, 'Error getting MCC codes');
    res.status(500).json({
      success: false,
      error: 'Failed to retrieve MCC codes'
    });
  }
});

/**
 * Get MCC statistics
 */
router.get('/mcc-stats', async (req, res) => {
  const requestId = req.requestId || uuidv4();
  
  try {
    logger.debug({ requestId }, 'MCC statistics endpoint accessed');
    
    const stats = await mccService.getMccStatistics();
    const suspiciousCodes = await mccService.getSuspiciousMccCodes();
    
    res.json({
      success: true,
      statistics: {
        ...stats,
        suspiciousCodeCount: suspiciousCodes.length,
        riskDistribution: suspiciousCodes.reduce((acc, code) => {
          acc[code.riskLevel] = (acc[code.riskLevel] || 0) + 1;
          return acc;
        }, {})
      }
    });
    
  } catch (error) {
    logger.error({ requestId, error: error.message }, 'Error getting MCC statistics');
    res.status(500).json({
      success: false,
      error: 'Failed to retrieve MCC statistics'
    });
  }
});

/**
 * Lookup specific MCC code
 */
router.get('/mcc/:code', async (req, res) => {
  const requestId = req.requestId || uuidv4();
  const { code } = req.params;
  
  try {
    logger.debug({ requestId, mccCode: code }, 'MCC lookup endpoint accessed');
    
    const mccInfo = await mccService.lookupMCC(code);
    
    if (!mccInfo) {
      return res.status(404).json({
        success: false,
        error: `MCC code ${code} not found`
      });
    }
    
    // Check if it's a suspicious code
    const suspiciousCodes = await mccService.getSuspiciousMccCodes();
    const suspiciousInfo = suspiciousCodes.find(s => s.mcc_code === code.padStart(4, '0'));
    
    res.json({
      success: true,
      mccCode: code.padStart(4, '0'),
      ...mccInfo,
      suspicious: !!suspiciousInfo,
      ...(suspiciousInfo && {
        riskLevel: suspiciousInfo.riskLevel,
        riskReason: suspiciousInfo.reason
      })
    });
    
  } catch (error) {
    logger.error({ requestId, mccCode: code, error: error.message }, 'Error looking up MCC code');
    res.status(500).json({
      success: false,
      error: 'Failed to lookup MCC code'
    });
  }
});

export default router; 