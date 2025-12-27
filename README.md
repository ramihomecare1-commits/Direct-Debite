# DDA Form Auto-Fill Service

A web service that automatically fills Direct Debit Authorization (DDA) PDF forms. Users enter their details through a web form, and the system generates a ready-to-download filled PDF.

🔗 **Live Demo**: [Coming Soon - Deploy to Render]

## Features

- ✅ Simple web form interface
- ✅ Auto-fills DDA PDF template
- ✅ Mobile-friendly responsive design
- ✅ No data storage (stateless)
- ✅ Fast PDF generation (< 3 seconds)
- ✅ Input validation
- ✅ HTTPS secure (on Render)

## Tech Stack

- **Backend**: Node.js + Express
- **PDF Processing**: pdf-lib
- **Frontend**: HTML + Vanilla JavaScript
- **Hosting**: Render

## Local Setup

### Prerequisites

- Node.js 18+ installed
- DDA_FORM.pdf template file

### Installation

1. **Clone the repository**
   ```bash
   git clone https://github.com/ramihomecare1-commits/Direct-Debite.git
   cd Direct-Debite
   ```

2. **Install dependencies**
   ```bash
   npm install
   ```

3. **Add your PDF template**
   - Place your `DDA_FORM.pdf` file in the root directory
   - Ensure it's a fillable PDF form

4. **Start the server**
   ```bash
   npm start
   ```

5. **Open in browser**
   ```
   http://localhost:3000
   ```

## Development

Run with auto-reload:
```bash
npm run dev
```

## API Endpoints

### `GET /`
Serves the web form interface.

### `POST /fill`
Generates a filled PDF.

**Request Body** (JSON):
```json
{
  "name": "John Doe",
  "iban": "AE070331234567890123456",
  "bankName": "Emirates NBD",
  "amount": "1000"
}
```

**Response**: PDF file download

**Error Responses**:
- `400`: Missing or invalid fields
- `500`: PDF template not found or processing error

### `GET /health`
Health check endpoint.

**Response**:
```json
{
  "status": "OK",
  "timestamp": "2025-12-27T11:39:21.000Z"
}
```

## Deployment to Render

### Step 1: Push to GitHub
```bash
git add .
git commit -m "Initial commit"
git push origin main
```

### Step 2: Create Render Web Service

1. Go to [Render Dashboard](https://dashboard.render.com/)
2. Click **"New +"** → **"Web Service"**
3. Connect your GitHub repository
4. Configure:
   - **Name**: `direct-debite`
   - **Environment**: `Node`
   - **Build Command**: `npm install`
   - **Start Command**: `node server.js`
   - **Instance Type**: Free tier

### Step 3: Deploy
- Click **"Create Web Service"**
- Wait for deployment to complete
- Your service will be live at: `https://direct-debite.onrender.com`

## PDF Field Mapping

The server attempts to map form fields using common DDA field names:

| Form Input | PDF Field Names (attempts in order) |
|------------|-------------------------------------|
| Name | `accountHolderName`, `name`, `fullName` |
| IBAN | `iban`, `accountNumber` |
| Bank Name | `bankName`, `bank` |
| Amount | `amount`, `fixedAmount` |
| Date (auto) | `date`, `signatureDate` |

### Verifying PDF Field Names

If the auto-fill doesn't work, you may need to verify the actual field names in your PDF:

1. Open `DDA_FORM.pdf` in Adobe Acrobat
2. Go to **Tools** → **Prepare Form**
3. Note the exact field names
4. Update the field mapping in `server.js` (lines 50-60)

## Troubleshooting

### PDF not generating
- Ensure `DDA_FORM.pdf` exists in the root directory
- Check that the PDF has fillable form fields
- Verify field names match (see PDF Field Mapping above)

### Fields not filling correctly
- Open the generated PDF and check which fields are empty
- Update the field name mapping in `server.js`
- Restart the server

### Deployment issues on Render
- Check build logs for errors
- Ensure `package.json` has correct start script
- Verify Node version is 18+

## Security

- No data is stored in a database
- All requests are stateless
- HTTPS enforced on Render
- Input validation on all fields
- IBAN format validation

## License

MIT

## Support

For issues or questions, please open an issue on GitHub.
