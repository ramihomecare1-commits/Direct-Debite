const express = require('express');
const { PDFDocument, StandardFonts, rgb } = require('pdf-lib');
const fs = require('fs').promises;
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static('public'));

// Helper to format date to DD.MM.YYYY
function getFormattedDate(date = new Date()) {
    const d = new Date(date);
    const day = String(d.getDate()).padStart(2, '0');
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const year = d.getFullYear();
    return `${day}.${month}.${year}`;
}

// GET / - Serve the form
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// POST /fill - Generate filled PDF
app.post('/fill', async (req, res) => {
    console.log('Received fill request:', req.body);
    try {
        // Validate input
        const { name, iban, bankName, amount } = req.body;

        if (!name || !iban || !bankName || !amount) {
            return res.status(400).json({
                error: 'All fields are required: name, iban, bankName, amount'
            });
        }

        // Validate IBAN format (basic check)
        if (!/^[A-Z]{2}[0-9]{2}[A-Z0-9]+$/.test(iban.replace(/\s/g, ''))) {
            return res.status(400).json({
                error: 'Invalid IBAN format'
            });
        }

        // Validate amount
        const numAmount = parseFloat(amount);
        if (isNaN(numAmount) || numAmount <= 0) {
            return res.status(400).json({
                error: 'Amount must be a positive number'
            });
        }

        // Load the PDF template
        const templatePath = path.join(__dirname, 'DDA_FORM.pdf');

        // Check if template exists
        try {
            await fs.access(templatePath);
        } catch (error) {
            console.error('Template not found:', templatePath);
            return res.status(500).json({
                error: 'PDF template not found. Please contact administrator.'
            });
        }

        const existingPdfBytes = await fs.readFile(templatePath);
        const pdfDoc = await PDFDocument.load(existingPdfBytes);

        // Get current date
        const currentDate = getFormattedDate();

        // Check if PDF has form fields
        const form = pdfDoc.getForm();
        const fields = form.getFields();

        if (fields.length > 0) {
            // PDF has fillable form fields - use form filling
            try {
                const nameField = form.getTextField('accountHolderName') || form.getTextField('name') || form.getTextField('fullName');
                const ibanField = form.getTextField('iban') || form.getTextField('accountNumber');
                const bankField = form.getTextField('bankName') || form.getTextField('bank');
                const amountField = form.getTextField('amount') || form.getTextField('fixedAmount');

                if (nameField) nameField.setText(name);
                if (ibanField) ibanField.setText(iban);
                if (bankField) bankField.setText(bankName);
                if (amountField) amountField.setText(amount.toString());

                try {
                    const dateField = form.getTextField('date') || form.getTextField('signatureDate');
                    if (dateField) dateField.setText(currentDate);
                } catch (e) {
                    // Date field might not exist
                }
            } catch (error) {
                console.error('Error filling form fields:', error);
                return res.status(500).json({
                    error: 'Error mapping form fields. PDF template may need field name verification.'
                });
            }
        } else {
            // PDF has no form fields - draw text directly on the page
            // This is a static PDF, so we'll overlay text at specific coordinates
            try {
                // Get the first page
                const pages = pdfDoc.getPages();
                const firstPage = pages[0];
                const { height } = firstPage.getSize();

                // Embed a standard font
                const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
                const fontSize = 9; // Smaller font to fit in boxes
                const charSpacing = 13.5; // Space between each character box

                // Helper function to draw text character by character
                const drawCharByChar = (text, startX, startY, spacing = charSpacing) => {
                    if (!text) return;
                    const chars = text.toString().split('');
                    chars.forEach((char, index) => {
                        // Skip separators if they are already on the PDF
                        if (char === '/' || char === '.') return;

                        firstPage.drawText(char, {
                            x: startX + (index * spacing),
                            y: startY,
                            size: fontSize,
                            font: font,
                            color: rgb(0, 0, 0),
                        });
                    });
                };

                // Helper function to draw checkbox (X mark)
                const drawCheckbox = (x, y, size = 10) => {
                    firstPage.drawText('X', {
                        x: x,
                        y: y,
                        size: size,
                        font: font,
                        color: rgb(0, 0, 0),
                    });
                };

                // Calculate Y positions from top
                const fromTop = (yFromTop) => height - yFromTop;

                // User-calibrated coordinates
                const coords = {
                    bankName: { x: 216, y: 262 },
                    name: { x: 193, y: 282 },
                    type: { x: 248, y: 302 },
                    iban: { x: 141, y: 330, spacing: 13.95 },
                    mobile: { x: 150, y: 354, spacing: 32.11 },
                    issued: { x: 193, y: 393, spacing: 44 },
                    commence: { x: 204, y: 415, spacing: 18 },
                    expire: { x: 202, y: 436, spacing: 22 },
                    freq: { x: 206, y: 490 },
                    amt1: { x: 234, y: 526, spacing: 18.33 },
                    amt2: { x: 233, y: 552, spacing: 18 }
                };

                // Row 1: Bank Name
                firstPage.drawText(bankName, {
                    x: coords.bankName.x,
                    y: fromTop(coords.bankName.y),
                    size: 11,
                    font: font,
                    color: rgb(0, 0, 0),
                });

                // Row 2: Title of Account (Name)
                firstPage.drawText(name, {
                    x: coords.name.x,
                    y: fromTop(coords.name.y),
                    size: 11,
                    font: font,
                    color: rgb(0, 0, 0),
                });

                // Row 3: Account Type (Tick)
                drawCheckbox(coords.type.x, fromTop(coords.type.y), 10);

                // Row 4: IBAN
                const ibanClean = iban.replace(/\s/g, '');
                drawCharByChar(ibanClean, coords.iban.x, fromTop(coords.iban.y), coords.iban.spacing);

                // Row 5: Mobile Number
                const mobile = req.body.mobile || '';
                drawCharByChar(mobile, coords.mobile.x, fromTop(coords.mobile.y), coords.mobile.spacing);

                // Row 7: Issued for - DD MM YYYY
                const issuedDate = req.body.commenceDate || currentDate;
                const issuedParts = issuedDate.split(/[./]/);
                if (issuedParts.length === 3) {
                    // Using relative spacing from the start X provided
                    // Note: User only calibrated the DD part, so we use relative offsets for MM and YYYY
                    // but apply the user's custom spacing for characters
                    drawCharByChar(issuedParts[0], coords.issued.x, fromTop(coords.issued.y), coords.issued.spacing);
                    drawCharByChar(issuedParts[1], coords.issued.x + 60, fromTop(coords.issued.y), coords.issued.spacing);
                    drawCharByChar(issuedParts[2], coords.issued.x + 125, fromTop(coords.issued.y), coords.issued.spacing);
                }

                // Row 8: Commences On - DD / MM / YYYY
                const commenceDate = req.body.commenceDate || currentDate;
                const commenceParts = commenceDate.split(/[./]/);
                if (commenceParts.length === 3) {
                    drawCharByChar(commenceParts[0], coords.commence.x, fromTop(coords.commence.y), coords.commence.spacing);
                    drawCharByChar(commenceParts[1], coords.commence.x + 60, fromTop(coords.commence.y), coords.commence.spacing);
                    drawCharByChar(commenceParts[2], coords.commence.x + 125, fromTop(coords.commence.y), coords.commence.spacing);
                }

                // Row 9: Expires On - DD / MM / YYYY
                const expireDate = req.body.expireDate || currentDate;
                const expireParts = expireDate.split(/[./]/);
                if (expireParts.length === 3) {
                    drawCharByChar(expireParts[0], coords.expire.x, fromTop(coords.expire.y), coords.expire.spacing);
                    drawCharByChar(expireParts[1], coords.expire.x + 60, fromTop(coords.expire.y), coords.expire.spacing);
                    drawCharByChar(expireParts[2], coords.expire.x + 125, fromTop(coords.expire.y), coords.expire.spacing);
                }

                // Row 11: Payment Frequency - tick Monthly checkbox
                drawCheckbox(coords.freq.x, fromTop(coords.freq.y), 10);

                // Row 12: Fixed Amount 1
                const amountStr = amount.toString();
                drawCharByChar(amountStr, coords.amt1.x, fromTop(coords.amt1.y), coords.amt1.spacing);

                // Row 13: Fixed Amount 2
                drawCharByChar(amountStr, coords.amt2.x, fromTop(coords.amt2.y), coords.amt2.spacing);


            } catch (error) {
                console.error('Error drawing text on PDF:', error);
                return res.status(500).json({
                    error: 'Error adding text to PDF. Please contact administrator.'
                });
            }
        }

        // Save the filled PDF
        const pdfBytes = await pdfDoc.save();

        // Send the PDF as a download
        res.setHeader('Content-Type', 'application/pdf');
        res.setHeader('Content-Disposition', `attachment; filename="DDA_${name.replace(/\s/g, '_')}_${Date.now()}.pdf"`);
        res.send(Buffer.from(pdfBytes));

    } catch (error) {
        console.error('Error generating PDF:', error);
        res.status(500).json({
            error: 'Failed to generate PDF. Please try again.'
        });
    }
});

// Health check endpoint
app.get('/health', (req, res) => {
    res.json({ status: 'OK', timestamp: new Date().toISOString() });
});

// Start server
app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
    console.log(`Visit http://localhost:${PORT} to use the service`);
});
