# Reference Data

This directory contains reference data files used by the Honeypot Transaction Monitoring System.

## MCC Codes (`mcc_codes_rows.csv`)

Comprehensive database of Merchant Category Codes (MCC) used in payment processing.

### Structure

- **mcc_code**: 4-digit MCC identifier
- **description**: Full description of the merchant category
- **category**: High-level category grouping

### Statistics

- **Total Codes**: 915 MCC codes
- **Categories**: 12 major categories including Airlines, Car Rental, Lodging, Transportation Services, etc.
- **Coverage**: Complete industry coverage from agricultural services to government services

### Major Categories

1. **Agricultural Services** (0742-0780) - Veterinary, co-operatives, landscaping
2. **Contracted Services** (1520-2842) - Construction, electrical, plumbing, publishing
3. **Airlines** (3000-3299) - All major airlines worldwide
4. **Car Rental** (3351-3441) - Rental agencies and services
5. **Lodging** (3501-3831) - Hotels, motels, resorts, casinos
6. **Transportation Services** (4011-4789) - Rail, bus, freight, taxi, cruise, travel agencies
7. **Utility Services** (4812-4900) - Telecom, cable, utilities, money transfer
8. **Retail Outlet Services** (5013-5599) - All retail from hardware to automotive
9. **Clothing Stores** (5611-5699) - Apparel and accessories
10. **Miscellaneous Stores** (5712-6760) - Everything else including restaurants, pharmacies, direct marketing
11. **Business Services** (7311-7999) - Professional services, entertainment, gambling
12. **Professional Services and Membership Organizations** (8011-8999) - Healthcare, legal, education
13. **Government Services** (9034-9950) - Courts, taxes, postal, government purchases

### Suspicious Categories

The following MCC categories are commonly associated with fraudulent transactions:

- **5960-5969**: Direct Marketing (telemarketing, mail order, subscription scams)
- **4829**: Money Transfer services
- **6010-6012**: Financial institution cash services
- **6051**: Quasi-cash merchants (money orders, foreign currency)
- **7273**: Dating services
- **7276-7278**: Counseling and personal services
- **7321**: Credit reporting agencies
- **7800-7802**: Government-licensed gambling
- **7995-7996**: Gambling and fortune telling
- **8111**: Legal services
- **9211, 9222-9223, 9311, 9399**: Government fees and services

### Usage in System

This reference data is used for:

1. **Transaction Classification** - Categorizing incoming transactions
2. **Risk Scoring** - Identifying suspicious MCC patterns
3. **Alert Generation** - Triggering alerts for high-risk categories
4. **Reporting** - Grouping transactions by merchant type
5. **Simulation** - Generating realistic test transactions

### Data Source

Based on standard MCC codes used by major payment processors including Visa, Mastercard, and American Express. Regularly updated to reflect current industry standards.

### Integration

While the transaction simulator currently uses hardcoded suspicious MCC lists, this comprehensive database could be integrated for:

- Dynamic risk scoring based on MCC categories
- Enhanced merchant validation
- Improved transaction pattern analysis
- More sophisticated fraud detection algorithms

To use this data programmatically:

```javascript
import fs from 'fs';
import csv from 'csv-parser';

const mccCodes = [];
fs.createReadStream('data/mcc_codes_rows.csv')
  .pipe(csv())
  .on('data', (row) => mccCodes.push(row))
  .on('end', () => {
    console.log(`Loaded ${mccCodes.length} MCC codes`);
  });
``` 