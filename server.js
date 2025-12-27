const express = require('express');
const { PDFDocument } = require('pdf-lib');
const fs = require('fs').promises;
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static('public'));

// GET / - Serve the form
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// POST /fill - Generate filled PDF
app.post('/fill', async (req, res) => {
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
            return res.status(500).json({
                error: 'PDF template not found. Please contact administrator.'
            });
        }

        const existingPdfBytes = await fs.readFile(templatePath);
        const pdfDoc = await PDFDocument.load(existingPdfBytes);

        // Get current date
        const currentDate = new Date().toLocaleDateString('en-GB');

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
                const { StandardFonts, rgb } = require('pdf-lib');

                // Get the first page
                const pages = pdfDoc.getPages();
                const firstPage = pages[0];
                const { height } = firstPage.getSize();

                // Embed a standard font
                const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
                const fontSize = 10;
                const charSpacing = 14; // Space between each character box

                // Helper function to draw text character by character
                const drawCharByChar = (text, startX, startY, spacing = charSpacing) => {
                    const chars = text.toString().split('');
                    chars.forEach((char, index) => {
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
                const drawCheckbox = (x, y, size = 8) => {
                    // Draw X mark
                    firstPage.drawText('X', {
                        x: x,
                        y: y,
                        size: size,
                        font: font,
                        color: rgb(0, 0, 0),
                    });
                };

                // Calculate Y positions from top (easier to measure from image)
                // PDF height is 842, so: y = 842 - yFromTop
                const fromTop = (yFromTop) => height - yFromTop;

                // Row 4: IBAN - each character in separate box
                // IBAN format: AE07 0331 2345 6789 0123 456 (remove spaces)
                const ibanClean = iban.replace(/\s/g, '');
                drawCharByChar(ibanClean, 220, fromTop(245), 14);

                // Row 5: Mobile Number - 05 + 8 digits
                // Assuming mobile is passed or we extract from another field
                // For now, we'll add it to the form input
                const mobile = req.body.mobile || '0500000000';
                drawCharByChar(mobile, 220, fromTop(285), 14);

                // Row 8: Commences On - DD/MM/YYYY
                const commenceDate = req.body.commenceDate || currentDate;
                const commenceParts = commenceDate.split('/'); // Expecting DD/MM/YYYY
                if (commenceParts.length === 3) {
                    // DD
                    drawCharByChar(commenceParts[0], 220, fromTop(405), 14);
                    // MM
                    drawCharByChar(commenceParts[1], 285, fromTop(405), 14);
                    // YYYY
                    drawCharByChar(commenceParts[2], 350, fromTop(405), 14);
                }

                // Row 9: Expires On - DD/MM/YYYY
                const expireDate = req.body.expireDate || currentDate;
                const expireParts = expireDate.split('/');
                if (expireParts.length === 3) {
                    // DD
                    drawCharByChar(expireParts[0], 220, fromTop(445), 14);
                    // MM
                    drawCharByChar(expireParts[1], 285, fromTop(445), 14);
                    // YYYY
                    drawCharByChar(expireParts[2], 350, fromTop(445), 14);
                }

                // Row 11: Payment Frequency - tick Monthly checkbox
                drawCheckbox(305, fromTop(530), 10);

                // Row 12: Fixed Amount 1 - each digit in separate box
                const amountStr = amount.toString().padStart(10, ' ');
                drawCharByChar(amountStr, 220, fromTop(610), 14);

                // Row 13: Fixed Amount 2 (same as amount 1 for now)
                drawCharByChar(amountStr, 220, fromTop(650), 14);

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
