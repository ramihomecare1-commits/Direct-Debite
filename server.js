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

                // Row 1: Bank Name
                firstPage.drawText(bankName, {
                    x: 235,
                    y: fromTop(170),
                    size: 11,
                    font: font,
                    color: rgb(0, 0, 0),
                });

                // Row 2: Title of Account (Name)
                firstPage.drawText(name, {
                    x: 235,
                    y: fromTop(210),
                    size: 11,
                    font: font,
                    color: rgb(0, 0, 0),
                });

                // Row 3: Account Type (Tick Current/Savings)
                drawCheckbox(405, fromTop(250), 10);

                // Row 4: IBAN - each character in separate box
                const ibanClean = iban.replace(/\s/g, '');
                drawCharByChar(ibanClean, 235, fromTop(290), 13.5);

                // Row 5: Mobile Number
                const mobile = req.body.mobile || '';
                drawCharByChar(mobile, 235, fromTop(330), 13.5);

                // Row 7: Issued for - DD MM YYYY (8 boxes in a row)
                const issuedDate = req.body.commenceDate || currentDate;
                const issuedClean = issuedDate.replace(/[./]/g, '');
                if (issuedClean.length === 8) {
                    drawCharByChar(issuedClean, 380, fromTop(410), 15);
                }

                // Row 8: Commences On - DD / MM / YYYY
                const commenceDate = req.body.commenceDate || currentDate;
                const commenceParts = commenceDate.split(/[./]/);
                if (commenceParts.length === 3) {
                    drawCharByChar(commenceParts[0], 320, fromTop(450), 13.5); // DD
                    drawCharByChar(commenceParts[1], 380, fromTop(450), 13.5); // MM
                    drawCharByChar(commenceParts[2], 445, fromTop(450), 13.5); // YYYY
                }

                // Row 9: Expires On - DD / MM / YYYY
                const expireDate = req.body.expireDate || currentDate;
                const expireParts = expireDate.split(/[./]/);
                if (expireParts.length === 3) {
                    drawCharByChar(expireParts[0], 320, fromTop(490), 13.5); // DD
                    drawCharByChar(expireParts[1], 380, fromTop(490), 13.5); // MM
                    drawCharByChar(expireParts[2], 445, fromTop(490), 13.5); // YYYY
                }

                // Row 11: Payment Frequency - tick Monthly checkbox
                drawCheckbox(335, fromTop(575), 10);

                // Row 12: Fixed Amount 1
                const amountStr = amount.toString();
                drawCharByChar(amountStr, 235, fromTop(640), 20);

                // Row 13: Fixed Amount 2
                drawCharByChar(amountStr, 235, fromTop(680), 20);


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
